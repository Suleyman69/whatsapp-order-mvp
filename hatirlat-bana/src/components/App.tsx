"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { complete, remindTomorrow, rollForward, snoozeHour } from "@/lib/actions";
import { deleteReminder, getAllReminders, loadBook, newId, putReminder, saveBook } from "@/lib/db";
import { formatTime, friendlyDay, startOfNextDay } from "@/lib/format";
import {
  type AddressBook,
  emptyBook,
  learnCorrection,
  recordUse,
  removeAlias,
  setAlias,
} from "@/lib/addressbook";
import { analyzeSpeech } from "@/lib/intent";
import { isLearnableCorrection, resolveAddress } from "@/lib/resolve";
import {
  currentPushStatus,
  enablePush,
  ensureSubscribed,
  registerServiceWorker,
  sendTestPush,
  syncReminders,
  type PushStatus,
} from "@/lib/push-client";
import { REPEAT_LABELS, type Reminder } from "@/lib/types";
import { CheckIcon, MicIcon, PencilIcon, PinIcon, RepeatIcon, StopIcon, TrashIcon } from "./icons";
import { AddressBookSheet, ConfirmSheet, DetailSheet, EditSheet, QuickNavSheet, TextSheet, type Draft } from "./sheets";
import { spokenAddress } from "@/lib/location";
import { UNSUPPORTED_MSG, useSpeech } from "./useSpeech";

type SheetState =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "confirm"; draft: Draft; suggestion?: string | null; original?: string }
  | { kind: "quick"; draft: Draft; location: string; original: string; suggestion: string | null }
  | { kind: "book" }
  | { kind: "edit"; draft: Draft; id?: string }
  | { kind: "detail"; id: string };

interface Toast {
  text: string;
  undo?: () => void;
}

export default function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const [push, setPush] = useState<PushStatus | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [now, setNow] = useState(0); // ilk yüklemede reload() ayarlar (prerender sırasında saat okunmaz)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Adres defteri: kısa adlar, sık kullanılan adresler, öğrenilen düzeltmeler
  const [book, setBook] = useState<AddressBook>(emptyBook);
  const bookRef = useRef<AddressBook>(book);
  const updateBook = useCallback((fn: (b: AddressBook) => AddressBook) => {
    const next = fn(bookRef.current);
    bookRef.current = next;
    setBook(next);
    void saveBook(next);
  }, []);
  /** Adres gerçekten kullanıldı (navigasyon / hatırlatma): sık kullanılanlara ekle; yanlış duymaysa düzeltmeyi öğren. */
  const markAddressUsed = useCallback(
    (address: string, original?: string) =>
      updateBook((b) => {
        let n = recordUse(b, address);
        if (original && isLearnableCorrection(original, address)) n = learnCorrection(n, original, address);
        return n;
      }),
    [updateBook],
  );
  useEffect(() => {
    void loadBook().then((b) => {
      bookRef.current = b;
      setBook(b);
    });
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const reload = useCallback(async () => {
    const all = await getAllReminders();
    // Dünden kalan tekrarlayan hatırlatmaları ileri al
    const rolled = all.map((r) => rollForward(r)).filter((r): r is Reminder => r !== null);
    await Promise.all(rolled.map(putReminder));
    const byId = new Map(all.map((r) => [r.id, r]));
    rolled.forEach((r) => byId.set(r.id, r));
    setReminders([...byId.values()]);
    setNow(Date.now());
    setLoaded(true);
    return rolled.length > 0;
  }, []);

  /** Değişiklikten sonra: listeyi yenile, sunucuya push zamanlamasını bildir. */
  const commit = useCallback(async () => {
    await reload();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") void syncReminders();
  }, [reload]);

  // ---- Açılış ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      await registerServiceWorker().catch(() => null);
      let status = await currentPushStatus().catch((): PushStatus => "unsupported");
      // İzin daha önce verildiyse aboneliği sessizce tazele (sunucu verisi kaybolmuş olabilir)
      if (status === "on" || (status === "default" && "Notification" in window && Notification.permission === "granted")) {
        status = await ensureSubscribed().catch((): PushStatus => "server-off");
      }
      if (!cancelled) setPush(status);

      const id = new URLSearchParams(window.location.search).get("r");
      if (id && !cancelled) {
        setSheet({ kind: "detail", id });
        window.history.replaceState(null, "", "/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Service worker mesajları ve uygulamaya geri dönüş
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "reminders-changed") void reload();
      if (e.data?.type === "open-reminder" && e.data.id) {
        void reload();
        setSheet({ kind: "detail", id: e.data.id });
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [reload]);

  // Yedek: push kapalıyken uygulama açık olduğu sürece zamanı gelenleri hatırlat
  useEffect(() => {
    if (push === null || push === "on") return;
    const due = reminders.filter(
      (r) => !r.done && r.dueAt !== null && r.dueAt <= now && now - r.dueAt < 12 * 3_600_000 && r.notifiedDue !== r.dueAt,
    );
    if (!due.length) return;
    (async () => {
      for (const r of due) {
        await putReminder({ ...r, notifiedDue: r.dueAt ?? undefined });
        if ("Notification" in window && Notification.permission === "granted") {
          const reg = await navigator.serviceWorker?.ready;
          await reg?.showNotification("Hatırlat Bana", { body: r.title, tag: r.id, data: { id: r.id }, icon: "/icon-192.png" });
        } else {
          showToast({ text: `⏰ ${r.title}` });
        }
      }
      void reload();
    })();
  }, [now, reminders, push, reload, showToast]);

  // ---- Ses ----
  const onTranscript = useCallback((text: string, lang: string = "tr-TR") => {
    // Almanca adres dikte modu: tüm söylenen adrestir → doğrudan hızlı navigasyon
    if (lang.startsWith("de")) {
      const original = spokenAddress(text);
      let location = original;
      let suggestion: string | null = null;
      const r = resolveAddress(original, bookRef.current);
      if (r.status === "auto") location = r.location;
      else if (r.status === "suggest") suggestion = r.suggestion ?? null;
      setSheet({
        kind: "quick",
        location,
        original,
        suggestion,
        draft: { title: location, dueAt: null, repeat: "none", location, source: text },
      });
      return;
    }
    // Ayrıştır + adres defteriyle çözümle (kısa adlar, bulanık adres düzeltme, güvenilir hedef kontrolü)
    const a = analyzeSpeech(text, Date.now(), bookRef.current);
    const p = a.parsed;
    const draft: Draft = { title: a.title, dueAt: p.dueAt, repeat: p.repeat, location: a.location ?? undefined, source: text };
    // "Erdemli'ye gidiyorum": zaman ifadesi yoksa ve hedef güvenilirse hatırlatma onayı yerine hızlı navigasyon
    setSheet(
      a.navigation && a.location
        ? { kind: "quick", draft, location: a.location, original: p.location ?? a.location, suggestion: a.suggestion }
        : { kind: "confirm", draft, suggestion: a.suggestion, original: p.location ?? undefined },
    );
  }, []);
  const speech = useSpeech(onTranscript);

  const onGermanMic = () => {
    if (speech.listening) return speech.stop();
    speech.start("de-DE");
  };

  const onMic = () => {
    if (speech.listening) return speech.stop();
    if (!speech.start()) {
      // Desteklenmiyorsa doğrudan yazılı girişe geç
      if (!speech.isSupported()) setSheet({ kind: "text", text: "" });
    }
  };

  const onTextSubmit = (text: string) => {
    speech.setError(null);
    onTranscript(text);
  };

  // ---- Kaydet / düzenle ----
  const saveDraft = async (d: Draft, id?: string, original?: string) => {
    const t = Date.now();
    const prev = id ? reminders.find((r) => r.id === id) : undefined;
    const r: Reminder = prev
      ? { ...prev, title: d.title, dueAt: d.dueAt, repeat: d.repeat, location: d.location, updatedAt: t }
      : {
          id: newId(),
          title: d.title,
          dueAt: d.dueAt,
          repeat: d.repeat,
          location: d.location,
          done: false,
          createdAt: t,
          updatedAt: t,
          source: d.source,
        };
    if (prev && prev.done && d.dueAt && d.dueAt > t) {
      r.done = false;
      r.doneAt = undefined;
    }
    await putReminder(r);
    if (d.location) markAddressUsed(d.location, original);
    setSheet({ kind: "none" });
    await commit();
    if (!prev) {
      showToast({
        text:
          d.dueAt && push !== "on"
            ? "Kaydedildi. Bildirim için aşağıdan izin ver."
            : d.dueAt
              ? `Kaydedildi · ${friendlyDay(d.dueAt)} ${formatTime(d.dueAt)}`
              : "Kaydedildi",
      });
    }
  };

  const update = async (r: Reminder) => {
    await putReminder(r);
    await commit();
  };

  const toggleDone = async (r: Reminder) => {
    if (r.done) return update({ ...r, done: false, doneAt: undefined, updatedAt: Date.now() });
    const next = complete(r);
    await update(next);
    if (!next.done && next.dueAt) showToast({ text: `Sonraki: ${friendlyDay(next.dueAt)} ${formatTime(next.dueAt)}`, undo: () => update(r) });
    else showToast({ text: "Tamamlandı", undo: () => update(r) });
  };

  const remove = async (r: Reminder) => {
    await deleteReminder(r.id);
    setSheet({ kind: "none" });
    await commit();
    showToast({ text: "Silindi", undo: () => update(r) });
  };

  // ---- Bildirim izni ----
  const onEnablePush = async () => {
    const status = await enablePush().catch((): PushStatus => "unsupported");
    setPush(status);
    if (status === "on") showToast({ text: "Bildirimler açık ✓" });
  };

  const onTestPush = async () => {
    const err = await sendTestPush().catch((e: Error) => e.message);
    showToast({ text: err ?? "Deneme bildirimi gönderildi" });
  };

  // ---- Listeler ----
  const sections = useMemo(() => {
    const endToday = startOfNextDay(now);
    const open = reminders.filter((r) => !r.done);
    const byDue = (a: Reminder, b: Reminder) => (a.dueAt ?? 0) - (b.dueAt ?? 0);
    return {
      today: open.filter((r) => r.dueAt !== null && r.dueAt < endToday).sort(byDue),
      upcoming: open.filter((r) => r.dueAt !== null && r.dueAt >= endToday).sort(byDue),
      undated: open.filter((r) => r.dueAt === null).sort((a, b) => b.createdAt - a.createdAt),
      done: reminders
        .filter((r) => r.done)
        .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
        .slice(0, 30),
    };
  }, [reminders, now]);

  const detail = sheet.kind === "detail" ? reminders.find((r) => r.id === sheet.id) : undefined;
  const isEmpty = loaded && reminders.length === 0;

  return (
    <>
      <main className="mx-auto min-h-dvh max-w-lg px-5 pt-[max(env(safe-area-inset-top),16px)] pb-[calc(env(safe-area-inset-bottom)+190px)]">
        <h1 className="pt-4 pb-2 text-3xl font-bold tracking-tight">Hatırlat Bana</h1>

        <PushBanner status={push} onEnable={onEnablePush} />

        {isEmpty && (
          <div className="pt-16 text-center text-zinc-500">
            <p className="text-xl font-medium text-foreground">Mikrofona dokun ve söyle</p>
            <p className="mt-3 text-lg">“Yarın saat 10’da Mehmet’i ara”</p>
            <p className="mt-1 text-lg">“Her ayın 5’inde Hetzner ödemesini hatırlat”</p>
          </div>
        )}

        <Section title="Bugün" items={sections.today} now={now} onToggle={toggleDone} onEdit={editOf} onDelete={remove} />
        <Section title="Yaklaşanlar" items={sections.upcoming} now={now} onToggle={toggleDone} onEdit={editOf} onDelete={remove} />
        <Section title="Tarihsiz" items={sections.undated} now={now} onToggle={toggleDone} onEdit={editOf} onDelete={remove} />
        {sections.done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer list-none py-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Tamamlananlar ({sections.done.length})
            </summary>
            <Section items={sections.done} now={now} onToggle={toggleDone} onEdit={editOf} onDelete={remove} />
          </details>
        )}

        <p className="mt-10 text-center text-sm text-zinc-500">
          <button type="button" className="text-indigo-600 underline" onClick={() => setSheet({ kind: "book" })}>
            Adreslerim (ev, iş, Hbf…)
          </button>
        </p>

        {push === "on" && (
          <p className="mt-4 text-center text-sm text-zinc-500">
            Bildirimler açık ·{" "}
            <button type="button" className="text-indigo-600 underline" onClick={onTestPush}>
              Deneme bildirimi gönder
            </button>
          </p>
        )}
      </main>

      {/* Alt kontrol alanı: tek elle kullanım için ekranın altında */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-background from-70% to-transparent pb-[max(env(safe-area-inset-bottom),16px)] pt-10">
        <div className="pointer-events-auto mx-auto max-w-lg px-5">
          <p className="mb-3 min-h-7 text-center text-lg leading-snug" aria-live="polite">
            {speech.listening ? (
              <span className="text-zinc-600 dark:text-zinc-300">
                {speech.interim || (speech.activeLang.startsWith("de") ? "Adresi Almanca söyle…" : "Dinliyorum…")}
              </span>
            ) : speech.error ? (
              <span className="text-red-600">{speech.error}</span>
            ) : null}
          </p>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => {
                if (speech.listening) speech.stop();
                setSheet({ kind: "text", text: "" });
              }}
              aria-label="Yazarak ekle"
              className="flex size-16 items-center justify-center rounded-full bg-zinc-100 active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
            >
              <PencilIcon className="size-7" />
            </button>
            <button
              type="button"
              onClick={onMic}
              aria-label={speech.listening ? "Dinlemeyi bitir" : "Sesle ekle"}
              className={`flex size-24 items-center justify-center rounded-full text-white shadow-lg ${
                speech.listening && !speech.activeLang.startsWith("de")
                  ? "bg-red-600 ring-8 ring-red-600/25"
                  : "bg-indigo-600 active:bg-indigo-700"
              }`}
            >
              {speech.listening && !speech.activeLang.startsWith("de") ? (
                <StopIcon className="size-9" />
              ) : (
                <MicIcon className="size-11" />
              )}
            </button>
            <button
              type="button"
              onClick={onGermanMic}
              aria-label={speech.listening && speech.activeLang.startsWith("de") ? "Dinlemeyi bitir" : "Adresi Almanca söyle"}
              className={`flex size-16 flex-col items-center justify-center rounded-full ${
                speech.listening && speech.activeLang.startsWith("de")
                  ? "bg-red-600 text-white"
                  : "bg-zinc-100 active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
              }`}
            >
              {speech.listening && speech.activeLang.startsWith("de") ? (
                <StopIcon className="size-6" />
              ) : (
                <MicIcon className="size-6" />
              )}
              <span className="text-xs leading-none font-bold">DE</span>
            </button>
          </div>
          {speech.error === UNSUPPORTED_MSG && (
            <p className="mt-2 text-center text-sm text-zinc-500">Kalem ikonuna dokunarak yazabilirsin.</p>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[60] flex justify-center px-5">
          <div className="flex max-w-lg items-center gap-4 rounded-2xl bg-zinc-900 px-5 py-3 text-base text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900">
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className="font-semibold text-indigo-300 dark:text-indigo-600"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Geri al
              </button>
            )}
          </div>
        </div>
      )}

      {sheet.kind === "text" && (
        <TextSheet initial={sheet.text} onSubmit={onTextSubmit} onClose={() => setSheet({ kind: "none" })} />
      )}
      {sheet.kind === "book" && (
        <AddressBookSheet
          book={book}
          onAdd={(name, address) => updateBook((b) => setAlias(b, name, address))}
          onRemove={(name) => updateBook((b) => removeAlias(b, name))}
          onClose={() => setSheet({ kind: "none" })}
        />
      )}
      {sheet.kind === "quick" && (
        <QuickNavSheet
          location={sheet.location}
          suggestion={sheet.suggestion}
          source={sheet.draft.source}
          onUse={(address) => markAddressUsed(address, sheet.original)}
          onSaveAsReminder={(location) =>
            setSheet({
              kind: "confirm",
              draft: { ...sheet.draft, location, title: location === sheet.location ? sheet.draft.title : location },
            })
          }
          onClose={() => setSheet({ kind: "none" })}
        />
      )}
      {sheet.kind === "confirm" && (
        <ConfirmSheet
          draft={sheet.draft}
          suggestion={sheet.suggestion}
          onAcceptSuggestion={() =>
            setSheet({ ...sheet, suggestion: null, draft: { ...sheet.draft, location: sheet.suggestion ?? sheet.draft.location } })
          }
          onSave={() => saveDraft(sheet.draft, undefined, sheet.original)}
          onEdit={() => setSheet({ kind: "edit", draft: sheet.draft })}
          onFixText={() => setSheet({ kind: "text", text: sheet.draft.source ?? "" })}
          onClose={() => setSheet({ kind: "none" })}
        />
      )}
      {sheet.kind === "edit" && (
        <EditSheet
          draft={sheet.draft}
          isNew={!sheet.id}
          onSave={(d) => saveDraft(d, sheet.id)}
          onDelete={sheet.id ? () => remove(reminders.find((r) => r.id === sheet.id)!) : undefined}
          onClose={() => setSheet({ kind: "none" })}
        />
      )}
      {detail && (
        <DetailSheet
          reminder={detail}
          onDone={async () => {
            setSheet({ kind: "none" });
            await toggleDone(detail);
          }}
          onSnooze={async () => {
            setSheet({ kind: "none" });
            await update(snoozeHour(detail));
            showToast({ text: "1 saat sonra hatırlatılacak" });
          }}
          onTomorrow={async () => {
            setSheet({ kind: "none" });
            await update(remindTomorrow(detail));
            showToast({ text: "Yarın hatırlatılacak" });
          }}
          onEdit={() => editOf(detail)}
          onClose={() => setSheet({ kind: "none" })}
        />
      )}
    </>
  );

  function editOf(r: Reminder) {
    setSheet({
      kind: "edit",
      id: r.id,
      draft: { title: r.title, dueAt: r.dueAt, repeat: r.repeat, location: r.location, source: r.source },
    });
  }
}

function PushBanner({ status, onEnable }: { status: PushStatus | null; onEnable: () => void }) {
  if (status === null || status === "on") return null;
  const box = "mt-2 mb-2 rounded-2xl bg-indigo-50 p-4 text-base leading-snug dark:bg-indigo-950/50";
  switch (status) {
    case "default":
      return (
        <div className={box}>
          <p>Hatırlatmaların zamanında gelebilmesi için bildirimlere izin ver.</p>
          <button
            type="button"
            onClick={onEnable}
            className="mt-3 h-12 w-full rounded-xl bg-indigo-600 text-lg font-semibold text-white active:bg-indigo-700"
          >
            Bildirimlere izin ver
          </button>
        </div>
      );
    case "ios-install":
      return (
        <div className={box}>
          <p className="font-semibold">Bildirim almak için ana ekrana ekle</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">
            Safari’de <b>Paylaş</b> düğmesine (kare ve yukarı ok) dokun → <b>Ana Ekrana Ekle</b>. Sonra uygulamayı ana
            ekrandan aç.
          </p>
        </div>
      );
    case "denied":
      return (
        <div className={box}>
          Bildirimler kapalı. iPhone’da <b>Ayarlar → Bildirimler → Hatırlat Bana</b> yolundan açabilirsin.
        </div>
      );
    case "server-off":
      return (
        <div className={box}>
          Sunucu şu an bildirim gönderemiyor (VAPID ayarı eksik). Hatırlatmalar yalnızca uygulama açıkken gösterilir.
        </div>
      );
    case "error":
      return (
        <div className={box}>
          <p>Bildirim aboneliği oluşturulamadı. İnternet bağlantını kontrol edip tekrar dene.</p>
          <button type="button" onClick={onEnable} className="mt-2 font-semibold text-indigo-600">
            Tekrar dene
          </button>
        </div>
      );
    case "unsupported":
      return (
        <div className={box}>
          Bu tarayıcı arka plan bildirimlerini desteklemiyor. Hatırlatmalar yalnızca uygulama açıkken gösterilir.
        </div>
      );
  }
}

function Section({
  title,
  items,
  now,
  onToggle,
  onEdit,
  onDelete,
}: {
  title?: string;
  items: Reminder[];
  now: number;
  onToggle: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      {title && <h2 className="py-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((r) => {
          const overdue = !r.done && r.dueAt !== null && r.dueAt < now;
          return (
            <li key={r.id} className="flex items-center gap-2 py-3">
              <button
                type="button"
                onClick={() => onToggle(r)}
                aria-label={r.done ? "Geri al" : "Tamamlandı"}
                className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${
                  r.done ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 text-transparent active:text-zinc-400 dark:border-zinc-600"
                }`}
              >
                <CheckIcon className="size-5" />
              </button>
              <button type="button" onClick={() => onEdit(r)} className="min-w-0 flex-1 text-left">
                <span className={`block text-[19px] leading-snug font-medium ${r.done ? "text-zinc-400 line-through" : ""}`}>
                  {r.title}
                </span>
                {r.location && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-base text-zinc-500">
                    <PinIcon className="size-4 shrink-0" />
                    <span className="truncate">{r.location}</span>
                  </span>
                )}
                {r.dueAt !== null && (
                  <span className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-base ${overdue ? "text-red-600" : "text-zinc-500"}`}>
                    <span className="whitespace-nowrap">
                      {friendlyDay(r.dueAt, now)} · {formatTime(r.dueAt)}
                    </span>
                    {r.repeat !== "none" && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <RepeatIcon className="size-4" />
                        {REPEAT_LABELS[r.repeat]}
                      </span>
                    )}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onEdit(r)}
                aria-label="Düzenle"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800"
              >
                <PencilIcon className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(r)}
                aria-label="Sil"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800"
              >
                <TrashIcon className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

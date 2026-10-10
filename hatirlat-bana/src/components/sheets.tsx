"use client";

import { useState } from "react";
import type { AddressBook } from "@/lib/addressbook";
import { describeWhen, formatDate, formatTime, fromInputs, toDateInput, toTimeInput } from "@/lib/format";
import { REPEAT_LABELS, type Reminder, type Repeat } from "@/lib/types";
import { blitzerLink } from "@/lib/blitzer";
import { mapsUrl } from "@/lib/nav";
import { isIOS } from "@/lib/push-client";
import { spokenAddress } from "@/lib/location";
import { AlertIcon, MicIcon, NavIcon, PencilIcon, StopIcon } from "./icons";
import { PrimaryButton, SecondaryButton, Sheet } from "./Sheet";
import { useSpeech } from "./useSpeech";

/**
 * Blitzer.de PRO'yu açar (yalnızca iPhone/iPad'de, konumu olan hatırlatmalarda gösterilir).
 * Google Maps butonundan bağımsız, ayrı bir bağlantıdır; biri diğerini tetiklemez.
 */
export function BlitzerButton() {
  if (typeof navigator === "undefined" || !isIOS()) return null;
  const link = blitzerLink();
  return (
    <div>
      <a
        href={link.href}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 text-lg font-semibold text-zinc-900 active:bg-amber-500"
      >
        <AlertIcon className="size-5" />
        Blitzer.de&apos;yi aç
      </a>
      <details className="mt-2 text-sm text-zinc-500">
        <summary className="cursor-pointer">Nasıl çalışır?</summary>
        <p className="mt-1 leading-snug">
          {link.kind === "shortcut" ? (
            <>
              Kestirmeler uygulamasında <b>{link.shortcutName}</b> adlı, tek eylemi “Uygulamayı Aç → Blitzer.de PRO” olan
              bir kestirme oluştur. Düğme onu çalıştırır.{" "}
            </>
          ) : (
            <>Düğme Blitzer.de PRO’yu doğrudan açar. </>
          )}
          İki uygulama ayrı açılır: önce Blitzer.de’yi aç, sonra buraya dönüp Navigasyonu aç.
        </p>
      </details>
    </div>
  );
}

export interface Draft {
  title: string;
  dueAt: number | null;
  repeat: Repeat;
  /** Hedef konum/adres; boşsa navigasyon yok. */
  location?: string;
  source?: string;
}

/** Google Maps'te rota hedefi olarak açar. Gerçek bir bağlantıdır: iPhone'da Google Maps kuruluysa uygulama, değilse web açılır. */
export function NavButton({ location, onUse }: { location: string; onUse?: () => void }) {
  return (
    <a
      href={mapsUrl(location)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onUse}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-semibold text-white active:bg-emerald-700"
    >
      <NavIcon className="size-5" />
      Navigasyonu aç
    </a>
  );
}

/**
 * Hızlı navigasyon modu ("Erdemli'ye gidiyorum"): tarih/saat onayı olmadan doğrudan aksiyonlar.
 * İki uygulama ayrı butonlarla açılır; iOS art arda otomatik açmaya izin vermez.
 */
export function QuickNavSheet({
  location,
  suggestion,
  source,
  onUse,
  onSaveAsReminder,
  onClose,
}: {
  location: string;
  /** Orta güvenli bulanık eşleşme: "… mu demek istedin?" */
  suggestion?: string | null;
  source?: string;
  /** Adres kullanıldı (navigasyon / hatırlatma): sık kullanılanlara ekle, düzeltmeyi öğren */
  onUse: (address: string) => void;
  onSaveAsReminder: (location: string) => void;
  onClose: () => void;
}) {
  // Hedef düzenlenebilir: Türkçe tanıyıcı adı yanlış yazdıysa elle ya da Almanca dikteyle düzeltilir
  const [loc, setLoc] = useState(location);
  const [sug, setSug] = useState(suggestion ?? null);
  const de = useGermanAddress((a) => {
    setLoc(a);
    setSug(null);
  });
  const value = loc.trim();
  return (
    <Sheet onClose={onClose} label="Hemen yola çık">
      {source && <p className="mb-3 rounded-2xl bg-zinc-100 p-3 text-base italic text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">“{source}”</p>}
      <label htmlFor="hb-target" className="block text-base text-zinc-500">
        Hedef
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="hb-target"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className="h-14 min-w-0 flex-1 rounded-2xl bg-zinc-100 px-4 text-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-900"
          enterKeyHint="done"
        />
        <GermanMicButton de={de} />
      </div>
      {sug && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-amber-100 p-3 text-zinc-900">
          <span className="min-w-0 flex-1 text-base leading-snug">{sug} mu demek istedin?</span>
          <button
            type="button"
            className="h-10 rounded-xl bg-zinc-900 px-4 font-semibold text-white"
            onClick={() => {
              setLoc(sug);
              setSug(null);
            }}
          >
            Evet
          </button>
          <button type="button" className="h-10 rounded-xl px-3 font-medium" onClick={() => setSug(null)}>
            Hayır
          </button>
        </div>
      )}
      <GermanStatus de={de} hint="Yanlış yazıldıysa düzelt ya da DE tuşuyla adresi Almanca söyle." />
      <div className="mt-4 space-y-3">
        {value && <NavButton location={value} onUse={() => onUse(value)} />}
        {value && <BlitzerButton />}
        <SecondaryButton
          onClick={() => {
            if (value) onUse(value);
            onSaveAsReminder(value);
          }}
          disabled={!value}
        >
          Hatırlatma olarak kaydet
        </SecondaryButton>
        <SecondaryButton onClick={onClose}>Kapat</SecondaryButton>
      </div>
    </Sheet>
  );
}

/**
 * Adresi Almanca (de-DE) dikte eder: Türkçe tanıyıcı "Münsterstrasse"ı "Manchester Straße" gibi yazabilir,
 * Almanca tanıyıcı Alman cadde/şehir adlarını doğru yazar.
 */
function useGermanAddress(onAddress: (address: string) => void) {
  const speech = useSpeech((text) => onAddress(spokenAddress(text)));
  return {
    listening: speech.listening,
    interim: speech.interim,
    error: speech.error,
    toggle: () => (speech.listening ? speech.stop() : speech.start("de-DE")),
  };
}

type GermanAddress = ReturnType<typeof useGermanAddress>;

function GermanMicButton({ de }: { de: GermanAddress }) {
  return (
    <button
      type="button"
      onClick={de.toggle}
      aria-label={de.listening ? "Dinlemeyi bitir" : "Adresi Almanca söyle"}
      className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl ${
        de.listening ? "bg-red-600 text-white" : "bg-zinc-100 active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
      }`}
    >
      {de.listening ? <StopIcon className="size-5" /> : <MicIcon className="size-5" />}
      <span className="mt-0.5 text-[11px] leading-none font-bold">DE</span>
    </button>
  );
}

function GermanStatus({ de, hint }: { de: GermanAddress; hint?: string }) {
  if (de.listening) return <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">{de.interim || "Dinliyorum… adresi Almanca söyle"}</p>;
  if (de.error) return <p className="mt-2 text-base text-red-600">{de.error}</p>;
  return hint ? <p className="mt-2 text-sm text-zinc-500">{hint}</p> : null;
}

/** Yazılı giriş: "Pazartesi 14:30 dişçiyi ara" */
export function TextSheet({
  initial,
  onSubmit,
  onClose,
}: {
  initial: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Sheet onClose={onClose} label="Yazarak ekle">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(text.trim());
        }}
      >
        <label htmlFor="hb-text" className="mb-2 block text-lg font-semibold">
          Ne hatırlatayım?
        </label>
        <textarea
          id="hb-text"
          autoFocus
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) onSubmit(text.trim());
            }
          }}
          placeholder="Pazartesi 14:30 dişçiyi ara"
          enterKeyHint="done"
          className="w-full resize-none rounded-2xl bg-zinc-100 p-4 text-xl leading-snug outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-900"
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SecondaryButton onClick={onClose}>İptal</SecondaryButton>
          <PrimaryButton type="submit" disabled={!text.trim()}>
            Devam
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 py-3 last:border-0 dark:border-zinc-800">
      <span className="text-base text-zinc-500">{label}</span>
      <span className="text-right text-xl font-semibold">{value}</span>
    </div>
  );
}

/** Kaydetmeden önce özet: Görev / Tarih / Saat / Tekrar */
export function ConfirmSheet({
  draft,
  suggestion,
  onAcceptSuggestion,
  onSave,
  onEdit,
  onFixText,
  onClose,
}: {
  draft: Draft;
  /** Orta güvenli adres önerisi: "… mu demek istedin?" */
  suggestion?: string | null;
  onAcceptSuggestion?: () => void;
  onSave: () => void;
  onEdit: () => void;
  onFixText: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label="Hatırlatmayı onayla">
      {draft.source && (
        <button
          type="button"
          onClick={onFixText}
          className="mb-3 flex w-full items-start gap-3 rounded-2xl bg-zinc-100 p-3 text-left dark:bg-zinc-900"
          aria-label="Metni düzelt"
        >
          <span className="flex-1 text-base italic text-zinc-600 dark:text-zinc-400">“{draft.source}”</span>
          <PencilIcon className="mt-0.5 size-5 shrink-0 text-indigo-600" />
        </button>
      )}
      {draft.dueAt && (
        <p className="mb-1 text-center text-xl font-bold text-indigo-600 dark:text-indigo-400">
          {describeWhen(draft.dueAt)}
        </p>
      )}
      <div className="mb-5">
        <Row label="Görev" value={draft.title || "—"} />
        <Row label="Tarih" value={draft.dueAt ? formatDate(draft.dueAt) : "Tarihsiz"} />
        <Row label="Saat" value={draft.dueAt ? formatTime(draft.dueAt) : "—"} />
        {draft.location && <Row label="Konum" value={draft.location} />}
        {draft.location && suggestion && (
          <div className="mb-1 flex items-center gap-2 rounded-2xl bg-amber-100 p-3 text-zinc-900">
            <span className="min-w-0 flex-1 text-base leading-snug">{suggestion} mu demek istedin?</span>
            <button type="button" className="h-10 rounded-xl bg-zinc-900 px-4 font-semibold text-white" onClick={onAcceptSuggestion}>
              Evet
            </button>
          </div>
        )}
        {draft.repeat !== "none" && <Row label="Tekrar" value={REPEAT_LABELS[draft.repeat]} />}
      </div>
      <PrimaryButton onClick={onSave} disabled={!draft.title}>
        Kaydet
      </PrimaryButton>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SecondaryButton onClick={onEdit}>Düzenle</SecondaryButton>
        <SecondaryButton onClick={onClose}>İptal</SecondaryButton>
      </div>
    </Sheet>
  );
}

/** Elle düzenleme formu (yeni taslak veya kayıtlı hatırlatma). */
export function EditSheet({
  draft,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  draft: Draft;
  isNew: boolean;
  onSave: (d: Draft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [date, setDate] = useState(draft.dueAt ? toDateInput(draft.dueAt) : "");
  const [time, setTime] = useState(draft.dueAt ? toTimeInput(draft.dueAt) : "09:00");
  const [repeat, setRepeat] = useState<Repeat>(draft.repeat);
  const [location, setLocation] = useState(draft.location ?? "");
  const de = useGermanAddress(setLocation);

  const save = () => {
    if (!title.trim()) return;
    const dueAt = fromInputs(date, time);
    onSave({
      title: title.trim(),
      dueAt,
      repeat: dueAt ? repeat : "none",
      location: location.trim() || undefined,
      source: draft.source,
    });
  };

  const field = "w-full rounded-2xl bg-zinc-100 px-4 h-14 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-900";

  return (
    <Sheet onClose={onClose} label={isNew ? "Yeni hatırlatma" : "Hatırlatmayı düzenle"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-base text-zinc-500">Görev</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} enterKeyHint="done" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-base text-zinc-500">Tarih</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-base text-zinc-500">Saat</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={field}
              disabled={!date}
            />
          </label>
        </div>
        {date ? (
          <button type="button" onClick={() => setDate("")} className="text-base text-indigo-600">
            Tarihi kaldır
          </button>
        ) : (
          <p className="text-base text-zinc-500">Tarih seçilmezse “Tarihsiz” listesine eklenir, bildirim gelmez.</p>
        )}
        {date && (
          <fieldset>
            <legend className="mb-1 text-base text-zinc-500">Tekrar</legend>
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-900">
              {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRepeat(r)}
                  aria-pressed={repeat === r}
                  className={`h-11 rounded-xl text-sm font-medium ${
                    repeat === r ? "bg-background shadow-sm" : "text-zinc-500"
                  }`}
                >
                  {r === "none" ? "Yok" : REPEAT_LABELS[r]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor="hb-loc" className="mb-1 block text-base text-zinc-500">
            Konum (isteğe bağlı)
          </label>
          <div className="flex gap-2">
            <input
              id="hb-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Bonn, Rochusstraße 400"
              className={`${field} min-w-0 flex-1`}
              enterKeyHint="done"
            />
            <GermanMicButton de={de} />
          </div>
          <GermanStatus de={de} />
        </div>
        {location.trim() && <NavButton location={location} />}
        {location.trim() && !isNew && <BlitzerButton />}
        <PrimaryButton type="submit" disabled={!title.trim()}>
          Kaydet
        </PrimaryButton>
        <div className={`grid gap-3 ${onDelete ? "grid-cols-2" : "grid-cols-1"}`}>
          <SecondaryButton onClick={onClose}>İptal</SecondaryButton>
          {onDelete && (
            <SecondaryButton onClick={onDelete} className="text-red-600">
              Sil
            </SecondaryButton>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/** Bildirime dokunulunca açılan hızlı işlem paneli (iOS'ta bildirim butonları olmadığı için). */
export function DetailSheet({
  reminder,
  onDone,
  onSnooze,
  onTomorrow,
  onEdit,
  onClose,
}: {
  reminder: Reminder;
  onDone: () => void;
  onSnooze: () => void;
  onTomorrow: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label="Hatırlatma">
      <p className="text-2xl font-bold leading-tight">{reminder.title}</p>
      {reminder.dueAt && (
        <p className="mt-1 text-lg text-zinc-500">
          {formatDate(reminder.dueAt)} · {formatTime(reminder.dueAt)}
          {reminder.repeat !== "none" && ` · ${REPEAT_LABELS[reminder.repeat]}`}
        </p>
      )}
      {reminder.location && <p className="mt-1 text-lg text-zinc-500">Konum: {reminder.location}</p>}
      <div className="mb-5" />
      {reminder.location && (
        <div className="mb-3 space-y-3">
          <NavButton location={reminder.location} />
          <BlitzerButton />
        </div>
      )}
      <PrimaryButton onClick={onDone}>Tamamlandı</PrimaryButton>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SecondaryButton onClick={onSnooze}>1 saat sonra</SecondaryButton>
        <SecondaryButton onClick={onTomorrow}>Yarın hatırlat</SecondaryButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SecondaryButton onClick={onEdit}>Düzenle</SecondaryButton>
        <SecondaryButton onClick={onClose}>Kapat</SecondaryButton>
      </div>
    </Sheet>
  );
}

/**
 * Adreslerim: kısa adlar ("ev", "iş", "Hbf", "Flughafen", "Münster") tam adrese bağlanır.
 * Sonra "Eve gidiyorum" demen yeterli; kayıtlı adresler ayrıca yanlış duyulan adreslerin düzeltilmesinde yüksek ağırlık alır.
 */
export function AddressBookSheet({
  book,
  onAdd,
  onRemove,
  onClose,
}: {
  book: AddressBook;
  onAdd: (name: string, address: string) => void;
  onRemove: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const de = useGermanAddress(setAddress);
  const aliases = Object.values(book.aliases);
  const field = "h-14 w-full rounded-2xl bg-zinc-100 px-4 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-900";
  return (
    <Sheet onClose={onClose} label="Adreslerim">
      <p className="mb-3 text-xl font-bold">Adreslerim</p>
      {aliases.length === 0 ? (
        <p className="mb-4 text-base text-zinc-500">
          Kısa ad ekle: “ev” → tam adres. Sonra “Eve gidiyorum” demen yeterli.
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {aliases.map((a) => (
            <li key={a.name} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{a.name}</p>
                <p className="truncate text-base text-zinc-500">{a.address}</p>
              </div>
              <button type="button" className="h-10 rounded-xl px-3 text-red-600" onClick={() => onRemove(a.name)} aria-label={`${a.name} sil`}>
                Sil
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !address.trim()) return;
          onAdd(name, address);
          setName("");
          setAddress("");
        }}
      >
        <div className="flex flex-wrap gap-2">
          {["ev", "iş", "Hbf", "Flughafen"].map((n) => (
            <button key={n} type="button" onClick={() => setName(n)} className="h-9 rounded-full bg-zinc-100 px-4 text-base dark:bg-zinc-800">
              {n}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kısa ad (ev, iş, Hbf…)" aria-label="Kısa ad" className={field} />
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Dortmund, Münsterstraße 160"
            aria-label="Tam adres"
            className={`${field} min-w-0 flex-1`}
          />
          <GermanMicButton de={de} />
        </div>
        <GermanStatus de={de} />
        <PrimaryButton type="submit" disabled={!name.trim() || !address.trim()}>
          Ekle
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Kapat</SecondaryButton>
      </form>
    </Sheet>
  );
}

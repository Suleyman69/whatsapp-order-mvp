"use client";

import { useState } from "react";
import { describeWhen, formatDate, formatTime, fromInputs, toDateInput, toTimeInput } from "@/lib/format";
import { REPEAT_LABELS, type Reminder, type Repeat } from "@/lib/types";
import { PencilIcon } from "./icons";
import { PrimaryButton, SecondaryButton, Sheet } from "./Sheet";

export interface Draft {
  title: string;
  dueAt: number | null;
  repeat: Repeat;
  source?: string;
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
  onSave,
  onEdit,
  onFixText,
  onClose,
}: {
  draft: Draft;
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

  const save = () => {
    if (!title.trim()) return;
    const dueAt = fromInputs(date, time);
    onSave({ title: title.trim(), dueAt, repeat: dueAt ? repeat : "none", source: draft.source });
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
        <p className="mt-1 mb-5 text-lg text-zinc-500">
          {formatDate(reminder.dueAt)} · {formatTime(reminder.dueAt)}
          {reminder.repeat !== "none" && ` · ${REPEAT_LABELS[reminder.repeat]}`}
        </p>
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

/** Hatırlatma üzerindeki işlemler. public/sw.js'teki applyAction ile aynı davranır. */
import { nextOccurrence } from "./recurrence";
import { startOfDay } from "./format";
import type { Reminder } from "./types";

/** Tamamlandı: tekrarlayan hatırlatma bir sonraki zamana geçer, diğerleri tamamlanır. */
export function complete(r: Reminder, now = Date.now()): Reminder {
  const next = r.dueAt !== null ? nextOccurrence(r.dueAt, r.repeat, now) : null;
  if (next !== null) return { ...r, dueAt: next, updatedAt: now };
  return { ...r, done: true, doneAt: now, updatedAt: now };
}

export function snoozeHour(r: Reminder, now = Date.now()): Reminder {
  return { ...r, dueAt: Math.ceil((now + 3_600_000) / 60_000) * 60_000, done: false, updatedAt: now };
}

export function remindTomorrow(r: Reminder, now = Date.now()): Reminder {
  const base = new Date(r.dueAt ?? now);
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(base.getHours(), base.getMinutes(), 0, 0);
  return { ...r, dueAt: t.getTime(), done: false, updatedAt: now };
}

/**
 * Uygulama açıldığında: dünden kalmış tekrarlayan hatırlatmaları bugünden sonraki
 * ilk zamana taşır (bugünkü tekrar listede görünmeye devam eder).
 */
export function rollForward(r: Reminder, now = Date.now()): Reminder | null {
  if (r.done || r.dueAt === null || r.repeat === "none") return null;
  const today = startOfDay(now);
  if (r.dueAt >= today) return null;
  const next = nextOccurrence(r.dueAt, r.repeat, today - 1);
  return next === null ? null : { ...r, dueAt: next, updatedAt: now };
}

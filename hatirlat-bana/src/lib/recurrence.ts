import { fromWall, toWall } from "./tz";
import type { Repeat } from "./types";

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `base` zamanından `step` adım sonraki tekrar (Berlin takvimi; saat dilimi değişse de duvar saati korunur). */
function occurrence(base: number, repeat: Exclude<Repeat, "none">, step: number): number {
  const w = toWall(base);
  if (repeat === "daily") {
    w.setUTCDate(w.getUTCDate() + step);
    return fromWall(w);
  }
  if (repeat === "weekly") {
    w.setUTCDate(w.getUTCDate() + step * 7);
    return fromWall(w);
  }
  // Ayın 31'i gibi günler kısa aylarda ayın son gününe kayar, sonraki ayda tekrar 31'e döner.
  const day = w.getUTCDate();
  const target = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + step, 1, w.getUTCHours(), w.getUTCMinutes()));
  target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
  return fromWall(target);
}

/** `dueAt`'ten sonra gelen ve `after`'dan büyük olan ilk tekrar zamanı. */
export function nextOccurrence(dueAt: number, repeat: Repeat, after: number = dueAt): number | null {
  if (repeat === "none") return null;
  for (let step = 1; step < 100000; step++) {
    const t = occurrence(dueAt, repeat, step);
    if (t > after) return t;
  }
  return null;
}

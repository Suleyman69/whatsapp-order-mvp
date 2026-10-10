import type { Repeat } from "./types";

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** `base` tarihinden `step` adım sonraki tekrar zamanı (yerel saat diliminde). */
function occurrence(base: number, repeat: Exclude<Repeat, "none">, step: number): number {
  const d = new Date(base);
  if (repeat === "daily") {
    d.setDate(d.getDate() + step);
  } else if (repeat === "weekly") {
    d.setDate(d.getDate() + step * 7);
  } else {
    // Ayın 31'i gibi günler kısa aylarda ayın son gününe kayar, sonraki ayda tekrar 31'e döner.
    const day = d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + step, 1, d.getHours(), d.getMinutes());
    target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
    return target.getTime();
  }
  return d.getTime();
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

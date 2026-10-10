/**
 * Uygulamanın tek saat dilimi. Tüm "bugün / yarın / saat 10" hesapları cihazın değil
 * bu saat diliminin takvimine göre yapılır (cihaz başka bir bölgede olsa da aynı sonuç).
 *
 * "Duvar saati" (wall): Berlin'deki tarih+saat alanlarını UTC alanları olarak taşıyan Date.
 * Yani `wall.getUTCHours()` Berlin'deki saattir. Takvim aritmetiği (gün ekle, ay ekle)
 * bu nesneler üzerinde güvenle yapılır; DST kayması fromWall ile çözülür.
 */
export const APP_TZ = "Europe/Berlin";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Zaman damgasının Berlin duvar saati karşılığı. */
export function toWall(ts: number): Date {
  const v: Record<string, number> = {};
  for (const p of parts.formatToParts(ts)) if (p.type !== "literal") v[p.type] = Number(p.value);
  const ms = ((ts % 1000) + 1000) % 1000;
  return new Date(Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second, ms));
}

/** Berlin duvar saatinin zaman damgası. Yaz saati geçişlerinde en yakın geçerli anı verir. */
export function fromWall(wall: Date): number {
  const guess = wall.getTime();
  let ts = guess - (toWall(guess).getTime() - guess);
  ts = guess - (toWall(ts).getTime() - ts);
  return ts;
}

/** Berlin'de o günün 00:00'ı (duvar saati). */
export function wallDay(ts: number): Date {
  const w = toWall(ts);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
}

export function wallAddDays(w: Date, n: number): Date {
  const r = new Date(w);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Duvar saati günü + saat:dakika → zaman damgası. */
export function wallAt(day: Date, h: number, m: number): number {
  return fromWall(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)));
}

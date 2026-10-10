import { APP_TZ, fromWall, toWall, wallAddDays, wallAt, wallDay } from "./tz";

const opt = { timeZone: APP_TZ } as const;
const dateFmt = new Intl.DateTimeFormat("tr-TR", { ...opt, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("tr-TR", { ...opt, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("tr-TR", { ...opt, weekday: "long" });
const shortFmt = new Intl.DateTimeFormat("tr-TR", { ...opt, day: "numeric", month: "long" });
const longFmt = new Intl.DateTimeFormat("tr-TR", { ...opt, day: "numeric", month: "long", weekday: "long" });

const cap = (s: string) => s.replace(/^./, (c) => c.toLocaleUpperCase("tr-TR"));

export const formatDate = (t: number) => dateFmt.format(t);
export const formatTime = (t: number) => timeFmt.format(t);

/** Berlin'de o günün başlangıcı (zaman damgası). */
export function startOfDay(t: number) {
  return fromWall(wallDay(t));
}

/** Berlin'de ertesi günün başlangıcı. */
export function startOfNextDay(t: number) {
  return fromWall(wallAddDays(wallDay(t), 1));
}

/** Bugüne göre gün farkı (Berlin takvimi). */
function dayDiff(t: number, now: number) {
  return Math.round((wallDay(t).getTime() - wallDay(now).getTime()) / 86_400_000);
}

/** Liste için okunaklı gün: "Bugün", "Yarın", "Pazartesi", "15 Ekim". */
export function friendlyDay(t: number, now = Date.now()) {
  const diff = dayDiff(t, now);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff > 1 && diff < 7) return cap(weekdayFmt.format(t));
  return shortFmt.format(t);
}

/** Onay ekranı: "Bugün, 10 Ekim Cumartesi, 17:00" / "Yarın, 11 Ekim Pazar, 09:00" / "5 Kasım Perşembe, 09:00". */
export function describeWhen(t: number, now = Date.now()) {
  const diff = dayDiff(t, now);
  const rel = diff === 0 ? "Bugün" : diff === 1 ? "Yarın" : diff === 2 ? "Öbür gün" : diff === -1 ? "Dün" : "";
  const day = longFmt.format(t);
  return `${rel ? `${rel}, ` : ""}${day}, ${formatTime(t)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** <input type="date"> / <input type="time"> değerleri (Berlin saati). */
export function toDateInput(t: number) {
  const w = toWall(t);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}
export function toTimeInput(t: number) {
  const w = toWall(t);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}
export function fromInputs(date: string, time: string): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  return wallAt(new Date(Date.UTC(y, m - 1, d)), hh, mm);
}

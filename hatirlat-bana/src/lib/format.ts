const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("tr-TR", { weekday: "long" });
const shortFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" });

export const formatDate = (t: number) => dateFmt.format(t);
export const formatTime = (t: number) => timeFmt.format(t);

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Liste için okunaklı gün: "Bugün", "Yarın", "Pazartesi", "15 Ekim". */
export function friendlyDay(t: number, now = Date.now()) {
  const diff = Math.round((startOfDay(t) - startOfDay(now)) / 86_400_000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff > 1 && diff < 7) return weekdayFmt.format(t).replace(/^./, (c) => c.toLocaleUpperCase("tr-TR"));
  return shortFmt.format(t);
}

/** <input type="date"> / <input type="time"> değerleri (yerel saat). */
export function toDateInput(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function toTimeInput(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function fromInputs(date: string, time: string): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

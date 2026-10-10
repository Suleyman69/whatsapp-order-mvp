/**
 * Türkçe doğal dil hatırlatma çözümleyici.
 * "Yarın saat 10'da Mehmet'i ara" → { title: "Mehmet'i ara", dueAt: yarın 10:00, repeat: "none" }
 *
 * Kural tabanlıdır, harici servis kullanmaz. Eşleşen her parça metinden çıkarılır,
 * kalan metin görev başlığı olur.
 */
import { toWall, wallAddDays, wallAt, wallDay } from "./tz";
import type { Repeat } from "./types";

export interface ParseResult {
  title: string;
  dueAt: number | null;
  repeat: Repeat;
  /** Saat açıkça söylendi mi (yoksa varsayılan atandı). */
  timeExplicit: boolean;
}

const L = "\\p{L}";
const B0 = `(?<![${L}\\d])`; // kelime başı (Türkçe harfleri de kapsar)
const B1 = `(?![${L}\\d])`; // kelime sonu
/** Sayıdan sonra gelebilecek ek: 10'da, 5'inde, 3te, 10:30'da */
const NUM_SUF = `(?:'[${L}]{1,6}|(?:d[ae]|t[ae])(?![${L}]))?`;
/** Kelimeden sonra gelebilecek ek: cumaya, akşama, yarına, ekimde */
const WORD_SUF = "(?:'?(?:y?[ae]|[dt][ae]n?|ki|leyin|l[ae]r[ıi]|y?[ıiuü]|n[ıiuü]n|[ıiuü]n))?";

const WEEKDAYS: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  çarşamba: 3,
  perşembe: 4,
  cuma: 5,
  cumartesi: 6,
};
// Uzun adlar önce gelmeli (pazartesi > pazar, cumartesi > cuma)
const WEEKDAY_RE = "(pazartesi|cumartesi|çarşamba|perşembe|pazar|salı|cuma)";

const MONTHS = [
  "ocak",
  "şubat",
  "mart",
  "nisan",
  "mayıs",
  "haziran",
  "temmuz",
  "ağustos",
  "eylül",
  "ekim",
  "kasım",
  "aralık",
];
const MONTH_RE = `(${MONTHS.join("|")})`;

type Period = "sabah" | "öğle" | "öğleden sonra" | "akşamüstü" | "akşam" | "gece";
const PERIOD_DEFAULT: Record<Period, [number, number]> = {
  sabah: [9, 0],
  öğle: [12, 0],
  "öğleden sonra": [14, 0],
  akşamüstü: [17, 0],
  akşam: [18, 0],
  gece: [22, 0],
};
const PERIOD_RE = "(öğleden sonra|akşamüstü|akşam üstü|sabah|öğlen|öğle|akşam|gece)";

const DEFAULT_TIME: [number, number] = [9, 0];

function normPeriod(p: string): Period {
  if (p === "öğlen" || p === "öğle") return "öğle";
  if (p === "akşam üstü") return "akşamüstü";
  return p as Period;
}

function wordNum(s: string): number {
  if (s === "bir") return 1;
  if (s === "yarım") return 0.5;
  return parseInt(s, 10);
}

/** Saat değerini döneme göre 24 saate çevirir (akşam 8 → 20). */
function applyPeriod(h: number, period: Period | null): number {
  if (h >= 13) return h;
  switch (period) {
    case "öğleden sonra":
    case "akşamüstü":
    case "akşam":
      return h < 12 ? h + 12 : h;
    case "gece":
      return h >= 7 && h < 12 ? h + 12 : h === 12 ? 0 : h;
    case "öğle":
      return h <= 6 ? h + 12 : h;
    case "sabah":
      return h === 12 ? 0 : h;
    default:
      // Dönem belirtilmemiş "saat 3" büyük olasılıkla 15:00'tir.
      return h >= 1 && h <= 6 ? h + 12 : h;
  }
}

export function parseReminder(input: string, now: number = Date.now()): ParseResult {
  const original = input
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  let work = original.toLocaleLowerCase("tr-TR");
  let orig = work.length === original.length ? original : work;

  const consume = (start: number, end: number) => {
    const blank = " ".repeat(end - start);
    work = work.slice(0, start) + blank + work.slice(end);
    orig = orig.slice(0, start) + blank + orig.slice(end);
  };

  /** Kalıbı çalışma metninde arar; bulursa metinden çıkarır ve eşleşmeyi döner. */
  const take = (pattern: string): RegExpExecArray | null => {
    const re = new RegExp(pattern, "u");
    const m = re.exec(work);
    if (m) consume(m.index, m.index + m[0].length);
    return m;
  };

  const today = wallDay(now); // Berlin takvim günü (duvar saati)
  let day: Date | null = null;
  let dayIsToday = false;
  let time: [number, number] | null = null;
  let exactAt: number | null = null; // "20 dakika sonra" gibi tam zaman
  let period: Period | null = null;
  let repeat: Repeat = "none";
  let weekday: number | null = null;
  let nextWeek = false;
  let monthDay: number | null = null;

  // ---- Tekrar ----
  let m: RegExpExecArray | null;
  if ((m = take(`${B0}her ay(?:ın)? (\\d{1,2})${NUM_SUF}(?: gün[${L}]*)?${B1}`))) {
    repeat = "monthly";
    monthDay = Math.min(31, Math.max(1, parseInt(m[1], 10)));
  } else if ((m = take(`${B0}(?:her ay(?:ın)?|aylık|ayda bir)${B1}`))) {
    repeat = "monthly";
  } else if ((m = take(`${B0}her ${WEEKDAY_RE}(?: gün[${L}]*)?${WORD_SUF}${B1}`))) {
    repeat = "weekly";
    weekday = WEEKDAYS[m[1]];
  } else if ((m = take(`${B0}(?:her hafta|haftalık|haftada bir)${B1}`))) {
    repeat = "weekly";
  } else if ((m = take(`${B0}her ${PERIOD_RE}${B1}`))) {
    repeat = "daily";
    period = normPeriod(m[1]);
  } else if ((m = take(`${B0}(?:her gün|hergün|günlük|her gece|günde bir)${B1}`))) {
    repeat = "daily";
    if (m[0].includes("gece")) period = "gece";
  }

  // ---- Göreli süre: "20 dakika sonra", "yarım saat sonra", "3 gün sonra" ----
  if ((m = take(`${B0}(\\d{1,3}|bir|yarım) ?(dakika|dk|saat|gün|hafta|ay) ?(?:sonra|içinde)${B1}`))) {
    const n = wordNum(m[1]);
    const unit = m[2];
    if (unit === "dakika" || unit === "dk") exactAt = now + n * 60_000;
    else if (unit === "saat") exactAt = now + n * 3_600_000;
    else if (unit === "gün") day = wallAddDays(today, Math.round(n));
    else if (unit === "hafta") day = wallAddDays(today, Math.round(n * 7));
    else {
      const d = new Date(today);
      d.setUTCMonth(d.getUTCMonth() + Math.round(n));
      day = d;
    }
  }

  // ---- Gün ifadeleri ----
  if ((m = take(`${B0}bu ${PERIOD_RE}${WORD_SUF}${B1}`))) {
    day = today;
    dayIsToday = true;
    period = normPeriod(m[1]);
  }
  if (!day && take(`${B0}(?:öbür gün|öbürgün|ertesi gün|yarından sonra)${B1}`)) {
    day = wallAddDays(today, 2);
  }
  if (!day && take(`${B0}(?:bugün|bu gün)${WORD_SUF}${B1}`)) {
    day = today;
    dayIsToday = true;
  }
  if (!day && take(`${B0}yarın${WORD_SUF}${B1}`)) {
    day = wallAddDays(today, 1);
  }
  if ((m = take(`${B0}(?:(haftaya|gelecek|önümüzdeki|bu) )?${WEEKDAY_RE}(?: gün[${L}]*)?${WORD_SUF}${B1}`))) {
    weekday = WEEKDAYS[m[2]];
    nextWeek = !!m[1] && m[1] !== "bu";
  }
  if (!day && weekday === null && take(`${B0}(?:hafta ?sonu)${WORD_SUF}${B1}`)) {
    weekday = 6;
  }
  if (!day && weekday === null && take(`${B0}(?:haftaya|gelecek hafta|önümüzdeki hafta)${B1}`)) {
    day = wallAddDays(today, 7);
  }

  // ---- Açık tarih: "15 ekim", "15 Ekim 2026'da" ----
  if ((m = take(`${B0}(\\d{1,2}) ${MONTH_RE}${WORD_SUF}(?: (\\d{4})${NUM_SUF})?${B1}`))) {
    const dd = parseInt(m[1], 10);
    const mm = MONTHS.indexOf(m[2]);
    day = buildDate(dd, mm, m[3] ? parseInt(m[3], 10) : null, today);
  }
  // "15.10.2026", "15/10" (saatle karışmaması için '.' ile yazılmış ve 'da/te' ekli olanlar saat sayılır)
  if (!day && (m = take(`${B0}(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})${NUM_SUF}${B1}`))) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    day = buildDate(parseInt(m[1], 10), parseInt(m[2], 10) - 1, y, today);
  }
  if (!day && (m = take(`${B0}(\\d{1,2})/(\\d{1,2})${NUM_SUF}${B1}`))) {
    day = buildDate(parseInt(m[1], 10), parseInt(m[2], 10) - 1, null, today);
  }
  // "ayın 5'inde"
  if (!day && monthDay === null && (m = take(`${B0}ayın (\\d{1,2})${NUM_SUF}${B1}`))) {
    const dd = parseInt(m[1], 10);
    let d = buildDate(dd, today.getUTCMonth(), today.getUTCFullYear(), today);
    if (d && d < today) d = buildDate(dd, today.getUTCMonth() + 1, today.getUTCFullYear(), today);
    day = d;
  }

  // ---- Saat ----
  const periodBefore = `(?:${PERIOD_RE}${WORD_SUF} )?`;
  const setTime = (mm: RegExpExecArray, h: number, min: number, periodStr?: string) => {
    if (h > 24 || min > 59) return false;
    consume(mm.index, mm.index + mm[0].length);
    if (periodStr) period = normPeriod(periodStr);
    time = [h % 24, min];
    return true;
  };
  const find = (pattern: string) => new RegExp(pattern, "u").exec(work);
  const timeRules: Array<() => boolean> = [
    // "akşam saat 8'de", "saat 10", "saat 14:30'da", "saat 10 buçukta"
    () => {
      const mm = find(`${B0}${periodBefore}saat (\\d{1,2})(?:[:.](\\d{2}))?( buçuk)?${NUM_SUF}${B1}`);
      return !!mm && setTime(mm, +mm[2], mm[4] ? 30 : mm[3] ? +mm[3] : 0, mm[1]);
    },
    // "14:30", "sabah 9:15"
    () => {
      const mm = find(`${B0}${periodBefore}(\\d{1,2}):(\\d{2})${NUM_SUF}${B1}`);
      return !!mm && setTime(mm, +mm[2], +mm[3], mm[1]);
    },
    // "14.30" veya "10.05'te" — "15.10" gibi ekisiz ve dakikası ≤ 12 olanlar tarih sayılır
    () => {
      const mm = find(`${B0}${periodBefore}(\\d{1,2})\\.(\\d{2})('?(?:d[ae]|t[ae]))?${B1}(?!\\.\\d)`);
      if (!mm || !(mm[1] || mm[4] || +mm[3] > 12)) return false;
      return setTime(mm, +mm[2], +mm[3], mm[1]);
    },
    // "10 buçukta"
    () => {
      const mm = find(`${B0}${periodBefore}(\\d{1,2}) buçuk${WORD_SUF}${B1}`);
      return !!mm && setTime(mm, +mm[2], 30, mm[1]);
    },
    // "sabah 9", "akşam 8'de"
    () => {
      const mm = find(`${B0}${PERIOD_RE}${WORD_SUF} (\\d{1,2})${NUM_SUF}${B1}`);
      return !!mm && setTime(mm, +mm[2], 0, mm[1]);
    },
    // "10'da", "3'te"
    () => {
      const mm = find(`${B0}(\\d{1,2})'?(?:d[ae]|t[ae])${B1}`);
      return !!mm && setTime(mm, +mm[1], 0);
    },
  ];
  timeRules.some((rule) => rule());

  // Noktalı kısa tarih: "15.10"
  if (!day && (m = take(`${B0}(\\d{1,2})\\.(\\d{1,2})${NUM_SUF}${B1}`))) {
    day = buildDate(parseInt(m[1], 10), parseInt(m[2], 10) - 1, null, today);
  }

  // Tek başına dönem: "akşam", "sabahleyin", "öğleden sonra"
  if (!period && (m = take(`${B0}${PERIOD_RE}${WORD_SUF}${B1}`))) {
    period = normPeriod(m[1]);
  }

  // ---- Başlık ----
  const title = cleanTitle(orig);

  // ---- Zamanı birleştir ----
  const timeExplicit = time !== null || exactAt !== null;
  let hm: [number, number] | null = time
    ? [applyPeriod(time[0], period), time[1]]
    : period
      ? PERIOD_DEFAULT[period]
      : null;

  if (exactAt !== null && !day && repeat === "none") {
    return { title, dueAt: Math.floor(exactAt / 60_000) * 60_000, repeat, timeExplicit: true };
  }
  if (exactAt !== null && !hm) {
    const w = toWall(exactAt);
    hm = [w.getUTCHours(), w.getUTCMinutes()];
  }

  const at = (d: Date, t: [number, number]) => wallAt(d, t[0], t[1]);

  if (weekday !== null && !day) {
    const t = hm ?? DEFAULT_TIME;
    let diff = (weekday - today.getUTCDay() + 7) % 7;
    if (nextWeek) {
      // "haftaya cuma": bu haftanın (Pazartesi başlangıçlı) cumasından bir hafta sonrası
      const mondayOffset = (today.getUTCDay() + 6) % 7;
      const thisWeek = ((weekday + 6) % 7) - mondayOffset;
      diff = thisWeek + 7;
    } else if (diff === 0 && at(today, t) <= now) {
      diff = 7;
    }
    day = wallAddDays(today, diff);
  }

  if (monthDay !== null && !day) {
    const t = hm ?? DEFAULT_TIME;
    let d = buildDate(monthDay, today.getUTCMonth(), today.getUTCFullYear(), today, true);
    if (!d || at(d, t) <= now) d = buildDate(monthDay, today.getUTCMonth() + 1, today.getUTCFullYear(), today, true);
    day = d;
  }

  if (!day && !hm && repeat === "none") {
    return { title, dueAt: null, repeat, timeExplicit: false };
  }

  if (!day) {
    // Sadece saat (veya sadece tekrar) söylendi: bugün geçmediyse bugün, yoksa yarın.
    const t = hm ?? DEFAULT_TIME;
    day = at(today, t) > now ? today : wallAddDays(today, 1);
  }

  let dueAt = at(day, hm ?? DEFAULT_TIME);

  // "bu akşam" dendi ama varsayılan saat geçtiyse, yakın bir zamana kaydır.
  if (dayIsToday && !timeExplicit && dueAt <= now) {
    dueAt = Math.ceil((now + 15 * 60_000) / 300_000) * 300_000;
  }

  return { title, dueAt, repeat, timeExplicit };
}

function buildDate(dd: number, mm: number, yyyy: number | null, today: Date, clamp = false): Date | null {
  const year = yyyy ?? today.getUTCFullYear();
  const first = new Date(Date.UTC(year, mm, 1));
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  if (dd < 1 || (dd > dim && !clamp)) return null;
  first.setUTCDate(Math.min(dd, dim));
  if (yyyy === null && first < today) first.setUTCFullYear(first.getUTCFullYear() + 1);
  return first;
}

const FILLER_END = [
  /\s*(?:diye\s+)?(?:bana\s+)?hatırlat(?:ır mısın|abilir misin|sana|ma|)?\s*[.!?]*$/u,
  /\s*(?:lütfen)\s*[.!?]*$/u,
];
const FILLER_START = [/^(?:lütfen|bana|hatırlatma\s*:?)\s+/iu];

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  let removedHatirlat = false;
  for (const re of FILLER_END) {
    const before = t;
    t = t.replace(re, "").trim();
    if (before !== t && /hatırlat/iu.test(before)) removedHatirlat = true;
  }
  for (const re of FILLER_START) t = t.replace(re, "").trim();

  // Bağlaçlardan ve tek başına kalan zaman artıklarından temizle
  const DANGLING = /^(?:ve|de|da|için|saat|günü|gün|ile|,|-)\s+|\s+(?:ve|için|saat|günü|ile|,|-)$/iu;
  for (let i = 0; i < 4; i++) t = t.replace(DANGLING, "").trim();
  t = t.replace(/^[,.;:\-–\s]+|[,;:.!?\-–\s]+$/gu, "").trim();

  // "Hetzner ödemesini hatırlat" → "Hetzner ödemesi"
  if (removedHatirlat) {
    t = t.replace(/(s[ıiuü])n[ıiuü]$/u, "$1").replace(/([aeıioöuü])y[ıiuü]$/u, "$1");
  }
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1);
}

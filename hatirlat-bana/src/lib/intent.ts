/**
 * "Hemen yola çık / navigasyon modu" niyeti.
 *
 * Konum var, zaman ifadesi yok ve cümle şimdiki eylem bildiriyorsa ("Erdemli'ye gidiyorum",
 * "Köln Hbf'ye git", "Beni Bonn'a götür", "Navigasyonu Dortmund Flughafen'e aç") hatırlatma
 * onayı yerine doğrudan hızlı aksiyon ekranı açılır.
 *
 *   zaman / tarih / tekrar ifadesi varsa  → normal hatırlatma
 *   yalnızca şimdi / gidiyorum / yola çıkıyorum / git … → hızlı navigasyon
 */
import { tolerant } from "./location";
import { parseReminder } from "./parse";

export interface NavigationIntent {
  location: string;
}

/** Şimdiki hareket niyeti; Türkçe karakter düşmesine ("yola cikiyorum") ve konuşma dili yazımlarına ("gidiyom") toleranslı. */
const NAV_CUE = new RegExp(
  "(?<![\\p{L}])(?:" +
    [
      "gidiyorum",
      "gidiyoruz",
      "gidiyom",
      "gidiyoz",
      "gidelim",
      "yola çıkıyorum",
      "yola çıkıyoruz",
      "yola çıkıyom",
      "yola çıkıyoz",
      "yola çık",
      "götür(?:ür müsün|ebilir misin)?",
      "navigasyon\\p{L}*",
      "rota\\p{L}*",
      "şimdi",
      "git", // "Köln Hbf'ye git." (emir)
    ]
      .map(tolerant)
      .join("|") +
    ")(?![\\p{L}])",
  "iu",
);

/** Açıkça hatırlatma istenen cümleler hızlı moda girmez. */
const REMINDER_CUE = new RegExp(tolerant("hatırlat|hatırla(?![\\p{L}])|unutma"), "iu");

export function detectNavigationIntent(text: string, now: number = Date.now()): NavigationIntent | null {
  const p = parseReminder(text, now);
  if (!p.location) return null;
  if (p.dueAt !== null || p.repeat !== "none") return null; // zaman ifadesi var → hatırlatma
  const t = text.toLocaleLowerCase("tr-TR");
  if (REMINDER_CUE.test(t) || !NAV_CUE.test(t)) return null;
  return { location: p.location };
}

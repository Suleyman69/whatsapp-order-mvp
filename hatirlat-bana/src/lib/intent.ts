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
import { type AddressBook, emptyBook } from "./addressbook";
import { tolerant } from "./location";
import { type ParseResult, parseReminder } from "./parse";
import { resolveAddress } from "./resolve";

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

export interface SpeechAnalysis {
  parsed: ParseResult;
  /** Çözümlemeden sonraki konum (yüksek güvenli otomatik düzeltme uygulanmış olabilir) */
  location: string | null;
  /** Orta güvenli öneri: "… mu demek istedin?" (otomatik uygulanmaz) */
  suggestion: string | null;
  /** Görev başlığı (konum otomatik düzeltildiyse güncellenmiş) */
  title: string;
  /** Hızlı navigasyon modu: güvenilir hedef + zaman ifadesi yok + şimdiki hareket niyeti */
  navigation: boolean;
}

/** Metni ayrıştırır, konumu adres defteriyle çözümler ve hızlı navigasyon niyetini belirler. */
export function analyzeSpeech(text: string, now: number = Date.now(), book: AddressBook = emptyBook()): SpeechAnalysis {
  const parsed = parseReminder(text, now, { book });
  let location = parsed.location;
  let suggestion: string | null = null;
  let title = parsed.title;
  if (location && parsed.locationKind !== "alias") {
    const r = resolveAddress(location, book);
    if (r.status === "auto") {
      title = title.split(location).join(r.location);
      location = r.location;
    } else if (r.status === "suggest" && r.suggestion) {
      suggestion = r.suggestion;
    }
  }
  let navigation = false;
  if (location && parsed.dueAt === null && parsed.repeat === "none") {
    const t = text.toLocaleLowerCase("tr-TR");
    // Yalnızca güvenilir hedef: zayıf tahminler ayrıştırıcıda zaten konum sayılmaz
    navigation = !REMINDER_CUE.test(t) && (NAV_CUE.test(t) || parsed.locationBare);
  }
  return { parsed, location, suggestion, title, navigation };
}

export function detectNavigationIntent(text: string, now: number = Date.now(), book?: AddressBook): NavigationIntent | null {
  const a = analyzeSpeech(text, now, book);
  return a.navigation && a.location ? { location: a.location } : null;
}

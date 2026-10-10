/**
 * Adres defteri: kullanıcı tanımlı kısa adlar ("ev", "iş", "Hbf", "Flughafen", "Münster"),
 * sık kullanılan adresler ve kullanıcının yaptığı düzeltmeler. Bulanık eşleştirme bunlara
 * yerleşik cadde listesinden daha yüksek ağırlık verir.
 */
import { GERMAN_CITIES, TURKISH_CITIES } from "./cities";
import { fold } from "./fuzzy";

export interface BookAlias {
  /** Kullanıcının yazdığı kısa ad ("ev") */
  name: string;
  /** Tam adres ("Dortmund, Münsterstraße 160") */
  address: string;
}

export interface AddressBook {
  /** Anahtar: fold(ad) */
  aliases: Record<string, BookAlias>;
  /** Anahtar: adres. Kaydedilen/gidilen/onaylanan adresler. */
  used: Record<string, { count: number; last: number }>;
  /** Anahtar: fold(yanlış yazım) → kullanıcının onayladığı doğru adres */
  corrections: Record<string, string>;
}

export const emptyBook = (): AddressBook => ({ aliases: {}, used: {}, corrections: {} });

/** IndexedDB'den gelen (belki eksik/eski) veriyi güvenli biçimde AddressBook'a çevirir. */
export function normalizeBook(raw: unknown): AddressBook {
  const b = emptyBook();
  if (!raw || typeof raw !== "object") return b;
  const r = raw as Partial<AddressBook>;
  for (const [k, v] of Object.entries(r.aliases ?? {})) {
    if (v && typeof v.name === "string" && typeof v.address === "string") b.aliases[k] = { name: v.name, address: v.address };
  }
  for (const [k, v] of Object.entries(r.used ?? {})) {
    if (v && typeof v.count === "number" && typeof v.last === "number") b.used[k] = { count: v.count, last: v.last };
  }
  for (const [k, v] of Object.entries(r.corrections ?? {})) if (typeof v === "string") b.corrections[k] = v;
  return b;
}

export function setAlias(book: AddressBook, name: string, address: string): AddressBook {
  const key = fold(name);
  const n = name.trim();
  const a = address.trim();
  if (!key || !a) return book;
  return { ...book, aliases: { ...book.aliases, [key]: { name: n, address: a } } };
}

export function removeAlias(book: AddressBook, name: string): AddressBook {
  const aliases = { ...book.aliases };
  delete aliases[fold(name)];
  return { ...book, aliases };
}

/** Bir adresin kullanıldığını kaydeder (hatırlatma kaydı, navigasyon, onaylanan öneri). */
export function recordUse(book: AddressBook, address: string, now: number = Date.now()): AddressBook {
  const a = address.trim();
  if (!a) return book;
  const prev = book.used[a];
  return { ...book, used: { ...book.used, [a]: { count: (prev?.count ?? 0) + 1, last: now } } };
}

/** Kullanıcı yanlış yazılan adresi düzeltti: bir dahaki sefere otomatik uygulanır. */
export function learnCorrection(book: AddressBook, wrong: string, right: string, now: number = Date.now()): AddressBook {
  const key = fold(wrong);
  const r = right.trim();
  if (!key || !r || fold(r) === key) return book;
  return recordUse({ ...book, corrections: { ...book.corrections, [key]: r } }, r, now);
}

const ALIAS_SUFFIXES = ["nde", "nda", "ye", "ya", "de", "da", "te", "ta", "ne", "na", "e", "a"];

/**
 * Cümledeki yer öbeğini kullanıcı tanımlı kısa adlara bağlar. Hal ekli hâller de eşleşir:
 * "Eve", "evde", "işe", "Hbf'ye", "Flughafen'e", "Münster'e".
 */
export function matchAlias(seg: string, book: AddressBook): BookAlias | null {
  if (!Object.keys(book.aliases).length) return null;
  const noApos = seg.trim().replace(/['’][\p{L}]{1,4}$/u, "");
  const f = fold(noApos);
  if (!f) return null;
  const forms = [f, ...ALIAS_SUFFIXES.filter((s) => f.length > s.length + 1 && f.endsWith(s)).map((s) => f.slice(0, -s.length))];
  for (const form of forms) if (book.aliases[form]) return book.aliases[form];
  return null;
}

/** Cadde adları bilinen şehirlerde yer alır; kapsamlı bir adres veritabanı değildir, yalnızca bulanık eşleştirme içindir. */
export const GAZETTEER: Record<string, string[]> = {
  Dortmund: [
    "Münsterstraße", "Mallinckrodtstraße", "Rheinische Straße", "Hohe Straße", "Kampstraße", "Hansastraße",
    "Brückstraße", "Märkische Straße", "Ruhrallee", "Schwanenwall", "Westenhellweg", "Ostwall", "Hörder Hellweg",
    "Evinger Straße", "Bornstraße", "Schützenstraße", "Leopoldstraße", "Saarlandstraße", "Wittekindstraße", "Kaiserstraße",
  ],
  Bonn: ["Rochusstraße", "Adenauerallee", "Poppelsdorfer Allee", "Friedrich-Ebert-Allee", "Reuterstraße", "Kaiserstraße"],
  Köln: ["Hohenzollernring", "Hohe Straße", "Schildergasse", "Aachener Straße", "Venloer Straße", "Severinstraße"],
  Essen: ["Rüttenscheider Straße", "Kettwiger Straße", "Huyssenallee", "Rellinghauser Straße"],
  Düsseldorf: ["Königsallee", "Berliner Allee", "Graf-Adolf-Straße"],
};

/** "Sinemaya gidiyorum" gibi cümlelerin yer sayılmaması için, yalnızca bilinen şehirler tek başına güvenilir hedeftir. */
export const KNOWN_CITIES = [...GERMAN_CITIES, ...TURKISH_CITIES];
const KNOWN_CITY_KEYS = new Set(KNOWN_CITIES.map(fold));

/** Tek başına anlamsız yer türü sözcükleri: yanlarında şehir/ad yoksa güvenilir hedef değildir ("Hbf'ye git"). */
const GENERIC_PLACE_WORDS = new Set(
  ["hbf", "hauptbahnhof", "bahnhof", "flughafen", "airport", "messe", "zob", "rathaus", "krankenhaus", "klinik", "uni",
   "universitat", "stadion", "havalimani", "hastane", "istasyon", "otogar", "park", "zentrum", "centrum", "mitte", "stadt"].map(fold),
);

/** Konum yalnızca genel yer türü sözcüklerinden mi oluşuyor? ("Hbf", "Flughafen") */
export function isOnlyGenericPlace(location: string): boolean {
  const words = location.split(/[\s,]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC_PLACE_WORDS.has(fold(w)));
}

/** Konum bilinen bir şehirle ya da adres defterindeki bir kayıtla başlıyor mu? */
export function isKnownPlace(location: string, book?: AddressBook): boolean {
  const first = location.split(/[\s,]+/).filter(Boolean)[0];
  if (!first) return false;
  if (KNOWN_CITY_KEYS.has(fold(first))) return true;
  if (!book) return false;
  const f = fold(location);
  return Object.values(book.aliases).some((a) => fold(a.address).startsWith(f)) || Object.keys(book.used).some((a) => fold(a).includes(f));
}

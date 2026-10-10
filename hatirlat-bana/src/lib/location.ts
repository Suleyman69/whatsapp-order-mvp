/**
 * "Yarın saat 8'de Bonn Rochusstraße 400'de olacağım" gibi cümlelerden hedef konumu ayırır.
 * Konum yalnızca "git / ol / var" fiilleriyle birlikte, yer-hal ekli bir öbek olarak aranır
 * ("Erdemli'ye git", "Köln Hbf'de olmam lazım"); "Mehmet'i ara" gibi cümlelerde konum çıkmaz.
 */

const MASK_BASE = 0xe000;
const STREET_SUFFIX = "(?:straße|strasse|str\\.?|weg|allee|platz|gasse|ring|damm|ufer|chaussee)";
const STREET_NUMBER = new RegExp(`(?<![\\p{L}])[\\p{L}-]*${STREET_SUFFIX}\\s+(\\d{1,4}[a-z]?)(?![\\p{L}\\d])`, "giu");

/**
 * "Rochusstraße 8'de" gibi sokak numaralarındaki rakamları özel karakterlere çevirir ki
 * saat çözümleyici "8'de"yi saat sanmasın. Metin uzunluğu değişmez.
 */
export function maskHouseNumbers(text: string): string {
  let out = text;
  for (const m of text.matchAll(STREET_NUMBER)) {
    const num = m[1];
    const start = (m.index ?? 0) + m[0].length - num.length;
    const masked = num.replace(/\d/g, (d) => String.fromCharCode(MASK_BASE + Number(d)));
    out = out.slice(0, start) + masked + out.slice(start + num.length);
  }
  return out;
}

export function unmask(text: string): string {
  return text.replace(/[-]/g, (c) => String(c.charCodeAt(0) - MASK_BASE));
}

const VERB_RE = new RegExp(
  "(?<![\\p{L}])(" +
    [
      "gideceğim",
      "gideceğiz",
      "gidiyorum",
      "gitmem lazım",
      "gitmem gerek(?:iyor)?",
      "gitmeliyim",
      "gitmek için",
      "git",
      "olacağım",
      "olacağız",
      "olmam lazım",
      "olmam gerek(?:iyor)?",
      "olmalıyım",
      "ol",
      "varacağım",
      "varacağız",
      "varmam lazım",
      "varmalıyım",
    ].join("|") +
    ")(?![\\p{L}])",
  "iu",
);

/** Kesme işaretsiz yazımda adresin sonundaki hal eki (git/var → yönelme, ol → bulunma). */
const ADDRESS_SUFFIXES = { dative: ["ya", "ye", "a", "e"], locative: ["da", "de", "ta", "te"] };
const CASE_SUFFIXES = new Set(["e", "a", "ye", "ya", "de", "da", "te", "ta", "ne", "na", "nde", "nda"]);
const LEADING_FILLER = /^(?:(?:beni|bana|ben|lütfen|hemen|artık)\s+)+/iu;
const CLAUSE_BREAK = /(?:[,;]|(?<![\p{L}])(?:için|ve|ile|ben)(?![\p{L}]))\s*/giu;

/** Gidilecek yer olamayacak genel sözcükler. */
const GENERIC = new Set(["ev", "eve", "evde", "iş", "işe", "işte", "okul", "okula", "market", "markete", "dışarı", "dışarıya", "buraya", "oraya", "yukarı", "aşağı", "geri"]);

const trUpper = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

const STREET_WORD = new RegExp(`${STREET_SUFFIX}$`, "iu");
const STREET_STANDALONE = /^(?:straße|strasse|str\.?)$/iu;
const HOUSE_NUMBER = /^\d{1,4}[a-z]?$/iu;

export interface Address {
  /** "Dortmund" (varsa) */
  city?: string;
  /** "Münsterstraße 160" */
  street: string;
}

/** Hepsi küçük harfle yazılmışsa kelimelerin ilk harfini büyütür. */
function normalizeCase(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  return s === s.toLocaleLowerCase("tr-TR") ? s.split(" ").map(trUpper).join(" ") : s;
}

/**
 * "Dortmund Münsterstraße 160", "Dortmund Münster Straße 160", "Münsterstraße 160 Dortmund" gibi
 * şehir + cadde + bina numarası öbeklerini ayırır. Cadde+numara yoksa null.
 */
export function parseAddress(raw: string): Address | null {
  const t = normalizeCase(raw).replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const i = t.findIndex((w, k) => STREET_WORD.test(w) && k + 1 < t.length && HOUSE_NUMBER.test(t[k + 1]));
  if (i < 0) return null;
  // "Münster Straße 160": ayrı yazılmış cadde sözcüğü bir önceki sözcükle birlikte cadde adıdır
  const start = STREET_STANDALONE.test(t[i]) && i > 0 ? i - 1 : i;
  const street = `${t.slice(start, i + 1).join(" ")} ${t[i + 1]}`;
  const before = t.slice(0, start);
  const after = t.slice(i + 2);
  if (before.length && after.length) return null; // belirsiz, olduğu gibi bırak
  const cityWords = before.length ? before : after;
  if (cityWords.some((w) => /\d/.test(w))) return null; // posta kodu vb.: olduğu gibi bırak
  return { city: cityWords.join(" ") || undefined, street };
}

/** "Bonn Rochusstraße 400" → "Bonn, Rochusstraße 400"; adres değilse yalnızca büyük/küçük harf düzeltilir. */
export function formatLocation(raw: string): string {
  const addr = parseAddress(raw);
  if (addr) return addr.city ? `${addr.city}, ${addr.street}` : addr.street;
  return normalizeCase(raw);
}

const ALL_VOWELS = "aeıioöuü";

/** Türkçe ünlü uyumuyla hal eki: "Dortmund" + dative → "a"; "Köln" + locative → "de". */
export function caseSuffix(word: string, kind: "dative" | "locative"): string {
  const w = word.toLocaleLowerCase("tr-TR").replace(/[^\p{L}]/gu, "");
  const lastVowel = [...w].reverse().find((c) => ALL_VOWELS.includes(c));
  const vowel = lastVowel && "aıou".includes(lastVowel) ? "a" : "e";
  const endsWithVowel = ALL_VOWELS.includes(w.slice(-1));
  if (kind === "dative") return `${endsWithVowel ? "y" : ""}${vowel}`;
  return `${/[fstkçşhp]$/u.test(w) ? "t" : "d"}${vowel}`;
}

export interface LocationMatch {
  location: string;
  /** Konum ve fiil temizlenmiş/normalleştirilmiş görev başlığı ("Erdemli'ye git"). */
  title: string;
}

/** `rest`: tarih/saat/tekrar ifadeleri çıkarılmış, büyük/küçük harfi korunmuş metin. */
export function extractLocation(rest: string): LocationMatch | null {
  const text = unmask(rest);
  const v = VERB_RE.exec(text);
  if (!v) return null;
  const before = text.slice(0, v.index);
  const after = text.slice(v.index + v[0].length);

  // Son yan cümleden sonrasını al ("Annemi ziyaret etmek için Erdemli'ye" → "Erdemli'ye")
  let segStart = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) segStart = (m.index ?? 0) + m[0].length;
  // "Dortmund, Münsterstraße 160'a": virgülün öncesi şehirse (1-3 büyük harfli sözcük) ve sonrası cadde+numaraysa yan cümle sayma
  if (new RegExp(`${STREET_SUFFIX}\\s+\\d`, "iu").test(before.slice(segStart))) {
    const city = /(?:^|\s)((?:\p{Lu}[\p{L}.-]*\s+){0,2}\p{Lu}[\p{L}.-]*),\s*$/u.exec(before.slice(0, segStart));
    if (city) segStart = city.index + city[0].length - city[0].trimStart().length;
  }
  const seg = before.slice(segStart).trim().replace(LEADING_FILLER, "");
  if (!seg) return null;

  const verb = v[1].toLocaleLowerCase("tr-TR");
  const norm: "git" | "ol" | "var" = verb.startsWith("gi") ? "git" : verb.startsWith("ol") ? "ol" : "var";
  const kind = norm === "ol" ? "locative" : "dative";

  let base: string;
  let suffix = "";
  const apos = /^(.+?)'([\p{L}]{1,4})$/u.exec(seg);
  if (apos) {
    if (!CASE_SUFFIXES.has(apos[2].toLocaleLowerCase("tr-TR"))) return null;
    base = apos[1];
    suffix = apos[2];
  } else {
    // Kesme işaretsiz adres: "Münsterstraße 160'a" yerine konuşma tanımanın verdiği "160a", "160 a" ya da eksiz "160"
    const addr = new RegExp(`^(.*${STREET_SUFFIX}\\s+\\d{1,4})(?:\\s?([\\p{L}]{1,2}))?$`, "iu").exec(seg);
    if (addr) {
      const tail = (addr[2] ?? "").toLocaleLowerCase("tr-TR");
      if (tail && ADDRESS_SUFFIXES[kind].includes(tail)) {
        base = addr[1];
        suffix = tail;
      } else {
        base = addr[1] + (addr[2] ?? ""); // "160b": bina harfi
      }
    } else {
      const bare = /^(.*[\p{L}\d]{3})(ye|ya)$/iu.exec(seg);
      if (!bare) return null;
      base = bare[1];
      suffix = bare[2];
    }
  }
  base = base.trim();
  const words = base.split(/\s+/);
  if (!base || words.length > 6) return null;
  if (!/\p{L}/u.test(base) || GENERIC.has(base.toLocaleLowerCase("tr-TR"))) return null;
  // Özel ad belirtisi: kesme işareti, büyük harf ya da rakam ("erdemliye git" gibi belirsiz yazımlar atlanır)
  if (!(apos || /\p{Lu}/u.test(base) || /\d/.test(base))) return null;

  const location = formatLocation(base);
  // Tam adreste görev kısa olur: "Dortmund Münsterstraße 160'a gideceğim" → "Dortmund'a git"
  const addr = parseAddress(base);
  let place: string;
  if (addr?.city) place = `${addr.city}'${caseSuffix(addr.city, kind)}`;
  else if (suffix) place = `${location}'${suffix}`;
  else place = `${location} ${kind === "locative" ? "adresinde" : "adresine"}`;
  const prefix = before.slice(0, segStart).trimEnd();
  const title = `${prefix ? `${prefix} ` : ""}${place} ${norm}${after}`;
  return { location, title };
}

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

const CASE_SUFFIXES = new Set(["e", "a", "ye", "ya", "de", "da", "te", "ta", "ne", "na", "nde", "nda"]);
const LEADING_FILLER = /^(?:(?:beni|bana|ben|lütfen|hemen|artık)\s+)+/iu;
const CLAUSE_BREAK = /(?:[,;]|(?<![\p{L}])(?:için|ve|ile|ben)(?![\p{L}]))\s*/giu;

/** Gidilecek yer olamayacak genel sözcükler. */
const GENERIC = new Set(["ev", "eve", "evde", "iş", "işe", "işte", "okul", "okula", "market", "markete", "dışarı", "dışarıya", "buraya", "oraya", "yukarı", "aşağı", "geri"]);

const STREET_ADDRESS = new RegExp(`^(\\p{L}[\\p{L}.-]*)\\s+(\\p{L}[\\p{L}.-]*${STREET_SUFFIX})\\s+(\\d{1,4}\\s?[A-Za-z]?)$`, "iu");

const trUpper = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

/** Hepsi küçük harfle yazılmışsa kelimelerin ilk harfini büyütür; "Bonn Rochusstraße 400" → "Bonn, Rochusstraße 400". */
export function formatLocation(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (s === s.toLocaleLowerCase("tr-TR")) s = s.split(" ").map(trUpper).join(" ");
  const m = STREET_ADDRESS.exec(s);
  return m ? `${m[1]}, ${m[2]} ${m[3]}` : s;
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
  const seg = before.slice(segStart).trim().replace(LEADING_FILLER, "");
  if (!seg) return null;

  let base: string;
  let suffix = "";
  const apos = /^(.+?)'([\p{L}]{1,4})$/u.exec(seg);
  if (apos) {
    if (!CASE_SUFFIXES.has(apos[2].toLocaleLowerCase("tr-TR"))) return null;
    base = apos[1];
    suffix = apos[2];
  } else {
    const bare = /^(.*[\p{L}\d]{3})(ye|ya)$/iu.exec(seg);
    if (!bare) return null;
    base = bare[1];
    suffix = bare[2];
  }
  base = base.trim();
  const words = base.split(/\s+/);
  if (!base || words.length > 6) return null;
  if (!/\p{L}/u.test(base) || GENERIC.has(base.toLocaleLowerCase("tr-TR"))) return null;
  // Özel ad belirtisi: kesme işareti, büyük harf ya da rakam ("erdemliye git" gibi belirsiz yazımlar atlanır)
  if (!(apos || /\p{Lu}/u.test(base) || /\d/.test(base))) return null;

  const location = formatLocation(base);
  const verb = v[1].toLocaleLowerCase("tr-TR");
  const norm = verb.startsWith("gi") ? "git" : verb.startsWith("ol") ? "ol" : "var";
  const prefix = before.slice(0, segStart).trimEnd();
  const title = `${prefix ? `${prefix} ` : ""}${location}'${suffix} ${norm}${after}`;
  return { location, title };
}

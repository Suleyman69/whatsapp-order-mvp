/**
 * "Yarın saat 8'de Bonn Rochusstraße 400'de olacağım" gibi cümlelerden hedef konumu ayırır.
 * Konum yalnızca "git / ol / var" gibi fiillerle birlikte, yer-hal ekli bir öbek olarak aranır
 * ("Erdemli'ye git", "Köln Hbf'de olmam lazım"); "Mehmet'i ara" gibi cümlelerde konum çıkmaz.
 *
 * Girdi çoğunlukla iPhone Web Speech çıktısıdır; bu yüzden toleranslıdır:
 *  - cadde eki: str, str., strasse, straße, strase … → "straße"
 *  - ayrı yazım: "Münster Straße 160" → "Münsterstraße 160"
 *  - bina numarası: 160'a, 160a, 160 a, 160, 160-162, "Nr. 160"
 *  - büyük/küçük harf: "dortmund MÜNSTERSTRASSE 160" → "Dortmund, Münsterstraße 160"
 *  - ç/ş/ğ/ı/ö/ü düşmesi: "yola cikiyorum", "gidiyom", "navigasyonu ac"
 */

/**
 * Türkçe karakterlerin ASCII karşılığını da kabul eden desen (konuşma tanıma/yazım hataları için).
 * Yalnızca küçük harfli desen metinlerine uygulanır; "i" bayrağıyla birlikte kullanılır.
 */
export function tolerant(pattern: string): string {
  const map: Record<string, string> = { ç: "[çc]", ş: "[şs]", ğ: "[ğg]", ı: "[ıi]", ö: "[öo]", ü: "[üu]" };
  return pattern.replace(/[çşğıöü]/g, (c) => map[c]);
}

const MASK_BASE = 0xe000;

/** Cadde sonekleri; "straße" için yaygın yazım/tanıma varyantları dahildir. */
const STREET_CORE = "(?:str(?:a(?:ß|ss|s|sz)e)?\\.?|weg|allee|platz|gasse|ring|damm|ufer|chaussee)";
/** "Nr. 160", "No 160", "Hausnummer 160" gibi araya girebilen sözcük */
const NR_WORD = "(?:\\s+(?:nr|no|nummer|hausnummer)\\.?)?";
/** 160, 160a, 160-162, 12/14 */
const NUM = "\\d{1,4}(?:[-–/]\\d{1,4})?[a-z]?";

const STREET_NUMBER = new RegExp(
  `(?<![\\p{L}])[\\p{L}-]*${STREET_CORE}${NR_WORD}\\s+(${NUM})(?!\\d)`,
  "giu",
);

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
  return text.replace(/[\ue000-\ue009]/g, (c) => String(c.charCodeAt(0) - MASK_BASE));
}

const BASE_VERBS = [
  "gideceğim",
  "gideceğiz",
  "gidecem",
  "gidicem",
  "gidiyorum",
  "gidiyoruz",
  "gidiyom",
  "gidiyoz",
  "gidelim",
  "gitmem lazım",
  "gitmem gerek(?:iyor)?",
  "gitmeliyim",
  "gitmek için",
  "yola çıkıyorum",
  "yola çıkıyoruz",
  "yola çıkıyom",
  "yola çıkıyoz",
  "yola çıkacağım",
  "götürür müsün",
  "götürebilir misin",
  "götür",
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
];
/** "Navigasyonu Dortmund Flughafen'e aç" gibi cümleler için; "aç" tek başına çok genel olduğundan yalnızca navigasyon/rota geçince aranır. */
const NAV_VERBS = ["açar mısın", "açabilir misin", "aç", "başlat", "oluştur"];

const buildVerbRe = (verbs: string[]) =>
  new RegExp(`(?<![\\p{L}])(${verbs.map(tolerant).join("|")})(?![\\p{L}])`, "iu");
const VERB_RE = buildVerbRe(BASE_VERBS);
const VERB_NAV_RE = buildVerbRe([...NAV_VERBS, ...BASE_VERBS]);
const NAV_OPEN_VERB = new RegExp(`^(?:${["aç", "başlat", "oluştur"].map(tolerant).join("|")})`, "iu");
const GOTUR_VERB = new RegExp(`^${tolerant("götür")}`, "iu");
const NAV_WORD = new RegExp(`${tolerant("navigasyon|rota")}`, "iu");

/** Kesme işaretsiz yazımda adresin sonundaki hal eki (git/var → yönelme, ol → bulunma). */
const ADDRESS_SUFFIXES = { dative: ["ya", "ye", "a", "e"], locative: ["da", "de", "ta", "te"] };
const CASE_SUFFIXES = new Set(["e", "a", "ye", "ya", "de", "da", "te", "ta", "ne", "na", "nde", "nda"]);
const ADVERBS = tolerant("şimdi|hemen|artık|şu an|şuan");
const LEADING_FILLER = new RegExp(
  `^(?:(?:${tolerant("beni|bana|ben|lütfen|hemen|artık|şimdi|şu an|şuan|haydi|navigasyonu|navigasyon|rotayı|rota")})\\s+)+`,
  "iu",
);
const CLAUSE_BREAK = new RegExp(`(?:[,;]|(?<![\\p{L}])(?:${tolerant("için|ve|ile|ben")})(?![\\p{L}]))\\s*`, "giu");
const TRAILING_NAV_NOUN = new RegExp(`\\s+(?:${tolerant("için")}\\s+)?(?:(?:${tolerant("navigasyon|rota")})\\p{L}*)\\s*$`, "iu");
const HERE_WORDS = new RegExp(`[,;]?\\s*(?:beni\\s+)?(?:buraya|oraya|şuraya)\\s*$`, "iu");

/** Gidilecek yer olamayacak genel sözcükler. */
const GENERIC = new Set(["ev", "eve", "evde", "iş", "işe", "işte", "okul", "okula", "market", "markete", "dışarı", "dışarıya", "buraya", "oraya", "yukarı", "aşağı", "geri"]);

// ---- Adres çözümleme ve normalizasyon ----

const STREET_WORD = new RegExp(`${STREET_CORE}$`, "iu");
const STREET_STANDALONE = /^str(?:a(?:ß|ss|s|sz)e)?\.?$/iu;
const STREET_SUFFIX_TOKEN = /^(.*?)(-?)(str(?:a(?:ß|ss|s|sz)e)?\.?)$/iu;
const HOUSE_NUMBER = new RegExp(`^${NUM}$`, "iu");
const NR_TOKEN = /^(?:nr|no|nummer|hausnummer)\.?$/iu;
/** Şehir adlarında küçük kalan sözcükler ("Frankfurt am Main") */
const SMALL_WORDS = new Set(["am", "an", "der", "im", "in", "bei", "auf", "von", "vor", "zu", "zum", "zur", "den", "dem", "und", "ob"]);

const trUpper = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

/** "MÜNSTER" → "Münster", "münster" → "Münster", "karl-marx" → "Karl-Marx"; karışık yazımlara dokunmaz. */
function fixName(w: string): string {
  const base = w === w.toLocaleUpperCase("tr-TR") && w.length > 1 ? w.toLocaleLowerCase("tr-TR") : w;
  return base.split("-").map(trUpper).join("-");
}

/** "Münsterstr." / "Münsterstrasse" / "Münsterstrase" → "Münsterstraße"; diğer ekleri düzgün yazar. */
function canonStreetToken(token: string): string {
  const m = STREET_SUFFIX_TOKEN.exec(token);
  if (!m) return fixName(token.replace(/\.$/, ""));
  const [, name, hyphen] = m;
  return name ? `${hyphen ? fixName(name) : restoreStreetStem(fixName(name))}${hyphen}${hyphen ? "Straße" : "straße"}` : "Straße";
}

export interface Address {
  /** "Dortmund" (varsa) */
  city?: string;
  /** "Münsterstraße 160" */
  street: string;
}

/** Umlaut'u konuşma/yazımda düşen yaygın Alman yer adları ("Munster", "Koln", "Muenster" → "Münster", "Köln"). */
const GERMAN_NAMES = [
  "Münster", "Köln", "Düsseldorf", "München", "Nürnberg", "Lübeck", "Göttingen", "Osnabrück",
  "Mönchengladbach", "Gütersloh", "Würzburg", "Fürth", "Saarbrücken", "Mülheim", "Lünen",
  "Lüdenscheid", "Tübingen", "Überlingen", "Bückeburg", "Jülich", "Büren", "Löhne", "Hürth",
];
const NAME_MAP: Record<string, string> = {};
for (const n of GERMAN_NAMES) {
  const lower = n.toLocaleLowerCase("tr-TR");
  NAME_MAP[lower] = n;
  NAME_MAP[lower.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")] = n;
  NAME_MAP[lower.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")] = n;
}
/**
 * Türkçe tanıyıcının Almanca cadde adlarını sık yanlış duyduğu örnekler (yalnızca "…straße NN" adres
 * bağlamındaki cadde adında uygulanır): "Münsterstrasse" → "Manchester Straße" gibi.
 */
const MISHEARD_STREET: Record<string, string> = { manchester: "Münster", monster: "Münster", minster: "Münster", munchester: "Münster" };

/** "munster" → "Münster"; sözlükte yoksa verilen sözcük aynen döner. */
function restoreName(w: string): string {
  return NAME_MAP[w.toLocaleLowerCase("tr-TR")] ?? w;
}

/** Cadde adı gövdesi ("Manchester" + "straße"): sözlük ve yanlış duyma düzeltmesi. */
function restoreStreetStem(stem: string): string {
  const key = stem.toLocaleLowerCase("tr-TR");
  return NAME_MAP[key] ?? MISHEARD_STREET[key] ?? stem;
}

/** Hepsi küçük harfle yazılmışsa kelimelerin ilk harfini büyütür (adres olmayan yerler için); bilinen adlarda umlaut'u geri getirir. */
function normalizeCase(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  const cased = s === s.toLocaleLowerCase("tr-TR") ? s.split(" ").map(trUpper).join(" ") : s;
  return cased.split(" ").map(restoreName).join(" ");
}

/**
 * "Dortmund Münsterstraße 160", "dortmund münster straße 160", "Münsterstr. 160 Dortmund",
 * "Dortmund Münsterstrasse Nr. 160a" gibi şehir + cadde + bina numarası öbeklerini ayırıp
 * normalleştirir. Cadde+numara yoksa null.
 */
export function parseAddress(raw: string): Address | null {
  const t = raw
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, k, a) => !(NR_TOKEN.test(w) && k + 1 < a.length && HOUSE_NUMBER.test(a[k + 1])));
  const i = t.findIndex((w, k) => STREET_WORD.test(w) && k + 1 < t.length && HOUSE_NUMBER.test(t[k + 1]));
  if (i < 0) return null;
  // "Münster Straße 160": ayrı yazılmış cadde sözcüğü bir önceki sözcükle birlikte cadde adıdır
  const joined = STREET_STANDALONE.test(t[i]) && i > 0;
  const start = joined ? i - 1 : i;
  const streetName = joined ? `${restoreStreetStem(fixName(t[i - 1]))}straße` : canonStreetToken(t[i]);
  const number = t[i + 1].toLocaleLowerCase("tr-TR");
  const before = t.slice(0, start);
  const after = t.slice(i + 2);
  if (before.length && after.length) return null; // belirsiz, olduğu gibi bırak
  const cityWords = before.length ? before : after;
  if (cityWords.some((w) => /\d/.test(w))) return null; // posta kodu vb.: olduğu gibi bırak
  const city = cityWords
    .map((w, k) => (k > 0 && SMALL_WORDS.has(w.toLocaleLowerCase("tr-TR")) ? w.toLocaleLowerCase("tr-TR") : restoreName(fixName(w))))
    .join(" ");
  return { city: city || undefined, street: `${streetName} ${number}` };
}

/** "Bonn Rochusstr 400" → "Bonn, Rochusstraße 400"; adres değilse yalnızca büyük/küçük harf düzeltilir. */
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
  /** Cümlede fiil yok, yalnızca adres söylendi ("Münsterstraße 160"). */
  bare?: boolean;
  /** Konum ve fiil temizlenmiş/normalleştirilmiş görev başlığı ("Erdemli'ye git"). */
  title: string;
}

/** `rest`: tarih/saat/tekrar ifadeleri çıkarılmış, büyük/küçük harfi korunmuş metin. */
export function extractLocation(rest: string): LocationMatch | null {
  const text = unmask(rest);
  const v = (NAV_WORD.test(text) ? VERB_NAV_RE : VERB_RE).exec(text);
  if (!v) return bareAddress(text);
  let before = text.slice(0, v.index);
  const after = text.slice(v.index + v[0].length);
  const navOpen = NAV_OPEN_VERB.test(v[1]);
  // "Dortmund Münsterstraße 160'a şimdi gidiyorum": fiilin önündeki zarf yerin ekini gizlemesin
  before = before.replace(new RegExp(`\\s+(?:${ADVERBS})\\s*$`, "iu"), " ");
  // "Münsterstraße 160, beni buraya götür": "buraya" önceki cümledeki adrese işaret eder
  if (GOTUR_VERB.test(v[1])) before = before.replace(HERE_WORDS, " ");
  // "Münsterstraße 160 için navigasyonu aç": navigasyon sözcüğü yerin arkasında kalabilir
  if (navOpen) before = before.replace(TRAILING_NAV_NOUN, " ");

  // "Dortmund, Münsterstraße 160, gidiyorum": fiilden önceki virgül yan cümle sınırı olmasın
  before = before.replace(/[,;\s]+$/u, " ");

  // Son yan cümleden sonrasını al ("Annemi ziyaret etmek için Erdemli'ye" → "Erdemli'ye")
  let segStart = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) segStart = (m.index ?? 0) + m[0].length;
  // "Dortmund, Münsterstraße 160'a": virgülün öncesi şehirse (1-3 büyük harfli sözcük) ve sonrası cadde+numaraysa yan cümle sayma
  if (new RegExp(`${STREET_CORE}${NR_WORD}\\s+\\d`, "iu").test(before.slice(segStart))) {
    const city = /(?:^|\s)((?:\p{Lu}[\p{L}.-]*\s+){0,2}\p{Lu}[\p{L}.-]*),\s*$/u.exec(before.slice(0, segStart));
    if (city) segStart = city.index + city[0].length - city[0].trimStart().length;
  }
  const seg = before.slice(segStart).trim().replace(/[,;]+$/u, "").trim().replace(LEADING_FILLER, "");
  if (!seg) return null;

  const verb = v[1].toLocaleLowerCase("tr-TR");
  const norm: "git" | "ol" | "var" = verb.startsWith("ol") ? "ol" : verb.startsWith("var") ? "var" : "git";
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
    const addr = new RegExp(
      `^(.*${STREET_CORE}${NR_WORD}\\s+\\d{1,4}(?:[-–/]\\d{1,4})?)(?:\\s?([\\p{L}]{1,2}))?$`,
      "iu",
    ).exec(seg);
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
      if (bare) {
        base = bare[1];
        suffix = bare[2];
      } else if (navOpen) {
        base = seg; // "Navigasyonu Dortmund Flughafen aç": ek aranmaz
      } else {
        return null;
      }
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
  else if (addr) place = `${location} ${kind === "locative" ? "adresinde" : "adresine"}`;
  else place = `${location}'${caseSuffix(location, kind)}`;
  const prefix = before.slice(0, segStart).trimEnd();
  const title = `${prefix ? `${prefix} ` : ""}${place} ${norm}${after}`;
  return { location, title };
}

const BARE_FILLER = new RegExp(
  `^(?:(?:${tolerant("şimdi|hemen|adres|adresi|konum|konumu|hedef|hedefi")}|navigasyon\\p{L}*)\\s+)+`,
  "iu",
);
const TRAILING_REMIND = new RegExp(`\\s*(?:diye\\s+)?(?:bana\\s+)?${tolerant("hatırlat")}\\p{L}*\\s*$`, "iu");

/**
 * Fiilsiz, yalnızca adres söylenen cümle: "Münsterstraße 160", "Dortmund Münster Str. 160",
 * "Manchester Straße 160" (Türkçe tanıyıcının "Münsterstrasse" için verdiği yanlış yazım).
 * Cadde + bina numarası şart; adres dışında en fazla 3 sözcük (şehir) kabul edilir.
 */
function bareAddress(text: string): LocationMatch | null {
  let t = text.replace(/[.!?,;]+$/u, "").trim().replace(TRAILING_REMIND, "").trim().replace(BARE_FILLER, "");
  const apos = /^(.+?\d)'([\p{L}]{1,4})$/u.exec(t);
  if (apos && CASE_SUFFIXES.has(apos[2].toLocaleLowerCase("tr-TR"))) t = apos[1];
  const addr = parseAddress(t);
  if (!addr) return null;
  if (addr.city && addr.city.split(" ").length > 3) return null;
  // Karışık harfli metinde her sözcük adres sözcüğü gibi olmalı (büyük harfle başlayan ad, rakam, "Str."); Türkçe fiil/ek varsa adres değildir
  if (t !== t.toLocaleLowerCase("tr-TR")) {
    const ok = t
      .split(/[\s,]+/)
      .filter(Boolean)
      .every((w) => !/'/.test(w) && (/^\p{Lu}|^\d/u.test(w) || SMALL_WORDS.has(w.toLocaleLowerCase("tr-TR")) || STREET_STANDALONE.test(w) || NR_TOKEN.test(w)));
    if (!ok) return null;
  }
  const location = formatLocation(t);
  return { location, title: location, bare: true };
}

/**
 * Almanca dikte edilen adres ("Navigation zu Münsterstraße 160 Dortmund", "Münsterstraße 160")
 * → normalleştirilmiş konum. Önde gelen Almanca yönlendirme kalıpları atılır.
 */
export function spokenAddress(text: string): string {
  const t = text
    .trim()
    .replace(/[.!?]+$/u, "")
    .replace(
      /^(?:bitte\s+)?(?:navigation|navigiere|navigieren|route|fahre|fahr|ich fahre|ich bin|bring mich|führe mich|fuehre mich)\s+(?:mich\s+)?(?:(?:nach|zu der|zu dem|zum|zur|zu|in die|in der|in)(?![\p{L}]))?\s*/iu,
      "",
    )
    .trim();
  return formatLocation(t);
}

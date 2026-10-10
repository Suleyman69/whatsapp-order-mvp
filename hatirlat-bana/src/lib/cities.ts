/**
 * Şehir adları için bulanık / sesbilgisel normalizasyon.
 *
 * Konuşma tanıma Alman şehirlerini sık bozar ("Ahen", "Koln", "Frankfort"). Tek bir benzerlik eşiği
 * "ahen → Aachen" ile "Hakan → Hagen" / "Merlin → Berlin" gibi yanlış pozitifleri ayıramadığından karar
 * yapılandırılmış kanıtla verilir:
 *   - tam eşleşme (katlanmış): umlaut/büyük harf düzeltilir ("koln" → "Köln"); asla bulanık aranmaz
 *   - ilk harf sınıfı aynı olmalı (Merlin ≠ Berlin), uzunluk uyumlu, ≥ 4 harf
 *   - silinti kanıtı: sorgu adayın alt dizisi ve ilk/son harf aynı ("ahen" ⊂ "aachen") → bonus
 *   - benzersizlik: en iyi aday ikinciden belirgin önde olmalı
 *   - yaygın kişi adları ve tam eşleşen Türk şehirleri hiçbir zaman Alman şehrine çevrilmez
 * Karar: auto (yüksek güven, doğrudan normalize) / suggest ("… mu demek istedin?") / none.
 */
import { fold, nameSimilarity } from "./fuzzy";

export const GERMAN_CITIES = [
  "Aachen", "Augsburg", "Bad Homburg", "Bad Honnef", "Bamberg", "Bayreuth", "Bergisch Gladbach", "Bergkamen", "Berlin",
  "Bernau", "Bielefeld", "Bocholt", "Bochum", "Bonn", "Bottrop", "Braunschweig", "Bremen", "Bremerhaven", "Castrop-Rauxel",
  "Celle", "Chemnitz", "Cottbus", "Darmstadt", "Dessau", "Detmold", "Dinslaken", "Dortmund", "Dresden", "Duisburg", "Düren",
  "Düsseldorf", "Erfurt", "Erlangen", "Essen", "Esslingen", "Flensburg", "Frankfurt", "Frankfurt am Main", "Freiburg",
  "Friedrichshafen", "Fulda", "Fürth", "Gelsenkirchen", "Gera", "Gießen", "Gladbeck", "Göttingen", "Greifswald", "Gütersloh",
  "Hagen", "Halle", "Hamburg", "Hamm", "Hanau", "Hannover", "Hattingen", "Heidelberg", "Heilbronn", "Herford", "Herne",
  "Herten", "Hildesheim", "Homburg", "Ingolstadt", "Iserlohn", "Jena", "Kaiserslautern", "Kamen", "Karlsruhe", "Kassel", "Kiel",
  "Koblenz", "Köln", "Konstanz", "Krefeld", "Landshut", "Leipzig", "Leverkusen", "Lippstadt", "Lübeck", "Lüdenscheid",
  "Ludwigshafen", "Lünen", "Magdeburg", "Mainz", "Mannheim", "Marburg", "Marl", "Meerbusch", "Menden", "Minden", "Moers",
  "Mönchengladbach", "Mülheim", "München", "Münster", "Neuss", "Nürnberg", "Oberhausen", "Offenbach", "Oldenburg", "Osnabrück",
  "Paderborn", "Pforzheim", "Potsdam", "Ratingen", "Recklinghausen", "Regensburg", "Remscheid", "Reutlingen", "Rostock",
  "Saarbrücken", "Salzgitter", "Schwerin", "Schwerte", "Siegen", "Soest", "Solingen", "Stuttgart", "Trier", "Tübingen", "Ulm",
  "Unna", "Velbert", "Viersen", "Wesel", "Wiesbaden", "Witten", "Wolfsburg", "Worms", "Wuppertal", "Würzburg", "Zwickau",
];

/** Tam eşleşirse korunur (Alman şehrine bulanık çevrilmez). */
export const TURKISH_CITIES = [
  "Istanbul", "İstanbul", "Ankara", "Izmir", "İzmir", "Mersin", "Erdemli", "Adana", "Antalya", "Bursa", "Konya", "Kayseri",
  "Gaziantep", "Trabzon", "Samsun", "Eskişehir", "Diyarbakır", "Hatay", "Malatya", "Denizli", "Mardin", "Tarsus", "Silifke",
  "Kızkalesi", "Alanya", "Bodrum", "Marmaris", "Fethiye", "Kocaeli", "Sakarya", "Edirne", "Balıkesir", "Manisa", "Aydın",
];

/** Yaygın Türk/Alman kişi adları ve şehir adına benzeyen genel sözcükler: asla şehre çevrilmez ve tek başına yer sayılmaz. */
const NAME_LIST = [
  "Hakan", "Berna", "Merlin", "Emre", "Eren", "Ahmet", "Mehmet", "Kemal", "Selim", "Hasan", "Hüseyin", "Ali", "Ayşe", "Fatma",
  "Murat", "Mustafa", "Burak", "Can", "Cem", "Deniz", "Elif", "Ece", "Kerem", "Orhan", "Osman", "Ramazan", "Serkan", "Tolga",
  "Uğur", "Yusuf", "Zeynep", "Ayten", "Hamza", "Hakkı", "Halil", "Harun", "Hande", "Hilal", "Berk", "Bora", "Burcu", "Nuri",
  "Metin", "Melis", "Mert", "Mina", "Melek", "Mine", "Kenan", "Kerim", "Berkay", "Hüsnü", "Tarık", "Selin", "Seda", "Sedat",
  "Marie", "Maria", "Martin", "Markus", "Matthias", "Michael", "Hans", "Heinz", "Karl", "Karin", "Klaus", "Kurt", "Lena",
  "Lars", "Hannah", "Hanna", "Jens", "Jan", "Jana", "Nina", "Nora", "Paul", "Peter", "Petra", "Sandra", "Stefan", "Sven", "Tim",
  "Tom", "Ulrich", "Anna", "Anne", "Hannes", "Marco", "Mario", "Marcel", "Moritz", "Manuel", "Max", "Oliver", "Uwe", "Ute",
].map(fold);
const NAME_SET = new Set(NAME_LIST);

export const isPersonName = (word: string) => NAME_SET.has(fold(word));

// ---- tam eşleşme (katlanmış) ----

const EXACT = new Map<string, string>();
for (const c of [...TURKISH_CITIES, ...GERMAN_CITIES]) {
  EXACT.set(fold(c), c);
  const lower = c.toLocaleLowerCase("tr-TR");
  EXACT.set(fold(lower.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")), c); // muenster
}
// Alman şehirleri öncelikli; Istanbul/İstanbul gibi çakışmalarda listedeki son (noktalı Türkçe) yazım kalır
for (const c of GERMAN_CITIES) EXACT.set(fold(c), c);

/** Katlanmış tam eşleşme: "koln" → "Köln", "frankfurt am main" → "Frankfurt am Main". */
export function exactCity(phrase: string): string | undefined {
  return EXACT.get(fold(phrase));
}

// ---- bulanık eşleşme ----

/** Konuşma tanımada karışan ilk harfler aynı sınıftadır. */
const FIRST_CLASS: Record<string, string> = { c: "k", k: "k", q: "k", f: "f", v: "f", s: "s", z: "s", d: "d", t: "d", b: "b", p: "b" };
const firstClass = (f: string) => FIRST_CLASS[f[0]] ?? f[0];

function isSubsequence(q: string, c: string): boolean {
  let i = 0;
  for (const ch of c) if (ch === q[i]) i++;
  return i === q.length;
}

const CITY_KEYS = GERMAN_CITIES.map((c) => ({ city: c, key: fold(c) }));

/** Bir sorgunun bir aday şehirle puanı (0..1). Tam bir olasılık değil, kanıt toplamıdır. */
export function cityScore(query: string, city: string): number {
  const q = fold(query);
  const c = fold(city);
  if (!q || !c) return 0;
  let score = nameSimilarity(q, c);
  if (firstClass(q) !== firstClass(c)) score -= 0.25;
  if (Math.abs(q.length - c.length) > Math.max(3, 0.4 * c.length)) score -= 0.2;
  if (q.length >= 4 && q[0] === c[0] && q[q.length - 1] === c[c.length - 1] && isSubsequence(q, c) && q.length < c.length) score += 0.12;
  return Math.min(1, Math.max(0, score));
}


export type CityContext = "address" | "place";
export type CityStatus = "exact" | "auto" | "suggest" | "none";
export interface CityMatch {
  status: CityStatus;
  /** exact/auto/suggest durumlarında doğru yazılmış şehir; none'da girilen metin */
  city: string;
  score: number;
}

/** Eşikler: tests/cities.test.ts bunları kilitler. Adres bağlamında şehir sözcüğünün yeri güçlü kanıttır (+0.03). */
export const CITY_THRESHOLDS = { auto: 0.86, suggest: 0.76, margin: 0.04, addressBonus: 0.03, minLength: 4 };

export function matchCity(input: string, context: CityContext): CityMatch {
  const typed = input.trim();
  const none: CityMatch = { status: "none", city: typed, score: 0 };
  const f = fold(typed);
  if (!f) return none;
  const exact = EXACT.get(f);
  if (exact) return { status: "exact", city: exact, score: 1 };
  if (f.length < CITY_THRESHOLDS.minLength || /\d/.test(typed) || NAME_SET.has(f)) return none;

  const bonus = context === "address" ? CITY_THRESHOLDS.addressBonus : 0;
  const ranked = CITY_KEYS.map(({ city }) => ({ city, score: Math.min(1, cityScore(f, city) + bonus) })).sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (!top || top.score < CITY_THRESHOLDS.suggest) return { ...none, score: top?.score ?? 0 };
  // Benzersizlik: başka bir şehir neredeyse aynı puandaysa (Hamburg/Homburg) belirsiz → dokunma
  if (second && second.score >= top.score - CITY_THRESHOLDS.margin) return { ...none, score: top.score };
  const status: CityStatus = top.score >= CITY_THRESHOLDS.auto ? "auto" : "suggest";
  return { status, city: top.city, score: top.score };
}

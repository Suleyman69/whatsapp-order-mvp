/**
 * Adres çözümleme: konuşma tanıma çıktısı ("Manchester Straße 160") adres defteri ve yerleşik cadde listesiyle
 * karşılaştırılır. Şehir + cadde + numara birlikte puanlanır; kayıtlı/sık kullanılan adresler yüksek ağırlık alır.
 *
 *   exact   → cadde zaten bilinen biçimde (değişiklik yok)
 *   auto    → yüksek güven, kullanıcının kendi verisi destekliyor → doğrudan düzeltilir
 *   suggest → orta güven → "… mu demek istedin?" önerisi (otomatik değişmez)
 *   none    → düşük güven → dokunulmaz
 */
import { type AddressBook, GAZETTEER } from "./addressbook";
import { fold, nameSimilarity } from "./fuzzy";
import { type Address, parseAddress } from "./location";

export type ResolveStatus = "exact" | "auto" | "suggest" | "none";

export interface Resolution {
  status: ResolveStatus;
  /** Kullanılacak konum (auto'da düzeltilmiş, diğerlerinde girilen) */
  location: string;
  suggestion?: string;
  score: number;
  source?: "correction" | "saved" | "used" | "builtin";
}

/** Eşik değerleri: tests/resolve.test.ts bunları kilitler. */
export const THRESHOLDS = { minName: 0.72, suggest: 0.69, auto: 0.9, autoName: 0.8, ambiguity: 0.05 };

interface Candidate {
  street: string; // "Münsterstraße"
  stem: string; // "Münster"
  type: string; // "strasse" | "weg" | ...
  city?: string;
  number?: string;
  source: "saved" | "used" | "builtin";
  weight: number; // 0..1
}

const SUFFIX = /^(.*?)(str(?:a(?:ß|ss|s|sz)e)?\.?|weg|allee|platz|gasse|ring|damm|ufer|chaussee)$/iu;

function splitStreet(name: string): { stem: string; type: string } | null {
  const m = SUFFIX.exec(name.replace(/\s+/g, ""));
  if (!m || !m[1]) return null;
  const type = /^str/i.test(m[2]) ? "strasse" : fold(m[2]);
  return { stem: m[1], type };
}

function candidateFromAddress(address: string, source: "saved" | "used", weight: number): Candidate | null {
  const a = parseAddress(address);
  if (!a) return null;
  const parts = a.street.split(" ");
  const number = parts.pop();
  const name = parts.join(" ");
  const sp = splitStreet(name);
  if (!sp) return null;
  return { street: name, stem: sp.stem, type: sp.type, city: a.city, number, source, weight };
}

function candidates(book: AddressBook): Candidate[] {
  const out: Candidate[] = [];
  for (const alias of Object.values(book.aliases)) {
    const c = candidateFromAddress(alias.address, "saved", 1);
    if (c) out.push(c);
  }
  for (const [address, u] of Object.entries(book.used)) {
    const c = candidateFromAddress(address, "used", Math.min(1, 0.4 + 0.2 * u.count));
    if (c) out.push(c);
  }
  for (const [city, streets] of Object.entries(GAZETTEER)) {
    for (const s of streets) {
      const sp = splitStreet(s);
      if (sp) out.push({ street: s, stem: sp.stem, type: sp.type, city, source: "builtin", weight: 0.35 });
    }
  }
  return out;
}

/** Kullanıcının en çok kullandığı şehir (adres defterinden); bağlam olarak zayıf ipucu verir. */
export function homeCity(book: AddressBook): string | undefined {
  const counts = new Map<string, number>();
  const bump = (address: string, n: number) => {
    const city = parseAddress(address)?.city;
    if (city) counts.set(city, (counts.get(city) ?? 0) + n);
  };
  for (const a of Object.values(book.aliases)) bump(a.address, 2);
  for (const [a, u] of Object.entries(book.used)) bump(a, u.count);
  let best: string | undefined;
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) [best, bestN] = [c, n];
  return best;
}

const sameCity = (a?: string, b?: string) => !!a && !!b && nameSimilarity(a, b) >= 0.85;

/** Şehir adında orta güvenli düzeltme varsa öneriye yansıtır ("Aken, Hauptstraße 5" → "Aachen, Hauptstraße 5 mu demek istedin?"). */
function withCitySuggestion(res: Resolution, addr: Address): Resolution {
  if (!addr.citySuggestion) return res;
  if (res.status === "suggest" && res.suggestion) {
    return { ...res, suggestion: addr.city ? res.suggestion.replace(addr.city, addr.citySuggestion) : `${addr.citySuggestion}, ${res.suggestion}` };
  }
  if (res.status === "none" || res.status === "exact") {
    return { status: "suggest", location: res.location, suggestion: `${addr.citySuggestion}, ${addr.street}`, score: Math.max(res.score, 0.76), source: res.source };
  }
  return res;
}

export function resolveAddress(location: string, book: AddressBook): Resolution {
  const res = resolveStreet(location, book);
  const addr = res.source === "correction" ? null : parseAddress(location);
  return addr ? withCitySuggestion(res, addr) : res;
}

function resolveStreet(location: string, book: AddressBook): Resolution {
  const none: Resolution = { status: "none", location, score: 0 };

  // 1) kullanıcının daha önce onayladığı düzeltme
  const corrected = book.corrections[fold(location)];
  if (corrected) return { status: "auto", location: corrected, score: 1, source: "correction" };

  // 2) fuzzy yalnızca "cadde + numara" biçimli adreslerde
  const addr = parseAddress(location);
  if (!addr) return none;
  const parts = addr.street.split(" ");
  const number = parts.pop();
  const sp = splitStreet(parts.join(" "));
  if (!sp) return none;
  const ctxCity = homeCity(book);

  type Scored = { c: Candidate; score: number; nameSim: number; equal: boolean };
  const best = new Map<string, Scored>(); // aday cadde başına en iyi puan
  for (const c of candidates(book)) {
    if (c.type !== sp.type) continue; // "Münsterallee" ≠ "Münsterstraße": farklı cadde türü başka bir caddedir
    const nameSim = nameSimilarity(sp.stem, c.stem);
    if (nameSim < THRESHOLDS.minName) continue;
    let cityTerm = 0;
    if (addr.city) {
      if (c.city && !sameCity(addr.city, c.city)) continue; // farklı şehir: aday değil
      cityTerm = c.city ? 0.15 : 0.04;
    } else if (sameCity(ctxCity, c.city)) cityTerm = 0.08;
    const numberTerm = number && c.number ? (fold(number) === fold(c.number) ? 0.15 : 0) : 0.05;
    const score = 0.6 * nameSim + cityTerm + numberTerm + 0.15 * c.weight;
    const key = fold(c.stem) + c.type;
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { c, score, nameSim, equal: fold(c.stem) === fold(sp.stem) });
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return none;

  // Cadde zaten biliniyor: dokunma
  if (top.equal) return { status: "exact", location, score: top.score, source: top.c.source };
  if (ranked.some((r) => r.equal)) return { status: "exact", location, score: top.score }; // başka bir bilinen cadde adıyla birebir eşleşiyor

  // Belirsiz: iki farklı cadde birbirine yakın puanda → yanlış düzeltme yapma
  if (ranked[1] && ranked[1].score >= top.score - THRESHOLDS.ambiguity) return { ...none, score: top.score };

  const fixedStreet = `${top.c.street} ${number ?? top.c.number ?? ""}`.trim();
  const suggestion = addr.city ? `${addr.city}, ${fixedStreet}` : fixedStreet;
  if (top.score >= THRESHOLDS.auto && top.nameSim >= THRESHOLDS.autoName && top.c.source !== "builtin") {
    return { status: "auto", location: suggestion, score: top.score, source: top.c.source };
  }
  if (top.score >= THRESHOLDS.suggest) return { status: "suggest", location, suggestion, score: top.score, source: top.c.source };
  return { ...none, score: top.score };
}

/**
 * Kullanıcının düzeltmesi kalıcı "düzeltme" olarak öğrenilsin mi? Yalnızca aynı numara + benzer ama farklı cadde adı
 * (yanlış duyma). "Hauptstraße 5" → "Hauptstraße 7" gibi gerçek adres değişiklikleri öğrenilmez.
 */
export function isLearnableCorrection(wrong: string, right: string): boolean {
  const a = parseAddress(wrong);
  const b = parseAddress(right);
  if (!a || !b) return false;
  const pa = a.street.split(" ");
  const pb = b.street.split(" ");
  const na = pa.pop();
  const nb = pb.pop();
  const sa = splitStreet(pa.join(" "));
  const sb = splitStreet(pb.join(" "));
  if (!sa || !sb || !na || !nb || fold(na) !== fold(nb)) return false;
  const sim = nameSimilarity(sa.stem, sb.stem);
  return sim >= THRESHOLDS.minName && sim < 1;
}

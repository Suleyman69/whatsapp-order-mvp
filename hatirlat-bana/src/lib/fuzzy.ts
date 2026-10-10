/**
 * Adres adları için bulanık / sesbilgisel (phonetic) benzerlik.
 * Girdiler önce katlanır: küçük harf, ä/ö/ü/ß → a/o/u/ss, ae/oe/ue → a/o/u, harf dışı karakterler atılır.
 */

/** Karşılaştırma için katlanmış biçim: "Münsterstraße" → "munsterstrasse". */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = aynı, 0 = tamamen farklı */
export function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(b.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!bMatch[j] && a[i] === b[j]) {
        aMatch[i] = bMatch[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Kölner Phonetik (Almanca sesbilgisel anahtar). "Manchester" ve "Münster" gibi kulağa benzeyen
 * ama yazımı çok farklı adların anahtarları birbirine yakın çıkar. Girdi katlanmış olmalıdır.
 */
export function phoneticKey(folded: string): string {
  const s = folded.replace(/[^a-z]/g, "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const prev = s[i - 1] ?? "";
    const next = s[i + 1] ?? "";
    let code: string;
    if ("aeiouyj".includes(c)) code = "0";
    else if (c === "h") code = "";
    else if (c === "b") code = "1";
    else if (c === "p") code = next === "h" ? "3" : "1";
    else if ("dt".includes(c)) code = "csz".includes(next) ? "8" : "2";
    else if ("fvw".includes(c)) code = "3";
    else if ("gkq".includes(c)) code = "4";
    else if (c === "x") code = "ckq".includes(prev) ? "8" : "48";
    else if (c === "l") code = "5";
    else if ("mn".includes(c)) code = "6";
    else if (c === "r") code = "7";
    else if ("sz".includes(c)) code = "8";
    else if (c === "c") {
      if (i === 0) code = "ahkloqrux".includes(next) ? "4" : "8";
      else if ("sz".includes(prev)) code = "8";
      else code = "ahkoqux".includes(next) ? "4" : "8";
    } else code = "";
    out += code;
  }
  // ardışık tekrarları ve baştaki dışındaki 0'ları at
  let dedup = "";
  for (const ch of out) if (ch !== dedup[dedup.length - 1]) dedup += ch;
  return dedup[0] + dedup.slice(1).replace(/0/g, "");
}

/** Ad benzerliği 0..1: Jaro-Winkler + Levenshtein + sesbilgisel anahtar benzerliği (katlanmış metinler üzerinde). */
export function nameSimilarity(a: string, b: string): number {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  const phon = levenshteinRatio(phoneticKey(fa), phoneticKey(fb));
  return 0.4 * jaroWinkler(fa, fb) + 0.25 * levenshteinRatio(fa, fb) + 0.35 * phon;
}

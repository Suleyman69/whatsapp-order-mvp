/**
 * Konuşma tanıma çıktısını çözümlemeden önce temizler. Gerçek iPhone çıktılarında görülen bozulmalar:
 *  - aynı ifadenin iki kez teslim edilmesi ("Münster Straße 160 Münster Straße 160")
 *  - tırnak/parantez içinde gelmesi, görünmez karakterler (sıfır genişlikli boşluk, yumuşak tire), özel boşluklar (NBSP)
 *  - ayrışık Unicode (u + ¨)
 */

/** Karşılaştırma için sözcük: harf/rakam dışı karakterler atılmış küçük harf. */
const key = (w: string) => w.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Tüm metin aynı sözcük dizisinin ≥ 2 kez tekrarıysa ilk tekrarı döndürür ("A B C A B C" → "A B C").
 * Tek sözcüklük tekrarlar ("ara ara") bilerek dokunulmaz.
 */
export function collapseRepeats(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const n = tokens.length;
  for (let p = 2; p <= n / 2; p++) {
    if (n % p !== 0) continue;
    let repeated = true;
    for (let i = p; i < n && repeated; i++) repeated = key(tokens[i]) === key(tokens[i % p]);
    if (repeated) return tokens.slice(0, p).join(" ");
  }
  return text;
}

export function cleanTranscript(text: string): string {
  return collapseRepeats(
    text
      .normalize("NFC")
      .replace(/​/g, " ")
      .replace(/[‌‍﻿­]/g, "")
      .replace(/[  -   　]/g, " ")
      .replace(/^[\s"“”„«»‹›‘’`´()[\]]+/u, "")
      .replace(/[\s"“”„«»‹›()[\]]+$/u, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

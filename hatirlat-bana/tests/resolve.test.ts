import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type AddressBook,
  emptyBook,
  isKnownPlace,
  learnCorrection,
  matchAlias,
  normalizeBook,
  recordUse,
  removeAlias,
  setAlias,
} from "../src/lib/addressbook";
import { fold, jaroWinkler, levenshtein, nameSimilarity, phoneticKey } from "../src/lib/fuzzy";
import { analyzeSpeech, detectNavigationIntent } from "../src/lib/intent";
import { homeCity, isLearnableCorrection, resolveAddress, THRESHOLDS } from "../src/lib/resolve";
import { fromWall } from "../src/lib/tz";

const NOW = fromWall(new Date(Date.UTC(2026, 9, 10, 12, 0))); // 10.10.2026 12:00 Berlin

const withBook = (f: (b: AddressBook) => AddressBook) => f(emptyBook());
const DORTMUND_HOME = withBook((b) => recordUse(recordUse(recordUse(b, "Dortmund, Münsterstraße 160", 1), "Dortmund, Münsterstraße 160", 2), "Dortmund, Münsterstraße 160", 3));
const ALIASES = withBook((b) =>
  [
    ["ev", "Dortmund, Münsterstraße 160"],
    ["iş", "Bonn, Rochusstraße 400"],
    ["Hbf", "Dortmund Hbf"],
    ["Flughafen", "Dortmund Flughafen"],
    ["Münster", "Münster Hbf"],
  ].reduce((acc, [n, a]) => setAlias(acc, n, a), b),
);

// ---------- bulanık eşleştirme primitifleri ----------

test("fuzzy primitifleri", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.ok(Math.abs(jaroWinkler("martha", "marhta") - 0.9611) < 0.001);
  assert.equal(fold("Münsterstraße"), "munsterstrasse");
  assert.equal(fold("Muensterstrasse"), "munsterstrasse");
  assert.equal(phoneticKey(fold("Monster")), phoneticKey(fold("Münster")));
  assert.equal(phoneticKey(fold("Minster")), phoneticKey(fold("Münster")));
});

test("ad benzerliği: gerçek yanlış duyma yakın, ilgisiz adlar uzak", () => {
  assert.ok(nameSimilarity("Manchester", "Münster") >= THRESHOLDS.minName, "Manchester ~ Münster");
  assert.ok(nameSimilarity("Monster", "Münster") > 0.9);
  assert.ok(nameSimilarity("Münstar", "Münster") > 0.9);
  assert.equal(nameSimilarity("Münster", "Muenster"), 1);
  for (const other of ["Winter", "Mannheimer", "Mühlen", "Haupt", "Mallinckrodt", "Bahnhof"]) {
    assert.ok(nameSimilarity(other, "Münster") < THRESHOLDS.minName, `${other} ≁ Münster`);
  }
});

// ---------- şehir + cadde + numara puanlama ----------

test("Dortmund bağlamı + yerleşik cadde → öneri (otomatik değişmez)", () => {
  const r = resolveAddress("Dortmund, Mansterstraße 160", emptyBook());
  assert.equal(r.status, "suggest");
  assert.equal(r.suggestion, "Dortmund, Münsterstraße 160");
  assert.equal(r.location, "Dortmund, Mansterstraße 160"); // dokunulmadı
});

test("kullanıcının kendi adresi yüksek ağırlıkla → doğrudan düzeltme", () => {
  const r = resolveAddress("Mansterstraße 160", DORTMUND_HOME);
  assert.equal(r.status, "auto");
  assert.equal(r.location, "Münsterstraße 160");
  assert.equal(r.source, "used");
  assert.ok(r.score >= THRESHOLDS.auto);
});

test("kayıtlı kısa ad adresi de aday: Dortmund bağlamı + numara eşleşmesi", () => {
  const r = resolveAddress("Dortmund, Münstastraße 160", ALIASES);
  assert.equal(r.status, "auto");
  assert.equal(r.location, "Dortmund, Münsterstraße 160");
  assert.equal(r.source, "saved");
});

test("az kullanılmış adres yalnızca öneri", () => {
  const once = recordUse(emptyBook(), "Dortmund, Münsterstraße 160", 1);
  const r = resolveAddress("Mansterstraße 160", once);
  assert.equal(r.status, "suggest");
  assert.equal(r.suggestion, "Münsterstraße 160");
});

test("farklı numara: cadde düzeltilir, kullanıcının numarası korunur", () => {
  const r = resolveAddress("Mansterstraße 99", DORTMUND_HOME);
  assert.notEqual(r.status, "none");
  assert.match(r.suggestion ?? r.location, /Münsterstraße 99$/);
});

test("bağlam yoksa düşük güven → hiçbir şey yapılmaz", () => {
  const r = resolveAddress("Mansterstraße 160", emptyBook());
  assert.equal(r.status, "none");
  assert.equal(r.location, "Mansterstraße 160");
  assert.equal(r.suggestion, undefined);
});

test("bilinen cadde birebir: exact, dokunulmaz", () => {
  assert.equal(resolveAddress("Dortmund, Münsterstraße 160", emptyBook()).status, "exact");
  assert.equal(resolveAddress("Bonn, Rochusstraße 400", emptyBook()).status, "exact");
});

test("kullanıcının onayladığı düzeltme sonraki sefer otomatik uygulanır", () => {
  const learned = learnCorrection(emptyBook(), "Mansterstraße 160", "Dortmund, Münsterstraße 160");
  const r = resolveAddress("mansterstrasse 160", learned);
  assert.equal(r.status, "auto");
  assert.equal(r.location, "Dortmund, Münsterstraße 160");
  assert.equal(r.source, "correction");
  assert.equal(learned.used["Dortmund, Münsterstraße 160"].count, 1);
});

// ---------- yanlış pozitifleri engelleyen testler ----------

test("yanlış pozitif: ilgisiz cadde adı, aynı numara + şehir bağlamına rağmen değişmez", () => {
  for (const street of ["Hauptstraße", "Winterstraße", "Mannheimer Straße", "Mühlenstraße", "Gartenstraße"]) {
    const r = resolveAddress(`Dortmund, ${street} 160`, DORTMUND_HOME);
    assert.ok(r.status === "none" || r.status === "exact", `${street}: ${r.status}`);
    assert.equal(r.suggestion, undefined, street);
    assert.ok(!/Münster/.test(r.location), street);
  }
});

test("yanlış pozitif: farklı açık şehir adayı eler", () => {
  const r = resolveAddress("Köln, Mansterstraße 5", DORTMUND_HOME);
  assert.equal(r.status, "none");
});

test("yanlış pozitif: farklı cadde türü ('Münsterallee') Münsterstraße'ye çevrilmez", () => {
  const r = resolveAddress("Dortmund, Münsterallee 160", DORTMUND_HOME);
  assert.notEqual(r.status, "auto");
  assert.notEqual(r.status, "suggest");
});

test("yanlış pozitif: belirsizlikte (iki yakın aday) düzeltme yok", () => {
  let b = recordUse(emptyBook(), "Dortmund, Münsterstraße 1", 1);
  b = recordUse(b, "Dortmund, Mönsterstraße 1", 2);
  const r = resolveAddress("Dortmund, Mansterstraße 1", b);
  assert.ok(r.status === "none" || r.status === "exact");
  assert.equal(r.suggestion, undefined);
});

test("yerleşik liste tek başına asla otomatik düzeltme yapmaz", () => {
  for (const wrong of ["Dortmund, Mansterstraße 160", "Dortmund, Monsterstraße 160", "Dortmund, Münstastraße 160"]) {
    assert.notEqual(resolveAddress(wrong, emptyBook()).status, "auto", wrong);
  }
});

test("adres olmayan konumlar fuzzy'ye girmez", () => {
  assert.equal(resolveAddress("Erdemli", DORTMUND_HOME).status, "none");
  assert.equal(resolveAddress("Köln Hbf", DORTMUND_HOME).status, "none");
});

// ---------- istenen örnekler (uçtan uca) ----------

test("“Manchester Straße 160’a gidiyorum” → Münsterstraße 160, hızlı navigasyon", () => {
  const a = analyzeSpeech("Manchester Straße 160’a gidiyorum", NOW);
  assert.equal(a.location, "Münsterstraße 160");
  assert.equal(a.navigation, true);
});

test("“Manchester Straße 160’a gidiyorum”: Dortmund bağlamında aynı sonuç", () => {
  const a = analyzeSpeech("Dortmund Manchester Straße 160’a gidiyorum", NOW, DORTMUND_HOME);
  assert.equal(a.location, "Dortmund, Münsterstraße 160");
  assert.equal(a.navigation, true);
});

test("“Munster str 160 gidiyom” → Münsterstraße 160", () => {
  const a = analyzeSpeech("Munster str 160 gidiyom", NOW);
  assert.equal(a.location, "Münsterstraße 160");
  assert.equal(a.navigation, true);
});

test("“Münsterstr. 160” (fiilsiz) → Münsterstraße 160, hızlı navigasyon", () => {
  const a = analyzeSpeech("Münsterstr. 160", NOW);
  assert.equal(a.location, "Münsterstraße 160");
  assert.equal(a.navigation, true);
});

test("“Dortmund Münsterstraße 160’a gidiyorum” → hızlı navigasyon", () => {
  const a = analyzeSpeech("Dortmund Münsterstraße 160’a gidiyorum", NOW);
  assert.equal(a.location, "Dortmund, Münsterstraße 160");
  assert.equal(a.navigation, true);
  assert.equal(a.suggestion, null);
});

test("“kapıyı aç” ve “sinemaya gidiyorum” navigasyon değil", () => {
  for (const t of ["kapıyı aç", "sinemaya gidiyorum", "Sinemaya gidiyorum", "Markete gidiyorum", "Bakkala gidiyorum", "Kapıyı aç"]) {
    const a = analyzeSpeech(t, NOW);
    assert.equal(a.navigation, false, t);
    assert.equal(a.location, null, t);
  }
});

test("bulanık eşleşmede orta güven: öneri sunulur, konum değişmez, hızlı ekran açılır", () => {
  const a = analyzeSpeech("Dortmund Mansterstraße 160'a gidiyorum", NOW);
  assert.equal(a.location, "Dortmund, Mansterstraße 160");
  assert.equal(a.suggestion, "Dortmund, Münsterstraße 160");
  assert.equal(a.navigation, true);
});

test("yüksek güvende başlık da güncellenir", () => {
  const a = analyzeSpeech("Mansterstraße 160'a gidiyorum", NOW, DORTMUND_HOME);
  assert.equal(a.location, "Münsterstraße 160");
  assert.equal(a.suggestion, null);
  assert.match(a.title, /Münsterstraße 160/);
});

// ---------- hızlı navigasyon yalnız güvenilir hedefte ----------

test("güvenilir hedef: özel ad kesmeli, bilinen şehir, adres", () => {
  assert.ok(detectNavigationIntent("Erdemli'ye gidiyorum", NOW));
  assert.ok(detectNavigationIntent("Erdemliye gidiyorum", NOW)); // kesmesiz ama bilinen şehir
  assert.ok(detectNavigationIntent("Köln Hbf'ye git", NOW));
});

test("güvenilmez hedef: yalnızca genel yer türü ya da bilinmeyen kesmesiz ad", () => {
  for (const t of ["Hbf'ye git", "Flughafen'e gidiyorum", "Messe'ye gidiyorum", "Sinemaya gidiyorum", "Bakkala gidiyorum"]) {
    assert.equal(detectNavigationIntent(t, NOW), null, t);
  }
});

test("zaman ifadesi varsa hızlı navigasyon açılmaz (hatırlatma akışı)", () => {
  for (const t of [
    "bugün saat 17'de Dortmund Münsterstraße 160'a gideceğim",
    "yarın 9'da Mansterstraße 160'a git",
    "20 dakika sonra Erdemli'ye gidiyorum",
  ]) {
    const a = analyzeSpeech(t, NOW, DORTMUND_HOME);
    assert.equal(a.navigation, false, t);
    assert.notEqual(a.parsed.dueAt, null, t);
  }
});

// ---------- kısa adlar (alias) ----------

test("kısa adlar tam adrese bağlanır: ev, iş, Hbf, Flughafen, Münster", () => {
  const cases: Array<[string, string]> = [
    ["Eve gidiyorum", "Dortmund, Münsterstraße 160"],
    ["evde olacağım yarın saat 9'da", "Dortmund, Münsterstraße 160"],
    ["işe gidiyorum", "Bonn, Rochusstraße 400"],
    ["İşe gidiyorum", "Bonn, Rochusstraße 400"],
    ["Hbf'ye git", "Dortmund Hbf"],
    ["Hbf’ye gidiyorum", "Dortmund Hbf"],
    ["Flughafen'e gidiyorum", "Dortmund Flughafen"],
    ["Münster'e gidiyorum", "Münster Hbf"],
  ];
  for (const [text, address] of cases) {
    assert.equal(analyzeSpeech(text, NOW, ALIASES).location, address, text);
  }
});

test("kısa ad hızlı navigasyon açar; adres defteri yoksa 'eve gidiyorum' açmaz", () => {
  assert.deepEqual(detectNavigationIntent("Eve gidiyorum", NOW, ALIASES), { location: "Dortmund, Münsterstraße 160" });
  assert.equal(detectNavigationIntent("Eve gidiyorum", NOW), null);
  assert.equal(detectNavigationIntent("eve git", NOW), null);
});

test("kısa ad + zaman ifadesi → konumlu hatırlatma", () => {
  const a = analyzeSpeech("yarın saat 8'de işe gidiyorum", NOW, ALIASES);
  assert.equal(a.navigation, false);
  assert.equal(a.location, "Bonn, Rochusstraße 400");
  assert.notEqual(a.parsed.dueAt, null);
  assert.equal(a.parsed.locationKind, "alias");
});

test("adres defteri yardımcıları", () => {
  assert.equal(matchAlias("Evde", ALIASES)?.address, "Dortmund, Münsterstraße 160");
  assert.equal(matchAlias("Hbf'ye", ALIASES)?.address, "Dortmund Hbf");
  assert.equal(matchAlias("Bakkal", ALIASES), null);
  assert.equal(Object.keys(removeAlias(ALIASES, "ev").aliases).includes("ev"), false);
  assert.equal(homeCity(ALIASES), "Dortmund");
  assert.equal(homeCity(emptyBook()), undefined);
  assert.equal(isKnownPlace("Erdemli"), true);
  assert.equal(isKnownPlace("Sinema"), false);
  // bozuk / eski IndexedDB verisi
  assert.deepEqual(normalizeBook(undefined), emptyBook());
  assert.deepEqual(normalizeBook({ aliases: { x: { name: 1 } }, used: { a: "b" }, corrections: { k: 5 } }), emptyBook());
  assert.equal(normalizeBook({ aliases: { ev: { name: "ev", address: "X" } } }).aliases.ev.address, "X");
});

test("öğrenilebilir düzeltme: aynı numara + benzer ama farklı cadde adı; gerçek adres değişiklikleri öğrenilmez", () => {
  assert.equal(isLearnableCorrection("Dortmund, Mansterstraße 160", "Dortmund, Münsterstraße 160"), true);
  assert.equal(isLearnableCorrection("Mansterstraße 160", "Münsterstraße 160"), true);
  assert.equal(isLearnableCorrection("Hauptstraße 5", "Hauptstraße 7"), false); // numara değişti
  assert.equal(isLearnableCorrection("Hauptstraße 5", "Hauptstraße 5"), false); // aynı
  assert.equal(isLearnableCorrection("Hauptstraße 5", "Münsterstraße 5"), false); // ilgisiz cadde
  assert.equal(isLearnableCorrection("Erdemli", "Mersin"), false); // adres değil
});

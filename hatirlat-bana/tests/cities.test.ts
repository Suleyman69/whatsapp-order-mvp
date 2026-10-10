import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBook } from "../src/lib/addressbook";
import { CITY_THRESHOLDS, cityScore, exactCity, isPersonName, matchCity } from "../src/lib/cities";
import { analyzeSpeech, detectNavigationIntent } from "../src/lib/intent";
import { formatLocation, normalizeLocation, parseAddress, spokenAddress } from "../src/lib/location";
import { parseReminder } from "../src/lib/parse";
import { resolveAddress } from "../src/lib/resolve";
import { fromWall } from "../src/lib/tz";

const NOW = fromWall(new Date(Date.UTC(2026, 9, 10, 12, 0))); // 10.10.2026 12:00 Berlin

// ---------- istenen regresyon örnekleri ----------

const regression: Array<[string, string]> = [
  ["ahen", "Aachen"],
  ["aachen", "Aachen"],
  ["koln", "Köln"],
  ["dusseldorf", "Düsseldorf"],
  ["munster", "Münster"],
  ["frankfort", "Frankfurt"],
];
for (const [input, city] of regression) {
  for (const ctx of ["address", "place"] as const) {
    test(`şehir normalizasyonu [${ctx}]: ${input} → ${city}`, () => {
      const m = matchCity(input, ctx);
      assert.ok(m.status === "exact" || m.status === "auto", `${input}: ${m.status} (${m.score.toFixed(2)})`);
      assert.equal(m.city, city);
    });
  }
}

test("tam eşleşme (katlanmış) umlaut ve büyük harfi düzeltir, bulanık aranmaz", () => {
  for (const [input, city] of [
    ["AACHEN", "Aachen"], ["köln", "Köln"], ["Koeln", "Köln"], ["duesseldorf", "Düsseldorf"], ["muenchen", "München"],
    ["nurnberg", "Nürnberg"], ["monchengladbach", "Mönchengladbach"], ["frankfurt am main", "Frankfurt am Main"], ["bad honnef", "Bad Honnef"],
    ["osnabruck", "Osnabrück"], ["gottingen", "Göttingen"], ["istanbul", "İstanbul"], ["izmir", "İzmir"],
  ] as const) {
    const m = matchCity(input, "place");
    assert.equal(m.status, "exact", input);
    assert.equal(m.city, city, input);
  }
  assert.equal(exactCity("Hamburg"), "Hamburg");
  assert.equal(exactCity("Homburg"), "Homburg"); // gerçek ayrı şehir: Hamburg'a çevrilmez
});

test("yaygın konuşma tanıma hataları yüksek güvenle düzeltilir", () => {
  const cases: Array<[string, string]> = [
    ["aahen", "Aachen"], ["frankfurd", "Frankfurt"], ["frankfurth", "Frankfurt"], ["hamburk", "Hamburg"], ["hannofer", "Hannover"],
    ["hanover", "Hannover"], ["nurenberg", "Nürnberg"], ["stutgart", "Stuttgart"], ["dortmunt", "Dortmund"], ["tortmund", "Dortmund"],
    ["bohum", "Bochum"], ["wupertal", "Wuppertal"], ["bilefeld", "Bielefeld"], ["menchengladbach", "Mönchengladbach"], ["duisburk", "Duisburg"],
    ["leibzig", "Leipzig"], ["dresten", "Dresden"], ["manheim", "Mannheim"], ["carlsruhe", "Karlsruhe"], ["freiburk", "Freiburg"],
    ["paterborn", "Paderborn"], ["kasel", "Kassel"], ["kolen", "Köln"], ["monster", "Münster"], ["esen", "Essen"], ["leverkuzen", "Leverkusen"],
  ];
  for (const [input, city] of cases) {
    const m = matchCity(input, "address");
    assert.equal(m.status, "auto", `${input}: ${m.status}`);
    assert.equal(m.city, city, input);
  }
});

// ---------- düşük güvenli eşleşmeler otomatik değişmez ----------

test("orta güven: yalnızca öneri, otomatik değişmez", () => {
  for (const [input, city] of [["aken", "Aachen"], ["noyss", "Neuss"]] as const) {
    const m = matchCity(input, "place");
    assert.equal(m.status, "suggest", input);
    assert.equal(m.city, city);
    assert.ok(m.score >= CITY_THRESHOLDS.suggest && m.score < CITY_THRESHOLDS.auto);
  }
});

test("yanlış pozitif: kişi adları, Türk şehirleri ve genel sözcükler asla Alman şehrine çevrilmez", () => {
  for (const w of ["Hakan", "Merlin", "Berna", "Ahmet", "Eren", "Mehmet", "Kemal", "Selim", "Hans", "Berk"]) {
    assert.equal(matchCity(w, "address").status, "none", w);
    assert.equal(isPersonName(w), true, w);
  }
  for (const w of ["Mersin", "Erdemli", "Ankara", "Adana", "Hatay", "Antalya"]) {
    const m = matchCity(w, "place");
    assert.equal(m.status, "exact", w);
    assert.equal(m.city, w);
  }
  for (const w of ["Sinema", "Market", "Hastane", "Bakkal", "Okul", "Garten", "Flughafen", "Hbf", "Kerpen", "Okuyan", "Bon", "Ali"]) {
    assert.equal(matchCity(w, "place").status, "none", w);
  }
});

test("yanlış pozitif: ilk harf sınıfı farklıysa (Merlin ≠ Berlin) puan düşer", () => {
  assert.ok(cityScore("Merlin", "Berlin") < CITY_THRESHOLDS.suggest);
  assert.ok(cityScore("Verlin", "Berlin") < CITY_THRESHOLDS.suggest);
  assert.ok(cityScore("ahen", "Aachen") >= CITY_THRESHOLDS.auto);
});

test("yanlış pozitif: iki şehre eşit yakınsa (Hern → Herne/Herten) dokunulmaz", () => {
  const m = matchCity("Hern", "place");
  assert.equal(m.status, "none");
  assert.equal(m.city, "Hern");
});

test("çok kısa / rakamlı girdiler bulanık aranmaz", () => {
  for (const w of ["Bo", "Ha", "Ulm1", "123", "", " "]) assert.equal(matchCity(w, "address").status === "auto", false, w);
});

// ---------- adres ve yer öbeği entegrasyonu ----------

test("adres bağlamında şehir düzeltilir", () => {
  assert.deepEqual(parseAddress("Ahen Hauptstraße 5"), { city: "Aachen", street: "Hauptstraße 5" });
  assert.deepEqual(parseAddress("Hauptstraße 5 Ahen"), { city: "Aachen", street: "Hauptstraße 5" });
  assert.equal(formatLocation("koln hohenzollernring 20"), "Köln, Hohenzollernring 20");
  assert.equal(formatLocation("Frankfort Kaiserstr. 3"), "Frankfurt, Kaiserstraße 3");
  assert.equal(formatLocation("dusseldorf konigsallee 1"), "Düsseldorf, Konigsallee 1"); // cadde adındaki umlaut geri getirilmez
});

test("orta güven adreste öneri olur, şehir değişmez", () => {
  const a = parseAddress("Aken Hauptstraße 5");
  assert.equal(a?.city, "Aken");
  assert.equal(a?.citySuggestion, "Aachen");
  assert.deepEqual(normalizeLocation("Aken Hauptstraße 5"), { location: "Aken, Hauptstraße 5", suggestion: "Aachen, Hauptstraße 5" });
  const r = resolveAddress("Aken, Hauptstraße 5", emptyBook());
  assert.equal(r.status, "suggest");
  assert.equal(r.suggestion, "Aachen, Hauptstraße 5");
  assert.equal(r.location, "Aken, Hauptstraße 5");
});

test("yer öbeğinde ilk sözcükteki şehir düzeltilir", () => {
  assert.equal(formatLocation("ahen hbf"), "Aachen Hbf");
  assert.equal(formatLocation("koln hbf"), "Köln Hbf");
  assert.equal(formatLocation("frankfort flughafen"), "Frankfurt Flughafen");
  assert.equal(formatLocation("bad honnef bahnhof"), "Bad Honnef Bahnhof");
  assert.equal(formatLocation("dortmund flughafen"), "Dortmund Flughafen");
  assert.equal(formatLocation("Hakan Hbf"), "Hakan Hbf");
  assert.deepEqual(normalizeLocation("aken hbf"), { location: "Aken Hbf", suggestion: "Aachen Hbf" });
});

// ---------- cümle düzeyinde (adres / navigasyon bağlamı) ----------

test("navigasyon bağlamı: yüksek güven normalize edilir ve hızlı Hedef ekranı açılır", () => {
  const cases: Array<[string, string]> = [
    ["Ahen'e gidiyorum", "Aachen"],
    ["ahen'e git", "Aachen"],
    ["Frankfort Hbf'ye git", "Frankfurt Hbf"],
    ["Koln Hbf'ye git", "Köln Hbf"],
    ["Dusseldorf'a gidiyorum", "Düsseldorf"],
    ["Munster'e gidiyorum", "Münster"],
    ["Dortmunt'a gidiyorum", "Dortmund"],
    ["Navigasyonu Ahen'e aç", "Aachen"],
    ["Ahen Hauptstraße 5'e gidiyorum", "Aachen, Hauptstraße 5"],
    ["Ahen Hauptstr. 5", "Aachen, Hauptstraße 5"],
    ["Frankfort Kaiserstraße 3'e gidiyorum", "Frankfurt, Kaiserstraße 3"],
    ["dusseldorf konigsallee 1'e git", "Düsseldorf, Konigsallee 1"],
  ];
  for (const [text, location] of cases) {
    const a = analyzeSpeech(text, NOW);
    assert.equal(a.location, location, text);
    assert.equal(a.navigation, true, text);
    assert.equal(a.suggestion, null, text);
  }
});

test("görev başlığı düzeltilmiş şehri kullanır", () => {
  assert.equal(parseReminder("Ahen'e gidiyorum", NOW).title, "Aachen'e git");
  assert.equal(parseReminder("Ahen Hauptstraße 5'e gidiyorum", NOW).title, "Aachen'e git");
  assert.equal(parseReminder("Frankfort Kaiserstraße 3'e gidiyorum", NOW).title, "Frankfurt'a git");
});

test("orta güven: konum değişmez, 'mu demek istedin?' önerisi çıkar", () => {
  const a = analyzeSpeech("Aken'e gidiyorum", NOW);
  assert.equal(a.location, "Aken");
  assert.equal(a.suggestion, "Aachen");
  const b = analyzeSpeech("Aken Hauptstraße 5'e gidiyorum", NOW);
  assert.equal(b.location, "Aken, Hauptstraße 5");
  assert.equal(b.suggestion, "Aachen, Hauptstraße 5");
});

test("kesmesiz ek ama düzeltilince bilinen şehir: güvenilir hedef", () => {
  const a = analyzeSpeech("Ahenye gidiyorum", NOW);
  assert.equal(a.location, "Aachen");
  assert.equal(a.navigation, true);
});

test("yanlış pozitif (cümle): kişi adları ve tanıdık olmayan kelimeler şehre çevrilmez, hızlı navigasyon açılmaz", () => {
  for (const t of ["Hakan'a gidiyorum", "Mehmet'e git", "Merlin'e gidiyorum", "Berna'ya gidiyorum", "Ahmet'e gidiyorum", "Sinemaya gidiyorum"]) {
    const a = analyzeSpeech(t, NOW);
    assert.equal(a.navigation, false, t);
    assert.equal(a.location, null, t);
    assert.equal(a.suggestion, null, t);
  }
  // adres bağlamında bile kişi adı şehre çevrilmez
  for (const [t, loc] of [
    ["Hakan Hauptstraße 5'e gidiyorum", "Hakan, Hauptstraße 5"],
    ["Merlin Hauptstraße 5'e gidiyorum", "Merlin, Hauptstraße 5"],
    ["Berna Hauptstraße 5'e git", "Berna, Hauptstraße 5"],
  ] as const) {
    const a = analyzeSpeech(t, NOW);
    assert.equal(a.location, loc, t);
    assert.equal(a.suggestion, null, t);
  }
});

test("bilinen Türk şehirleri korunur", () => {
  for (const city of ["Erdemli", "Mersin", "Adana", "Antalya"]) {
    const a = analyzeSpeech(`${city}'ye gidiyorum`, NOW);
    assert.equal(a.location, city);
    assert.equal(a.navigation, true);
  }
});

test("zaman ifadesi varsa şehir düzeltilir ama normal hatırlatma akışı sürer", () => {
  const a = analyzeSpeech("yarın saat 9'da Ahen Hauptstraße 5'e git", NOW);
  assert.equal(a.navigation, false);
  assert.equal(a.location, "Aachen, Hauptstraße 5");
  assert.equal(a.parsed.dueAt, fromWall(new Date(Date.UTC(2026, 9, 11, 9, 0))));
  assert.equal(detectNavigationIntent("bugün saat 17'de Frankfort Hbf'ye git", NOW), null);
});

test("Almanca dikte edilen adreste şehir düzeltilir", () => {
  assert.equal(spokenAddress("Aachen Hauptstraße 5"), "Aachen, Hauptstraße 5");
  assert.equal(spokenAddress("ahen hauptstraße 5"), "Aachen, Hauptstraße 5");
  assert.equal(spokenAddress("Navigation zu Koln Hbf"), "Köln Hbf");
});

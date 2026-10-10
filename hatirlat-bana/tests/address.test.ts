import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNavigationIntent } from "../src/lib/intent";
import { formatLocation, parseAddress, spokenAddress } from "../src/lib/location";
import { parseReminder } from "../src/lib/parse";
import { fromWall } from "../src/lib/tz";

const NOW = fromWall(new Date(Date.UTC(2026, 9, 10, 12, 0))); // 10.10.2026 12:00 Berlin
const DM = "Dortmund, Münsterstraße 160";

/** iPhone Web Speech'in verebileceği adres yazımları → aynı normalleştirilmiş konum ve hızlı navigasyon. */
const speech: Array<[string, string]> = [
  // cadde eki varyantları
  ["Dortmund Münsterstraße 160'a gidiyorum", DM],
  ["Dortmund Münsterstrasse 160'a gidiyorum", DM],
  ["Dortmund Münsterstr. 160'a gidiyorum", DM],
  ["Dortmund Münsterstr 160'a gidiyorum", DM],
  ["Dortmund Münsterstrase 160'a gidiyorum", DM],
  ["Dortmund Münsterstrasze 160'a gidiyorum", DM],
  // ayrı yazılmış cadde sözcüğü
  ["Dortmund Münster Straße 160'a gidiyorum", DM],
  ["Dortmund Münster Strasse 160'a gidiyorum", DM],
  ["Dortmund Münster straße 160'a gidiyorum", DM],
  ["Dortmund Münster Str. 160'a gidiyorum", DM],
  ["Dortmund Münster Str 160'a gidiyorum", DM],
  // bina numarası: apostroflu / apostrofsuz / ek ayrı / eksiz
  ["Dortmund Münsterstraße 160’a gidiyorum", DM], // tipografik apostrof
  ["Dortmund Münsterstraße 160a gidiyorum", DM],
  ["Dortmund Münsterstraße 160 a gidiyorum", DM],
  ["Dortmund Münsterstraße 160 gidiyorum", DM],
  ["Dortmund Münsterstraße 160'e gidiyorum", DM],
  ["Dortmund Münsterstraße Nr. 160'a gidiyorum", DM],
  ["Dortmund Münsterstraße Nr 160 a gidiyorum", DM],
  ["Dortmund Münsterstraße No 160'a gidiyorum", DM],
  ["Münsterstraße 160-162'ye gidiyorum", "Münsterstraße 160-162"],
  ["Münsterstraße 160b gidiyorum", "Münsterstraße 160b"],
  // sıra: cadde önce / virgüllü
  ["Münsterstraße 160 Dortmund'a gidiyorum", DM],
  ["Dortmund, Münsterstraße 160'a gidiyorum", DM],
  ["Dortmund, Münsterstraße 160, gidiyorum", DM],
  ["Dortmund Münsterstraße 160'a şimdi gidiyorum", DM],
  ["Şimdi Dortmund Münsterstr. 160'a gidiyorum.", DM],
  // büyük / küçük harf
  ["dortmund münsterstraße 160'a gidiyorum", DM],
  ["DORTMUND MÜNSTERSTRASSE 160'A gidiyorum", DM],
  ["dortmund Münsterstraße 160'a gidiyorum", DM],
  ["Dortmund MÜNSTER STRASSE 160'a gidiyorum", DM],
  // Türkçe karakter / umlaut düşmesi ve konuşma dili
  ["Dortmund Münsterstraße 160'a gidiyom", DM],
  ["Dortmund Münsterstraße 160'a gidiyoz", DM],
  ["Dortmund Münsterstraße 160'a yola cikiyorum", DM],
  ["Dortmund Münsterstraße 160'a yola çıkıyom", DM],
  ["Munsterstrasse 160'a gidiyorum", "Münsterstraße 160"],
  ["Koln Hbf'ye git", "Köln Hbf"],
  ["Köln Hbf'ye git.", "Köln Hbf"],
  ["köln hbf'ye git", "Köln Hbf"],
  // navigasyon açma kalıpları
  ["Navigasyonu Dortmund Flughafen'e aç", "Dortmund Flughafen"],
  ["Navigasyonu Dortmund Flughafen'e ac", "Dortmund Flughafen"],
  ["navigasyonu Dortmund Münsterstr. 160'a aç", DM],
  ["Münsterstraße 160 için navigasyonu aç", "Münsterstraße 160"],
  ["Erdemli için navigasyonu aç", "Erdemli"],
  ["Dortmund için rota oluştur", "Dortmund"],
  ["Rotayı Köln Hbf'ye aç", "Köln Hbf"],
  ["Beni Dortmund Münsterstr. 160'a götür", DM],
  ["Dortmund Münsterstr. 160, beni buraya götür", DM],
  ["Ben Erdemli'ye gidiyorum", "Erdemli"],
];
for (const [text, location] of speech) {
  test(`konuşma varyasyonu: ${text}`, () => {
    assert.equal(parseReminder(text, NOW).location, location);
    assert.deepEqual(detectNavigationIntent(text, NOW), { location });
  });
}

// Fiilsiz, yalnızca adres söylendi (ekran görüntüsündeki durum: Safari "Münsterstrasse 160" için "Manchester Straße 160" yazdı)
const bare: Array<[string, string]> = [
  ["Manchester Straße 160", "Münsterstraße 160"],
  ["Manchester Strasse 160", "Münsterstraße 160"],
  ["manchester straße 160", "Münsterstraße 160"],
  ["Monster Straße 160", "Münsterstraße 160"],
  ["Münsterstrasse 160", "Münsterstraße 160"],
  ["Munsterstrasse 160", "Münsterstraße 160"],
  ["Muensterstrasse 160", "Münsterstraße 160"],
  ["Münsterstraße 160.", "Münsterstraße 160"],
  ["Münsterstraße 160'a", "Münsterstraße 160"],
  ["Dortmund Münsterstraße 160", DM],
  ["Dortmund Manchester Straße 160", DM],
  ["Koln Munster Str. 5", "Köln, Münsterstraße 5"],
  ["Adres Münsterstraße 160", "Münsterstraße 160"],
  ["Navigasyon Dortmund Münsterstr. 160", DM],
];
for (const [text, location] of bare) {
  test(`yalnızca adres → hızlı navigasyon: ${text}`, () => {
    const r = parseReminder(text, NOW);
    assert.equal(r.location, location);
    assert.equal(r.locationBare, true);
    assert.deepEqual(detectNavigationIntent(text, NOW), { location });
  });
}

test("fiilsiz adres zaman ifadesiyle hatırlatma olur; hatırlat dersen de hatırlatma", () => {
  const timed = parseReminder("yarın saat 10'da Manchester Straße 160", NOW);
  assert.equal(timed.location, "Münsterstraße 160");
  assert.equal(timed.dueAt, fromWall(new Date(Date.UTC(2026, 9, 11, 10, 0))));
  assert.equal(detectNavigationIntent("yarın saat 10'da Manchester Straße 160", NOW), null);
  const remind = parseReminder("Münsterstraße 160 hatırlat", NOW);
  assert.equal(remind.location, "Münsterstraße 160");
  assert.equal(detectNavigationIntent("Münsterstraße 160 hatırlat", NOW), null);
});

test("adres olmayan kısa cümleler yalnızca-adres sayılmaz", () => {
  for (const t of ["Mehmet", "Süt al", "Manchester", "Münster", "Dr. Müller 5 randevu", "Hauptstr. 5 Dr. Müller'i ara"]) {
    assert.equal(parseReminder(t, NOW).locationBare, false, t);
    assert.equal(detectNavigationIntent(t, NOW), null, t);
  }
});

test("Almanca dikte edilen adres normalleşir", () => {
  assert.equal(spokenAddress("Münsterstraße 160"), "Münsterstraße 160");
  assert.equal(spokenAddress("Münsterstraße 160 Dortmund"), DM);
  assert.equal(spokenAddress("Dortmund Münsterstraße 160."), DM);
  assert.equal(spokenAddress("Navigation zu Münsterstraße 160 Dortmund"), DM);
  assert.equal(spokenAddress("Bitte navigiere nach Dortmund Flughafen"), "Dortmund Flughafen");
  assert.equal(spokenAddress("Fahre zum Köln Hauptbahnhof"), "Köln Hauptbahnhof");
});

test("umlaut geri getirme", () => {
  assert.equal(formatLocation("Koln Hbf"), "Köln Hbf");
  assert.equal(formatLocation("dusseldorf flughafen"), "Düsseldorf Flughafen");
  assert.equal(parseAddress("Muenchen Hauptstr. 1")?.city, "München");
});

// Zaman ifadesi varsa aynı adres varyasyonları normal hatırlatma olarak kalır
const timed: Array<[string, string, number]> = [
  ["bugün saat 17'de Dortmund Münsterstr. 160'a gideceğim", DM, fromWall(new Date(Date.UTC(2026, 9, 10, 17, 0)))],
  ["Dortmund Münster Strasse 160 a gideceğim bugün saat 17'de", DM, fromWall(new Date(Date.UTC(2026, 9, 10, 17, 0)))],
  ["yarın 9'da DORTMUND MÜNSTERSTRASSE 160'A gidiyorum", DM, fromWall(new Date(Date.UTC(2026, 9, 11, 9, 0)))],
  ["Dortmund Münsterstraße Nr. 160'a 2 saat sonra git", DM, fromWall(new Date(Date.UTC(2026, 9, 10, 14, 0)))],
  ["Münsterstr. 8'de saat 17'de olacağım", "Münsterstraße 8", fromWall(new Date(Date.UTC(2026, 9, 10, 17, 0)))],
];
for (const [text, location, dueAt] of timed) {
  test(`zamanlı hatırlatma kalır: ${text}`, () => {
    const r = parseReminder(text, NOW);
    assert.equal(r.location, location);
    assert.equal(r.dueAt, dueAt);
    assert.equal(detectNavigationIntent(text, NOW), null);
  });
}

test("konuşma varyasyonları görevi kısa ve doğru üretir", () => {
  assert.equal(parseReminder("Dortmund Münster Str. 160 a gidiyorum", NOW).title, "Dortmund'a git");
  assert.equal(parseReminder("Münsterstr. 160 a gidiyorum", NOW).title, "Münsterstraße 160'a git");
  assert.equal(parseReminder("Münsterstrasse 160 gidiyorum", NOW).title, "Münsterstraße 160 adresine git");
  assert.equal(parseReminder("Erdemli için navigasyonu aç", NOW).title, "Erdemli'ye git");
});

test("parseAddress / formatLocation normalizasyonu", () => {
  assert.deepEqual(parseAddress("bad honnef hauptstr. 5"), { city: "Bad Honnef", street: "Hauptstraße 5" });
  assert.deepEqual(parseAddress("Frankfurt am Main Karl-Marx-Strasse 7"), { city: "Frankfurt am Main", street: "Karl-Marx-Straße 7" });
  assert.equal(formatLocation("Bonn Rochusstr 400"), "Bonn, Rochusstraße 400");
  assert.equal(formatLocation("dortmund flughafen"), "Dortmund Flughafen"); // adres değil: yalnızca büyük/küçük harf
  assert.equal(parseAddress("Dortmund Flughafen"), null);
});

test("nav/konum yanlış pozitifleri yok", () => {
  for (const t of [
    "Mehmet'i ara",
    "Süt al",
    "gidiyorum",
    "eve gidiyorum",
    "bugün işe gidiyorum",
    "navigasyonu aç", // hedef yok
    "kapıyı aç", // navigasyon bağlamı yok
    "Erdemli'ye gideceğim",
    "Dortmund Münsterstr. 160'a gideceğim",
    "Erdemli'ye git diye hatırlat",
  ]) {
    assert.equal(detectNavigationIntent(t, NOW), null, t);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNavigationIntent } from "../src/lib/intent";
import { formatLocation, parseAddress } from "../src/lib/location";
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
  ["Munsterstrasse 160'a gidiyorum", "Munsterstraße 160"],
  ["Koln Hbf'ye git", "Koln Hbf"],
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

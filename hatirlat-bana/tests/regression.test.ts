/**
 * Gerçek iPhone hatası: mikrofon "Münster Straße 160" ifadesini doğru yazdı ama uygulama
 * hızlı Hedef ekranı yerine normal "Tarihsiz / Kaydet" hatırlatma ekranını açtı.
 * Zaman ifadesi olmayan, geçerli tek başına adres HER ZAMAN hızlı navigasyona girmeli.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBook, recordUse, setAlias } from "../src/lib/addressbook";
import { analyzeSpeech } from "../src/lib/intent";
import { parseReminder } from "../src/lib/parse";
import { cleanTranscript, collapseRepeats } from "../src/lib/transcript";
import { fromWall } from "../src/lib/tz";

const NOW = fromWall(new Date(Date.UTC(2026, 9, 10, 12, 0))); // 10.10.2026 12:00 Berlin
const STREET = "Münsterstraße 160";
const DM = "Dortmund, Münsterstraße 160";

// Gerçek örnek ve istenen varyasyonlar
const real: Array<[string, string]> = [
  ["Münster Straße 160", STREET],
  ["Münsterstraße 160", STREET],
  ["Münsterstr. 160", STREET],
  ["Münster Str. 160", STREET],
  ["Münster Strasse 160", STREET],
  ["münster straße 160", STREET],
  ["Dortmund Münster Straße 160", DM],
  ["Dortmund Münsterstraße 160", DM],
  ["Dortmund Münsterstr. 160", DM],
  ["Dortmund, Münster Straße 160", DM],
  ["Münster Straße 160 Dortmund", DM],
  ["Münster Straße 160, Dortmund", DM],
];

const BOOKS: Array<[string, ReturnType<typeof emptyBook>]> = [
  ["boş adres defteri", emptyBook()],
  [
    "kısa adlı + kullanılmış adresli defter",
    recordUse(recordUse(setAlias(setAlias(emptyBook(), "Münster", "Münster Hbf"), "ev", DM), DM, 1), DM, 2),
  ],
];

for (const [bookName, book] of BOOKS) {
  for (const [text, location] of real) {
    test(`regresyon [${bookName}]: “${text}” → hızlı Hedef ekranı`, () => {
      const a = analyzeSpeech(text, NOW, book);
      assert.equal(a.navigation, true, "hızlı navigasyon açılmalı (Tarihsiz/Kaydet değil)");
      assert.equal(a.location, location);
      assert.equal(a.parsed.dueAt, null);
      assert.equal(a.parsed.locationKind, "address");
    });
  }
}

// iPhone'un teslim ettiği bozulmuş biçimler
const degraded: Array<[string, string]> = [
  ["Münster Straße 160 Münster Straße 160", STREET], // aynı ifade iki kez teslim edildi
  ["Münster Straße 160. Münster Straße 160.", STREET],
  ["münster straße 160 Münster Straße 160", STREET],
  ["Dortmund Münster Straße 160 Dortmund Münster Straße 160", DM],
  ["“Münster Straße 160”", STREET],
  ['"Münster Straße 160"', STREET],
  ["„Münster Straße 160“", STREET],
  ["(Münster Straße 160)", STREET],
  ["Münster Straße 160", STREET], // NBSP
  ["Münster Straße 160", STREET], // dar NBSP
  ["Münster​Straße 160", STREET], // sıfır genişlikli boşluk
  ["Münster Straße 160", STREET], // ayrışık ü (u + ¨)
  ["Münster Straße 160​", STREET],
  ["﻿Münster Straße 160", STREET],
  ["Münster Straße 1 60", STREET], // rakam ayrıldı
  ["Münster Straße Nr. 160", STREET],
  ["Münster Straße Nummer 160", STREET],
  ["Münster Straße 160 Nummer", STREET],
  ["Adresse Münster Straße 160", STREET],
  ["Münster Straße 160.", STREET],
  ["  Münster   Straße   160  ", STREET],
];
for (const [text, location] of degraded) {
  test(`regresyon (bozulmuş çıktı): ${JSON.stringify(text)}`, () => {
    const a = analyzeSpeech(text, NOW);
    assert.equal(a.navigation, true);
    assert.equal(a.location, location);
  });
}

test("transkript temizleme: tekrar, tırnak, görünmez karakter", () => {
  assert.equal(collapseRepeats("A B C A B C"), "A B C");
  assert.equal(collapseRepeats("Münster Straße 160 münster straße 160."), "Münster Straße 160");
  assert.equal(collapseRepeats("Münster Straße 160 Münster Straße 160 Münster Straße 160"), "Münster Straße 160");
  assert.equal(cleanTranscript("“Münster Straße 160”"), "Münster Straße 160");
  assert.equal(cleanTranscript("Münster Straße"), "Münster Straße");
  // yanlış birleştirme yok
  assert.equal(collapseRepeats("ara ara"), "ara ara"); // tek sözcük tekrarı dokunulmaz
  assert.equal(collapseRepeats("Münster Straße 160 Dortmund"), "Münster Straße 160 Dortmund");
  assert.equal(collapseRepeats("Süt al"), "Süt al");
  assert.equal(cleanTranscript("Pazartesi 14:30 dişçiyi ara"), "Pazartesi 14:30 dişçiyi ara");
});

// ---------- zaman ifadesi varsa normal hatırlatma akışı bozulmaz ----------

test("zaman ifadesi varsa hızlı Hedef ekranı açılmaz: normal hatırlatma", () => {
  const cases: Array<[string, number]> = [
    ["yarın saat 9'da Münster Straße 160", fromWall(new Date(Date.UTC(2026, 9, 11, 9, 0)))],
    ["bugün saat 17'de Münsterstraße 160", fromWall(new Date(Date.UTC(2026, 9, 10, 17, 0)))],
    ["Münsterstr. 160 yarın saat 8'de", fromWall(new Date(Date.UTC(2026, 9, 11, 8, 0)))],
    ["2 saat sonra Dortmund Münster Straße 160", fromWall(new Date(Date.UTC(2026, 9, 10, 14, 0)))],
    ["Münster Straße 160 yarın saat 8'de Münster Straße 160 yarın saat 8'de", fromWall(new Date(Date.UTC(2026, 9, 11, 8, 0)))], // iOS çift teslim + zaman
  ];
  for (const [text, dueAt] of cases) {
    const a = analyzeSpeech(text, NOW);
    assert.equal(a.navigation, false, text);
    assert.equal(a.parsed.dueAt, dueAt, text);
    assert.match(a.location ?? "", /Münsterstraße 160$/, text);
  }
});

test("hatırlat denirse adres bile olsa hatırlatma akışı", () => {
  const a = analyzeSpeech("Münster Straße 160 hatırlat", NOW);
  assert.equal(a.navigation, false);
  assert.equal(a.location, STREET);
});

test("sıradan hatırlatmalar etkilenmez (başlık, tarih, konum yok)", () => {
  for (const [text, title] of [
    ["Süt al", "Süt al"],
    ["Mehmet'i ara", "Mehmet'i ara"],
    ["Münster Straße", "Münster Straße"], // numarasız cadde adı adres sayılmaz
    ["160 Münster", "160 Münster"],
  ] as const) {
    const a = analyzeSpeech(text, NOW);
    assert.equal(a.navigation, false, text);
    assert.equal(a.location, null, text);
    assert.equal(a.title, title, text);
  }
  const t = parseReminder("Pazartesi 14:30 dişçiyi ara", NOW);
  assert.equal(t.title, "Dişçiyi ara");
  assert.equal(t.location, null);
});

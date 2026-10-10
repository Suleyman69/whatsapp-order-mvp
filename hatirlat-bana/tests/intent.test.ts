import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNavigationIntent } from "../src/lib/intent";
import { parseReminder } from "../src/lib/parse";
import { fromWall } from "../src/lib/tz";

const NOW = fromWall(new Date(Date.UTC(2026, 9, 10, 12, 0))); // 10.10.2026 12:00 Berlin

const nav: Array<[string, string]> = [
  ["Münsterstraße 160'a gidiyorum", "Münsterstraße 160"],
  ["Şimdi Bonn Rochusstraße 400'e gidiyorum", "Bonn, Rochusstraße 400"],
  ["Erdemli'ye gidiyorum", "Erdemli"],
  ["Köln Hbf'ye git", "Köln Hbf"],
  ["Navigasyonu Dortmund Flughafen'e aç", "Dortmund Flughafen"],
  ["Beni Bonn Hbf'ye götür", "Bonn Hbf"],
  ["Münsterstraße 160, beni buraya götür", "Münsterstraße 160"],
  ["Dortmund Münsterstraße 160'a şimdi gidiyorum", "Dortmund, Münsterstraße 160"],
  ["Essen Messe'ye yola çıkıyorum", "Essen Messe"],
  ["Hemen Dortmund Münsterstraße 160'a gidiyorum.", "Dortmund, Münsterstraße 160"],
  ["Rotayı Köln Hbf'ye aç", "Köln Hbf"],
];
for (const [text, location] of nav) {
  test(`navigasyon modu: ${text}`, () => {
    assert.deepEqual(detectNavigationIntent(text, NOW), { location });
  });
}

const reminders = [
  "Bugün saat 17'de Münsterstraße 160'a gideceğim",
  "bugün saat 17'de Münsterstraße 160'a gidiyorum", // zaman ifadesi → hatırlatma
  "Bugün Erdemli'ye gidiyorum",
  "Yarın saat 8'de Bonn Rochusstraße 400'de olacağım",
  "20 dakika sonra Bonn Hbf'ye git",
  "Erdemli'ye gideceğim", // gelecek niyet, şimdi değil
  "Erdemli'ye git diye hatırlat",
  "Her pazartesi Essen Messe'ye git",
  "Mehmet'i ara",
  "Süt al",
  "gidiyorum", // konum yok
  "Beni yarın sabah 7'de Essen Messe'ye gitmek için hatırlat",
];
for (const text of reminders) {
  test(`hatırlatma akışı: ${text}`, () => {
    assert.equal(detectNavigationIntent(text, NOW), null);
  });
}

test("zaman ifadeli konumlu cümle normal akışta aynı kalır", () => {
  const r = parseReminder("bugün saat 17'de Münsterstraße 160'a gideceğim", NOW);
  assert.equal(r.location, "Münsterstraße 160");
  assert.equal(r.dueAt, fromWall(new Date(Date.UTC(2026, 9, 10, 17, 0))));
});

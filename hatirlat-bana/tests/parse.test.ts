import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReminder } from "../src/lib/parse";
import { nextOccurrence } from "../src/lib/recurrence";

import { fromWall } from "../src/lib/tz";
import { describeWhen } from "../src/lib/format";

// Tüm zamanlar Europe/Berlin duvar saatidir; testler cihazın TZ'sinden bağımsız olmalı.
const dt = (y: number, mo: number, d: number, h: number, mi = 0) => fromWall(new Date(Date.UTC(y, mo - 1, d, h, mi)));
// Sabit "şimdi": 10 Ekim 2026 Cumartesi 12:00 Berlin
const NOW = dt(2026, 10, 10, 12);

const cases: Array<[string, string, number | null, string?]> = [
  ["Yarın saat 10'da Mehmet'i ara.", "Mehmet'i ara", dt(2026, 10, 11, 10)],
  ["Cuma öğleden sonra sigortacıyı ara", "Sigortacıyı ara", dt(2026, 10, 16, 14)],
  ["Her ayın 5'inde Hetzner ödemesini hatırlat", "Hetzner ödemesi", dt(2026, 11, 5, 9), "monthly"],
  ["Bu akşam eve giderken boya al", "Eve giderken boya al", dt(2026, 10, 10, 18)],
  ["Pazartesi 14:30 dişçiyi ara", "Dişçiyi ara", dt(2026, 10, 12, 14, 30)],
  ["Süt al", "Süt al", null],
  ["yarın sabah 8'de spor", "Spor", dt(2026, 10, 11, 8)],
  ["akşam 8'de annemi ara", "Annemi ara", dt(2026, 10, 10, 20)],
  ["saat 3'te toplantı", "Toplantı", dt(2026, 10, 10, 15)],
  ["20 dakika sonra fırını kapat", "Fırını kapat", dt(2026, 10, 10, 12, 20)],
  ["yarım saat sonra çayı demle", "Çayı demle", dt(2026, 10, 10, 12, 30)],
  ["15 Ekim'de kira öde", "Kira öde", dt(2026, 10, 15, 9)],
  ["15.11.2026 saat 09:15 vize randevusu", "Vize randevusu", dt(2026, 11, 15, 9, 15)],
  ["her gün saat 22'de ilaç iç", "İlaç iç", dt(2026, 10, 10, 22), "daily"],
  ["her pazartesi haftalık rapor gönder", "Haftalık rapor gönder", dt(2026, 10, 12, 9), "weekly"],
  ["haftaya cuma faturayı öde", "Faturayı öde", dt(2026, 10, 16, 9)],
  ["cumartesi 14.30 berber", "Berber", dt(2026, 10, 10, 14, 30)],
  ["öbür gün öğlen yemek rezervasyonu", "Yemek rezervasyonu", dt(2026, 10, 12, 12)],
  ["pazarlama toplantısı", "Pazarlama toplantısı", null],
  ["saat 10 buçukta kargo", "Kargo", dt(2026, 10, 11, 10, 30)],
  ["15.10 doğum günü hediyesi al", "Doğum günü hediyesi al", dt(2026, 10, 15, 9)],
  // Göreli tarihler → gerçek takvim tarihi
  ["bugün saat 17'de toplantı", "Toplantı", dt(2026, 10, 10, 17)],
  ["yarın saat 9'da spor", "Spor", dt(2026, 10, 11, 9)],
  ["öbür gün saat 14'te doktor", "Doktor", dt(2026, 10, 12, 14)],
  ["bu cuma saat 18'de pazar alışverişi", "Pazar alışverişi", dt(2026, 10, 16, 18)],
  ["gelecek pazartesi saat 8'de rapor", "Rapor", dt(2026, 10, 12, 8)],
  ["bu cumartesi saat 18'de misafir", "Misafir", dt(2026, 10, 10, 18)],
  ["bu cumartesi saat 10'da misafir", "Misafir", dt(2026, 10, 17, 10)],
  ["gelecek cuma kargo", "Kargo", dt(2026, 10, 16, 9)],
  ["3 gün sonra saat 11'de ara", "Ara", dt(2026, 10, 13, 11)],
];

for (const [input, title, dueAt, repeat = "none"] of cases) {
  test(input, () => {
    const r = parseReminder(input, NOW);
    assert.equal(r.title, title);
    assert.equal(r.dueAt, dueAt, `${r.dueAt && new Date(r.dueAt).toISOString()} != ${dueAt && new Date(dueAt).toISOString()}`);
    assert.equal(r.repeat, repeat);
  });
}

test("aylık tekrar ayın 31'ini kısa aylarda son güne taşır", () => {
  const jan31 = dt(2027, 1, 31, 9);
  assert.equal(nextOccurrence(jan31, "monthly"), dt(2027, 2, 28, 9));
  assert.equal(nextOccurrence(jan31, "monthly", dt(2027, 3, 1, 0)), dt(2027, 3, 31, 9));
});

test("günlük tekrar geçmişten bugüne atlar", () => {
  assert.equal(nextOccurrence(dt(2026, 10, 1, 9), "daily", NOW), dt(2026, 10, 11, 9));
});

test("Berlin takvimi: UTC'de hâlâ 10 Ekim, Berlin'de 11 Ekim 01:30 ise 'bugün' 11 Ekim'dir", () => {
  const late = Date.UTC(2026, 9, 10, 23, 30); // Berlin: 11.10.2026 01:30
  assert.equal(parseReminder("bugün saat 17'de toplantı", late).dueAt, dt(2026, 10, 11, 17));
  assert.equal(parseReminder("yarın saat 9'da spor", late).dueAt, dt(2026, 10, 12, 9));
});

test("yaz saati sonu (25 Ekim 2026): yarın 09:00 Berlin saatiyle 09:00 kalır", () => {
  const now = dt(2026, 10, 24, 12);
  const r = parseReminder("yarın saat 9'da spor", now);
  assert.equal(r.dueAt, dt(2026, 10, 25, 9));
  assert.equal(new Date(r.dueAt!).toISOString(), "2026-10-25T08:00:00.000Z"); // CET = UTC+1
  assert.equal(new Date(dt(2026, 10, 24, 9)).toISOString(), "2026-10-24T07:00:00.000Z"); // CEST = UTC+2
});

test("günlük tekrar yaz saati geçişinde duvar saatini korur", () => {
  assert.equal(nextOccurrence(dt(2026, 10, 24, 9), "daily"), dt(2026, 10, 25, 9));
});

test("onay ekranı metni", () => {
  assert.equal(describeWhen(dt(2026, 10, 10, 17), NOW), "Bugün, 10 Ekim Cumartesi, 17:00");
  assert.equal(describeWhen(dt(2026, 10, 11, 9), NOW), "Yarın, 11 Ekim Pazar, 09:00");
  assert.equal(describeWhen(dt(2026, 10, 12, 14), NOW), "Öbür gün, 12 Ekim Pazartesi, 14:00");
  assert.equal(describeWhen(dt(2026, 11, 5, 9), NOW), "5 Kasım Perşembe, 09:00");
});

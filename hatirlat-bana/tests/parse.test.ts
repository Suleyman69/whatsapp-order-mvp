import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReminder } from "../src/lib/parse";
import { nextOccurrence } from "../src/lib/recurrence";

// Sabit "şimdi": 10 Ekim 2026 Cumartesi 12:00 (yerel saat)
const NOW = new Date(2026, 9, 10, 12, 0).getTime();
const dt = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

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
];

for (const [input, title, dueAt, repeat = "none"] of cases) {
  test(input, () => {
    const r = parseReminder(input, NOW);
    assert.equal(r.title, title);
    assert.equal(r.dueAt === null ? null : new Date(r.dueAt).toString(), dueAt === null ? null : new Date(dueAt).toString());
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

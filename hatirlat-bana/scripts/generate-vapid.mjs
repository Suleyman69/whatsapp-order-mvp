// VAPID anahtarlarını üretir ve .env.local dosyasına yazar (varsa dokunmaz).
// Kullanım: npm run vapid
import fs from "node:fs";
import webpush from "web-push";

const file = ".env.local";
if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("VAPID_PRIVATE_KEY")) {
  console.log(`${file} içinde VAPID anahtarları zaten var. Değiştirirsen tüm cihazlar yeniden izin vermeli.`);
  process.exit(0);
}
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const lines = [
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  `VAPID_SUBJECT=mailto:sen@ornek.com`,
  `APP_TIMEZONE=Europe/Istanbul`,
  "",
].join("\n");
fs.appendFileSync(file, lines);
console.log(`${file} oluşturuldu. VAPID_SUBJECT değerini kendi e-postanla değiştir.`);

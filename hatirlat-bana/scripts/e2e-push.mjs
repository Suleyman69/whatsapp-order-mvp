// Uçtan uca push testi: sahte bir push servisi kurar, cihaz aboneliği oluşturur,
// zamanı yakın hatırlatmalar senkronize eder ve sunucunun gönderdiği şifreli
// mesajları çözer. web-push yalnızca HTTPS konuştuğu için sahte servis kendinden imzalı
// sertifika kullanır; Next sunucusu bu sertifikaya güvenecek şekilde başlatılmalı:
//   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 \
//     -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"
//   NODE_EXTRA_CA_CERTS=cert.pem npm start
//   node scripts/e2e-push.mjs http://localhost:3000 key.pem cert.pem
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import ece from "http_ece";

const BASE = process.argv[2] || "http://localhost:3000";
const PORT = 4555;
const received = [];

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const auth = crypto.randomBytes(16);
const b64 = (b) => b.toString("base64url");

const server = https.createServer({ key: fs.readFileSync(process.argv[3]), cert: fs.readFileSync(process.argv[4]) }, (req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (req.url.includes("gone")) {
      res.writeHead(410).end();
      received.push({ gone: true });
      return;
    }
    const plain = ece.decrypt(body, { version: "aes128gcm", privateKey: ecdh, authSecret: b64(auth) });
    received.push({ headers: req.headers, payload: JSON.parse(plain.toString()), at: Date.now() });
    res.writeHead(201).end();
  });
});
await new Promise((r) => server.listen(PORT, r));

const deviceId = crypto.randomUUID();
const api = (path, method, body) =>
  fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
    async (r) => ({ status: r.status, json: await r.json() }),
  );
const sub = (endpoint) => ({ endpoint, keys: { p256dh: b64(ecdh.getPublicKey()), auth: b64(auth) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};

check((await api("/api/push/subscribe", "POST", { deviceId, subscription: sub(`https://localhost:${PORT}/push/${deviceId}`) })).status === 200, "abonelik kaydedildi");

const test = await api("/api/push/test", "POST", { deviceId });
await sleep(300);
check(test.status === 200 && received[0]?.payload.body === "Bildirimler çalışıyor ✓", "deneme bildirimi anında geldi");

const due = Date.now() + 3000;
const reminders = [
  { id: "r-once", title: "Mehmet'i ara", dueAt: due, repeat: "none" },
  { id: "r-daily", title: "İlaç iç", dueAt: due, repeat: "daily" },
  { id: "r-later", title: "Gelecek hafta", dueAt: Date.now() + 7 * 864e5, repeat: "none" },
];
check((await api("/api/reminders/sync", "PUT", { deviceId, reminders })).json.count === 3, "3 hatırlatma senkronize edildi");

console.log("… zamanlayıcı bekleniyor (≤ 25 sn)");
for (let i = 0; i < 50 && received.length < 3; i++) await sleep(500);
const pushes = received.slice(1);
check(pushes.length === 2, `zamanı gelen 2 bildirim geldi (gelen: ${pushes.length})`);
check(pushes.every((p) => p.at >= due), "hiçbiri zamanından önce gelmedi");
check(pushes.some((p) => p.payload.body === "Mehmet'i ara" && p.payload.id === "r-once"), "payload: başlık + id doğru");
check(pushes.every((p) => /^vapid t=/.test(p.headers.authorization) && p.headers.urgency === "high" && p.headers.ttl === "3600"), "VAPID imzası, Urgency=high, TTL başlıkları var");

// İstemci eski dueAt ile tekrar senkronize ederse aynı bildirim yeniden gönderilmemeli
await api("/api/reminders/sync", "PUT", { deviceId, reminders });
await sleep(22000);
check(received.length === 3, "aynı zaman için tekrar gönderim yok");

// 410 Gone → cihaz silinir
const goneId = crypto.randomUUID();
await api("/api/push/subscribe", "POST", { deviceId: goneId, subscription: sub(`https://localhost:${PORT}/gone`) });
const goneTest = await api("/api/push/test", "POST", { deviceId: goneId });
check(goneTest.status === 410, "süresi dolmuş abonelik (410) temizlendi");

// Geçersiz istekler
check((await api("/api/reminders/sync", "PUT", { deviceId: "x", reminders: [] })).status === 400, "geçersiz deviceId reddedildi");

server.close();
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm push testleri geçti");
process.exit(failures ? 1 : 0);

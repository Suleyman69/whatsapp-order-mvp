# Hatırlat Bana

Sesle hızlı hatırlatma ekleyen, mobil öncelikli PWA. Next.js 16 + TypeScript + Tailwind 4.

## Mimari (neden küçük bir backend var?)

iOS'ta (ve genel olarak web'de) kapalı bir PWA ileri bir zaman için **yerel** bildirim
planlayamaz — Notification Triggers API yok. Uygulama kapalıyken bildirim gelmesinin tek
güvenilir yolu **Web Push**: sunucu, zamanı gelince Apple/Google push servisine mesaj gönderir.

```
iPhone (PWA)                                   Sunucu (aynı Next.js uygulaması)
├─ IndexedDB: tüm hatırlatmalar (asıl veri)    ├─ /api/push/subscribe   abonelik kaydı
├─ Service Worker (public/sw.js)               ├─ /api/reminders/sync   aktif hatırlatmaların tam listesi
│   push → bildirim göster                     ├─ zamanlayıcı (20 sn)   zamanı gelene Web Push gönder,
│   bildirim aksiyonları → IndexedDB + sync    │                        tekrarlıları ileri al
└─ her değişiklikte → PUT /api/reminders/sync  └─ .data/push-store.json (abonelik + zamanlama)
```

- Hatırlatmalar cihazda IndexedDB'de durur. Sunucu sadece push için gerekeni (id, başlık, zaman, tekrar) tutar.
- Zamanlayıcı `src/instrumentation.ts` ile `next start` sürecinin içinde çalışır → **tek, sürekli açık bir sunucu** (VPS / Hetzner, Docker vb.) gerekir.
- Serverless (Vercel vb.) kullanılacaksa: `DISABLE_INTERNAL_SCHEDULER=1` + dakikada bir `GET /api/cron` (Authorization: `Bearer $CRON_SECRET`) + JSON dosyası yerine bir veritabanı.

## Çalıştırma

```bash
cd hatirlat-bana
npm install
npm run vapid        # VAPID anahtarlarını .env.local'e yazar (bir kez)
npm run dev          # http://localhost:3000
# veya üretim:
npm run build && npm start
```

`.env.local` içinde `VAPID_SUBJECT=mailto:...` değerini kendi e-postanla değiştir. Diğer ayarlar `.env.example`'da.

Testler:

```bash
npm test             # Türkçe tarih/saat çözümleyici + tekrar hesabı
# Uçtan uca push testi (sahte push servisi ile) — talimat scripts/e2e-push.mjs başında
```

## iPhone'a kurulum

Web Push iOS'ta **yalnızca HTTPS** ve **ana ekrana eklenmiş** uygulamada çalışır (iOS 16.4+).

1. Uygulamayı HTTPS ile yayınla: bir VPS'te `npm start` + önünde Caddy/Nginx (Let's Encrypt).
   Hızlı deneme için: `npx cloudflared tunnel --url http://localhost:3000` → verilen `https://…trycloudflare.com` adresi.
   (Tünel adresi her seferinde değişir; adres değişirse uygulamayı yeniden eklemek gerekir.)
2. iPhone'da **Safari** ile adresi aç (Chrome değil).
3. **Paylaş** (kare + yukarı ok) → **Ana Ekrana Ekle** → **Ekle**.
4. Ana ekrandaki **Hatırlat Bana** ikonundan aç.
5. Üstteki kartta **Bildirimlere izin ver** → **İzin Ver**.
6. Mikrofon ilk kullanımda mikrofon/konuşma tanıma izni ister.

## Bildirimleri test etme

1. İzin verdikten sonra listenin altındaki **Deneme bildirimi gönder** → anında bildirim gelmeli.
2. “**2 dakika sonra test**” yaz/söyle → Kaydet → uygulamayı tamamen kapat (app switcher'dan yukarı kaydır), telefonu kilitle.
   ~2 dk sonra (zamanlayıcı 20 sn'de bir çalışır) bildirim gelmeli.
3. Bildirime dokun → uygulama o hatırlatmanın panelini açar: Tamamlandı / 1 saat sonra / Yarın hatırlat / Düzenle.
4. Android Chrome / masaüstünde bildirimin üzerinde doğrudan aksiyon butonları da görünür.

## Söyleyebileceklerin

| Söylenen | Sonuç |
|---|---|
| Yarın saat 10'da Mehmet'i ara | Mehmet'i ara · yarın 10:00 |
| Cuma öğleden sonra sigortacıyı ara | Sigortacıyı ara · Cuma 14:00 |
| Her ayın 5'inde Hetzner ödemesini hatırlat | Hetzner ödemesi · ayın 5'i 09:00 · her ay |
| Bu akşam eve giderken boya al | Eve giderken boya al · bugün 18:00 |
| Pazartesi 14:30 dişçiyi ara | Dişçiyi ara · Pazartesi 14:30 |
| 20 dakika sonra fırını kapat | Fırını kapat · 20 dk sonra |
| Her gün saat 22'de ilaç iç | İlaç iç · 22:00 · her gün |

Tüm tarih hesapları cihazın değil **Europe/Berlin** takvimine göre yapılır (`src/lib/tz.ts`); “bugün / yarın / öbür gün / bu cuma / gelecek pazartesi” Berlin’deki gerçek tarihe çevrilir ve onay ekranında “Yarın, 11 Ekim Pazar, 09:00” gibi gösterilir. Saat dilimini değiştirmek için `APP_TZ` sabitini düzenle.

Varsayılanlar: saat söylenmezse 09:00; sabah 09, öğlen 12, öğleden sonra 14, akşam 18, gece 22.
“Saat 3” gibi 1–6 arası saatler öğleden sonra kabul edilir. Tarih/saat yoksa “Tarihsiz” listesine gider.

## Konum ve navigasyon

“Yarın saat 8'de Bonn Rochusstraße 400'de olacağım”, “Bugün Erdemli'ye gideceğim”, “Saat 17'de Köln Hbf'de olmam lazım” gibi cümlelerdeki hedef (“git / ol / var” fiiliyle birlikte yer-hal ekli öbek) otomatik ayrılır (`src/lib/location.ts`).
Konum onay ekranında, düzenleme formunda (elle değiştirilebilir) ve bildirimden açılan detay panelinde görünür; konum varsa **Navigasyonu aç** butonu çıkar, yoksa hiç görünmez.
Buton API anahtarı gerektirmeyen standart bir Google Maps rota bağlantısıdır (`https://www.google.com/maps/dir/?api=1&destination=…`, `src/lib/nav.ts`): Google Maps kuruluysa uygulamada, değilse tarayıcıda açılır.
Konum alanı IndexedDB'de isteğe bağlı bir alandır; eski kayıtlar olduğu gibi çalışır.

## Dosyalar

- `src/components/App.tsx` — ana ekran, listeler, mikrofon, izin akışı
- `src/components/sheets.tsx` — yazılı giriş, onay, düzenleme, bildirim detay panelleri
- `src/components/useSpeech.ts` — tarayıcı konuşma tanıma (tr-TR)
- `src/lib/parse.ts` — Türkçe doğal dil çözümleyici
- `src/lib/db.ts` — IndexedDB · `src/lib/push-client.ts` — izin, abonelik, senkron
- `src/lib/recurrence.ts`, `src/lib/actions.ts` — tekrar ve erteleme mantığı
- `src/lib/server/*` — depo, push gönderimi, zamanlayıcı · `src/app/api/*` — uç noktalar
- `public/sw.js` — Service Worker · `src/app/manifest.ts` — PWA manifest

## Bilinen sınırlamalar

- **iOS bildirim aksiyon butonlarını göstermez**; bildirime dokununca uygulama ilgili hatırlatmayı açar.
- **iOS'ta ana ekrana eklenmeden** push yok; Safari sekmesinde hatırlatmalar sadece uygulama açıkken gösterilir.
- **Ses tanıma**: iOS Safari'de çalışır ama ana ekran (standalone) modunda iOS sürümüne göre kısıtlı/kararsız olabilir; çalışmazsa anlaşılır mesaj gösterilir, kalemle yazılabilir. Ses tanıma Apple/Google sunucularında yapılır, internet gerekir.
- **Kimlik doğrulama yok**: cihaz rastgele bir UUID ile tanınır. Kişisel kullanım için yeterli; açık internette çok kullanıcılı kullanımdan önce basit bir koruma eklenmeli.
- Veri cihazdadır: uygulamayı ana ekrandan silmek hatırlatmaları da siler. Cihazlar arası senkron yok.
- Sunucu 12 saatten uzun kapalı kalırsa kaçırılan bildirimler gönderilmez (uygulamada gecikmiş olarak görünür).
- JSON dosya deposu tek sunucu içindir.

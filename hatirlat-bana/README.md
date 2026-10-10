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
Şehir + cadde + bina numarası bir arada söylenirse konum “Şehir, Cadde No” olarak ayrılır ve görev kısa olur: “Dortmund Münsterstraße 160'a gideceğim bugün saat 17'de” → Görev **Dortmund'a git**, Konum **Dortmund, Münsterstraße 160**. “Münster Straße”, “160a / 160 a” (konuşma tanımanın kesme işaretsiz yazımı), “Münsterstraße 160 Dortmund'a” ve virgüllü yazımlar da tanınır; şehre doğru hal eki ünlü uyumuyla eklenir (Dortmund'a, Köln'e, Köln'de). Yalnızca cadde varsa görev adresi korur.
**Şehir adı normalizasyonu** (`src/lib/cities.ts`, testler `tests/cities.test.ts`): adres ya da navigasyon bağlamındaki şehir adı, Almanya'daki ~150 yaygın şehirle karşılaştırılır; tek bir benzerlik eşiği yerine yapılandırılmış kanıt kullanılır.
- **Tam eşleşme** (katlanmış): umlaut ve büyük harf düzelir — `koln → Köln`, `dusseldorf → Düsseldorf`, `munster → Münster`, `aachen → Aachen`; asla bulanık aranmaz (Hamburg/Homburg ayrı şehirlerdir).
- **Yüksek güven → doğrudan normalize**: `ahen → Aachen`, `frankfort → Frankfurt`, `hamburk → Hamburg`, `bohum → Bochum`… Kanıt: Jaro-Winkler + Levenshtein + Kölner Phonetik, aynı ilk harf sınıfı (Merlin ≠ Berlin), uzunluk uyumu, silinti kanıtı (“ahen” “aachen”in alt dizisi), benzersizlik payı (Herne/Herten ikilisinde dokunulmaz). Adres bağlamı küçük bir güven bonusu verir.
- **Orta güven** (`aken`, `noyss`) → “Aachen mu demek istedin?” önerisi; otomatik değişmez.
- **Düşük güven / korumalar**: yaygın kişi adları (Hakan, Merlin, Berna, Ahmet…), tam eşleşen Türk şehirleri (Mersin, Erdemli…) ve genel sözcükler (Sinema, Market, Flughafen…) asla Alman şehrine çevrilmez; yaygın bir kişi adı artık tek başına güvenilir hedef sayılmaz (“Mehmet'e git” hızlı navigasyon açmaz).
- Eşikler `CITY_THRESHOLDS` içindedir ve testlerle kilitlidir.

**Gerçek iPhone transkript bozulmaları** (`src/lib/transcript.ts`, regresyon: `tests/regression.test.ts`): çözümlemeden önce transkript temizlenir — aynı ifadenin iki kez teslim edilmesi (“Münster Straße 160 Münster Straße 160”), tırnak/parantez içinde gelmesi, görünmez karakterler/NBSP, ayrışık ü, ayrılmış bina numarası (“1 60”) ve sondaki “Nummer/Adresse” tolere edilir. Zaman ifadesi olmayan geçerli tek başına adres (“Münster Straße 160”, “Münsterstr. 160”, şehirli varyasyonlar) her zaman hızlı **Hedef** ekranını açar. Ana ekranın altındaki “sürüm abc1234” yazısı telefonda hangi sürümün çalıştığını gösterir (Vercel'de commit SHA); eski sürüm/önbellek şüphesinde ilk bakılacak yer.

**Bulanık / sesbilgisel adres düzeltme** (`src/lib/fuzzy.ts`, `resolve.ts`, `addressbook.ts`; testler `tests/resolve.test.ts`): cadde adı `str/straße/strasse` normalleştirildikten sonra adres defteri ve yerleşik cadde listesiyle karşılaştırılır. Benzerlik = Jaro-Winkler + Levenshtein + Kölner Phonetik (“Manchester” ≈ “Münster”). Şehir + cadde + numara birlikte puanlanır (`0.6·ad + şehir 0.15 + numara 0.15 + ağırlık 0.15`); kayıtlı/sık kullanılan adresler yüksek, yerleşik liste düşük ağırlık alır.
- **Yüksek güven** (≥ 0.90, ad ≥ 0.80, kullanıcının kendi verisi destekliyor) → doğrudan düzeltilir. Yerleşik liste tek başına asla otomatik düzeltme yapmaz.
- **Orta güven** (≥ 0.69) → “Dortmund, Münsterstraße 160 mu demek istedin?” [Evet/Hayır]; otomatik değişmez.
- **Düşük güven**, farklı açık şehir, farklı cadde türü (“…allee” ≠ “…straße”), iki yakın aday (belirsizlik) → dokunulmaz.
- Öğrenme: Evet dediğin ya da elle düzelttiğin yanlış duyma (aynı numara + benzer cadde adı) kaydedilir ve aynı yazım bir dahaki sefere otomatik düzelir; kullanılan adresler “sık kullanılan” olarak ağırlık kazanır.
- **Adreslerim** (ana ekranın altında): “ev”, “iş”, “Hbf”, “Flughafen”, “Münster” gibi kısa adları tam adrese bağlar; “Eve gidiyorum”, “Hbf'ye git” bu adrese gider. Veri yalnızca cihazdaki IndexedDB'dedir (`meta/addressBook`).
- **Hızlı navigasyon yalnızca güvenilir hedefte**: cadde+numara, kesme işaretli özel ad (“Erdemli'ye”), kısa ad ya da bilinen şehir. “Sinemaya gidiyorum”, tek başına “Hbf'ye git”, “Flughafen'e gidiyorum” (kısa ad tanımlı değilse) ve “kapıyı aç” hatırlatma akışında kalır, konum eklenmez.

**Safari Türkçe tanıyıcı Alman adlarını yanlış yazarsa** (“Münsterstrasse 160” → “Manchester Straße 160”): (1) tek başına söylenen adres (fiil olmadan) artık adres sayılır ve hızlı navigasyon ekranı açılır; (2) bilinen yanlış duymalar ve umlaut düşmeleri düzeltilir (“Manchester/Monster Straße” → “Münsterstraße”, “Munster/Koln” → “Münster/Köln”; sözlük `GERMAN_NAMES`/`MISHEARD_STREET`, `src/lib/location.ts`); (3) ana ekrandaki **DE** mikrofonu adresi **Almanca (de-DE)** dinler, Almanca tanıyıcı Alman cadde/şehir adlarını doğru yazar; (4) hızlı navigasyon ekranındaki **Hedef** alanı ve düzenleme formundaki **Konum** alanı elle düzeltilebilir ve yanlarında aynı DE mikrofonu vardır. Almanca dikteden önce gelen “Navigation zu / nach …” kalıpları atılır.

**iPhone Web Speech toleransı** (`src/lib/location.ts`, `tests/address.test.ts`): cadde eki `str`, `str.`, `strasse`, `straße`, `strase` hepsi `straße` olur; ayrı yazılmış “Münster Straße / Str.” birleştirilir; bina numarası `160'a`, `160’a`, `160a`, `160 a`, `160`, `160-162`, `Nr. 160` biçimlerinde okunur; büyük/küçük harf düzeltilir (`DORTMUND MÜNSTERSTRASSE` → “Dortmund, Münsterstraße 160”); ç/ş/ğ/ı/ö/ü düşmesi (“yola cikiyorum”, “navigasyonu ac”) ve konuşma dili (“gidiyom”, “gidiyoz”) kabul edilir. Cadde adındaki umlaut düşmüşse (“Munsterstrasse”) geri getirilmez. “Münsterstraße 160 için navigasyonu aç” gibi hedefin fiilden önce geldiği kalıplar da tanınır.
Konum onay ekranında, düzenleme formunda (elle değiştirilebilir) ve bildirimden açılan detay panelinde görünür; konum varsa **Navigasyonu aç** butonu çıkar, yoksa hiç görünmez.
Buton API anahtarı gerektirmeyen standart bir Google Maps rota bağlantısıdır (`https://www.google.com/maps/dir/?api=1&destination=…`, `src/lib/nav.ts`): Google Maps kuruluysa uygulamada, değilse tarayıcıda açılır.
Konum alanı IndexedDB'de isteğe bağlı bir alandır; eski kayıtlar olduğu gibi çalışır.

## Hemen yola çık (hızlı navigasyon modu)

Zaman ifadesi olmayan, konumlu ve şimdiki eylem bildiren cümleler hatırlatma onayına gitmez; doğrudan hızlı aksiyon ekranı açılır (`src/lib/intent.ts`):
“Münsterstraße 160'a gidiyorum”, “Şimdi Bonn Rochusstraße 400'e gidiyorum”, “Erdemli'ye gidiyorum”, “Köln Hbf'ye git”, “Navigasyonu Dortmund Flughafen'e aç”, “Beni Bonn Hbf'ye götür”, “Münsterstraße 160, beni buraya götür”.
Ekranda hedef ve üç ayrı aksiyon vardır: **Navigasyonu aç** (Google Maps), **Blitzer.de'yi aç** (iOS, Yola Çık kestirmesi) ve **Hatırlatma olarak kaydet** (normal onay ekranına geçer). iOS iki uygulamayı art arda otomatik açmaya izin vermediği için iki buton ayrıdır.

Kural: tarih/saat/tekrar ifadesi varsa her zaman normal hatırlatma (“bugün saat 17'de Münsterstraße 160'a gideceğim”, “Bugün Erdemli'ye gidiyorum”, “20 dakika sonra Bonn Hbf'ye git”); “gideceğim” gibi gelecek niyet ve “…git diye hatırlat” de hatırlatmadır.

## Blitzer.de PRO

Konumu olan bir hatırlatmanın detayında (bildirime dokununca açılan panel ve kayıtlı hatırlatmayı düzenleme ekranı), **iPhone/iPad'de**, Google Maps butonunun altında ayrı bir **Blitzer.de'yi aç** butonu çıkar (`src/lib/blitzer.ts`). İki buton birbirinden bağımsız iki ayrı bağlantıdır; biri diğerini tetiklemez ve zincir kurulmaz.

Blitzer.de PRO için belgelenmiş bir URL şeması / universal link bulunamadı (uygulama Siri Kestirmeleri ve CarPlay sunuyor). Uydurma bir `blitzer://` adresi iOS'ta hata penceresi çıkaracağı için buton Apple'ın belgelenmiş `shortcuts://run-shortcut?name=…` bağlantısıyla Kestirmeler'deki **Yola Çık** kestirmesini çalıştırır.

Kurulum (bir kez, iPhone'da):
1. **Kestirmeler** uygulaması → **+** → eylem ekle: **Uygulamayı Aç** → **Blitzer.de PRO** seç.
2. Kestirmeyi **Yola Çık** olarak adlandır (başka ad için build sırasında `NEXT_PUBLIC_BLITZER_SHORTCUT=Ad` ver).
3. Hatırlatma detayında **Blitzer.de'yi aç**'a dokun; iOS “Kestirmeler'de açılsın mı?” diye sorabilir.

Blitzer.de ileride gerçek bir uygulama bağlantısı yayınlarsa `NEXT_PUBLIC_BLITZER_URL=blitzer://…` tanımlamak yeterlidir; tanımlıysa kestirme yerine o kullanılır (yalnızca `uygulama://` biçimli, `javascript:`/`data:` olmayan adresler kabul edilir).

Önerilen sıra: önce **Blitzer.de'yi aç**, sonra Hatırlat Bana'ya dönüp **Navigasyonu aç** (Blitzer arka planda uyarılara devam eder). iOS aynı anda iki uygulamayı öne getiremez; bu yüzden ikisi tek dokunuşta zincirlenmedi. Araca binince otomatik başlatmak için Kestirmeler'de CarPlay/Bluetooth bağlanınca bu kestirmeyi çalıştıran bir **Otomasyon** kurulabilir (iPhone kilitliyken güvenilir çalışmayabilir).

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

# Android FCM API sözleşmesi — Aşama 1

Durum: Aşama 1 API, 12 Kasım 2026 tarihinde canlıya alındı. Commit/push yapılmadı. Bu belge Android istemcisinin uygulanacağı kesin sözleşmedir. Paket `tr.com.navortal`, origin `https://www.navortal.com.tr`, bildirim kanalı `reminders-v1`.

## 1. Kapsam ve kimlik doğrulama

Bu aşama cihaz kaydı, mobil tercihler, HTTP v1 FCM gönderimi, gösterim kontrolü ve teslim makbuzlarını içerir. PKCE/grants/exchange/refresh, yeni Bearer yetkisi, sayaç senkronizasyonu ve hesap silme yoktur. Mobile ve UI kaynakları değiştirilmemiştir.

Native istemci oturum çerezini WebView CookieManager deposundan alır ve yalnız sabit HTTPS origin'ine gönderir:

```http
Cookie: __Host-adhd_session=<WEBVIEW_SESSION_COOKIE>
Accept: application/json
```

Yazma istekleri ayrıca şu başlıkları taşır:

```http
Content-Type: application/json
X-ADHD-CSRF: 1
Origin: https://www.navortal.com.tr
```

`X-ADHD-CSRF` değeri sabit `1`'dir; config'ten veya çerezden alınmaz. Origin yoksa aynı host'a ait mutlak Referer kabul edilir. GET için CSRF/Origin zorunlu değildir. Authorization/Bearer göndermeyin: geçerli Bearer bile mobil uçlarda oturum çerezinin yerine kabul edilmez. Production cookie adı yukarıdaki gibidir; Development/Testing ortamlarında `adhd_session` kullanılır. Mevcut HttpOnly/Secure/SameSite=Strict davranışı değişmez.

Çerez/FCM tokenı/Authorization değerlerini konsola, analitiğe, hata raporuna veya HTTP body/header loguna koymayın. Yönlendirme ile başka host'a kimlik bilgisi taşımayın. WebView oturumu değişince eski native hesap bağını derhal bırakın. `/api/auth/me` yenilenmiş Set-Cookie döndürürse native ve WebView cookie depolarını aynı oturumda tutmak Android'in sorumluluğudur.

API her mobil çağrıda `sid` oturumunun iptal edilmediğini veritabanından ayrıca kontrol eder. Genel JWT oturum önbelleğinin iptal gecikmesine dayanmaz.

## 2. Uç noktalar

Tüm yollar yukarıdaki origin'e göredir. Tüm başarılı JSON yanıtları camelCase'tir. UUID alanları string, zamanlar UTC RFC3339, sürümler/sıralar JSON Int64 sayıdır. Native taraf bunları `long` ile tutmalıdır.

| Yöntem | Yol | Gövde / sorgu | Başarı |
|---|---|---|---|
| GET | `/api/mobile/push/devices/{installationId}` | Yok | 200 `MobilePushDeviceView` |
| PUT | `/api/mobile/push/devices/{installationId}` | `RegisterMobilePushDevice`; Idempotency-Key zorunlu | 200 `MobilePushDeviceView` |
| DELETE | `/api/mobile/push/devices/{installationId}` | `RemoveMobilePushDevice`; Idempotency-Key zorunlu | 204; gövde yok |
| GET | `/api/mobile/push/preferences` | Yok | 200 `MobilePushPreferencesView` |
| PUT | `/api/mobile/push/preferences` | `UpdateMobilePushPreferences`; Idempotency-Key zorunlu | 200 `MobilePushPreferencesView` |
| GET | `/api/mobile/push/deliveries/{deliveryId}` | `installationId` UUID, `bindingVersion` pozitif Int64 sorgu parametreleri | 200 `MobilePushDisplayView` |
| POST | `/api/mobile/push/deliveries/{deliveryId}/receipts` | `MobilePushReceipt`; Idempotency-Key gerekmez | 204; gövde yok |

### RegisterMobilePushDevice

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "fcmToken": "<FCM_REGISTRATION_TOKEN>",
  "bindingVersion": 0,
  "clientSequence": 1,
  "platform": "android",
  "packageName": "tr.com.navortal",
  "appVersion": "1.0.0",
  "buildNumber": 1,
  "osVersion": "12",
  "permission": "granted",
  "remindersChannelEnabled": true
}
```

- `expectedUserId`, `fcmToken`, `bindingVersion`, `clientSequence`, `appVersion`, `buildNumber` zorunludur. Eksik zorunlu alan 400'dür.
- `expectedUserId`, `/api/auth/me` ile doğrulanmış hesaptır; oturum sahibinden farklıysa 404.
- `installationId`: uygulama kurulumu/Android profili başına üretilen kalıcı, sıfır olmayan rastgele UUID. Donanım kimliği değildir. Hesap değişince sıfırlanmaz.
- İlk kayıt `bindingVersion=0`; diğer yazmalar son yanıtın değerini kullanır. Hesap, oturum veya token değişiminde; pasif kaydın yeniden açılmasında sunucu artırır. Android dönen değeri atomik saklamalıdır.
- `clientSequence`: kurulum başına kalıcı, kesin artan pozitif Int64. Kayıt, token/izin güncelleme ve silmede artırılır; hesap değişince sıfırlanmaz. Aynı sıra/aynı kayıt içeriği mevcut sonucu döndürebilir; farklı/gecikmiş sıra 409'dur.
- `fcmToken`: 1–4096 karakter; boşluk/kontrol karakteri yok. Yanıtlara konmaz. Şifreli saklanır, benzersizlik hash ile denetlenir.
- `platform` yalnız `android`, `packageName` yalnız `tr.com.navortal`; eksikler bu varsayılanları kullanır.
- `appVersion` 1–32 karakter; `buildNumber` pozitif Int64; `osVersion` 0–64 karakter, varsayılan boş string.
- `permission`: `granted`, `denied`, `notDetermined`; eksikse `notDetermined`. `remindersChannelEnabled` eksikse false. Uygulama izni VE reminders-v1 kanalı açık olmadıkça gönderim yapılmaz.
- Kullanıcı başına en fazla 20 aktif kayıt. Her kurulumda tek güncel kullanıcı/oturum/token bağı vardır; aynı token iki kurulumda tutulamaz.

### MobilePushDeviceView

```json
{
  "installationId": "22222222-2222-4222-8222-222222222222",
  "userId": "11111111-1111-4111-8111-111111111111",
  "bindingVersion": 1,
  "clientSequence": 1,
  "version": 1,
  "active": true,
  "permission": "granted",
  "remindersChannelEnabled": true,
  "platform": "android",
  "packageName": "tr.com.navortal",
  "appVersion": "1.0.0",
  "buildNumber": 1,
  "osVersion": "12",
  "lastSeenAt": "2026-11-12T10:00:00Z",
  "fcmAvailable": true
}
```

`version` sunucu kayıt sürümüdür; cihaz yazmasında esas koruma `bindingVersion` + `clientSequence`'dir. `active` cihaz kaydının izin/kanal durumudur; mobil tercih, canlı oturum ve FCM uygunluğu ayrıca değerlendirilir. `fcmAvailable`, transport etkinliği ve dosya mevcudiyetini gösterir; hizmet hesabının Google'da geçerli veya IAM/ağın çalışır olduğunu kanıtlamaz.

### RemoveMobilePushDevice

```json
{"expectedUserId":"11111111-1111-4111-8111-111111111111","bindingVersion":1,"clientSequence":2}
```

Üç alan da zorunludur. Token temizlenir, kayıt pasif olur. Aynı bağa aynı anahtar/içerikle tekrar 204'tür. Yeni hesabın/oturumun bağı eski silme isteğiyle kapatılamaz. Çıkıştan önce bu çağrı yapılabilir; normal logout/logout-all da ilgili mobil kayıtları sunucuda kapatır ve tokenlarını temizler. Web Push abonelikleri bu işlemle değiştirilmez.

Hesap değişiminde eski bağı silin veya logout yapın. Aynı kurulum, aynı güncel token ile yeni hesaba atomik bağlanabilir; farklı tokenla başka hesaba ait hâlâ bağlı bir kurulum devralınamaz (`fcm_token_owned`). Eski teslimlerin kullanıcı/binding bilgisi yeniden yazılmaz. Eski hesaba ait idempotency replay'i yeni bağı geri alamaz.

### Mobil tercihler

`MobilePushPreferencesView`:

```json
{"enabled":true,"version":0,"fcmAvailable":true}
```

Satır yokken mobil varsayılan açık ve version 0'dır. PUT gövdesindeki üç alan zorunlu:

```json
{"expectedUserId":"11111111-1111-4111-8111-111111111111","version":0,"enabled":false}
```

Yanıt aynı şemada artırılmış version içerir. Mobil tercihi kapatmak mevcut Web Push `pushEnabled` tercihini değiştirmez. Ortak bildirim anahtarı, olay tercihleri ve sessiz saatler her iki kanal için geçerlidir.

### Gösterim kontrolü

```http
GET /api/mobile/push/deliveries/<DELIVERY_ID>?installationId=<INSTALLATION_ID>&bindingVersion=1
```

`MobilePushDisplayView`:

```json
{
  "deliveryId":"33333333-3333-4333-8333-333333333333",
  "notificationId":"44444444-4444-4444-8444-444444444444",
  "snoozeCount":0,
  "displayAllowed":true,
  "reason":"ready",
  "serverNow":"2026-11-12T10:00:00Z",
  "expiresAt":"2026-11-12T10:02:00Z",
  "silent":false
}
```

200/false nedenleri: `device_inactive`, `session_revoked`, `mobile_disabled`, `read`, `snoozed`, `obsolete`, `disabled`, `expired`, `not_due`, `quiet_hours`, `not_sent`. Çıkış nedeniyle cookie geçersizse 200/false yerine 401; yabancı kullanıcı/kurulum/teslim eşleşmesi 404 olabilir. `reason` metnini UI cümlesi gibi parse etmeyin; karar `displayAllowed` üzerindendir.

Android gösterimden hemen önce bu çağrıyı yapar. Ağ/kimlik doğrulama hatası veya false durumunda göstermez. İzin ve binding'i yerelde tekrar kontrol eder; ardından kullanıcı/bildirim/snoozeCount için kalıcı atomik yerel dedupe uygular. `silent=true` ise ortak/odak ses tercihi gereği yerel bildirim sessiz olmalıdır; Android kanal ayarları ayrıca geçerlidir. API kontrolü ile gerçek gösterim arasındaki okunma yarışı tamamen ortadan kalkmaz.

### Makbuz

```json
{
  "expectedUserId":"11111111-1111-4111-8111-111111111111",
  "installationId":"22222222-2222-4222-8222-222222222222",
  "bindingVersion":1,
  "snoozeCount":0,
  "stage":"Displayed"
}
```

Tüm alanlar zorunlu. `stage` yalnız `Displayed` veya `Opened`; tur negatif olamaz ve teslimle eşleşmelidir. Android gerçekten yerel bildirimi oluşturunca Displayed, kullanıcı tıklayınca Opened gönderir. Tekrarlar 204 ve etkisizdir; zaman sunucudan alınır. İstemci zamanı veya bildirim metni kabul edilmez. Makbuz bildirimi okundu yapmaz ve fiziksel görülme kanıtı değildir. Gerekirse aynı içerikle sınırlı tekrar yapılabilir. Mevcut `/api/notifications/{id}/delivery-status`, mobil sağlayıcı kabulünü ve bu makbuzları da kapsar; eski yanıt şeması değişmemiştir.

## 3. Idempotency, sıra ve hatalar

PUT cihaz, DELETE cihaz ve PUT tercihler `Idempotency-Key` ister: 1–128 karakter. Her yeni niyete yeni anahtar; ağ tekrarında aynı anahtar + aynı JSON değerleri kullanılır. Anahtarlar kullanıcı/işlem/kurulum kapsamında 24 saat geçerlidir, yalnız hash ve token içermeyen yanıt saklanır. Bakım işi süresi dolan mobil anahtarlarını temizler. Hesap/binding değişmişse eski replay 404/409 olabilir; eski sonucu yeni hesaba uygulamayın.

Hata gövdesi `application/problem+json`: `status` (sayı), `title` (kullanıcı metni), `code` (makine kodu), `traceId`; model doğrulamada ayrıca `errors`. Native gövde yokluğu/proxy 5xx gibi taşıma hatalarına da dayanıklı olmalıdır.

| HTTP | code | İstemci davranışı |
|---|---|---|
| 400 | `validation_failed` | Zorunlu alan, JSON, header veya alan sınırını düzelt. `errors` mevcut olabilir. |
| 400 | `mobile_device_invalid`, `mobile_preferences_invalid`, `mobile_receipt_invalid` | İstek biçimini/değerlerini düzelt; kör retry yapma. |
| 400 | `mobile_device_limit` | 20 aktif kayıt sınırı; eski kendi kayıtlarını kapat. |
| 400 | `idempotency_key_required` | Boş/128'i aşan anahtarı düzelt. Eksik header model doğrulama kodunu da üretebilir. |
| 401 | `unauthorized` | WebView oturumunu doğrula; çerez erişimini ve logout durumunu kontrol et, gerekiyorsa giriş iste. |
| 401 | `mobile_cookie_required` | Authorization başlığını kaldır, geçerli WebView oturum çereziyle dene. |
| 403 | `csrf_required`, `csrf_origin` | `X-ADHD-CSRF:1` ve canonical Origin'i düzelt. |
| 404 | `mobile_device_not_found` | Yabancı/olmayan kayıt veya owner/session uyuşmazlığı. Başka hesap verisi olarak yorumlama. |
| 409 | `mobile_binding_conflict` | Kendi kaydını GET ile yenile; sıra/binding durumunu uzlaştır. Eski payload'ı yeni sürüme körlemesine taşıma. |
| 409 | `fcm_token_owned` | Token başka kuruluma ait veya başka hesabın bağlı kurulumu farklı tokenla devralınmaya çalışılıyor. Eski kendi bağı kapatılmalı; otomatik zorla devralma yok. |
| 409 | `version_conflict` | Tercihi GET ile yenile; kullanıcının niyetini güncel sürümle yeniden uygula. |
| 409 | `idempotency_conflict` | Aynı anahtar farklı içerikle kullanılmış; yeni niyet için yeni anahtar kullan. |
| 429 | `mobile_rate_limited` | Tüm mobil push uçlarında IP başına dakikada 60; `Retry-After` saniyesini bekle. |
| 500 | `internal_error` | Sınırlı tekrar/GET ile durum kontrolü; yalnız traceId ile takip et, kimlik bilgisi loglama. |

Yeni Google kimlik doğrulama uçları yoktur. `google_link_required` bu mobil uçların hatası değildir; varsa mevcut giriş akışında ele alınır.

## 4. FCM data yükü ve Android davranışı

HTTP v1 `message.data` nesnesinin kesin 16 alanı; değerlerin tamamı string:

```json
{
  "schemaVersion":"1",
  "type":"notification.ready",
  "deliveryId":"33333333-3333-4333-8333-333333333333",
  "notificationId":"44444444-4444-4444-8444-444444444444",
  "recipientUserId":"11111111-1111-4111-8111-111111111111",
  "bindingVersion":"1",
  "snoozeCount":"0",
  "eventType":"Custom",
  "title":"Rapor yaz",
  "body":"13:30 – 14:30 arası başlıyor · Taslağı bitir",
  "path":"/notifications/44444444-4444-4444-8444-444444444444",
  "dedupeKey":"11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444:0",
  "groupKey":"reminders",
  "channelId":"reminders-v1",
  "sentAt":"2026-11-12T10:00:00Z",
  "expiresAt":"2026-11-12T10:02:00Z"
}
```

`eventType`: ScheduleStart, ScheduleEnd, TaskDeadline, FocusTarget, BreakEnd, ReturnToTask, Custom, SpecialDay. Alan sayısı ve adları aynıdır. `title` (en çok 120) ve `body` (en çok 300 karakter) artık görev/olay adı, zaman ve kısa not içerir; fazlası anlamlı yerde kesilip "…" eklenir. Saatler kullanıcının saat diliminde yazılır, görev adı yoksa genel ad kullanılır. Örnekler: ScheduleStart "Rapor yaz" / "13:30 – 14:30 arası başlıyor"; ScheduleEnd "Rapor yaz" / "Bitiş saati 14:30"; TaskDeadline "Rapor yaz" / "Aralığın son günü yarın" (görevin tarih aralığının bitişi; saat yok, öncül süre uygulanmaz); FocusTarget "Rapor yaz" / "Hedeflediğin 25 dk odak süresi doldu"; BreakEnd "Mola bitti" / "Göreve dön: Rapor yaz"; ReturnToTask "Rapor yaz" / "Çalışmaya ara verdin, devam et"; Custom "Su iç" / "Hatırlatma saati 13:30"; SpecialDay "Ayşe" / "Doğum günü · 14 Kasım". Not yalnız görev açıklamasının ilk satırıdır ve e-posta, telefon, parola veya IBAN benzeri içerik taşıyorsa hiç eklenmez. Bu metinler Google FCM üzerinden geçer. Web Push metni değişmez. Kullanıcı/teslim kimlikleri yetki kanıtı değildir. `dedupeKey` erteleme turunu ayırır; Android tag'i notificationId ile aynı bildirimi değiştirebilir, `groupKey` görsel gruplamadır. FCM collapse kullanılmaz; farklı hatırlatmalar birbirini düşürmez.

FCM isteği yalnız `message.token`, `message.data`, `message.android` taşır. `notification` nesnesi yoktur. Android seçenekleri HIGH öncelik, en çok120s TTL ve restricted_package_name=tr.com.navortal'dır. expiresAt etkin vade +2 dakikadır; retry TTL'si kalan zamana göre azalır. TTL sıfırsa gönderilmez.

Android akışı:
1. Desteklenen schema/type, izin/kanal, etkin ownerId ve bindingVersion, sona erme ve yerel dedupe kontrolü.
2. Yukarıdaki gösterim GET'i. Ağ işi callback süresini aşacaksa uygun WorkManager işi; çevrimdışıyken doğrulanamayan bildirimi gösterme.
3. reminders-v1 kanalında yükteki `title`/`body` ile tek yerel bildirim; sonra Displayed makbuzu.
4. Tıklamada tekrar owner/binding kontrolü; sabit HTTPS origin + izinli `/notifications/{uuid}` yolu; Opened makbuzu. Dış URL, `//`, şema, keyfi query veya host kabul etme.
5. Açık WebView içindeki aynı olayla ikinci ses/bildirim üretme. İstemci ortak dedupe tutmalı. Çıkış/hesap değişiminde yerel bildirimleri ve bekleyen eski-owner işlerini temizle.

Data-only, gösterim öncesi kontrol için seçilmiştir. Arka planda/süreç kapalıyken teslim en iyi çabadır; force-stop/Doze/üretici ve Google Play services kısıtlarında garanti yoktur. HIGH mesajların sürekli bastırılması öncelik düşürülmesine yol açabilir. FCM kabulü Android'in gösterdiği anlamına gelmez. APK'nın SDK sürümü ve güncel Firebase AndroidConfigV2/FID geçiş uyumu gerçek cihaz testinde ayrıca doğrulanmalıdır.

## 5. Kanal seçimi, yeniden deneme ve çıkış

Her kullanıcı/notificationId/snoozeCount için `mobile_push_routes` atomik ve kalıcı karar tutar. Uygun mobil hedef varsa (FCM mevcut, mobil tercih açık, cihaz/kanal izni açık, canlı sid), son kayıt/yenilemesi en yeni kurulum seçilir; eşitlikte installationId sırası kullanılır. Bir turda tek mobil cihaz seçilir. Diğer mobil kayıtlar silinmez. Mobil yoksa mevcut Web Push fan-out'u aynen çalışır.

Mobil gönderim ortak bildirim anahtarı/olay/sessiz saat politikalarına tabidir; eski Web Push pushEnabled anahtarı yalnız web kanalını yönetir. Varsayılan mobil açık olduğundan web pushEnabled=false iken de uygun mobil cihaza gönderilebilir.

Seçilen cihaz gönderimden önce kapanır/oturumu iptal olur/mobil tercih kapanırsa veya FCM kesin reddederse mevcut web tercihi ve VAPID etkinliği uygunsa Web Push'a bir kez düşülür. Okunmuş/eski/kaynağı geçersiz bildirim Web fallback ile yeniden canlandırılmaz.

FCM 429/5xx, Retry-After veya mevcut bounded job retry ile aynı deliveryId üzerinden yeniden denenir; güncel koşullar tekrar kontrol edilir. UNREGISTERED hedefi kapatır ve token'ı temizler. INVALID_ARGUMENT yalnız FcmError ayrıntısı token hatasını gösteriyor ve BadRequest payload hatası taşımıyorsa token temizler. Diğer kesin4xx hedef tokenını topluca silmez. Eski cevabın yeni dönen tokenı silmemesi bindingVersion ile korunur.

Timeout/bağlantı kopması veya Sending durumunda süreç kaybı sonucu belirsizdir: Unknown tutulur, Web fallback ve otomatik yeniden gönderim yapılmaz. Bu tercih çift gösterim yerine nadir teslim kaybını göze alır. FCM kabulünden sonra makbuz gelmemesi de fallback sebebi değildir. Kullanıcı farklı tarayıcılarda web bildirimini zaten alıyorsa eski web kanalı kendi mevcut çok cihaz davranışını korur; kanallar arası mutlak exactly-once garantisi verilmez.

## 6. Sunucu yapılandırması ve veri

| Anahtar | Varsayılan |
|---|---|
| Firebase__Enabled | false |
| Firebase__ProjectId | navortal |
| Firebase__ServiceAccountPath | /opt/navortal/API/.local/firebase-service-account.json |
| Firebase__AndroidPackageName | tr.com.navortal |
| Firebase__TimerSyncEnabled | false; Aşama1'de gönderim uygulaması yok |

Enabled=false veya dosya yoksa FCM kapalıdır; mevcut Web Push bozulmaz. Cihaz kaydı yine yapılabilir; fcmAvailable=false döner. Geçersiz anahtar/yetki nedeniyle kesin gönderilememe web fallback'e gider. Anahtar dosyası yalnız Google kütüphanesine yol ile verilir; içeriği DTO/log/çıktıya alınmaz.

HTTP v1: `https://fcm.googleapis.com/v1/projects/navortal/messages:send`, OAuth scope `https://www.googleapis.com/auth/firebase.messaging`. Mevcut Google.Apis.Auth1.77.0 + HttpClient kullanılır; yeni NuGet yoktur. Sunucu anahtarı mobil pakete/Git/image'a konmaz. Üretimde dosya `docker-compose.firebase.yml` ile ayardaki runtime yoluna salt okunur bağlanmıştır. Geliştirme gerçek üretim anahtarı yerine ayrı proje veya fake transport kullanmalıdır.

Yeni tablolar: mobile_push_devices, mobile_push_preferences, mobile_push_routes, mobile_push_deliveries. Mevcut Web Push tabloları değiştirilmez. FCM tokenları AES-256-GCM ile şifrelenir; şifreleme anahtarı mevcut sunucu JWT anahtarından HKDF ve ayrı amaç bilgisiyle türetilir. Böylece container değişiminde geçici Data Protection anahtarlarına bağımlı değildir. JWT anahtar rotasyonunda eski kayıtlar yeniden kaydedilmelidir. Token veya anahtar içeriği OpenAPI/yanıta çıkmaz.

Migration: `20261111214523_AddMobilePush`. İzole yedek geri yükleme/yükseltme doğrulamasından sonra üretime uygulanmıştır. Üretimde `API/.local/firebase.env` üzerinden Firebase açık, TimerSync kapalıdır; yukarıdaki tablo uygulama varsayılanlarını gösterir.

## 7. Android uygulama sırası

1. CookieManager oturumu + me owner'ı doğrula; yerel kurulum/sequence saklamasını oluştur.
2. Login, uygulama açılışı, token refresh ve izin/kanal değişiminde PUT cihaz. Tek seferde tek kayıt yazımı; retry aynı key/içerik.
3. Mobil tercihi oku/güncelle. İzin kapalı bilgisini sunucuya ilet; izin tekrar açılınca yeni sıra ile kaydet.
4. Data alıcısı, gösterim GET'i, kalıcı dedupe, reminders-v1 yerel gösterim ve makbuzlar.
5. Hesap değişimi/logout: eski-owner işleri/bildirimleri temizle; DELETE veya logout, sonra yeni cookie ile yeni bağ. Eski makbuzları yeni hesapla gönderme.
6. Gerçek cihazda açık/arka plan/kapalı/force-stop, izin kapalı, token refresh, hesap değişimi, web fallback, okunmuşluk ve ağ timeout kabul testleri.

Bu belgedeki UUID/token/çerez örnekleri yalnız yer tutucu veya sentetik örnektir; gerçek sır içermez.

## 8. Dosya bazlı uygulama özeti

| Dosya | Değişiklik |
|---|---|
| API/src/Adhd.Domain/Notifications/MobilePushModels.cs | Cihaz, mobil tercih, kanal kararı ve teslim modelleri. |
| API/src/Adhd.Application/Notifications/MobilePushContracts.cs | Kesin istek/yanıt DTO'ları, store/transport/şifreleme arayüzleri. |
| API/src/Adhd.Api/Controllers/MobilePushController.cs | Yedi cookie tabanlı uç. |
| API/src/Adhd.Api/Auth/MobilePushCookie.cs | Cookie-only ve canlı sid kontrolü; sunucu anahtarından ayrı amaçla türetilmiş token şifrelemesi. |
| API/src/Adhd.Api/Auth/AuthRegistration.cs | Mobil filtre/koruyucu DI, mobil hız sınırı ve Retry-After. |
| API/src/Adhd.Api/Auth/PlannerOpenApi.cs | Mobil cookie security scheme, CSRF/Origin başlıkları, 403/429 sözleşmesi. |
| API/src/Adhd.Api/appsettings.json; API/.env.example | Kapalı Firebase transport varsayılanları. |
| API/src/Adhd.Infrastructure/Notifications/MobilePushStore.cs | Sahiplik, sıra, binding, idempotency, tercihler, gösterim ve makbuz. |
| API/src/Adhd.Infrastructure/Notifications/MobilePushRouting.cs | Atomik mobil önceliği, uygunluk ve mevcut Web Push'a güvenli fallback. |
| API/src/Adhd.Infrastructure/Notifications/MobilePushJobs.cs | Kalıcı gönderim durumları, retry/belirsiz sonuç koruması, genel data payload. |
| API/src/Adhd.Infrastructure/Notifications/FcmTransport.cs | Mevcut Google.Apis.Auth ile HTTP v1, hizmet hesabı yolu ve sınıflandırılmış hata işleme. |
| API/src/Adhd.Infrastructure/Notifications/MobilePushPersistence.cs | Dört yeni tablonun indeks/FK/sürüm eşlemesi. |
| API/src/Adhd.Infrastructure/Notifications/NotificationRegistration.cs | Mobil store/router/job/FCM DI kayıtları. |
| API/src/Adhd.Infrastructure/Notifications/NotificationJobs.cs | Ready aşamasında kanal seçimi; mobil job dispatch. |
| API/src/Adhd.Infrastructure/Notifications/NotificationStore.Receipts.cs | Mevcut delivery-status yanıtında mobil kabul/makbuzların birleştirilmesi. |
| API/src/Adhd.Infrastructure/Jobs/OutboxHandler.cs | MobilePushDelivery job türünün yönlendirilmesi. |
| API/src/Adhd.Infrastructure/Jobs/MaintenanceJob.cs | Süresi dolan mobil idempotency kayıtlarının temizliği. |
| API/src/Adhd.Infrastructure/Auth/AuthSessionStore.cs | Logout/logout-all'da mobil kaydı ve tokenı kapatma; Web Push korunur. |
| API/src/Adhd.Infrastructure/Persistence/PlannerDbContext.cs | Yeni DbSet ve model eşlemesi. |
| API/src/Adhd.Infrastructure/Persistence/Migrations/20261111214523_AddMobilePush.cs; .Designer.cs; PlannerDbContextModelSnapshot.cs | Şema migration'ı ve EF snapshot. |
| API/tests/Adhd.IntegrationTests/MobilePushTests.cs | Cookie/CSRF/owner, yarışlar, idempotency, hesap değişimi, fallback, makbuz, izin/okunmuşluk/ses ve rate limit testleri. |
| API/tests/Adhd.IntegrationTests/FcmTransportTests.cs | HTTP v1 biçimi, hata sınıflandırması, kalıcı/tahrife dayanıklı şifreleme, gerçek sır/ağ kullanmayan testler. |
| API/tests/Adhd.IntegrationTests/ApiContractTests.cs | Cookie-only OpenAPI ve CSRF/403/429 regresyonları. |
| API/tests/Adhd.IntegrationTests/ApiTranscriptStartupFilter.cs | Test kanıtında fcmToken/protectedToken redaksiyonu. |
| API/scripts/generate-frontend-docs.py; API/scripts/frontend_doc_rules.py; API/scripts/validate-frontend-docs.py | Yeni uçların cookie ile belgelenmesi, alan/işlem kuralları ve sözleşme doğrulaması. |
| docs/Frontend API Rehberi.md; docs/operations.md; docs/android-fcm-api-stage1.md | Android sözleşmesi, gezinme bağlantısı ve gelecek yayın için işletim notları. |
| docs/openapi-v1.json; docs/endpoint-catalog.json; docs/operation-policies.json; docs/documentation-coverage.json; docs/frontend-api/*.md | Exporter'dan yenilenen sözleşme/katalog/DTO/hata/endpoint belgeleri. |

UI generated dosyaları dahil UI ve Mobile kaynaklarına bu FCM aşamasında dokunulmamıştır. İlk yerel uygulama sırasında üretime dokunulmamıştır; sonraki yayın doğrulaması bölüm 10'dadır.

## 9. Doğrulama sonuçları ve sınırlar (12 Kasım 2026)

Testler yalnız bu çalışma için oluşturulan, dış portu olmayan SDK/PostgreSQL container'larında ve sentetik kullanıcı/tokenlarla çalıştırıldı. Gerçek Firebase kimlik bilgisi kullanılmadı. Yeni NuGet bağımlılığı eklenmedi.

| Kontrol | Sonuç |
|---|---|
| Release API/sözleşme exporter derlemesi | Başarılı; 0 uyarı, 0 hata. |
| Son hedefli entegrasyon turu | 62/62 geçti: MobilePushTests, FcmTransportTests, PushDeliveryTests, AuthSessionTests, ApiContractTests, NotificationSubscriptionTests, NotificationMobileTests, NotificationAlertTests. |
| Son eklenen migration yükseltme testi | 1/1 geçti; mevcut Web aboneliği korundu, mobil varsayılan açık, eski kullanıcıya kendiliğinden cihaz kaydı oluşturulmadı. |
| Geniş birim test turu | 233/233 geçti. |
| Geniş entegrasyon turu | 628 geçti, 3 başarısız, 1 atlandı (gerçek Cloudinary kimlik bilgisi isteyen kabul testi). Bu turdan sonra yapılan son küçük sözleşme/ses kontrolleri yukarıdaki 62 testte doğrulandı. |
| Üç hatanın FCM öncesi kaynakla tekrarı | Aynı üç test, aynı hatalarla başarısız; FCM değişikliğinden kaynaklanmadığı doğrulandı. Ayrıntılar aşağıda. |
| EF Release model/migration uyumu | Bekleyen model değişikliği yok. Üretim migration'ı uygulanmadı. |
| OpenAPI/Android sözleşmesi | 233 controller işlemi, 238 somut işlem, 323 şema dışa aktarıldı. Yedi mobil işlemin cookie-only yetkisi, yazma CSRF başlığı, 429 yanıtı, tüm mobil alan açıklamaları ve 16 string alanlı payload doğrulandı. Belgedeki sekiz JSON örneği ayrıştırıldı. |
| Tüm eski belgeler için genel validator | Geçmedi: mobil dışındaki iki nullable şema örneği, bazı genel alan açıklamaları ve 14 eski yerel bağlantı/anchor sorunu; toplam 17 rapor. Yeni mobil endpoint/alanları için hata kalmadı. İlgisiz belgeler bu kapsamda düzeltilmedi. |
| git diff --check | Başarılı. |

FCM öncesi kaynak karşılaştırmasında da başarısız olan testler:

- `BackendJourneyTests.PoolTwelveHourWorkUsesSameTaskAcrossFutureMonthAndEditingDoesNotEraseActualOrCopyTask`: boş koleksiyonda tek öğe beklentisi (satır 71).
- `ReminderRepeatTests.InboxOmitsScheduleMessagesWhileTheyStillBecomeReadyAndReadAllDoesNotReadFutureOrForeignRows`: read-all için 2 yerine 1 sonucu (satır 108).
- `MigrationUpgradeTests.ReadVersionUpgradePreservesExistingTaskNoteAndPlanningVersionAndStartsBothCountersAtZero`: eski şemaya güncel modelle seed sırasında `CategoryDetached` sütunu bulunamaması (satır 290).

Karşılaştırma kaynağı: `API/.local/deployments/webview-compat-20261111T201628Z/API`; kaynak salt okunur kullanıldı. Bu üç sorun ayrı kapsamdadır, değiştirilmedi.

İlk yerel test turunda gerçek Google OAuth/FCM ağı ve hizmet hesabı dosyası doğrulanmamıştı; sonraki yayın kontrolleri bölüm 10'dadır. Gerçek cihaz tokenı, Huawei WebView/Google Play services, Android açık/arka plan/kapalı/Doze/force-stop davranışı ve fiziksel bildirim/ses henüz doğrulanmadı. FCM kabulü gösterim garantisi değildir.

İlk yerel teslimde yayınlama yapılmadı; sonraki açık yayın talimatıyla aşağıdaki işlemler tamamlandı. Commit/push yapılmadı.

## 10. Üretim yayını (12 Kasım 2026)

- Hizmet hesabı dosyası içeriği görüntülenmeden `/opt/navortal/API/.local/firebase-service-account.json` yoluna yerleştirildi; dosya API container'ına salt okunur bağlandı.
- `Firebase__Enabled=true`; `Firebase__TimerSyncEnabled=false` etkin üretim ayarları olarak doğrulandı.
- Veritabanı yedeği alındı, izole veritabanına geri yüklendi ve incelenen eklemeli migration uygulandı. Üretimde de migration tamamlandı; mevcut tabloların kayıt sayıları korundu.
- Aday API'de gerçek Production çerez biçimiyle sentetik/izole kullanıcı üzerinden kayıt, idempotent tekrar, cihaz silme, varsayılan açık mobil tercih, `fcmAvailable=true` ve logout sonrası 401 doğrulandı. Üretimde test hesabı oluşturulmadı.
- Google OAuth erişimi doğrulandı. FCM `validate_only` isteği gerçek cihaz olmayan sentetik hedef için beklenen 400/INVALID_ARGUMENT yanıtını döndürdü; gerçek cihaza gönderim yapılmadı.
- İlk uygulama girişiminde SQL dosyasının UTF-8 BOM işareti komut ön ekiyle uyumsuz bulundu; DDL başlamadan otomatik eski API'ye dönüldü. UTF-8-sig okuması ve izole tekrar doğrulamasından sonra yayın başarıyla tamamlandı.
- API readiness başarılı; mevcut JWT/veritabanı/Google/Web Push/diğer API ayarları korundu. UI ve veritabanı container'ları değiştirilmedi. Android kaynakları değiştirilmedi.

Sonraki üretim API güncellemelerinde salt okunur anahtar bağlantısı için `docker compose -f docker-compose.yml -f docker-compose.firebase.yml up -d --no-deps --no-build api` kullanılır. Temel Compose anahtar dosyası gerektirmez; FCM ek dosyası açıkça seçilir. Anahtar ve çerez/token değerleri Git, doküman veya log çıktısına konmaz.

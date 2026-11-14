# Bildirimler, kalıcı işler ve senkronizasyon

In-app kaynak NotificationIntent Ready kayıtlarıdır; SignalR değişiklik işaretidir. Push varsayılan kapalı, ayrı VAPID keypair gerekir; public-config private key vermez. Endpoint/key’ler request’te browser subscription’dan gelir, listede geri dönmez. Snooze aynı notificationId ve yeni snoozeCount; DND deneme bütçesi tüketmez, eski alarm seli önlenir. Lead kaynak zamanından çıkarılır; source/revision/version gönderim öncesi tekrar doğrulanır.404/410 subscription deactivate; transient push bounded retry; exactly-once yoktur. Normal pause geri dönüş alarmı alabilir, planlı Pomodoro molası ikinci dönüş alarmı üretmez. GET sync owner planningVersion/aktif veya son paused work/focus kimliğidir; sonra gerçek endpoint’leri refetch edin. Jobs/outbox görünürlüğü yalnız owner ve payload/secretsizdir. [Bildirim/SignalR](../notifications-realtime.md), [jobs](../jobs-outbox.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/jobs/outbox

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `state` | query | hayır | [OutboxState](DTO-Sozlugu.md#outboxstate); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/jobs/outbox
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OutboxPage](DTO-Sozlugu.md#outboxpage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/jobs/outbox/{id}/retry

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/jobs/outbox/11111111-1111-4111-8111-111111111111/retry
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [OutboxView](DTO-Sozlugu.md#outboxview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek",
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "sourceVersion": 1,
  "state": "Pending",
  "attempts": 1,
  "occurredAt": "2026-10-16T06:00:00Z",
  "availableAt": "2026-10-16T06:00:00Z",
  "leaseUntil": "2026-10-16T06:00:00Z",
  "lastErrorCode": "örnek",
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/jobs/reminders

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `state` | query | hayır | [ReminderState](DTO-Sozlugu.md#reminderstate); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/jobs/reminders
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ReminderPage](DTO-Sozlugu.md#reminderpage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/mobile/push/deliveries/{deliveryId}

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `deliveryId` | path | evet | string (uuid); — |
| `installationId` | query | evet | string (uuid); — |
| `bindingVersion` | query | evet | integer\|string (int64); minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/mobile/push/deliveries/11111111-1111-4111-8111-111111111111?installationId=11111111-1111-4111-8111-111111111111&bindingVersion=1
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
```

**Başarılı response:** HTTP 200.
Şema: [MobilePushDisplayView](DTO-Sozlugu.md#mobilepushdisplayview).

```json
{
  "deliveryId": "11111111-1111-4111-8111-111111111111",
  "notificationId": "11111111-1111-4111-8111-111111111111",
  "snoozeCount": 1,
  "displayAllowed": false,
  "reason": "Takvim düzenlendi",
  "serverNow": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "silent": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## POST /api/mobile/push/deliveries/{deliveryId}/receipts

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `deliveryId` | path | evet | string (uuid); — |
| `X-ADHD-CSRF` | header | evet | string: 1; — |
| `Origin` | header | hayır | string; — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | DTO/modül iş kuralı |
| `installationId` | Guid | DTO/modül iş kuralı |
| `bindingVersion` | Int64 | DTO/modül iş kuralı |
| `snoozeCount` | Int32 | DTO/modül iş kuralı |
| `stage` | String | DTO/modül iş kuralı |

**Request şeması:** [MobilePushReceipt](DTO-Sozlugu.md#mobilepushreceipt).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "installationId": "11111111-1111-4111-8111-111111111111",
  "bindingVersion": 1,
  "snoozeCount": 1,
  "stage": "Displayed"
}
```

**Örnek HTTP:**

```http
POST /api/mobile/push/deliveries/11111111-1111-4111-8111-111111111111/receipts
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
X-ADHD-CSRF: 1
Origin: https://www.navortal.com.tr
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## DELETE /api/mobile/push/devices/{installationId}

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `installationId` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; minLength=1; maxLength=128; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |
| `X-ADHD-CSRF` | header | evet | string: 1; — |
| `Origin` | header | hayır | string; — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | DTO/modül iş kuralı |
| `bindingVersion` | Int64 | DTO/modül iş kuralı |
| `clientSequence` | Int64 | DTO/modül iş kuralı |

**Request şeması:** [RemoveMobilePushDevice](DTO-Sozlugu.md#removemobilepushdevice).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "bindingVersion": 1,
  "clientSequence": 1
}
```

**Örnek HTTP:**

```http
DELETE /api/mobile/push/devices/11111111-1111-4111-8111-111111111111
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
X-ADHD-CSRF: 1
Origin: https://www.navortal.com.tr
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## GET /api/mobile/push/devices/{installationId}

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `installationId` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/mobile/push/devices/11111111-1111-4111-8111-111111111111
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
```

**Başarılı response:** HTTP 200.
Şema: [MobilePushDeviceView](DTO-Sozlugu.md#mobilepushdeviceview).

```json
{
  "installationId": "11111111-1111-4111-8111-111111111111",
  "userId": "11111111-1111-4111-8111-111111111111",
  "bindingVersion": 1,
  "clientSequence": 1,
  "version": 1,
  "active": false,
  "permission": "granted",
  "remindersChannelEnabled": false,
  "platform": "android",
  "packageName": "tr.com.navortal",
  "appVersion": "1.0.0",
  "buildNumber": 1,
  "osVersion": "12",
  "lastSeenAt": "2026-10-16T06:00:00Z",
  "fcmAvailable": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## PUT /api/mobile/push/devices/{installationId}

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `installationId` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; minLength=1; maxLength=128; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |
| `X-ADHD-CSRF` | header | evet | string: 1; — |
| `Origin` | header | hayır | string; — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `fcmToken` | String | required; length:1..4096 |
| `bindingVersion` | Int64 | range:0..9.223372036854776E+18 |
| `clientSequence` | Int64 | range:1..9.223372036854776E+18 |
| `platform` | String | required; RegularExpression |
| `packageName` | String | required; RegularExpression |
| `appVersion` | String | required; length:1..32 |
| `buildNumber` | Int64 | range:1..9.223372036854776E+18 |
| `osVersion` | String | length:0..64 |
| `permission` | String | required; RegularExpression |
| `remindersChannelEnabled` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [RegisterMobilePushDevice](DTO-Sozlugu.md#registermobilepushdevice).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "fcmToken": "<FCM_REGISTRATION_TOKEN>",
  "bindingVersion": 1,
  "clientSequence": 1,
  "platform": "android",
  "packageName": "tr.com.navortal",
  "appVersion": "1.0.0",
  "buildNumber": 1,
  "osVersion": "12",
  "permission": "granted",
  "remindersChannelEnabled": false
}
```

**Örnek HTTP:**

```http
PUT /api/mobile/push/devices/11111111-1111-4111-8111-111111111111
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
X-ADHD-CSRF: 1
Origin: https://www.navortal.com.tr
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [MobilePushDeviceView](DTO-Sozlugu.md#mobilepushdeviceview).

```json
{
  "installationId": "11111111-1111-4111-8111-111111111111",
  "userId": "11111111-1111-4111-8111-111111111111",
  "bindingVersion": 1,
  "clientSequence": 1,
  "version": 1,
  "active": false,
  "permission": "granted",
  "remindersChannelEnabled": false,
  "platform": "android",
  "packageName": "tr.com.navortal",
  "appVersion": "1.0.0",
  "buildNumber": 1,
  "osVersion": "12",
  "lastSeenAt": "2026-10-16T06:00:00Z",
  "fcmAvailable": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## GET /api/mobile/push/preferences

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/mobile/push/preferences
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
```

**Başarılı response:** HTTP 200.
Şema: [MobilePushPreferencesView](DTO-Sozlugu.md#mobilepushpreferencesview).

```json
{
  "enabled": false,
  "version": 1,
  "fcmAvailable": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## PUT /api/mobile/push/preferences

**Yetki:** Yalnız oturum çerezi; Bearer kabul edilmez. Yazmada X-ADHD-CSRF: 1 ve aynı-host Origin/Referer zorunlu.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Aşama1 native FCM: yalnız HttpOnly oturum çerezi; Authorization/Bearer göndermeyin. Yazmalarda X-ADHD-CSRF:1 ve aynı-host Origin/Referer gerekir. Mobil varsayılan açık, Web Push tercihi ayrıdır. Kurulum/hesap/oturum/token bağı bindingVersion ve kalıcı clientSequence ile korunur. Ayrıntılı kesin Android sözleşmesi: ../android-fcm-api-stage1.md. Gösterim/makbuz bildirim okundu anlamına gelmez; ağ sonucu belirsizse gösterimden önce teslimi doğrulayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; minLength=1; maxLength=128; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |
| `X-ADHD-CSRF` | header | evet | string: 1; — |
| `Origin` | header | hayır | string; — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | DTO/modül iş kuralı |
| `version` | Int64 | DTO/modül iş kuralı |
| `enabled` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UpdateMobilePushPreferences](DTO-Sozlugu.md#updatemobilepushpreferences).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "enabled": false
}
```

**Örnek HTTP:**

```http
PUT /api/mobile/push/preferences
Accept: application/json
Cookie: __Host-adhd_session=<SESSION_COOKIE>
X-ADHD-CSRF: 1
Origin: https://www.navortal.com.tr
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [MobilePushPreferencesView](DTO-Sozlugu.md#mobilepushpreferencesview).

```json
{
  "enabled": false,
  "version": 1,
  "fcmAvailable": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 403 (csrf_required veya csrf_origin; başlıkları kontrol edin.), 429 (mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.).

## GET /api/notifications

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Gelen kutusu yalnız Ready bildirimleri listeler. ScheduleStart/ScheduleEnd gönderimleri sürer fakat gelen kutusuna dahil edilmez; teknik intentler veri tabanında korunur. Total bu sorgunun toplamıdır; Pending/Suppressed/Obsolete/Expired kayıtlar sayılmaz. Açılışta read-all ayrı açık komuttur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationPage](DTO-Sozlugu.md#notificationpage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/alerts

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Ön plan alarmı için salt okunur sunucu otoritesi: limit varsayılan25,1..50 aday; Ready ve unread, dueAt≤serverNow ve en çok120sn eski, güncel kaynak/version/revision/tür/enabled/sessiz saat kontrolleri. Ses kapalı öğe kalır; soundEnabled global ses ve FocusTarget/BreakEnd için focus snapshot sesinin birleşimidir. PushEnabled bu yerel kanalı kapatmaz. dueAt açık snooze turunda NotBefore, schedule/deadline için OccurredAt−LeadSeconds, diğerlerinde NotBefore??OccurredAt. Artan (dueAt,id) keyset cursor ilk sayfanın sabit üst sınırını korur; her sayfa güncel tazelik/policy kontrolünü yeniden yapar. Geçersiz adaylar yüzünden boş items ile nextCursor gelebilir; null bitiştir. Yeni poll/sync turunda cursor kullanma. İmleç auth tokenı değildir; bozuk/yabancı/eski (>120sn) cursor400 notification_alert_cursor_invalid. GET job tetiklemez, readAt veya receipt yazmaz. ReadyAt ilk hazırlama anıdır; yeni snooze turunun baseline anı NotBefore olur. Browser unlock/mount öncesi tarihçeyi çalmama ve owner/id/snoozeCount kanal dedupu frontend sorumluluğudur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=25 |
| `cursor` | query | hayır | string; — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/alerts
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationAlertPage](DTO-Sozlugu.md#notificationalertpage).

```json
{
  "serverNow": "2026-10-16T06:00:00Z",
  "preferencesVersion": 1,
  "items": [],
  "nextCursor": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/preferences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/preferences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationPreferencesView](DTO-Sozlugu.md#notificationpreferencesview).

```json
{
  "settings": {
    "enabled": true,
    "pushEnabled": false,
    "soundEnabled": true,
    "scheduleStart": true,
    "scheduleEnd": true,
    "taskDeadline": true,
    "focusTarget": true,
    "breakEnd": true,
    "returnToTask": true,
    "custom": true,
    "leadSeconds": 0,
    "snoozeSeconds": 300,
    "quietStart": "örnek",
    "quietEnd": "örnek",
    "returnAfterSeconds": 0,
    "specialDay": true,
    "pomodoroSound": "örnek",
    "reminderSound": "örnek",
    "taskEndSound": "örnek"
  },
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/notifications/preferences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `settings` | NotificationSettings | DTO/modül iş kuralı |

**Request şeması:** [UpdateNotificationPreferences](DTO-Sozlugu.md#updatenotificationpreferences).

**Örnek request body:**

```json
{
  "version": 1,
  "settings": {
    "enabled": true,
    "pushEnabled": false,
    "soundEnabled": true,
    "scheduleStart": true,
    "scheduleEnd": true,
    "taskDeadline": true,
    "focusTarget": true,
    "breakEnd": true,
    "returnToTask": true,
    "custom": true,
    "leadSeconds": 0,
    "snoozeSeconds": 300,
    "quietStart": "örnek",
    "quietEnd": "örnek",
    "returnAfterSeconds": 0,
    "specialDay": true,
    "pomodoroSound": "örnek",
    "reminderSound": "örnek",
    "taskEndSound": "örnek"
  }
}
```

**Örnek HTTP:**

```http
PUT /api/notifications/preferences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NotificationPreferencesView](DTO-Sozlugu.md#notificationpreferencesview).

```json
{
  "settings": {
    "enabled": true,
    "pushEnabled": false,
    "soundEnabled": true,
    "scheduleStart": true,
    "scheduleEnd": true,
    "taskDeadline": true,
    "focusTarget": true,
    "breakEnd": true,
    "returnToTask": true,
    "custom": true,
    "leadSeconds": 0,
    "snoozeSeconds": 300,
    "quietStart": "örnek",
    "quietEnd": "örnek",
    "returnAfterSeconds": 0,
    "specialDay": true,
    "pomodoroSound": "örnek",
    "reminderSound": "örnek",
    "taskEndSound": "örnek"
  },
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/push-config

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/push-config
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PushConfiguration](DTO-Sozlugu.md#pushconfiguration).

```json
{
  "enabled": false,
  "publicKey": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/read-all

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gelen kutusu açıldığında bir kez çağrılır. Owner lock altında gelen kutusuyla aynı filtredeki Ready/okunmamış kayıtları topluca okur; sürümleri artar. Gelen kutusunda görünmeyen ScheduleStart/ScheduleEnd plan sinyalleri etkilenmez. Pending/başka owner/sonraki Ready kayıtlar değişmez. Belirsiz sonuçta kendiliğinden tekrar yok; açık kullanıcı niyetiyle yeniden gönderilebilir.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Request body:** yok.

**Örnek HTTP:**

```http
POST /api/notifications/read-all
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ReadAllNotificationsResult](DTO-Sozlugu.md#readallnotificationsresult).

```json
{
  "readCount": 1,
  "readAt": "2026-10-16T06:00:00Z",
  "summary": {
    "unreadCount": 1,
    "asOf": "2026-10-16T06:00:00Z"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/reminders

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** repeat null veya verilmemişse tek sefer. Haftalık tekrar seçili günlerde aynı kayıt/sürüm altında yeni intent üretir; ilk uygun gelecek günden başlar. Idempotency tekrarında özgün sonuç döner; düzenleme/iptal eski sürümün intentlerini geçersiz kılar. Sonraki intent sunucuda atomik üretilir; gecikmiş alarm tekrarları atlanır, kullanıcıya geçmiş alarm seli gönderilmez.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Doğrudan array döner; offset/limit var fakat total yok. activeOnly varsayılan false: uzlaştırma için iptal/geçmiş kayıtlar da okunabilir. Hatırlatmalar ekranı activeOnly=true kullanır: owner kapsamında, sayfalama öncesinde iptal kayıtlar ve DueAt≤serverNow tek seferlik kayıtlar çıkarılır; iptal edilmemiş haftalık tekrarlar etkin kalır. Kayıtlar silinmez, bildirim gönderimi ve geçmişi değişmez.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `activeOnly` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/reminders
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview)[].

```json
[]
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/reminders

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** repeat null veya verilmemişse tek sefer. Haftalık tekrar seçili günlerde aynı kayıt/sürüm altında yeni intent üretir; ilk uygun gelecek günden başlar. Idempotency tekrarında özgün sonuç döner; düzenleme/iptal eski sürümün intentlerini geçersiz kılar. Sonraki intent sunucuda atomik üretilir; gecikmiş alarm tekrarları atlanır, kullanıcıya geçmiş alarm seli gönderilmez.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `title` | String | DTO/modül iş kuralı |
| `dueAt` | DateTimeOffset | DTO/modül iş kuralı |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `version` | Int64? | DTO/modül iş kuralı |
| `repeat` | ReminderRepeat | DTO/modül iş kuralı |

**Request şeması:** [CustomReminderCommand](DTO-Sozlugu.md#customremindercommand).

**Örnek request body:**

```json
{
  "title": "Raporu yaz",
  "dueAt": "2026-10-16T06:00:00Z",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "repeat": {
    "timeZoneId": "Europe/Istanbul",
    "localTime": "örnek",
    "weekDays": []
  }
}
```

**Örnek HTTP:**

```http
POST /api/notifications/reminders
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "dueAt": "2026-10-16T06:00:00Z",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "canceled": false,
  "version": 1,
  "repeat": {
    "timeZoneId": "Europe/Istanbul",
    "localTime": "örnek",
    "weekDays": []
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/notifications/reminders/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** repeat null veya verilmemişse tek sefer. Haftalık tekrar seçili günlerde aynı kayıt/sürüm altında yeni intent üretir; ilk uygun gelecek günden başlar. Idempotency tekrarında özgün sonuç döner; düzenleme/iptal eski sürümün intentlerini geçersiz kılar. Sonraki intent sunucuda atomik üretilir; gecikmiş alarm tekrarları atlanır, kullanıcıya geçmiş alarm seli gönderilmez.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** CustomReminderCommand.version nullable şemaya rağmen update için davranışsal olarak gereklidir; eksik/stale409. DueAt serverNowdan ileri ve en çok bir yıl, title1..200.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `title` | String | DTO/modül iş kuralı |
| `dueAt` | DateTimeOffset | DTO/modül iş kuralı |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `version` | Int64? | DTO/modül iş kuralı |
| `repeat` | ReminderRepeat | DTO/modül iş kuralı |

**Request şeması:** [CustomReminderCommand](DTO-Sozlugu.md#customremindercommand).

**Örnek request body:**

```json
{
  "title": "Raporu yaz",
  "dueAt": "2026-10-16T06:00:00Z",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "repeat": {
    "timeZoneId": "Europe/Istanbul",
    "localTime": "örnek",
    "weekDays": []
  }
}
```

**Örnek HTTP:**

```http
PUT /api/notifications/reminders/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "dueAt": "2026-10-16T06:00:00Z",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "canceled": false,
  "version": 1,
  "repeat": {
    "timeZoneId": "Europe/Istanbul",
    "localTime": "örnek",
    "weekDays": []
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/reminders/{id}/cancel

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/reminders/11111111-1111-4111-8111-111111111111/cancel
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "dueAt": "2026-10-16T06:00:00Z",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "canceled": false,
  "version": 1,
  "repeat": {
    "timeZoneId": "Europe/Istanbul",
    "localTime": "örnek",
    "weekDays": []
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/subscriptions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Liste en çok100 kayıt döndürür; aktif cihazlar önce, her grupta CreatedAt/Id azalan sıradadır. Pasif geçmiş aktif cihazları liste dışına itemez. Endpoint ve anahtarlar geri dönmez.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/subscriptions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SubscriptionView](DTO-Sozlugu.md#subscriptionview)[].

```json
[]
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/subscriptions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** En çok20 aktif cihaz sınırı yeni kayıt ve pasif aboneliği yeniden açmada uygulanır. Mevcut aktif aboneliğin yenilenmesi sınırda da mümkündür. Sınır aşımı400 push_subscription_limit; başka hesabın endpoint sahibi değiştirilmez.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `endpoint` | String | DTO/modül iş kuralı |
| `p256dh` | String | DTO/modül iş kuralı |
| `auth` | String | DTO/modül iş kuralı |
| `label` | String | DTO/modül iş kuralı |
| `expiresAt` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [RegisterSubscription](DTO-Sozlugu.md#registersubscription).

**Örnek request body:**

```json
{
  "endpoint": "örnek",
  "p256dh": "örnek",
  "auth": "örnek",
  "label": "örnek",
  "expiresAt": "2026-10-16T06:00:00Z"
}
```

**Örnek HTTP:**

```http
POST /api/notifications/subscriptions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SubscriptionView](DTO-Sozlugu.md#subscriptionview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "providerHost": "örnek",
  "label": "örnek",
  "active": false,
  "expiresAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/subscriptions/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/subscriptions/11111111-1111-4111-8111-111111111111/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/summary

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Owner kapsamında, gelen kutusuyla aynı Ready/tür filtresinde ReadAt null olan bütün kayıtları sayar; son sayfaya veya 10 kayda bağlı değildir. asOf sunucu okuma zamanıdır. Read-all summary aynı transaction içinde komut sonrası sayıdır; geç kalan GET ile komut makbuzunu ezmeyin, ardından yeni kayıtlar için yenileyin.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/summary
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationInboxSummary](DTO-Sozlugu.md#notificationinboxsummary).

```json
{
  "unreadCount": 1,
  "asOf": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek",
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "revisionId": "11111111-1111-4111-8111-111111111111",
  "occurredAt": "2026-10-16T06:00:00Z",
  "readyAt": "2026-10-16T06:00:00Z",
  "notBefore": "2026-10-16T06:00:00Z",
  "readAt": "2026-10-16T06:00:00Z",
  "state": "Pending",
  "snoozeCount": 1,
  "soundEnabled": false,
  "version": 1,
  "title": "Raporu yaz",
  "sound": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/{id}/delivery-receipts

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** expectedUserId oturum owner ile aynı olmalı; yabancı kimlik/kayıt404. Negatif/gelecek tur, bilinmeyen aşama veya o turda hazırlanmış PushDelivery yoksa400 notification_receipt_invalid. Displayed/Opened ilk makbuzu sunucu saatiyle idempotent kaydeder; içerik, endpoint, token veya istemci saati almaz. Bildirimi okundu yapmaz; provider kabulü veya fiziksel görülme kanıtı değildir. Cookie istemci aynı-origin CSRF başlığı gönderir. Aynı owner/bildirim/tur/aşama makbuzu uygulama olayında sınırlı teknik yeniden denemeye uygundur; Idempotency-Key gerekmez.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | DTO/modül iş kuralı |
| `snoozeCount` | Int32 | DTO/modül iş kuralı |
| `stage` | NotificationReceiptStage | DTO/modül iş kuralı |

**Request şeması:** [RecordNotificationReceipt](DTO-Sozlugu.md#recordnotificationreceipt).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "snoozeCount": 1,
  "stage": "Displayed"
}
```

**Örnek HTTP:**

```http
POST /api/notifications/11111111-1111-4111-8111-111111111111/delivery-receipts
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/{id}/delivery-status

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

**Ek entegrasyon kuralı:** Yalnız owner ve güncel erteleme turu. preparedAt güncel turdaki ilk PushDelivery hazırlığıdır; ilk turda teslim yoksa ReadyAt, sonraki turda henüz teslim yoksa null, providerAcceptedAt başarılı dış gönderimin sunucu zamanı, clientDisplayedAt/clientOpenedAt en az bir tarayıcının ayrı iddiası, readAt uygulama okundu işaretidir. Eksik aşama null; sağlayıcı 201 fiziksel gösterim/ses garantisi değildir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notifications/11111111-1111-4111-8111-111111111111/delivery-status
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationDeliveryStatus](DTO-Sozlugu.md#notificationdeliverystatus).

```json
{
  "snoozeCount": 1,
  "preparedAt": "2026-10-16T06:00:00Z",
  "providerAcceptedAt": "2026-10-16T06:00:00Z",
  "clientDisplayedAt": "2026-10-16T06:00:00Z",
  "clientOpenedAt": "2026-10-16T06:00:00Z",
  "readAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/{id}/read

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/11111111-1111-4111-8111-111111111111/read
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek",
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "revisionId": "11111111-1111-4111-8111-111111111111",
  "occurredAt": "2026-10-16T06:00:00Z",
  "readyAt": "2026-10-16T06:00:00Z",
  "notBefore": "2026-10-16T06:00:00Z",
  "readAt": "2026-10-16T06:00:00Z",
  "state": "Pending",
  "snoozeCount": 1,
  "soundEnabled": false,
  "version": 1,
  "title": "Raporu yaz",
  "sound": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/{id}/snooze

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Aynı notificationId, artan snoozeCount ve yeni NotBefore; kaynak hâlâ geçerli olmalıdır. DND ve tür tercihleri teslimde yeniden kontrol edilir.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `seconds` | Int32? | DTO/modül iş kuralı |

**Request şeması:** [SnoozeNotification](DTO-Sozlugu.md#snoozenotification).

**Örnek request body:**

```json
{
  "version": 1,
  "seconds": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/11111111-1111-4111-8111-111111111111/snooze
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek",
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "revisionId": "11111111-1111-4111-8111-111111111111",
  "occurredAt": "2026-10-16T06:00:00Z",
  "readyAt": "2026-10-16T06:00:00Z",
  "notBefore": "2026-10-16T06:00:00Z",
  "readAt": "2026-10-16T06:00:00Z",
  "state": "Pending",
  "snoozeCount": 1,
  "soundEnabled": false,
  "version": 1,
  "title": "Raporu yaz",
  "sound": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/sync

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/sync
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SyncView](DTO-Sozlugu.md#syncview).

```json
{
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0,
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "focusSessionId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/workspace/snapshot

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R3 performance: owner cookie/Bearer korunur; me doğrulaması önce gelir. Varsayılan includeFocus=false pasiftir. true mevcut focus/current değerlendirmesini aynı owner transaction sınırında uygular; FocusIncluded=false ile doğrulanmış ActiveFocus=null farklıdır. ActiveWork Running öncelikli, yoksa en son başlayan Paused kaydıdır. Preferences yalnız küçük görüntüleme projeksiyonudur; tam PUT belgesi veya tam preferences cache girdisi değildir. PlanningVersion bütün kaynakların sürümü sayılmaz. Yanıt no-store, private; serverNow aynı snapshot içindeki sürelerin ortak kesimidir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `includeFocus` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/workspace/snapshot
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkspaceSnapshotView](DTO-Sozlugu.md#workspacesnapshotview).

```json
{
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0,
  "preferences": {
    "version": 1,
    "timeZoneId": "Europe/Istanbul",
    "timeFormat": "24h",
    "weekStartsOn": 1,
    "supportEnabled": false,
    "hasWorkingWindows": false,
    "uiSupports": {
      "calmView": false,
      "dayBar": true,
      "calibrationHints": true,
      "nudges": true,
      "resumeCard": true,
      "openTodayAsOneThing": false
    }
  },
  "activeWork": null,
  "focusSessionId": null,
  "focusIncluded": false,
  "activeFocus": null,
  "versions": {
    "planning": 1,
    "notes": 1,
    "specialDays": 1
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

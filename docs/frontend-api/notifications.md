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
GET /api/jobs/outbox?state=Failed
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OutboxPage](DTO-Sozlugu.md#outboxpage).

```json
{
  "items": [
    {
      "id": "0d509e4f-84e0-48b7-b06b-093e1661d9a0",
      "kind": "Unknown",
      "sourceId": "0d509e4f-84e0-48b7-b06b-093e1661d9a0",
      "sourceVersion": 0,
      "state": "Failed",
      "attempts": 5,
      "occurredAt": "2026-10-15T06:00:00+00:00",
      "availableAt": "2026-10-15T06:01:02+00:00",
      "leaseUntil": null,
      "lastErrorCode": "unknown_outbox_kind",
      "completedAt": null,
      "version": 11
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 11
}
```

**Örnek HTTP:**

```http
POST /api/jobs/outbox/0d509e4f-84e0-48b7-b06b-093e1661d9a0/retry
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [OutboxView](DTO-Sozlugu.md#outboxview).

```json
{
  "id": "0d509e4f-84e0-48b7-b06b-093e1661d9a0",
  "kind": "Unknown",
  "sourceId": "0d509e4f-84e0-48b7-b06b-093e1661d9a0",
  "sourceVersion": 0,
  "state": "Pending",
  "attempts": 0,
  "occurredAt": "2026-10-15T06:00:00+00:00",
  "availableAt": "2026-10-15T06:01:02+00:00",
  "leaseUntil": null,
  "lastErrorCode": null,
  "completedAt": null,
  "version": 12
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Yalnız güncel başarısız işi yeniden deneyebilirsiniz.",
  "status": 409,
  "code": "job_retry_conflict",
  "traceId": "00-15c1f009fcf1f0800776e068e3860c1a-40ab4db191d171e7-00"
}
```

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
  "limit": 50,
  "total": 0
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "items": [
    {
      "id": "01a16bfa-6552-7448-92c4-a25d5dfcf004",
      "kind": "Custom",
      "sourceId": "01a16bfa-6551-7c8b-9d8f-24e8b8f16a4f",
      "taskId": null,
      "dailyPlanId": null,
      "revisionId": null,
      "occurredAt": "2026-10-15T06:01:00+00:00",
      "readyAt": "2026-10-15T06:01:00+00:00",
      "notBefore": "2026-10-15T06:01:00+00:00",
      "readAt": null,
      "state": "Ready",
      "snoozeCount": 0,
      "soundEnabled": true,
      "version": 2
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Bildirim alanlarını kontrol edin.",
  "status": 400,
  "code": "pagination_invalid",
  "traceId": "00-2bb72029c735f0820eb57b7874538f60-9fc64af2f70835eb-00"
}
```

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
    "leadSeconds": 300,
    "snoozeSeconds": 300,
    "quietStart": null,
    "quietEnd": null,
    "returnAfterSeconds": 0,
    "specialDay": true
  },
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "version": 0,
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
    "quietStart": "22:00:00",
    "quietEnd": "08:00:00",
    "returnAfterSeconds": 0,
    "specialDay": true
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
    "quietStart": "22:00:00",
    "quietEnd": "08:00:00",
    "returnAfterSeconds": 0,
    "specialDay": true
  },
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "publicKey": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/read-all

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gelen kutusu açıldığında bir kez çağrılır. Owner lock altında o anda Ready/okunmamış kayıtları topluca okur; sürümleri artar. Pending/başka owner/sonraki Ready kayıtlar değişmez. Belirsiz sonuçta kendiliğinden tekrar yok; açık kullanıcı niyetiyle yeniden gönderilebilir.

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
  "readAt": "2026-10-16T06:00:00Z"
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
[
  {
    "id": "01a16c00-e656-78ad-a1fe-259c2240cb5c",
    "title": "Düzenlenen hatırlatma",
    "dueAt": "2026-10-15T06:20:00+00:00",
    "taskId": null,
    "canceled": false,
    "version": 2
  }
]
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "title": "Hatırlat",
  "dueAt": "2026-10-15T06:01:00+00:00",
  "taskId": null
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
  "id": "01a16bf9-2816-78f9-9bd3-eeb46bc63204",
  "title": "Hatırlat",
  "dueAt": "2026-10-15T06:01:00+00:00",
  "taskId": null,
  "canceled": false,
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Anahtar farklı komutta kullanılmış.",
  "status": 409,
  "code": "idempotency_conflict",
  "traceId": "00-bec51808557f8637fc5c98daa58c7394-23ed21ec67eb323d-00"
}
```

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
  "version": 1,
  "title": "Düzenlenen hatırlatma",
  "dueAt": "2026-10-15T06:20:00+00:00"
}
```

**Örnek HTTP:**

```http
PUT /api/notifications/reminders/01a16c00-e656-78ad-a1fe-259c2240cb5c
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview).

```json
{
  "id": "01a16c00-e656-78ad-a1fe-259c2240cb5c",
  "title": "Düzenlenen hatırlatma",
  "dueAt": "2026-10-15T06:20:00+00:00",
  "taskId": null,
  "canceled": false,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel sürümü alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-af1da2f6bed91b07b1043c773d9810da-e9b319caee852f58-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/reminders/01a16bf9-288c-7d32-a2f8-245bb63c2314/cancel
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [CustomReminderView](DTO-Sozlugu.md#customreminderview).

```json
{
  "id": "01a16bf9-288c-7d32-a2f8-245bb63c2314",
  "title": "Hatırlat",
  "dueAt": "2026-10-15T06:01:00+00:00",
  "taskId": null,
  "canceled": true,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/notifications/subscriptions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

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
[
  {
    "id": "01a16c00-e6c5-7b01-97bb-33585d44c829",
    "providerHost": "push.example.test",
    "label": "Masaüstü",
    "active": true,
    "expiresAt": null,
    "version": 1
  }
]
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notifications/subscriptions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.

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
  "endpoint": "<REPLACE_ENDPOINT>",
  "p256dh": "<REPLACE_P256DH>",
  "auth": "<REPLACE_AUTH>",
  "label": "Masaüstü",
  "expiresAt": null
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
  "id": "01a16bfa-bef0-7ca7-978e-2b42ef61656c",
  "providerHost": "push.example.test",
  "label": "Masaüstü",
  "active": true,
  "expiresAt": null,
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Tarayıcı aboneliği önce önceki hesaptan kaldırılmalı ve yeniden oluşturulmalı.",
  "status": 409,
  "code": "push_endpoint_owned",
  "traceId": "00-b1f8165864717a93593cd4671a25a2c9-7909a586a591b800-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/notifications/subscriptions/01a16c00-e6c5-7b01-97bb-33585d44c829/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Bildirim kaydı bulunamadı.",
  "status": 404,
  "code": "notification_not_found",
  "traceId": "00-9a91a43e9a5513d6a24fc62d23e47bec-886b047b263c2bc0-00"
}
```

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
GET /api/notifications/01a16bfa-6552-7448-92c4-a25d5dfcf004
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "01a16bfa-6552-7448-92c4-a25d5dfcf004",
  "kind": "Custom",
  "sourceId": "01a16bfa-6551-7c8b-9d8f-24e8b8f16a4f",
  "taskId": null,
  "dailyPlanId": null,
  "revisionId": null,
  "occurredAt": "2026-10-15T06:01:00+00:00",
  "readyAt": "2026-10-15T06:01:00+00:00",
  "notBefore": "2026-10-15T06:02:00+00:00",
  "readAt": null,
  "state": "Pending",
  "snoozeCount": 1,
  "soundEnabled": true,
  "version": 3
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Bildirim kaydı bulunamadı.",
  "status": 404,
  "code": "notification_not_found",
  "traceId": "00-3c959791769b0fdd973790e6d22318f9-34cc067a41fefa21-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 4
}
```

**Örnek HTTP:**

```http
POST /api/notifications/01a16bfa-6552-7448-92c4-a25d5dfcf004/read
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "01a16bfa-6552-7448-92c4-a25d5dfcf004",
  "kind": "Custom",
  "sourceId": "01a16bfa-6551-7c8b-9d8f-24e8b8f16a4f",
  "taskId": null,
  "dailyPlanId": null,
  "revisionId": null,
  "occurredAt": "2026-10-15T06:01:00+00:00",
  "readyAt": "2026-10-15T06:01:00+00:00",
  "notBefore": "2026-10-15T06:02:00+00:00",
  "readAt": "2026-10-15T06:02:00+00:00",
  "state": "Ready",
  "snoozeCount": 1,
  "soundEnabled": true,
  "version": 5
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "version": 2,
  "seconds": 60
}
```

**Örnek HTTP:**

```http
POST /api/notifications/01a16bf9-9b03-7f7b-9e42-364605874657/snooze
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NotificationView](DTO-Sozlugu.md#notificationview).

```json
{
  "id": "01a16bf9-9b03-7f7b-9e42-364605874657",
  "kind": "ReturnToTask",
  "sourceId": "01a16bf9-9303-7a15-aa39-00e863923e98",
  "taskId": "01a16bf9-9286-7900-8a96-5b945112fde2",
  "dailyPlanId": null,
  "revisionId": null,
  "occurredAt": "2026-10-15T06:03:00+00:00",
  "readyAt": "2026-10-15T06:03:00+00:00",
  "notBefore": "2026-10-15T06:04:00+00:00",
  "readAt": null,
  "state": "Pending",
  "snoozeCount": 1,
  "soundEnabled": true,
  "version": 3
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel sürümü alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-703a7483bad647188cf9d53e9595f8fd-d6fecfff88d3d8f8-00"
}
```

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
  "serverNow": "2026-10-15T06:02:00+00:00",
  "planningVersion": 2,
  "workSessionId": "01a16bfc-3e07-73ff-8646-6d3020a2dad4",
  "focusSessionId": "01a16bfc-3e0f-7d29-8e64-a991c34edff8"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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

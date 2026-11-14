# Gerçek çalışma, düzeltme ve Pomodoro

Normal start/pause/resume/finish gerçek segmentleri yönetir; bir kullanıcıda tek açık segment DB’de de korunur. Finish task complete değildir; task complete açık segmenti kapatır. ServerNow/ActiveSeconds otoritedir; browser kapanması veya bağlantı kaybı sayacı bitirmez. Manual/correction önceki-yeni değer/neden audit’iyle atomiktir, gerçek work overlap reddedilir; audit ayrıca actual sayılmaz. Focus preset35/7 dahil özeldir; task90dk ile cycle35dk ayrı kavramlardır. ContinueTracking hedefi bir kez kaydeder ve actual/overtime sürer. AutoBreak ilk server değerlendirmesinde kapatır, geçmişi hedef anında kesilmiş gibi değiştirmez. Break work segmentini kapatır; next açık kullanıcı niyetidir, gizli döngü yoktur. Aynı WorkSession birkaç focus cycle’a bağlanabilir; süreleri tekrar toplamayın. [Work/focus](../focus-pomodoro.md), [düzeltme](../testing-strategy.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/focus-presets

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/focus-presets
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusPresetPage](DTO-Sozlugu.md#focuspresetpage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "builtIns": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-presets

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | required; length:0..100 |
| `settings` | FocusSettings | required |

**Request şeması:** [FocusPresetRequest](DTO-Sozlugu.md#focuspresetrequest).

**Örnek request body:**

```json
{
  "name": "Çalışma",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  }
}
```

**Örnek HTTP:**

```http
POST /api/focus-presets
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [FocusPresetView](DTO-Sozlugu.md#focuspresetview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/focus-presets/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `name` | String | required; length:0..100 |
| `settings` | FocusSettings | required |

**Request şeması:** [UpdateFocusPresetRequest](DTO-Sozlugu.md#updatefocuspresetrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Çalışma",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  }
}
```

**Örnek HTTP:**

```http
PUT /api/focus-presets/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusPresetView](DTO-Sozlugu.md#focuspresetview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/focus-sessions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/focus-sessions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusPage](DTO-Sozlugu.md#focuspage).

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

## POST /api/focus-sessions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** presetId ile settings birlikte verilmez. workSessionId/workSessionVersion çifti mevcut Running/Paused worke attach eder; taskId yoksa yeni genel odak mümkündür. plan bloğu için önce normal planlı work başlatın; bu requestte scheduleId yoktur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `workSessionId` | Guid? | DTO/modül iş kuralı |
| `workSessionVersion` | Int64? | DTO/modül iş kuralı |
| `presetId` | Guid? | DTO/modül iş kuralı |
| `settings` | FocusSettings | DTO/modül iş kuralı |

**Request şeması:** [FocusStart](DTO-Sozlugu.md#focusstart).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "workSessionVersion": 1,
  "presetId": "11111111-1111-4111-8111-111111111111",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  }
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/focus-sessions/current

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Current/detail GET hedef ve mola zamanını ObserveFocus ile kalıcı değerlendirebilir; version/state/planningVersion değişebilir. Liste GET aynı gözlem akışını çalıştırmaz. GET yanıtını shared cache veya SWde saklamayın.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/focus-sessions/current
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusCurrent](DTO-Sozlugu.md#focuscurrent).

```json
{
  "session": {
    "id": "11111111-1111-4111-8111-111111111111",
    "workSessionId": "11111111-1111-4111-8111-111111111111",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "previousFocusId": "11111111-1111-4111-8111-111111111111",
    "cycleNumber": 1,
    "state": "Working",
    "settings": {
      "workSeconds": 1500,
      "shortBreakSeconds": 300,
      "longBreakSeconds": 900,
      "longBreakEvery": 4,
      "targetBehavior": "ContinueTracking",
      "soundEnabled": true,
      "notificationsEnabled": true
    },
    "presetId": "11111111-1111-4111-8111-111111111111",
    "presetName": "örnek",
    "presetVersion": 1,
    "startedAt": "2026-10-16T06:00:00Z",
    "workEndedAt": "2026-10-16T06:00:00Z",
    "breakStartedAt": "2026-10-16T06:00:00Z",
    "breakEndedAt": "2026-10-16T06:00:00Z",
    "endedAt": "2026-10-16T06:25:00Z",
    "targetReachedAt": "2026-10-16T06:00:00Z",
    "targetObservedAt": "2026-10-16T06:00:00Z",
    "targetEventId": "11111111-1111-4111-8111-111111111111",
    "activeSeconds": 1,
    "remainingSeconds": 1,
    "overtimeSeconds": 1,
    "effectiveTargetReached": false,
    "breakTargetSeconds": 1,
    "breakElapsedSeconds": 1,
    "breakRemainingSeconds": 1,
    "version": 1,
    "workSessionVersion": 1,
    "serverNow": "2026-10-16T06:00:00Z"
  },
  "serverNow": "2026-10-16T06:00:00Z",
  "coverage": {
    "versions": {
      "planning": 1,
      "notes": 1,
      "specialDays": 1
    },
    "serverNow": "2026-10-16T06:00:00Z"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/focus-sessions/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Current/detail GET hedef ve mola zamanını ObserveFocus ile kalıcı değerlendirebilir; version/state/planningVersion değişebilir. Liste GET aynı gözlem akışını çalıştırmaz. GET yanıtını shared cache veya SWde saklamayın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/focus-sessions/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/pause

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/pause
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/resume

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/resume
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/break

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/break
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/next

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Yanıt yeni focusId içerir; önceki focus Finished olur. WorkSessionId korunur. UI yeni focus version ve workSessionVersion değerlerine geçmelidir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/next
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/finish

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/finish
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/focus-sessions/{id}/cancel

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `operation` | path | evet | string: pause, resume, break, next, finish, cancel; — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `workSessionVersion` | Int64 | DTO/modül iş kuralı |
| `skipBreak` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [FocusCommand](DTO-Sozlugu.md#focuscommand).

**Örnek request body:**

```json
{
  "version": 1,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/11111111-1111-4111-8111-111111111111/cancel
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/time

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/time
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskTimeView](DTO-Sozlugu.md#tasktimeview).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "directActualSeconds": 1,
  "subtreeActualSeconds": 1,
  "knownRemainingSeconds": 1,
  "unknownRemainingCount": 1,
  "remainingSeconds": 1,
  "knownOvertimeSeconds": 1,
  "unknownEstimateCount": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/work-sessions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `State` | query | hayır | [WorkState](DTO-Sozlugu.md#workstate); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/work-sessions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkPage](DTO-Sozlugu.md#workpage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "coverage": {
    "versions": {
      "planning": 1,
      "notes": 1,
      "specialDays": 1
    },
    "serverNow": "2026-10-16T06:00:00Z"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/work-sessions/current

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** ActiveSession yalnız Running kaydıdır. Paused oturum varken null dönebilir; sync.workSessionId veya state=Paused listesi üzerinden geri yükleyin.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/work-sessions/current
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CurrentWork](DTO-Sozlugu.md#currentwork).

```json
{
  "activeSession": {
    "id": "11111111-1111-4111-8111-111111111111",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "state": "Running",
    "source": "Timer",
    "startedAt": "2026-10-16T06:00:00Z",
    "endedAt": "2026-10-16T06:25:00Z",
    "timeZoneId": "Europe/Istanbul",
    "taskAtStart": {
      "schemaVersion": 1,
      "taskId": "11111111-1111-4111-8111-111111111111",
      "taskVersion": 1,
      "title": "Raporu yaz",
      "ancestors": [],
      "project": null,
      "pool": null,
      "category": null,
      "tags": [],
      "inputPlanningVersion": 1,
      "capturedAt": "2026-10-16T06:00:00Z"
    },
    "version": 1,
    "activeSeconds": 1,
    "serverNow": "2026-10-16T06:00:00Z",
    "recordedAt": "2026-10-16T06:00:00Z",
    "startedScheduleId": "11111111-1111-4111-8111-111111111111",
    "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
  },
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/work-sessions/manual

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | required |
| `startedAt` | DateTimeOffset? | required |
| `endedAt` | DateTimeOffset? | required |
| `reason` | String | required; length:0..2000 |

**Request şeması:** [ManualWorkRequest](DTO-Sozlugu.md#manualworkrequest).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/manual
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/work-sessions/start

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** taskId zorunlu; genel work bu endpointten başlamaz. scheduleId ve scheduleVersion birlikte verilir veya ikisi de boş. Focus planlı başlayacaksa önce bu çağrı, sonra focus-start mevcut workSessionId/workSessionVersion ile attach edilir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | required |
| `scheduleId` | Guid? | DTO/modül iş kuralı |
| `scheduleVersion` | Int64? | range:1..9.223372036854776E+18 |

**Request şeması:** [StartWorkRequest](DTO-Sozlugu.md#startworkrequest).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "scheduleId": "11111111-1111-4111-8111-111111111111",
  "scheduleVersion": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/start
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/work-sessions/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/work-sessions/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/work-sessions/{id}/corrections

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `State` | query | hayır | [WorkState](DTO-Sozlugu.md#workstate); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/work-sessions/11111111-1111-4111-8111-111111111111/corrections
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CorrectionPage](DTO-Sozlugu.md#correctionpage).

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

## POST /api/work-sessions/{id}/finish

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/11111111-1111-4111-8111-111111111111/finish
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/work-sessions/{id}/pause

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/11111111-1111-4111-8111-111111111111/pause
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/work-sessions/{id}/resume

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/11111111-1111-4111-8111-111111111111/resume
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/work-sessions/{id}/segments

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `State` | query | hayır | [WorkState](DTO-Sozlugu.md#workstate); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/work-sessions/11111111-1111-4111-8111-111111111111/segments
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SegmentPage](DTO-Sozlugu.md#segmentpage).

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

## POST /api/work-sessions/{id}/segments/{segmentId}/corrections

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** version/segmentVersion/startedAt/isVoided/reason zorunludur; endedAt açık segmentte null olabilir. Kapalı segment correction ile resume edilmez. Overlap reddedilir.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `segmentId` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `segmentVersion` | Int64 | range:1..9.223372036854776E+18 |
| `startedAt` | DateTimeOffset? | required |
| `endedAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `isVoided` | Boolean? | required |
| `reason` | String | required; length:0..2000 |

**Request şeması:** [CorrectWorkRequest](DTO-Sozlugu.md#correctworkrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "segmentVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "isVoided": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/11111111-1111-4111-8111-111111111111/segments/11111111-1111-4111-8111-111111111111/corrections
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 1,
    "taskId": "11111111-1111-4111-8111-111111111111",
    "taskVersion": 1,
    "title": "Raporu yaz",
    "ancestors": [],
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "pool": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "category": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Çalışma"
    },
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-16T06:00:00Z"
  },
  "version": 1,
  "activeSeconds": 1,
  "serverNow": "2026-10-16T06:00:00Z",
  "recordedAt": "2026-10-16T06:00:00Z",
  "startedScheduleId": "11111111-1111-4111-8111-111111111111",
  "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

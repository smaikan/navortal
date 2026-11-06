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
  "items": [
    {
      "id": "01a16bf9-3094-7c6a-85a7-9c859991add0",
      "name": "15/5",
      "settings": {
        "workSeconds": 900,
        "shortBreakSeconds": 300,
        "longBreakSeconds": 900,
        "longBreakEvery": 4,
        "targetBehavior": "ContinueTracking",
        "soundEnabled": true,
        "notificationsEnabled": true
      },
      "version": 2
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 1,
  "builtIns": [
    {
      "workSeconds": 900,
      "shortBreakSeconds": 300,
      "longBreakSeconds": 900,
      "longBreakEvery": 4,
      "targetBehavior": "ContinueTracking",
      "soundEnabled": true,
      "notificationsEnabled": true
    },
    {
      "workSeconds": 1500,
      "shortBreakSeconds": 300,
      "longBreakSeconds": 900,
      "longBreakEvery": 4,
      "targetBehavior": "ContinueTracking",
      "soundEnabled": true,
      "notificationsEnabled": true
    },
    {
      "workSeconds": 2700,
      "shortBreakSeconds": 600,
      "longBreakSeconds": 900,
      "longBreakEvery": 4,
      "targetBehavior": "ContinueTracking",
      "soundEnabled": true,
      "notificationsEnabled": true
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "name": "35/7",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 1200,
    "longBreakEvery": 3,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": false,
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
  "id": "01a16bf9-3094-7c6a-85a7-9c859991add0",
  "name": "35/7",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 1200,
    "longBreakEvery": 3,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": false,
    "notificationsEnabled": true
  },
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "title": "Gönderilen alanları kontrol edin.",
  "status": 400,
  "errors": {
    "request": [
      "The request field is required."
    ],
    "$.settings.targetBehavior": [
      "The JSON value could not be converted to Adhd.Domain.Focus.FocusSettings. Path: $.settings.targetBehavior | LineNumber: 0 | BytePositionInLine: 130."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URQHI"
}
```

## PUT /api/focus-presets/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `name` | String | required; length:0..100 |
| `settings` | FocusSettings | required |

**Request şeması:** [UpdateFocusPresetRequest](DTO-Sozlugu.md#updatefocuspresetrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "15/5",
  "settings": {
    "workSeconds": 900,
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
PUT /api/focus-presets/01a16bf9-3094-7c6a-85a7-9c859991add0
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusPresetView](DTO-Sozlugu.md#focuspresetview).

```json
{
  "id": "01a16bf9-3094-7c6a-85a7-9c859991add0",
  "name": "15/5",
  "settings": {
    "workSeconds": 900,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "title": "Gönderilen alanları kontrol edin.",
  "status": 400,
  "errors": {
    "Settings": [
      "The Settings field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URQSH"
}
```

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
GET /api/focus-sessions?limit=1
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusPage](DTO-Sozlugu.md#focuspage).

```json
{
  "items": [
    {
      "id": "01a16bf9-4877-7a7e-a9f0-f6c0e19739ac",
      "workSessionId": "01a16bf9-4875-7bcc-88d6-394907a95810",
      "taskId": null,
      "previousFocusId": null,
      "cycleNumber": 1,
      "state": "Finished",
      "settings": {
        "workSeconds": 1500,
        "shortBreakSeconds": 300,
        "longBreakSeconds": 900,
        "longBreakEvery": 4,
        "targetBehavior": "ContinueTracking",
        "soundEnabled": true,
        "notificationsEnabled": true
      },
      "presetId": null,
      "presetName": null,
      "presetVersion": null,
      "startedAt": "2026-10-15T06:00:00+00:00",
      "workEndedAt": "2026-10-15T06:03:00+00:00",
      "breakStartedAt": null,
      "breakEndedAt": null,
      "endedAt": "2026-10-15T06:03:00+00:00",
      "targetReachedAt": null,
      "targetObservedAt": null,
      "targetEventId": null,
      "activeSeconds": 180,
      "remainingSeconds": 1320,
      "overtimeSeconds": 0,
      "effectiveTargetReached": false,
      "breakTargetSeconds": 300,
      "breakElapsedSeconds": 0,
      "breakRemainingSeconds": 300,
      "version": 2,
      "workSessionVersion": 2,
      "serverNow": "2026-10-15T06:03:00+00:00"
    }
  ],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Offset0..100000 ve limit1..100 olmalı.",
  "status": 400,
  "code": "pagination_invalid",
  "traceId": "00-aa75db9c2d2caa62e9a46e7462cb0830-5af7036b936581b6-00"
}
```

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
  "taskId": null,
  "workSessionId": null,
  "workSessionVersion": null,
  "presetId": "01a16bf9-3094-7c6a-85a7-9c859991add0",
  "settings": null
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
  "id": "01a16bf9-32c4-773a-862e-ac29f9435b83",
  "workSessionId": "01a16bf9-32bc-79e8-9471-f2f77f8153d4",
  "taskId": null,
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 1200,
    "longBreakEvery": 3,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": false,
    "notificationsEnabled": true
  },
  "presetId": "01a16bf9-3094-7c6a-85a7-9c859991add0",
  "presetName": "35/7",
  "presetVersion": 1,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": null,
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": null,
  "targetObservedAt": null,
  "targetEventId": null,
  "activeSeconds": 0,
  "remainingSeconds": 2100,
  "overtimeSeconds": 0,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 420,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 420,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-15T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu anahtar başka bir odak komutunda kullanılmış.",
  "status": 409,
  "code": "idempotency_conflict",
  "traceId": "00-e319721d3abe5de595e1604bd976ea6d-213b1cb40816d8f6-00"
}
```

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
  "session": null,
  "serverNow": "2026-10-15T06:05:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/focus-sessions/01a16bf8-fca5-7639-9848-b4fe9755b9b4
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf8-fca5-7639-9848-b4fe9755b9b4",
  "workSessionId": "01a16bf8-fae3-7b93-839d-4b3d31df1ec3",
  "taskId": "01a16bf8-f94c-760e-b931-fcf8e26f36ba",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Interrupted",
  "settings": {
    "workSeconds": 300,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:10:00+00:00",
  "workEndedAt": "2026-10-15T06:15:00+00:00",
  "breakStartedAt": "2026-10-15T06:15:00+00:00",
  "breakEndedAt": "2026-10-15T06:16:00+00:00",
  "endedAt": "2026-10-15T06:16:00+00:00",
  "targetReachedAt": "2026-10-15T06:15:00+00:00",
  "targetObservedAt": "2026-10-15T06:15:00+00:00",
  "targetEventId": "01a16bf8-fca5-7639-9848-b4fe9755b9b4",
  "activeSeconds": 300,
  "remainingSeconds": 0,
  "overtimeSeconds": 0,
  "effectiveTargetReached": true,
  "breakTargetSeconds": 300,
  "breakElapsedSeconds": 60,
  "breakRemainingSeconds": 240,
  "version": 4,
  "workSessionVersion": 3,
  "serverNow": "2026-10-15T06:16:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sunucu zamanı çalışma kaydından geride.",
  "status": 409,
  "code": "server_clock_conflict",
  "traceId": "00-6e02d2d2caa243fad2afba736f5b4b5c-0fc34780319d4891-00"
}
```

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
POST /api/focus-sessions/01a16bf9-4e30-7379-bb3c-e83d8154ca5c/pause
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf9-4e30-7379-bb3c-e83d8154ca5c",
  "workSessionId": "01a16bf9-4e2e-7315-ab5a-3f8533e9388f",
  "taskId": null,
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Paused",
  "settings": {
    "workSeconds": 300,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "AutoBreak",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": null,
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": "2026-10-15T06:05:00+00:00",
  "targetObservedAt": "2026-10-15T06:06:00+00:00",
  "targetEventId": "01a16bf9-4e30-7379-bb3c-e83d8154ca5c",
  "activeSeconds": 360,
  "remainingSeconds": 0,
  "overtimeSeconds": 60,
  "effectiveTargetReached": true,
  "breakTargetSeconds": 300,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 300,
  "version": 3,
  "workSessionVersion": 2,
  "serverNow": "2026-10-15T06:06:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Odak oturumu bulunamadı.",
  "status": 404,
  "code": "focus_not_found",
  "traceId": "00-82bd972cb842076d3d22ce9f2d9d889b-3fcb9c3544e659db-00"
}
```

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
  "version": 2,
  "workSessionVersion": 2,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/01a16bf9-1603-71a0-b948-9b3de6aa0ec4/resume
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf9-1603-71a0-b948-9b3de6aa0ec4",
  "workSessionId": "01a16bf9-15d5-7ef7-b931-59d344139afc",
  "taskId": "01a16bf9-133e-744b-ae65-17ea6ef32c8f",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": null,
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": null,
  "targetObservedAt": null,
  "targetEventId": null,
  "activeSeconds": 1200,
  "remainingSeconds": 900,
  "overtimeSeconds": 0,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 420,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 420,
  "version": 3,
  "workSessionVersion": 3,
  "serverNow": "2026-10-15T06:50:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "version": 4,
  "workSessionVersion": 3,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/01a16bf9-1603-71a0-b948-9b3de6aa0ec4/break
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf9-1603-71a0-b948-9b3de6aa0ec4",
  "workSessionId": "01a16bf9-15d5-7ef7-b931-59d344139afc",
  "taskId": "01a16bf9-133e-744b-ae65-17ea6ef32c8f",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Break",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": "2026-10-15T07:18:00+00:00",
  "breakStartedAt": "2026-10-15T07:18:00+00:00",
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": "2026-10-15T07:05:00+00:00",
  "targetObservedAt": "2026-10-15T07:18:00+00:00",
  "targetEventId": "01a16bf9-1603-71a0-b948-9b3de6aa0ec4",
  "activeSeconds": 2880,
  "remainingSeconds": 0,
  "overtimeSeconds": 780,
  "effectiveTargetReached": true,
  "breakTargetSeconds": 420,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 420,
  "version": 5,
  "workSessionVersion": 4,
  "serverNow": "2026-10-15T07:18:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "version": 6,
  "workSessionVersion": 4,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/01a16bf9-1603-71a0-b948-9b3de6aa0ec4/next
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf9-18b8-72d6-a8e6-e86f25ccd71b",
  "workSessionId": "01a16bf9-15d5-7ef7-b931-59d344139afc",
  "taskId": "01a16bf9-133e-744b-ae65-17ea6ef32c8f",
  "previousFocusId": "01a16bf9-1603-71a0-b948-9b3de6aa0ec4",
  "cycleNumber": 2,
  "state": "Working",
  "settings": {
    "workSeconds": 2100,
    "shortBreakSeconds": 420,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T07:25:00+00:00",
  "workEndedAt": null,
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": null,
  "targetObservedAt": null,
  "targetEventId": null,
  "activeSeconds": 0,
  "remainingSeconds": 2100,
  "overtimeSeconds": 0,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 420,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 420,
  "version": 1,
  "workSessionVersion": 5,
  "serverNow": "2026-10-15T07:25:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Mola sürüyor; bitmesini bekleyin veya açıkça atlayın.",
  "status": 409,
  "code": "focus_break_pending",
  "traceId": "00-cc0e3940442cf7139d18e5d16ce0e78e-c97ab018c0b8f337-00"
}
```

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
  "version": 2,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/01a16bfa-c36d-7035-9904-23a3066a5d4a/finish
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bfa-c36d-7035-9904-23a3066a5d4a",
  "workSessionId": "01a16bfa-c32c-76f7-9c4f-be3174eb8718",
  "taskId": "01a16bfa-c243-7e30-b7f2-54afb268944e",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Finished",
  "settings": {
    "workSeconds": 300,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": "2026-10-15T06:07:00+00:00",
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": "2026-10-15T06:07:00+00:00",
  "targetReachedAt": "2026-10-15T06:05:00+00:00",
  "targetObservedAt": "2026-10-15T06:07:00+00:00",
  "targetEventId": "01a16bfa-c36d-7035-9904-23a3066a5d4a",
  "activeSeconds": 420,
  "remainingSeconds": 0,
  "overtimeSeconds": 120,
  "effectiveTargetReached": true,
  "breakTargetSeconds": 300,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 300,
  "version": 3,
  "workSessionVersion": 2,
  "serverNow": "2026-10-15T06:07:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Odak veya çalışma oturumu değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-94af5332a0b62f724525770001464cb1-04708a200a7f8955-00"
}
```

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
  "version": 2,
  "workSessionVersion": 1,
  "skipBreak": false
}
```

**Örnek HTTP:**

```http
POST /api/focus-sessions/01a16bf9-2015-7233-95e7-e40394e42dfe/cancel
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bf9-2015-7233-95e7-e40394e42dfe",
  "workSessionId": "01a16bf9-1ffd-7e9a-b93d-cc320b87d305",
  "taskId": "01a16bf9-1e4e-7d2b-952a-4f09e5baef03",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Interrupted",
  "settings": {
    "workSeconds": 300,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": "2026-10-15T06:06:00+00:00",
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": "2026-10-15T06:06:00+00:00",
  "targetReachedAt": "2026-10-15T06:05:00+00:00",
  "targetObservedAt": "2026-10-15T06:06:00+00:00",
  "targetEventId": "01a16bf9-2015-7233-95e7-e40394e42dfe",
  "activeSeconds": 360,
  "remainingSeconds": 0,
  "overtimeSeconds": 60,
  "effectiveTargetReached": true,
  "breakTargetSeconds": 300,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 300,
  "version": 3,
  "workSessionVersion": 2,
  "serverNow": "2026-10-15T06:06:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/tasks/01a16bfe-6efe-7d12-820c-3d15d855fde2/time
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskTimeView](DTO-Sozlugu.md#tasktimeview).

```json
{
  "taskId": "01a16bfe-6efe-7d12-820c-3d15d855fde2",
  "directActualSeconds": 3600,
  "subtreeActualSeconds": 3600,
  "knownRemainingSeconds": 18000,
  "unknownRemainingCount": 0,
  "remainingSeconds": 18000,
  "knownOvertimeSeconds": 0,
  "unknownEstimateCount": 0,
  "serverNow": "2026-10-15T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Görev bulunamadı.",
  "status": 404,
  "code": "task_not_found",
  "traceId": "00-401c5875a96330b77d4c927ccb17c5e1-8a911fe183cc6f0d-00"
}
```

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
GET /api/work-sessions?state=Paused
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkPage](DTO-Sozlugu.md#workpage).

```json
{
  "items": [
    {
      "id": "01a16bfc-978b-7b15-9ff4-7cbf3a642647",
      "taskId": "01a16bfc-9734-764a-ac83-4982f48591bf",
      "state": "Paused",
      "source": "Timer",
      "startedAt": "2026-10-24T03:37:57.217471+00:00",
      "endedAt": null,
      "timeZoneId": "Europe/Istanbul",
      "taskAtStart": {
        "schemaVersion": 2,
        "taskId": "01a16bfc-9734-764a-ac83-4982f48591bf",
        "taskVersion": 2,
        "title": "Project",
        "ancestors": [],
        "project": null,
        "pool": null,
        "category": null,
        "tags": [],
        "inputPlanningVersion": 1,
        "capturedAt": "2026-10-24T03:37:57.217471+00:00"
      },
      "version": 2,
      "activeSeconds": 0,
      "serverNow": "2026-10-24T03:37:57.217471+00:00",
      "recordedAt": "2026-10-24T03:37:57.217471+00:00",
      "startedScheduleId": null,
      "startedRevisionItemId": null
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
  "title": "Gönderilen alanları kontrol edin.",
  "status": 400,
  "errors": {
    "Limit": [
      "The field Limit must be between 1 and 100."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URS3K"
}
```

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
    "id": "01a16c00-0537-7adf-9dda-93f7d32a7602",
    "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
    "state": "Running",
    "source": "Timer",
    "startedAt": "2026-10-15T06:00:00+00:00",
    "endedAt": null,
    "timeZoneId": "Europe/Istanbul",
    "taskAtStart": {
      "schemaVersion": 2,
      "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
      "taskVersion": 3,
      "title": "Adım A",
      "ancestors": [
        {
          "id": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
          "name": "Ana iş"
        }
      ],
      "project": {
        "id": "01a16bff-f9cc-704b-8c22-bc9255cd9718",
        "name": "Ürün"
      },
      "pool": {
        "id": "01a16bff-f976-7363-b68d-f97e5ceee1c4",
        "name": "Uzun vade"
      },
      "category": null,
      "tags": [],
      "inputPlanningVersion": 18,
      "capturedAt": "2026-10-15T06:00:00+00:00"
    },
    "version": 3,
    "activeSeconds": 2700,
    "serverNow": "2026-10-15T06:52:00+00:00",
    "recordedAt": "2026-10-15T06:00:00+00:00",
    "startedScheduleId": "01a16c00-044d-7f12-bc56-4071fb88e71b",
    "startedRevisionItemId": "01a16c00-0489-726a-be2d-58b8adadc16f"
  },
  "serverNow": "2026-10-15T06:52:00+00:00",
  "planningVersion": 22
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sunucu zamanı önceki kayıttan geride; tekrar deneyin.",
  "status": 409,
  "code": "server_clock_conflict",
  "traceId": "00-3e383567d64b51902f5f0c96b0dfa4aa-6a5630f276065239-00"
}
```

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
  "taskId": "01a16bf8-d240-7132-a803-dfe836d2c355",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": "2026-10-15T07:00:00+00:00",
  "reason": "Rapor fixture"
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
  "id": "01a16bf8-d526-7f61-9fe0-daed896f9f6d",
  "taskId": "01a16bf8-d240-7132-a803-dfe836d2c355",
  "state": "Finished",
  "source": "Manual",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": "2026-10-15T07:00:00+00:00",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bf8-d240-7132-a803-dfe836d2c355",
    "taskVersion": 3,
    "title": "Eski başlık",
    "ancestors": [],
    "project": {
      "id": "01a16bf8-d33e-73ff-913a-492185d72456",
      "name": "Proje"
    },
    "pool": null,
    "category": {
      "id": "01a16bf8-d2d4-7a38-8504-7f94421192b1",
      "name": "Eski kategori"
    },
    "tags": [],
    "inputPlanningVersion": 4,
    "capturedAt": "2026-10-15T09:00:00+00:00"
  },
  "version": 1,
  "activeSeconds": 3600,
  "serverNow": "2026-10-15T09:00:00+00:00",
  "recordedAt": "2026-10-15T09:00:00+00:00",
  "startedScheduleId": null,
  "startedRevisionItemId": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu anahtar başka bir komutta kullanılmış.",
  "status": 409,
  "code": "idempotency_conflict",
  "traceId": "00-fa4f55e6d7f4b9af354023f4385d702b-bde8b03447285067-00"
}
```

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
| `scheduleVersion` | Int64? | range:1..9,223372036854776E+18 |

**Request şeması:** [StartWorkRequest](DTO-Sozlugu.md#startworkrequest).

**Örnek request body:**

```json
{
  "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
  "scheduleId": "01a16c00-044d-7f12-bc56-4071fb88e71b",
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
  "id": "01a16c00-0537-7adf-9dda-93f7d32a7602",
  "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": null,
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
    "taskVersion": 3,
    "title": "Adım A",
    "ancestors": [
      {
        "id": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
        "name": "Ana iş"
      }
    ],
    "project": {
      "id": "01a16bff-f9cc-704b-8c22-bc9255cd9718",
      "name": "Ürün"
    },
    "pool": {
      "id": "01a16bff-f976-7363-b68d-f97e5ceee1c4",
      "name": "Uzun vade"
    },
    "category": null,
    "tags": [],
    "inputPlanningVersion": 18,
    "capturedAt": "2026-10-15T06:00:00+00:00"
  },
  "version": 1,
  "activeSeconds": 0,
  "serverNow": "2026-10-15T06:00:00+00:00",
  "recordedAt": "2026-10-15T06:00:00+00:00",
  "startedScheduleId": "01a16c00-044d-7f12-bc56-4071fb88e71b",
  "startedRevisionItemId": "01a16c00-0489-726a-be2d-58b8adadc16f"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Önce açık çalışmayı duraklatın veya bitirin.",
  "status": 409,
  "code": "work_already_running",
  "traceId": "00-4ce08cb9f317cd4edcbb621a216555a8-9b1f738713ff4082-00"
}
```

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
GET /api/work-sessions/01a16c00-0537-7adf-9dda-93f7d32a7602
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "01a16c00-0537-7adf-9dda-93f7d32a7602",
  "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
  "state": "Finished",
  "source": "Timer",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": "2026-10-15T06:52:00+00:00",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
    "taskVersion": 3,
    "title": "Adım A",
    "ancestors": [
      {
        "id": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
        "name": "Ana iş"
      }
    ],
    "project": {
      "id": "01a16bff-f9cc-704b-8c22-bc9255cd9718",
      "name": "Ürün"
    },
    "pool": {
      "id": "01a16bff-f976-7363-b68d-f97e5ceee1c4",
      "name": "Uzun vade"
    },
    "category": null,
    "tags": [],
    "inputPlanningVersion": 18,
    "capturedAt": "2026-10-15T06:00:00+00:00"
  },
  "version": 4,
  "activeSeconds": 2700,
  "serverNow": "2026-10-15T06:52:00+00:00",
  "recordedAt": "2026-10-15T06:00:00+00:00",
  "startedScheduleId": "01a16c00-044d-7f12-bc56-4071fb88e71b",
  "startedRevisionItemId": "01a16c00-0489-726a-be2d-58b8adadc16f"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Oturum bulunamadı.",
  "status": 404,
  "code": "session_not_found",
  "traceId": "00-9a95ea9f1e9cd2bc91f85a86ad7f622c-ba7486f26358bb42-00"
}
```

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
GET /api/work-sessions/01a16bfa-16f9-7271-b626-43a2a42518b4/corrections
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CorrectionPage](DTO-Sozlugu.md#correctionpage).

```json
{
  "items": [
    {
      "id": "01a16bfa-1778-728a-99f5-57e3f2f5f903",
      "sessionId": "01a16bfa-16f9-7271-b626-43a2a42518b4",
      "segmentId": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
      "sequence": 1,
      "kind": "ManualAdded",
      "reason": "Unutulan çalışma",
      "createdAt": "2026-10-15T09:00:00+00:00",
      "previousValues": null,
      "newValues": {
        "id": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "isVoided": false,
        "version": 1
      },
      "previousSession": null,
      "newSession": {
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "state": "Finished",
        "version": 1
      }
    },
    {
      "id": "01a16bfa-18f2-78ec-b9c4-c38f358d74c3",
      "sessionId": "01a16bfa-16f9-7271-b626-43a2a42518b4",
      "segmentId": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
      "sequence": 2,
      "kind": "Adjusted",
      "reason": "Sayaç açık unutuldu",
      "createdAt": "2026-10-15T09:00:00+00:00",
      "previousValues": {
        "id": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "isVoided": false,
        "version": 1
      },
      "newValues": {
        "id": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "isVoided": true,
        "version": 2
      },
      "previousSession": {
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "state": "Finished",
        "version": 1
      },
      "newSession": {
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "state": "Finished",
        "version": 2
      }
    },
    {
      "id": "01a16bfa-1969-7566-affd-deaa3c301dfc",
      "sessionId": "01a16bfa-16f9-7271-b626-43a2a42518b4",
      "segmentId": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
      "sequence": 3,
      "kind": "Adjusted",
      "reason": "Sayaç açık unutuldu",
      "createdAt": "2026-10-15T09:00:00+00:00",
      "previousValues": {
        "id": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "isVoided": true,
        "version": 2
      },
      "newValues": {
        "id": "01a16bfa-1778-7b2b-a6b5-442f674b55e3",
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T06:20:00+00:00",
        "isVoided": false,
        "version": 3
      },
      "previousSession": {
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T07:00:00+00:00",
        "state": "Finished",
        "version": 2
      },
      "newSession": {
        "startedAt": "2026-10-15T06:00:00+00:00",
        "endedAt": "2026-10-15T06:20:00+00:00",
        "state": "Finished",
        "version": 3
      }
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 3
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Oturum bulunamadı.",
  "status": 404,
  "code": "session_not_found",
  "traceId": "00-9cce6ef9f702ae5b4809dada950c13b9-d409b1549a034fc3-00"
}
```

## POST /api/work-sessions/{id}/finish

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/01a16bfc-1ef0-73b1-bd51-d6393782c019/finish
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "01a16bfc-1ef0-73b1-bd51-d6393782c019",
  "taskId": "01a16bfc-1bf1-7395-8914-3bbea0760c39",
  "state": "Finished",
  "source": "Timer",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": "2026-10-15T06:02:00+00:00",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bfc-1bf1-7395-8914-3bbea0760c39",
    "taskVersion": 3,
    "title": "Step",
    "ancestors": [
      {
        "id": "01a16bfc-1aec-7d14-a449-1a92ea458890",
        "name": "Project"
      }
    ],
    "project": null,
    "pool": null,
    "category": null,
    "tags": [],
    "inputPlanningVersion": 5,
    "capturedAt": "2026-10-15T06:00:00+00:00"
  },
  "version": 2,
  "activeSeconds": 120,
  "serverNow": "2026-10-15T06:02:00+00:00",
  "recordedAt": "2026-10-15T06:00:00+00:00",
  "startedScheduleId": null,
  "startedRevisionItemId": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sunucu zamanı önceki kayıttan geride; tekrar deneyin.",
  "status": 409,
  "code": "server_clock_conflict",
  "traceId": "00-f0cdc504b84af6b1d7cdec5f162533bb-df0b3c8a2c98ef03-00"
}
```

## POST /api/work-sessions/{id}/pause

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/01a16bfc-8631-70fc-adaa-5a8107e7c516/pause
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "01a16bfc-8631-70fc-adaa-5a8107e7c516",
  "taskId": "01a16bfc-852d-7a1d-80bf-77377cbbdba7",
  "state": "Paused",
  "source": "Timer",
  "startedAt": "2026-10-15T06:00:00+00:00",
  "endedAt": null,
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bfc-852d-7a1d-80bf-77377cbbdba7",
    "taskVersion": 2,
    "title": "Step",
    "ancestors": [
      {
        "id": "01a16bfc-83c0-784d-b305-0c10bb244f92",
        "name": "Project"
      }
    ],
    "project": null,
    "pool": null,
    "category": null,
    "tags": [],
    "inputPlanningVersion": 3,
    "capturedAt": "2026-10-15T06:00:00+00:00"
  },
  "version": 2,
  "activeSeconds": 120,
  "serverNow": "2026-10-15T06:02:00+00:00",
  "recordedAt": "2026-10-15T06:00:00+00:00",
  "startedScheduleId": null,
  "startedRevisionItemId": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Oturum değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-eb391cddab18bbd6779efd84d431853a-b631dc434197d5aa-00"
}
```

## POST /api/work-sessions/{id}/resume

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [WorkTransitionRequest](DTO-Sozlugu.md#worktransitionrequest).

**Örnek request body:**

```json
{
  "version": 2
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/01a16bfc-3a98-770d-ad94-93f39340767d/resume
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "01a16bfc-3a98-770d-ad94-93f39340767d",
  "taskId": "01a16bfc-39f6-7021-8cf1-2f9b9c28f409",
  "state": "Running",
  "source": "Timer",
  "startedAt": "2026-10-24T03:37:33.458589+00:00",
  "endedAt": null,
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bfc-39f6-7021-8cf1-2f9b9c28f409",
    "taskVersion": 2,
    "title": "Project",
    "ancestors": [],
    "project": null,
    "pool": null,
    "category": null,
    "tags": [],
    "inputPlanningVersion": 2,
    "capturedAt": "2026-10-24T03:37:33.458589+00:00"
  },
  "version": 3,
  "activeSeconds": 0,
  "serverNow": "2026-10-24T03:37:33.458589+00:00",
  "recordedAt": "2026-10-24T03:37:33.458589+00:00",
  "startedScheduleId": null,
  "startedRevisionItemId": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Önce açık çalışmayı duraklatın veya bitirin.",
  "status": 409,
  "code": "work_already_running",
  "traceId": "00-d967dc5d23eaf0f2830eecd54b6d3ee4-2eed7327cb1f860a-00"
}
```

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
GET /api/work-sessions/01a16bf9-47c3-7f7e-a455-7b8f20325927/segments
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SegmentPage](DTO-Sozlugu.md#segmentpage).

```json
{
  "items": [
    {
      "id": "01a16bf9-47d6-7c15-ab55-f8992a6b1ff6",
      "startedAt": "2026-10-15T06:00:00+00:00",
      "endedAt": "2026-10-15T06:05:00+00:00",
      "isVoided": false,
      "version": 2
    },
    {
      "id": "01a16bf9-4b07-71ed-aa74-b454a71f71d4",
      "startedAt": "2026-10-15T06:10:00+00:00",
      "endedAt": null,
      "isVoided": false,
      "version": 1
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Oturum bulunamadı.",
  "status": 404,
  "code": "session_not_found",
  "traceId": "00-a88a3702e913eaecb5a21b9802f423ed-7e74e28335a57d1b-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `segmentVersion` | Int64 | range:1..9,223372036854776E+18 |
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
  "startedAt": "2026-10-14T20:30:00+00:00",
  "endedAt": "2026-10-14T21:00:00.123456+00:00",
  "isVoided": false,
  "reason": "Düzeltme"
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/01a16bf8-a974-7f1c-b447-762bb03260b0/segments/01a16bf8-a982-7e68-8080-814616aeb0ef/corrections
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [WorkView](DTO-Sozlugu.md#workview).

```json
{
  "id": "01a16bf8-a974-7f1c-b447-762bb03260b0",
  "taskId": "01a16bf8-a8a0-7a2b-b256-ddcd10e29a4c",
  "state": "Finished",
  "source": "Manual",
  "startedAt": "2026-10-14T20:30:00+00:00",
  "endedAt": "2026-10-14T21:00:00.123456+00:00",
  "timeZoneId": "Europe/Istanbul",
  "taskAtStart": {
    "schemaVersion": 2,
    "taskId": "01a16bf8-a8a0-7a2b-b256-ddcd10e29a4c",
    "taskVersion": 2,
    "title": "Project",
    "ancestors": [],
    "project": null,
    "pool": null,
    "category": null,
    "tags": [],
    "inputPlanningVersion": 1,
    "capturedAt": "2026-10-15T06:00:00+00:00"
  },
  "version": 2,
  "activeSeconds": 1800.123456,
  "serverNow": "2026-10-15T06:00:00+00:00",
  "recordedAt": "2026-10-15T06:00:00+00:00",
  "startedScheduleId": null,
  "startedRevisionItemId": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Çalışma kaydı değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-bfa2bbd1fff4a2a55a352fa6fa37d726-d14bab58ded3c4a8-00"
}
```

# Tekrarlayan görevler

Şablon, immutable definition ve tarihli occurrence ayrıdır. Aynı template/localDate daima aynı TaskId; disabled template geçmişi silmez. Materialize1..93gün, key ve template version ister. Daily/IntervalDays/Weekly/Monthly; ay29..31 için Skip/Clamp, DST gap/overlap için açık policy alanları vardır. localDueTime bir deadline’dır; otomatik plan bloğu yaratmaz. UpdateFuture geçmişi/çalışılmış/planlanmış/manuel değiştirilmiş örneği korur; refresh açık bounded pencere ister. Skip/cancel marker’ı üretilmemiş tarihi de engelleyebilir; ordinary reopen aynı task kimliğinde kalır. [Kesin seri/DST sözleşmesi](../recurrence.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/recurrence-templates

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/recurrence-templates?limit=1
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceTemplatePage](DTO-Sozlugu.md#recurrencetemplatepage).

```json
{
  "items": [
    {
      "id": "01a16bfd-2600-7df6-9c57-6a781075d1e7",
      "enabled": false,
      "version": 2,
      "definitionId": "01a16bfd-2600-7a22-af09-753b2c6233ec",
      "definitionNumber": 1,
      "effectiveFrom": "2026-10-15",
      "rule": {
        "startDate": "2026-10-15",
        "timeZoneId": "Europe/Istanbul",
        "frequency": "Daily",
        "interval": 1,
        "weekDays": [],
        "monthDay": null,
        "monthEnd": null,
        "untilDate": null,
        "dueTime": null,
        "gap": "Reject",
        "overlap": "Reject"
      },
      "task": {
        "title": "Tekrar",
        "description": null,
        "estimatedSeconds": 3600,
        "priority": "Normal",
        "canSplit": true,
        "poolId": null,
        "energyDemand": null
      },
      "createdAt": "2026-10-15T06:00:00+00:00"
    }
  ],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/recurrence-templates

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `rule` | RecurrenceRule | DTO/modül iş kuralı |
| `task` | RecurringTaskDefaults | DTO/modül iş kuralı |

**Request şeması:** [RecurrenceCreate](DTO-Sozlugu.md#recurrencecreate).

**Örnek request body:**

```json
{
  "rule": {
    "startDate": "2026-10-14",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "Weekly",
    "interval": 2,
    "weekDays": [
      1,
      3
    ],
    "monthDay": null,
    "monthEnd": null,
    "untilDate": null,
    "dueTime": null,
    "gap": "Reject",
    "overlap": "Reject"
  },
  "task": {
    "title": "Tekrar",
    "description": null,
    "estimatedSeconds": 3600,
    "priority": "Normal",
    "canSplit": true,
    "poolId": null,
    "energyDemand": null
  }
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-0dc5-790e-86cb-7eeb9b756eb3",
    "enabled": true,
    "version": 1,
    "definitionId": "01a16bfd-0dc5-71ec-bc36-69d9cce34f0c",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-14",
    "rule": {
      "startDate": "2026-10-14",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Weekly",
      "interval": 2,
      "weekDays": [
        1,
        3
      ],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Tekrar",
      "description": null,
      "estimatedSeconds": 3600,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Idempotency-Key gerekli; en çok128 karakter.",
  "status": 400,
  "code": "idempotency_key_required",
  "traceId": "00-8e42aad79d90cbb356d153d2361d1720-59cdb179758d1992-00"
}
```

## GET /api/recurrence-templates/projection

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Yazmaz. Etkin ve autoAddToPlan açık rutinlerin bugünden itibaren gerçek kaydı olmayan günlerini kuraldan hesaplar. Sonuç plan veya kapasite değildir; startTime yerel saattir. Aralık en çok 42 gün. Gün için skip ve materialize mevcut uçlardır.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `FromDate` | query | hayır | string (date); — |
| `ToDate` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/recurrence-templates/projection
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceProjectionView](DTO-Sozlugu.md#recurrenceprojectionview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "items": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/recurrence-templates/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/recurrence-templates/01a16bfd-2fe7-786e-9786-38e40f011238
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceTemplateView](DTO-Sozlugu.md#recurrencetemplateview).

```json
{
  "id": "01a16bfd-2fe7-786e-9786-38e40f011238",
  "enabled": true,
  "version": 1,
  "definitionId": "01a16bfd-2fe7-7f5f-bee4-73313af4486c",
  "definitionNumber": 1,
  "effectiveFrom": "2026-10-15",
  "rule": {
    "startDate": "2026-10-15",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "Daily",
    "interval": 1,
    "weekDays": [],
    "monthDay": null,
    "monthEnd": null,
    "untilDate": null,
    "dueTime": null,
    "gap": "Reject",
    "overlap": "Reject"
  },
  "task": {
    "title": "Tekrar",
    "description": null,
    "estimatedSeconds": 3600,
    "priority": "Normal",
    "canSplit": true,
    "poolId": null,
    "energyDemand": null
  },
  "createdAt": "2026-10-15T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/recurrence-templates/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `effectiveFrom` | DateOnly | DTO/modül iş kuralı |
| `rule` | RecurrenceRule | DTO/modül iş kuralı |
| `task` | RecurringTaskDefaults | DTO/modül iş kuralı |
| `refreshExisting` | Boolean | DTO/modül iş kuralı |
| `refreshThrough` | DateOnly? | DTO/modül iş kuralı |

**Request şeması:** [RecurrenceUpdate](DTO-Sozlugu.md#recurrenceupdate).

**Örnek request body:**

```json
{
  "version": 1,
  "effectiveFrom": "2026-10-16",
  "rule": {
    "startDate": "2026-10-15",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "IntervalDays",
    "interval": 2,
    "weekDays": null,
    "monthDay": null,
    "monthEnd": null,
    "untilDate": null,
    "dueTime": null,
    "gap": "Reject",
    "overlap": "Reject"
  },
  "task": {
    "title": "Yeni seri",
    "description": null,
    "estimatedSeconds": 1800,
    "priority": "Normal",
    "canSplit": true,
    "poolId": null,
    "energyDemand": null
  },
  "refreshExisting": true,
  "refreshThrough": "2026-10-20"
}
```

**Örnek HTTP:**

```http
PUT /api/recurrence-templates/01a16bfd-3a17-798c-9c59-c59dbe2024b9
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
    "enabled": true,
    "version": 2,
    "definitionId": "01a16bfd-3e5e-7396-b7fd-0931296e698c",
    "definitionNumber": 2,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "IntervalDays",
      "interval": 2,
      "weekDays": [],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Yeni seri",
      "description": null,
      "estimatedSeconds": 1800,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [
    {
      "id": "01a16bfd-3a93-70cb-90ea-f48926e01174",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-16",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a93-78eb-9692-acd4663051ad",
      "taskState": "Completed",
      "taskVersion": 2,
      "taskChangedSinceSync": true,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7f8f-b861-4f1db757166b",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-17",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-73ce-b8fb-f0747641addd",
      "taskState": "Pending",
      "taskVersion": 2,
      "taskChangedSinceSync": true,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-785e-9803-e12b3f03eb38",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-18",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-7987-b04e-2974e64dfd50",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7cd1-a906-5d4e40fe4730",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3e5e-7396-b7fd-0931296e698c",
      "localDate": "2026-10-19",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-7578-847d-c456dad34312",
      "taskState": "Pending",
      "taskVersion": 2,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7b07-9815-e003bdf2272c",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-20",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-79fa-9656-e45b5e5ef4ee",
      "taskState": "Pending",
      "taskVersion": 2,
      "taskChangedSinceSync": true,
      "state": "Materialized",
      "reason": null
    }
  ],
  "refreshedTaskIds": [
    "01a16bfd-3a94-7578-847d-c456dad34312"
  ],
  "protectedTaskIds": [
    "01a16bfd-3a93-78eb-9692-acd4663051ad",
    "01a16bfd-3a94-73ce-b8fb-f0747641addd",
    "01a16bfd-3a94-7987-b04e-2974e64dfd50",
    "01a16bfd-3a94-79fa-9656-e45b5e5ef4ee"
  ],
  "planningVersion": 6,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Tekrar şablonu değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-5209981e24398833a6eab06dba5733a2-8aa3fe841854e2af-00"
}
```

## GET /api/recurrence-templates/{id}/definitions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/recurrence-templates/01a16bfd-3a17-798c-9c59-c59dbe2024b9/definitions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceDefinitionPage](DTO-Sozlugu.md#recurrencedefinitionpage).

```json
{
  "items": [
    {
      "id": "01a16bfd-3e5e-7396-b7fd-0931296e698c",
      "number": 2,
      "effectiveFrom": "2026-10-16",
      "rule": {
        "startDate": "2026-10-15",
        "timeZoneId": "Europe/Istanbul",
        "frequency": "IntervalDays",
        "interval": 2,
        "weekDays": [],
        "monthDay": null,
        "monthEnd": null,
        "untilDate": null,
        "dueTime": null,
        "gap": "Reject",
        "overlap": "Reject"
      },
      "task": {
        "title": "Yeni seri",
        "description": null,
        "estimatedSeconds": 1800,
        "priority": "Normal",
        "canSplit": true,
        "poolId": null,
        "energyDemand": null
      },
      "createdAt": "2026-10-16T06:00:00+00:00"
    },
    {
      "id": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "number": 1,
      "effectiveFrom": "2026-10-15",
      "rule": {
        "startDate": "2026-10-15",
        "timeZoneId": "Europe/Istanbul",
        "frequency": "Daily",
        "interval": 1,
        "weekDays": [],
        "monthDay": null,
        "monthEnd": null,
        "untilDate": null,
        "dueTime": null,
        "gap": "Reject",
        "overlap": "Reject"
      },
      "task": {
        "title": "Tekrar",
        "description": null,
        "estimatedSeconds": 3600,
        "priority": "Normal",
        "canSplit": true,
        "poolId": null,
        "energyDemand": null
      },
      "createdAt": "2026-10-15T06:00:00+00:00"
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
  "title": "Tekrar kaydı bulunamadı.",
  "status": 404,
  "code": "recurrence_not_found",
  "traceId": "00-6f26f66e857663b9215fff10d48cc1b2-1cac09aac0d0455b-00"
}
```

## PUT /api/recurrence-templates/{id}/enabled

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `enabled` | Boolean? | required |

**Request şeması:** [RecurrenceEnableRequest](DTO-Sozlugu.md#recurrenceenablerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "enabled": false
}
```

**Örnek HTTP:**

```http
PUT /api/recurrence-templates/01a16bfd-2600-7df6-9c57-6a781075d1e7/enabled
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-2600-7df6-9c57-6a781075d1e7",
    "enabled": false,
    "version": 2,
    "definitionId": "01a16bfd-2600-7a22-af09-753b2c6233ec",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-15",
    "rule": {
      "startDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": [],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Tekrar",
      "description": null,
      "estimatedSeconds": 3600,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 1,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/recurrence-templates/{id}/materialize

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** 1..93gün; aynı template/localDate duplicate task üretmez. Eski template version409; key farklı payload’la tekrar kullanılamaz.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `fromDate` | DateOnly | DTO/modül iş kuralı |
| `toDate` | DateOnly | DTO/modül iş kuralı |

**Request şeması:** [MaterializeRecurrence](DTO-Sozlugu.md#materializerecurrence).

**Örnek request body:**

```json
{
  "version": 1,
  "fromDate": "2026-10-15",
  "toDate": "2026-10-20"
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/01a16bfd-3a17-798c-9c59-c59dbe2024b9/materialize
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
    "enabled": true,
    "version": 1,
    "definitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-15",
    "rule": {
      "startDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": [],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Tekrar",
      "description": null,
      "estimatedSeconds": 3600,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [
    {
      "id": "01a16bfd-3a93-768e-9744-54257ca32734",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-15",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a93-7024-aa9b-c8da631ef523",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a93-70cb-90ea-f48926e01174",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-16",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a93-78eb-9692-acd4663051ad",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7f8f-b861-4f1db757166b",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-17",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-73ce-b8fb-f0747641addd",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-785e-9803-e12b3f03eb38",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-18",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-7987-b04e-2974e64dfd50",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7cd1-a906-5d4e40fe4730",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-19",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-7578-847d-c456dad34312",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    },
    {
      "id": "01a16bfd-3a94-7b07-9815-e003bdf2272c",
      "templateId": "01a16bfd-3a17-798c-9c59-c59dbe2024b9",
      "originalDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "appliedDefinitionId": "01a16bfd-3a17-791b-8dca-c8233b76cfcb",
      "localDate": "2026-10-20",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-3a94-79fa-9656-e45b5e5ef4ee",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    }
  ],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 1,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Şablon pasif; yeni örnek üretilmez.",
  "status": 409,
  "code": "recurrence_disabled",
  "traceId": "00-05ce8b1977f6cb061d25a32a6d55410e-56d32e6fbfa3a33e-00"
}
```

## GET /api/recurrence-templates/{id}/occurrences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `FromDate` | query | hayır | string (date); — |
| `ToDate` | query | hayır | string (date); — |
| `Offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/recurrence-templates/01a16bfd-2600-7df6-9c57-6a781075d1e7/occurrences?fromDate=2026-10-15&toDate=2026-10-17&limit=1
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OccurrencePage](DTO-Sozlugu.md#occurrencepage).

```json
{
  "items": [
    {
      "id": "01a16bfd-2665-71fe-87a1-819b03bf4480",
      "templateId": "01a16bfd-2600-7df6-9c57-6a781075d1e7",
      "originalDefinitionId": "01a16bfd-2600-7a22-af09-753b2c6233ec",
      "appliedDefinitionId": "01a16bfd-2600-7a22-af09-753b2c6233ec",
      "localDate": "2026-10-15",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-2665-7671-afdc-3f535d803c47",
      "taskState": "Pending",
      "taskVersion": 1,
      "taskChangedSinceSync": false,
      "state": "Materialized",
      "reason": null
    }
  ],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/recurrence-templates/{id}/occurrences/{date}/cancel

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

**Ek entegrasyon kuralı:** Body version template versiondır; occurrence taskı varsa taskVersion da gerekir. Üretilmemiş örnekte taskVersion verilmez. Geçmiş/completed/arşivlenmiş instance korunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `taskVersion` | Int64? | DTO/modül iş kuralı |

**Request şeması:** [ChangeOccurrence](DTO-Sozlugu.md#changeoccurrence).

**Örnek request body:**

```json
{
  "version": 1,
  "taskVersion": null
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/01a16bfd-2fe7-786e-9786-38e40f011238/occurrences/2026-10-17/cancel
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-2fe7-786e-9786-38e40f011238",
    "enabled": true,
    "version": 1,
    "definitionId": "01a16bfd-2fe7-7f5f-bee4-73313af4486c",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-15",
    "rule": {
      "startDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": [],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Tekrar",
      "description": null,
      "estimatedSeconds": 3600,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [
    {
      "id": "01a16bfd-30e8-7ea8-b9de-88e653a92f0e",
      "templateId": "01a16bfd-2fe7-786e-9786-38e40f011238",
      "originalDefinitionId": "01a16bfd-2fe7-7f5f-bee4-73313af4486c",
      "appliedDefinitionId": "01a16bfd-2fe7-7f5f-bee4-73313af4486c",
      "localDate": "2026-10-17",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": null,
      "taskState": null,
      "taskVersion": null,
      "taskChangedSinceSync": false,
      "state": "Canceled",
      "reason": "User"
    }
  ],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/recurrence-templates/{id}/occurrences/{date}/skip

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.

**Ek entegrasyon kuralı:** Body version template versiondır; occurrence taskı varsa taskVersion da gerekir. Üretilmemiş örnekte taskVersion verilmez. Geçmiş/completed/arşivlenmiş instance korunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `taskVersion` | Int64? | DTO/modül iş kuralı |

**Request şeması:** [ChangeOccurrence](DTO-Sozlugu.md#changeoccurrence).

**Örnek request body:**

```json
{
  "version": 1,
  "taskVersion": 2
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/01a16bfd-51c1-7ecb-b006-4f2c3be52df6/occurrences/2026-10-15/skip
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceEffect](DTO-Sozlugu.md#recurrenceeffect).

```json
{
  "template": {
    "id": "01a16bfd-51c1-7ecb-b006-4f2c3be52df6",
    "enabled": true,
    "version": 1,
    "definitionId": "01a16bfd-51c1-7626-a4b4-9c201626872b",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-15",
    "rule": {
      "startDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": [],
      "monthDay": null,
      "monthEnd": null,
      "untilDate": null,
      "dueTime": null,
      "gap": "Reject",
      "overlap": "Reject"
    },
    "task": {
      "title": "Tekrar",
      "description": null,
      "estimatedSeconds": 3600,
      "priority": "Normal",
      "canSplit": true,
      "poolId": null,
      "energyDemand": null
    },
    "createdAt": "2026-10-15T06:00:00+00:00"
  },
  "occurrences": [
    {
      "id": "01a16bfd-52c4-7a2e-ad09-2a289d80da41",
      "templateId": "01a16bfd-51c1-7ecb-b006-4f2c3be52df6",
      "originalDefinitionId": "01a16bfd-51c1-7626-a4b4-9c201626872b",
      "appliedDefinitionId": "01a16bfd-51c1-7626-a4b4-9c201626872b",
      "localDate": "2026-10-15",
      "originalTimeZoneId": "Europe/Istanbul",
      "originalDueTime": null,
      "originalDueAt": null,
      "timeAdjusted": false,
      "taskId": "01a16bfd-52c4-762c-a8d8-dc951a577e71",
      "taskState": "Skipped",
      "taskVersion": 3,
      "taskChangedSinceSync": true,
      "state": "Skipped",
      "reason": "User"
    }
  ],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 4,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/recurrence

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/01a16bfd-52c4-762c-a8d8-dc951a577e71/recurrence
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OccurrenceView](DTO-Sozlugu.md#occurrenceview).

```json
{
  "id": "01a16bfd-52c4-7a2e-ad09-2a289d80da41",
  "templateId": "01a16bfd-51c1-7ecb-b006-4f2c3be52df6",
  "originalDefinitionId": "01a16bfd-51c1-7626-a4b4-9c201626872b",
  "appliedDefinitionId": "01a16bfd-51c1-7626-a4b4-9c201626872b",
  "localDate": "2026-10-15",
  "originalTimeZoneId": "Europe/Istanbul",
  "originalDueTime": null,
  "originalDueAt": null,
  "timeAdjusted": false,
  "taskId": "01a16bfd-52c4-762c-a8d8-dc951a577e71",
  "taskState": "Pending",
  "taskVersion": 4,
  "taskChangedSinceSync": true,
  "state": "Materialized",
  "reason": "User"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Tekrar kaydı bulunamadı.",
  "status": 404,
  "code": "occurrence_not_found",
  "traceId": "00-dcfc600cf56d04ec251beefbf77ed9ea-497035f0bac38b10-00"
}
```

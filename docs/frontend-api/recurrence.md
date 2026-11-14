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
GET /api/recurrence-templates
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceTemplatePage](DTO-Sozlugu.md#recurrencetemplatepage).

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
    "startDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "Daily",
    "interval": 1,
    "weekDays": null,
    "monthDay": 1,
    "monthEnd": "Skip",
    "untilDate": "2026-10-16",
    "dueTime": "örnek",
    "gap": "Reject",
    "overlap": "Reject",
    "startTime": "örnek",
    "autoAddToPlan": false
  },
  "task": {
    "title": "Raporu yaz",
    "description": "örnek",
    "estimatedSeconds": 1,
    "priority": "Low",
    "canSplit": true,
    "poolId": "11111111-1111-4111-8111-111111111111",
    "energyDemand": "Low"
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
GET /api/recurrence-templates/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceTemplateView](DTO-Sozlugu.md#recurrencetemplateview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "enabled": false,
  "version": 1,
  "definitionId": "11111111-1111-4111-8111-111111111111",
  "definitionNumber": 1,
  "effectiveFrom": "2026-10-16",
  "rule": {
    "startDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "Daily",
    "interval": 1,
    "weekDays": null,
    "monthDay": 1,
    "monthEnd": "Skip",
    "untilDate": "2026-10-16",
    "dueTime": "örnek",
    "gap": "Reject",
    "overlap": "Reject",
    "startTime": "örnek",
    "autoAddToPlan": false
  },
  "task": {
    "title": "Raporu yaz",
    "description": "örnek",
    "estimatedSeconds": 1,
    "priority": "Low",
    "canSplit": true,
    "poolId": "11111111-1111-4111-8111-111111111111",
    "energyDemand": "Low"
  },
  "createdAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
    "startDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "frequency": "Daily",
    "interval": 1,
    "weekDays": null,
    "monthDay": 1,
    "monthEnd": "Skip",
    "untilDate": "2026-10-16",
    "dueTime": "örnek",
    "gap": "Reject",
    "overlap": "Reject",
    "startTime": "örnek",
    "autoAddToPlan": false
  },
  "task": {
    "title": "Raporu yaz",
    "description": "örnek",
    "estimatedSeconds": 1,
    "priority": "Low",
    "canSplit": true,
    "poolId": "11111111-1111-4111-8111-111111111111",
    "energyDemand": "Low"
  },
  "refreshExisting": false,
  "refreshThrough": "2026-10-16"
}
```

**Örnek HTTP:**

```http
PUT /api/recurrence-templates/11111111-1111-4111-8111-111111111111
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
GET /api/recurrence-templates/11111111-1111-4111-8111-111111111111/definitions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceDefinitionPage](DTO-Sozlugu.md#recurrencedefinitionpage).

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
| `version` | Int64 | range:1..9.223372036854776E+18 |
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
PUT /api/recurrence-templates/11111111-1111-4111-8111-111111111111/enabled
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16"
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/11111111-1111-4111-8111-111111111111/materialize
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
GET /api/recurrence-templates/11111111-1111-4111-8111-111111111111/occurrences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OccurrencePage](DTO-Sozlugu.md#occurrencepage).

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
  "taskVersion": 1
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/11111111-1111-4111-8111-111111111111/occurrences/11111111-1111-4111-8111-111111111111/cancel
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "taskVersion": 1
}
```

**Örnek HTTP:**

```http
POST /api/recurrence-templates/11111111-1111-4111-8111-111111111111/occurrences/11111111-1111-4111-8111-111111111111/skip
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
    "id": "11111111-1111-4111-8111-111111111111",
    "enabled": false,
    "version": 1,
    "definitionId": "11111111-1111-4111-8111-111111111111",
    "definitionNumber": 1,
    "effectiveFrom": "2026-10-16",
    "rule": {
      "startDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "frequency": "Daily",
      "interval": 1,
      "weekDays": null,
      "monthDay": 1,
      "monthEnd": "Skip",
      "untilDate": "2026-10-16",
      "dueTime": "örnek",
      "gap": "Reject",
      "overlap": "Reject",
      "startTime": "örnek",
      "autoAddToPlan": false
    },
    "task": {
      "title": "Raporu yaz",
      "description": "örnek",
      "estimatedSeconds": 1,
      "priority": "Low",
      "canSplit": true,
      "poolId": "11111111-1111-4111-8111-111111111111",
      "energyDemand": "Low"
    },
    "createdAt": "2026-10-16T06:00:00Z"
  },
  "occurrences": [],
  "refreshedTaskIds": [],
  "protectedTaskIds": [],
  "planningVersion": 0,
  "replayed": false,
  "retractedDayItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
GET /api/tasks/11111111-1111-4111-8111-111111111111/recurrence
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [OccurrenceView](DTO-Sozlugu.md#occurrenceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "templateId": "11111111-1111-4111-8111-111111111111",
  "originalDefinitionId": "11111111-1111-4111-8111-111111111111",
  "appliedDefinitionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "originalTimeZoneId": "örnek",
  "originalDueTime": "örnek",
  "originalDueAt": "2026-10-16T06:00:00Z",
  "timeAdjusted": false,
  "taskId": "11111111-1111-4111-8111-111111111111",
  "taskState": "Pending",
  "taskVersion": 1,
  "taskChangedSinceSync": false,
  "state": "Materialized",
  "reason": "Takvim düzenlendi"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

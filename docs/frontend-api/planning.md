# Manuel plan, motor, acil iş, revizyon ve undo

İlk Work içeren kabul edilmiş tam revision baseline olur; preview bunu değiştirmez. Her önemli accepted blok değişimi yeni tam snapshot/delta/ChangeSet üretir. TaskSchedule plan, WorkSession gerçekleşendir. Motor deterministik sezgiseldir; Unplaced ve warnings normal sonuç olabilir. CanApply/HasConstraintConflicts/Unplaced birlikte okunur. IsPartial alanı undo’nun kısmi telafisini belirtir; kapasiteye sığmama Unplaced içindedir. Apply key ile görev/ayar/plan/session ve zamana bağlı sürümleri yeniden doğrular;409’da yeni preview alın. Default HTTP preview başlangıcı serverNow+30sn’nin sonraki dakikaya yuvarlanmasıdır; yanıtın gerçek saatini kullanın. Normal replan aktif işi kesmez; start-now açık kesme niyetidir. Preview modunda acil gerçek çalışma hemen başlar, kalan plan ayrıca onaylanır; reddetmek work’ü silmez. Multi-day en çok31 gün, aynı TaskId ve atomik ChangeSet; undo kör DB restore değil yeni telafi revision’ıdır. [Manuel plan](../manual-planning.md), [motor/apply](../scheduling-coordinator.md), [acil iş](../immediate-work.md), [undo](../plan-undo.md), [çok gün](../multi-day-planning.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/daily-plans/{date}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DailyPlanView](DTO-Sozlugu.md#dailyplanview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "currentRevisionId": "11111111-1111-4111-8111-111111111111",
  "baselineRevisionId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "planningVersion": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/daily-plans/{date}/entries

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** scope=Single varsayılanı yalnız seçileni ekler. Mevcut kökte scope=Subtree kendisi ve uygun alt ağacı tek işlemde ekler (en çok2000 görev); mevcut tekil/saatli kayıtlar kimlik ve saatlerini koruyarak gruba katılır, fazladan kopya oluşmaz. Tekrar seçim eksikleri uzlaştırır; geçmiş günler sonradan değişmez. UI-R4: taskId veya title tam biri; expectedPlanningVersion ve zorunlu Idempotency-Key. Yeni görev+day item tek transaction. IsUrgent yalnız plana ekler, çalışma/focus başlatmaz veya duraklatmaz. Başlangıç serverNow yerel dakikası; bitiş null. Aynı key aynı makbuz; farklı payload409. Normal ekleme saatsiz; öncelik/efor yalnız yeni görev içindir. Undo day-items/undo üzerinden; geçmiş korunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `title` | String | length:0..300 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `isUrgent` | Boolean | DTO/modül iş kuralı |
| `scope` | PlanEntryScope | DTO/modül iş kuralı |
| `priority` | TaskPriority | DTO/modül iş kuralı |
| `energyDemand` | EnergyLevel? | DTO/modül iş kuralı |

**Request şeması:** [AddPlanEntryRequest](DTO-Sozlugu.md#addplanentryrequest).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "expectedPlanningVersion": 0,
  "isUrgent": false,
  "scope": "Single",
  "priority": "Low",
  "energyDemand": "Low"
}
```

**Örnek HTTP:**

```http
POST /api/daily-plans/11111111-1111-4111-8111-111111111111/entries
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanEntryResult](DTO-Sozlugu.md#planentryresult).

```json
{
  "item": {
    "id": "11111111-1111-4111-8111-111111111111",
    "localDate": "2026-10-16",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "sortOrder": 1,
    "completedAt": "2026-10-16T06:00:00Z",
    "version": 1,
    "taskTitle": "örnek",
    "parentTaskId": "11111111-1111-4111-8111-111111111111",
    "parentTitle": "örnek",
    "directEstimatedSeconds": 1,
    "taskState": "Pending",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "startsAt": "2026-10-16T06:00:00Z",
    "endsAt": "2026-10-16T06:25:00Z",
    "isUrgent": false,
    "priority": "Low",
    "energyDemand": "Low",
    "timingIssue": "örnek",
    "groupTaskId": "11111111-1111-4111-8111-111111111111",
    "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
  },
  "replayed": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/daily-plans/{date}/glance

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111/glance
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayGlanceView](DTO-Sozlugu.md#dayglanceview).

```json
{
  "localDate": "2026-10-16",
  "workingRemainingSeconds": 1,
  "plannedRemainingSeconds": 1,
  "unknownEstimateCount": 1,
  "completedItemCount": 1,
  "openItemCount": 1,
  "actualSeconds": 1,
  "overCapacity": false,
  "hints": [],
  "planningVersion": 0,
  "serverNow": "2026-10-16T06:00:00Z",
  "unboundedItemCount": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/daily-plans/{date}/items

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R2 saatsiz gün öğeleri: yalnız Planned durumundakiler sortOrder sırasıyla; silinmiş/arşivli görevin öğesi düşer. UI-R3 değişiklikleri revision/undo ve planningVersion üretir; yalnız okuma sürüm değiştirmez. UI-R4 startsAt/endsAt/isUrgent/priority/energyDemand/timingIssue projeksiyonu vardır; bitişsiz süre sıfır kabul edilmez. taskTitle/parentTitle/directEstimatedSeconds güncel görevden okunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayItemPage](DTO-Sozlugu.md#dayitempage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "groups": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/daily-plans/{date}/items

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Açık, arşivsiz görevi (kapsayıcı dahil) güne saatsiz ekler; kapalı görev409 task_not_plannable. Aynı gün aynı görev için tek Planned öğe vardır:409 day_item_exists. Idempotency-Key yoktur; belirsiz sonuçta yeniden göndermeyin, listeyi GET ile okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | required |
| `placement` | DayItemPlacement? | DTO/modül iş kuralı |

**Request şeması:** [AddDayItemRequest](DTO-Sozlugu.md#adddayitemrequest).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "placement": "Last"
}
```

**Örnek HTTP:**

```http
POST /api/daily-plans/11111111-1111-4111-8111-111111111111/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/daily-plans/{date}/items/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `items` | DayItemMoveEntryRequest[] | required; minLength:1; maxLength:50 |
| `targetDate` | DateOnly? | required |

**Request şeması:** [MoveDayItemsRequest](DTO-Sozlugu.md#movedayitemsrequest).

**Örnek request body:**

```json
{
  "items": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "version": 1
    }
  ],
  "targetDate": "2026-10-16"
}
```

**Örnek HTTP:**

```http
POST /api/daily-plans/11111111-1111-4111-8111-111111111111/items/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemBatchResult](DTO-Sozlugu.md#dayitembatchresult).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "items": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/daily-plans/{date}/overview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** DayOverview aynı owner snapshot içinde gün metadata, bağımsız saatli/saatsiz ilk sayfalar, bütün gün glance toplamları ve küçük destek durumunu döndürür. Limitler1..100, offset0..100000; eksik sayfa tam gün toplamı yerine kullanılamaz. WindowStartsAt/EndsAt frozen zone içindir; read günlük plan yaratmaz. Versions yalnız planning/notes/specialDays kapsamındadır. Standart mutation id/version alanları korunur; yeni yazma endpointi değildir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `ScheduleOffset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `ScheduleLimit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `ItemOffset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `ItemLimit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111/overview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayOverviewView](DTO-Sozlugu.md#dayoverviewview).

```json
{
  "day": {
    "id": null,
    "localDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "currentRevisionId": null,
    "baselineRevisionId": null,
    "version": 0,
    "planningVersion": 0
  },
  "windowStartsAt": "2026-10-15T21:00:00Z",
  "windowEndsAt": "2026-10-16T21:00:00Z",
  "timed": {
    "items": [],
    "offset": 0,
    "limit": 100,
    "total": 0
  },
  "untimed": {
    "items": [],
    "offset": 0,
    "limit": 100,
    "total": 0
  },
  "glance": {
    "localDate": "2026-10-16",
    "workingRemainingSeconds": 0,
    "plannedRemainingSeconds": 0,
    "unknownEstimateCount": 0,
    "completedItemCount": 0,
    "openItemCount": 0,
    "actualSeconds": 0,
    "overCapacity": false,
    "hints": [],
    "planningVersion": 0,
    "serverNow": "2026-10-16T06:00:00Z"
  },
  "support": {
    "localDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "availableEnergy": null,
    "criticalTaskIds": [],
    "version": 0,
    "planningVersion": 0,
    "enabled": true
  },
  "versions": {
    "planning": 0,
    "notes": 0,
    "specialDays": 0
  },
  "recurringTaskIds": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/daily-plans/{date}/revisions

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111/revisions
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionPage](DTO-Sozlugu.md#revisionpage).

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

## GET /api/daily-plans/{date}/signals

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** İsteğe bağlı Today destekleri için küçük okuma: ReturnToTask eşiği, son çalışma, gerçek Ready/okunmamış bildirim işaretleri ve çalışan görevin kendi tahmini. En çok1000 işaret; complete=false yokluk kanıtı değildir. observeFocus varsayılan false; true ancak owner bugününde çalışan iş ve açık nudge desteği varken mevcut focus/current geçişini gözlemler. Diğer gün/koşullarda pasif kalır. Yanıt private/no-store; owner token/cookie ile belirlenir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `observeFocus` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/daily-plans/11111111-1111-4111-8111-111111111111/signals
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DaySignalsView](DTO-Sozlugu.md#daysignalsview).

```json
{
  "localDate": "2026-10-16",
  "serverNow": "2026-10-16T06:00:00Z",
  "returnThresholdSeconds": 1800,
  "notifications": [],
  "complete": true,
  "lastWork": null,
  "focusIncluded": false,
  "focus": null,
  "runningWorkSessionId": null,
  "runningTask": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/undo

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** DayGroup kaldırması da changeSetId + expectedPlanningVersion ile bu uçtan geri alınır; grubun saatli/saatsiz öğeleri aynı kimlik ve saatlerle birlikte döner. Daha sonra değişmiş plan/öğe, yeniden eklenmiş aynı görev veya tekrarlanan geri alma409 verir; çalışan sayaç ve gerçek çalışma değiştirilmez.

**Ek entegrasyon kuralı:** Defer erteleme grubu da saatli iptal ve saatsiz öğeleri birlikte geri alır; mevcut hedef öğeyi bozmaz, sonradan hedefe verilen saati geri sarmaz. Görev tanımı, actual ve eski revizyonlar değişmez. Sonraki sürüm/plan değişikliği ya da çalışan iş 409 verir.

**Ek entegrasyon kuralı:** UI-R3 Pool grubu da bu uçtan changeSetId + expectedPlanningVersion ile geri alınır: havuz bağı + saatli/saatsiz öğe kimlikleri birlikte telafi edilir. Sonraki kullanıcı değişikliği veya başlayan saatli tahsis 409 verir; görev tamamlanması ya da gerçek çalışma geri sarılmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `changeSetId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |

**Request şeması:** [UndoDayItemsRequest](DTO-Sozlugu.md#undodayitemsrequest).

**Örnek request body:**

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0
}
```

**Örnek HTTP:**

```http
POST /api/day-items/undo
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemBatchResult](DTO-Sozlugu.md#dayitembatchresult).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "items": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/{id}/complete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [DayItemVersionRequest](DTO-Sozlugu.md#dayitemversionrequest).

**Örnek request body:**

```json
{
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/day-items/11111111-1111-4111-8111-111111111111/complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/{id}/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

**Ek entegrasyon kuralı:** Öğeyi saatsiz olarak hedef güne taşır ve tamamlanma işaretini kaldırır. Aynı gün400 day_item_same_day; hedefte aynı görev varsa409 day_item_exists.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `targetDate` | DateOnly? | required |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [MoveDayItemRequest](DTO-Sozlugu.md#movedayitemrequest).

**Örnek request body:**

```json
{
  "targetDate": "2026-10-16",
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/day-items/11111111-1111-4111-8111-111111111111/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

**Ek entegrasyon kuralı:** Kaydedilmiş gün grubunda alt öğeleri bulunan görev kaldırılırsa aynı gün bu görevin altındaki saatli ve saatsiz öğeler tek transaction ve DayGroup revizyonuyla birlikte kaldırılır. Üyelik gün planında saklanan hiyerarşiden okunur; bağımsız öğeler ve başka günler değişmez. Görev kayıtları ve gerçek çalışma korunur. Saatsiz kökten kaldırmada sabit/kilitli alt blok409 schedule_protected verir; saatli uç mevcut allowProtectedChange iznini bütün gruba uygular. Yaprak öğe kaldırma mevcut tekil davranışını korur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [DayItemVersionRequest](DTO-Sozlugu.md#dayitemversionrequest).

**Örnek request body:**

```json
{
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/day-items/11111111-1111-4111-8111-111111111111/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/{id}/reopen

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [DayItemVersionRequest](DTO-Sozlugu.md#dayitemversionrequest).

**Örnek request body:**

```json
{
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/day-items/11111111-1111-4111-8111-111111111111/reopen
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/day-items/{id}/time

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R4: version ve expectedPlanningVersion; start null olabilir, end varsa start gerekli ve pozitif en çok24saat. Başlangıç öğenin kayıtlı gününde; saat dilimi gün planından. Acil day itemda end dolabilir ve overlap reddi yoktur; normal tam aralık mevcut schedules dönüşümünü kullanır. Key yok; belirsiz yazı tekrarlanmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `startsAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `endsAt` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [UpdateDayItemTimeRequest](DTO-Sozlugu.md#updatedayitemtimerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "expectedPlanningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z"
}
```

**Örnek HTTP:**

```http
PUT /api/day-items/11111111-1111-4111-8111-111111111111/time
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "completedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "taskTitle": "örnek",
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentTitle": "örnek",
  "directEstimatedSeconds": 1,
  "taskState": "Pending",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isUrgent": false,
  "priority": "Low",
  "energyDemand": "Low",
  "timingIssue": "örnek",
  "groupTaskId": "11111111-1111-4111-8111-111111111111",
  "groupParentTaskId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/plan-revisions/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/plan-revisions/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionView](DTO-Sozlugu.md#revisionview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "number": 1,
  "previousRevisionId": "11111111-1111-4111-8111-111111111111",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "trigger": "örnek",
  "reason": "Takvim düzenlendi",
  "createdAt": "2026-10-16T06:00:00Z",
  "effectiveAt": "2026-10-16T06:00:00Z",
  "algorithmVersion": "örnek",
  "snapshotSchemaVersion": 1,
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/plan-revisions/{id}/changes

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/plan-revisions/11111111-1111-4111-8111-111111111111/changes
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionChangePage](DTO-Sozlugu.md#revisionchangepage).

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

## GET /api/plan-revisions/{id}/items

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/plan-revisions/11111111-1111-4111-8111-111111111111/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionItemPage](DTO-Sozlugu.md#revisionitempage).

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

## GET /api/schedules

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `From` | query | hayır | string (date-time); — |
| `To` | query | hayır | string (date-time); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/schedules
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SchedulePage](DTO-Sozlugu.md#schedulepage).

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

## POST /api/schedules

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R2: dayItemId ve dayItemVersion verilirse aynı görev ve günün saatsiz öğesi aynı işlemde saatli bloğa dönüşür (öğe listeden düşer). dayItemVersion eksik400 day_item_version_required; görev farklı400 day_item_task_mismatch; gün farklı400 day_item_day_mismatch.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `localDate` | DateOnly? | required |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `kind` | ScheduleKind? | required |
| `startsAt` | DateTimeOffset? | required |
| `endsAt` | DateTimeOffset? | required |
| `isFixed` | Boolean | DTO/modül iş kuralı |
| `isLocked` | Boolean | DTO/modül iş kuralı |
| `allowConflicts` | Boolean | DTO/modül iş kuralı |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `reason` | String | length:0..2000 |
| `dayItemId` | Guid? | DTO/modül iş kuralı |
| `dayItemVersion` | Int64? | range:1..9.223372036854776E+18 |

**Request şeması:** [CreateScheduleRequest](DTO-Sozlugu.md#createschedulerequest).

**Örnek request body:**

```json
{
  "localDate": "2026-10-16",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "kind": "Work",
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isFixed": false,
  "isLocked": false,
  "allowConflicts": false,
  "expectedPlanningVersion": 0,
  "reason": "Takvim düzenlendi",
  "dayItemId": "11111111-1111-4111-8111-111111111111",
  "dayItemVersion": 1
}
```

**Örnek HTTP:**

```http
POST /api/schedules
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "revisionIds": [],
  "warnings": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/schedules/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/schedules/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleView](DTO-Sozlugu.md#scheduleview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "kind": "Work",
  "state": "Planned",
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isFixed": false,
  "isLocked": false,
  "splitGroupId": "11111111-1111-4111-8111-111111111111",
  "originScheduleId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "taskSnapshot": {
    "task": {
      "schemaVersion": 1,
      "taskId": "11111111-1111-4111-8111-111111111111",
      "taskVersion": 1,
      "title": "Raporu yaz",
      "ancestors": [],
      "project": {
        "id": null,
        "name": null
      },
      "pool": {
        "id": null,
        "name": null
      },
      "category": {
        "id": null,
        "name": null
      },
      "tags": [],
      "inputPlanningVersion": 1,
      "capturedAt": "2026-10-16T06:00:00Z"
    },
    "state": "Pending",
    "hasDirectWork": false,
    "directWorkCompleted": false,
    "requiredForParent": false,
    "directEstimatedSeconds": 1,
    "targetBudgetSeconds": 1,
    "priority": "Low",
    "energyDemand": "Low"
  },
  "isAutomatic": false,
  "completedAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/schedules/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `startsAt` | DateTimeOffset? | required |
| `endsAt` | DateTimeOffset? | required |
| `isFixed` | Boolean | DTO/modül iş kuralı |
| `isLocked` | Boolean | DTO/modül iş kuralı |
| `allowConflicts` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [UpdateScheduleRequest](DTO-Sozlugu.md#updateschedulerequest).

**Örnek request body:**

```json
{
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "isFixed": false,
  "isLocked": false,
  "allowConflicts": false,
  "version": 1,
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
PUT /api/schedules/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "revisionIds": [],
  "warnings": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/schedules/{id}/complete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** completeTask=false varsayılanında yalnız saatli plan öğesi değişir. completeTask=true görev alt ağacını da tamamlar, seçili günün biten bloklarını görünür tutar ve planningVersion ilerler; yeniden açmada yalnız seçili görev açılır. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [DayItemVersionRequest](DTO-Sozlugu.md#dayitemversionrequest).

**Örnek request body:**

```json
{
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/schedules/11111111-1111-4111-8111-111111111111/complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleCompletion](DTO-Sozlugu.md#schedulecompletion).

```json
{
  "schedules": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/schedules/{id}/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `targetDate` | DateOnly? | required |
| `startsAt` | DateTimeOffset? | required |
| `endsAt` | DateTimeOffset? | required |
| `allowConflicts` | Boolean | DTO/modül iş kuralı |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [MoveScheduleRequest](DTO-Sozlugu.md#moveschedulerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "expectedPlanningVersion": 0,
  "targetDate": "2026-10-16",
  "startsAt": "2026-10-16T06:00:00Z",
  "endsAt": "2026-10-16T06:25:00Z",
  "allowConflicts": false,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/schedules/11111111-1111-4111-8111-111111111111/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "revisionIds": [],
  "warnings": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/schedules/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Kaydedilmiş gün grubunda alt öğeleri bulunan görev kaldırılırsa aynı gün bu görevin altındaki saatli ve saatsiz öğeler tek transaction ve DayGroup revizyonuyla birlikte kaldırılır. Üyelik gün planında saklanan hiyerarşiden okunur; bağımsız öğeler ve başka günler değişmez. Görev kayıtları ve gerçek çalışma korunur. Saatsiz kökten kaldırmada sabit/kilitli alt blok409 schedule_protected verir; saatli uç mevcut allowProtectedChange iznini bütün gruba uygular. Yaprak öğe kaldırma mevcut tekil davranışını korur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [RemoveScheduleRequest](DTO-Sozlugu.md#removeschedulerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/schedules/11111111-1111-4111-8111-111111111111/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "revisionIds": [],
  "warnings": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/schedules/{id}/reopen

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** completeTask=false varsayılanında yalnız saatli plan öğesi değişir. completeTask=true görev alt ağacını da tamamlar, seçili günün biten bloklarını görünür tutar ve planningVersion ilerler; yeniden açmada yalnız seçili görev açılır. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `completeTask` | Boolean | DTO/modül iş kuralı |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [DayItemVersionRequest](DTO-Sozlugu.md#dayitemversionrequest).

**Örnek request body:**

```json
{
  "completeTask": false,
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/schedules/11111111-1111-4111-8111-111111111111/reopen
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleCompletion](DTO-Sozlugu.md#schedulecompletion).

```json
{
  "schedules": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/apply

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Önce ilgili proposal’ı alın; proposalId ve aynı niyete ait key gönderin. Stale409’da kör tekrar yerine güncel HTTP state ve yeni preview gerekir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `proposalId` | Guid? | required |

**Request şeması:** [ApplySchedulingRequest](DTO-Sozlugu.md#applyschedulingrequest).

**Örnek request body:**

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/apply
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingApplyResult](DTO-Sozlugu.md#schedulingapplyresult).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "revisionIds": [],
  "noChanges": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/distribute-apply

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Önce ilgili proposal’ı alın; proposalId ve aynı niyete ait key gönderin. Stale409’da kör tekrar yerine güncel HTTP state ve yeni preview gerekir.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `proposalId` | Guid? | required |

**Request şeması:** [ApplySchedulingRequest](DTO-Sozlugu.md#applyschedulingrequest).

**Örnek request body:**

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/distribute-apply
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingApplyResult](DTO-Sozlugu.md#schedulingapplyresult).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "revisionIds": [],
  "noChanges": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/distribute-plan

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Kullanıcının Preview/Auto tercihini izler; yanıtın status/applied alanını okuyun, her200 sonucu accepted revision sanmayın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `fromDate` | DateOnly? | required |
| `toDate` | DateOnly? | required |
| `taskIds` | Guid[] | required; minLength:1; maxLength:1000 |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |

**Request şeması:** [DistributionRequestDto](DTO-Sozlugu.md#distributionrequestdto).

**Örnek request body:**

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "taskIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "expectedPlanningVersion": 0
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/distribute-plan
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "status": "örnek",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [],
  "unplaced": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/distribute-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Proposal kaydı saklanır fakat accepted plan/revision değişmez. Geçerlilik2dk; /preview Auto tercihte de otomatik apply yapmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `fromDate` | DateOnly? | required |
| `toDate` | DateOnly? | required |
| `taskIds` | Guid[] | required; minLength:1; maxLength:1000 |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |

**Request şeması:** [DistributionRequestDto](DTO-Sozlugu.md#distributionrequestdto).

**Örnek request body:**

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "taskIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "expectedPlanningVersion": 0
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/distribute-preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "status": "örnek",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [],
  "unplaced": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/scheduling/distribution-proposals/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/scheduling/distribution-proposals/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "status": "örnek",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [],
  "unplaced": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/plan

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Kullanıcının Preview/Auto tercihini izler; yanıtın status/applied alanını okuyun, her200 sonucu accepted revision sanmayın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `date` | DateOnly? | required |
| `taskIds` | Guid[] | required; minLength:1; maxLength:1000 |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-16",
  "taskIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "expectedPlanningVersion": 0,
  "newWorkNotBefore": "2026-10-16T06:00:00Z"
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/plan
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "anchorAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "örnek",
  "blocks": [],
  "changes": [],
  "unplaced": [],
  "warnings": [],
  "explanations": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Proposal kaydı saklanır fakat accepted plan/revision değişmez. Geçerlilik2dk; /preview Auto tercihte de otomatik apply yapmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `date` | DateOnly? | required |
| `taskIds` | Guid[] | required; minLength:1; maxLength:1000 |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-16",
  "taskIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "expectedPlanningVersion": 0,
  "newWorkNotBefore": "2026-10-16T06:00:00Z"
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "anchorAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "örnek",
  "blocks": [],
  "changes": [],
  "unplaced": [],
  "warnings": [],
  "explanations": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/scheduling/proposals/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/scheduling/proposals/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "anchorAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "örnek",
  "blocks": [],
  "changes": [],
  "unplaced": [],
  "warnings": [],
  "explanations": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/undo-multi-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `changeSetId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UndoSchedulingRequest](DTO-Sozlugu.md#undoschedulingrequest).

**Örnek request body:**

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/undo-multi-preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "status": "örnek",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [],
  "unplaced": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/scheduling/undo-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `changeSetId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UndoSchedulingRequest](DTO-Sozlugu.md#undoschedulingrequest).

**Örnek request body:**

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
POST /api/scheduling/undo-preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "anchorAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "örnek",
  "blocks": [],
  "changes": [],
  "unplaced": [],
  "warnings": [],
  "explanations": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/allocation

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `From` | query | hayır | string (date-time); — |
| `To` | query | hayır | string (date-time); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/allocation
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskAllocation](DTO-Sozlugu.md#taskallocation).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "from": "2026-10-16T06:00:00Z",
  "to": "2026-10-16T06:25:00Z",
  "cutoff": "2026-10-16T06:00:00Z",
  "directActualSeconds": 1,
  "allocatedSeconds": 1,
  "remainingSeconds": 1,
  "unallocatedSeconds": 1,
  "excessAllocatedSeconds": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/work-sessions/start-now

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Acil gerçek çalışma hemen başlar; eski açık segment aynı server instant’ında kapanır. Preview planını reddetmek gerçek çalışma kaydını geri almaz.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** planningStatus Preview/Applied/NeedsPreview/Unavailable olabilir. Son ikisinde plan null olsa da work gerçekten başlamıştır; yeniden work oluşturmayın, current/sync ve yeni preview ile toparlanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `expectedSessionId` | Guid? | DTO/modül iş kuralı |
| `expectedSessionVersion` | Int64? | range:1..9.223372036854776E+18 |
| `remainingTaskIds` | Guid[] | maxLength:1000 |

**Request şeması:** [ImmediateWorkRequest](DTO-Sozlugu.md#immediateworkrequest).

**Örnek request body:**

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0,
  "expectedSessionId": "11111111-1111-4111-8111-111111111111",
  "expectedSessionVersion": 1,
  "remainingTaskIds": null
}
```

**Örnek HTTP:**

```http
POST /api/work-sessions/start-now
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ImmediateWorkResult](DTO-Sozlugu.md#immediateworkresult).

```json
{
  "work": {
    "session": {
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
    "pausedSession": {
      "id": "11111111-1111-4111-8111-111111111111",
      "taskId": "11111111-1111-4111-8111-111111111111",
      "state": "Running",
      "source": "Timer",
      "startedAt": "2026-10-16T06:00:00Z",
      "endedAt": "2026-10-16T06:25:00Z",
      "timeZoneId": "Europe/Istanbul",
      "taskAtStart": {
        "schemaVersion": null,
        "taskId": null,
        "taskVersion": null,
        "title": null,
        "ancestors": null,
        "project": null,
        "pool": null,
        "category": null,
        "tags": null,
        "inputPlanningVersion": null,
        "capturedAt": null
      },
      "version": 1,
      "activeSeconds": 1,
      "serverNow": "2026-10-16T06:00:00Z",
      "recordedAt": "2026-10-16T06:00:00Z",
      "startedScheduleId": "11111111-1111-4111-8111-111111111111",
      "startedRevisionItemId": "11111111-1111-4111-8111-111111111111"
    },
    "localDate": "2026-10-16",
    "planningVersion": 0,
    "taskIds": [],
    "resumed": false
  },
  "plan": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "inputVersion": 1,
    "createdAt": "2026-10-16T06:00:00Z",
    "expiresAt": "2026-10-16T06:00:00Z",
    "anchorAt": "2026-10-16T06:00:00Z",
    "planningMode": "Preview",
    "algorithmVersion": "örnek",
    "hasConstraintConflicts": false,
    "canApply": false,
    "status": "örnek",
    "blocks": [],
    "changes": [],
    "unplaced": [],
    "warnings": [],
    "explanations": [],
    "applied": {
      "proposalId": "11111111-1111-4111-8111-111111111111",
      "changeSetId": "11111111-1111-4111-8111-111111111111",
      "planningVersion": 0,
      "revisionIds": [],
      "noChanges": false
    },
    "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
    "isPartial": false
  },
  "planningStatus": "örnek",
  "planningError": "örnek",
  "replayed": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

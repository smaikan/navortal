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
GET /api/daily-plans/2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DailyPlanView](DTO-Sozlugu.md#dailyplanview).

```json
{
  "id": "01a16bf9-139d-7e60-ab55-e30706df2084",
  "localDate": "2026-10-15",
  "timeZoneId": "Europe/Istanbul",
  "currentRevisionId": "01a16bf9-1626-7242-8340-28cafb52fae3",
  "baselineRevisionId": "01a16bf9-149a-712c-b7bb-64d750707985",
  "version": 2,
  "planningVersion": 10
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/daily-plans/{date}/entries

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** scope=Single varsayılanı yalnız seçileni ekler. Mevcut kökte scope=Subtree kendisi ve uygun alt ağacı tek işlemde ekler (en çok2000 görev); mevcut tekil/saatli kayıtlar kimlik ve saatlerini koruyarak gruba katılır, fazladan kopya oluşmaz. Tekrar seçim eksikleri uzlaştırır; geçmiş günler sonradan değişmez. UI-R4: taskId veya title tam biri; expectedPlanningVersion ve zorunlu Idempotency-Key. Yeni görev+day item tek transaction. IsUrgent yalnız plana ekler, çalışma/focus başlatmaz veya duraklatmaz. Başlangıç serverNow yerel dakikası; bitiş null. Aynı key aynı makbuz; farklı payload409. Normal ekleme saatsiz; öncelik/efor yalnız yeni görev içindir. Undo day-items/undo üzerinden; geçmiş korunur.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R4: taskId veya title tam biri; expectedPlanningVersion ve zorunlu Idempotency-Key. Yeni görev+day item tek transaction. IsUrgent yalnız plana ekler, çalışma/focus başlatmaz veya duraklatmaz. Başlangıç serverNow yerel dakikası; bitiş null. Aynı key aynı makbuz; farklı payload409. Normal ekleme saatsiz; öncelik/efor yalnız yeni görev içindir. Undo day-items/undo üzerinden; geçmiş korunur.

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
GET /api/daily-plans/2026-10-15/glance
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayGlanceView](DTO-Sozlugu.md#dayglanceview).

```json
{
  "localDate": "2026-10-15",
  "workingRemainingSeconds": 2400,
  "plannedRemainingSeconds": 2400,
  "unknownEstimateCount": 1,
  "completedItemCount": 0,
  "openItemCount": 3,
  "actualSeconds": 300,
  "overCapacity": false,
  "hints": [
    {
      "taskId": "01a16bfe-878d-7e3d-a981-e7187a78e70c",
      "energyDemand": null,
      "nextStep": {
        "noteId": "01a16bfe-8c0c-768d-abab-73bbbe6efe9c",
        "text": "Dünkü notu aç"
      }
    },
    {
      "taskId": "01a16bfe-8a03-7480-8893-c81dc6703e5c",
      "energyDemand": null,
      "nextStep": null
    },
    {
      "taskId": "01a16bfe-8abb-7882-80a3-cbbd89628c08",
      "energyDemand": null,
      "nextStep": null
    }
  ],
  "planningVersion": 11,
  "serverNow": "2026-10-15T06:20:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/daily-plans/2026-10-15/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayItemPage](DTO-Sozlugu.md#dayitempage).

```json
{
  "items": [
    {
      "id": "01a16bfb-db9e-7f84-b39f-2fed621688d3",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-da1a-7f24-9307-321457ebfed1",
      "sortOrder": 0,
      "completedAt": null,
      "version": 3,
      "taskTitle": "Bir",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-dd5f-73cf-8039-0b5e1e46f001",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-da84-7407-9d9a-48167d61dc85",
      "sortOrder": 1,
      "completedAt": "2026-10-15T06:00:00+00:00",
      "version": 4,
      "taskTitle": "İki",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-ddc1-7075-8126-d192e1290513",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-dacf-7803-b253-ccd625fe8b91",
      "sortOrder": 2,
      "completedAt": null,
      "version": 3,
      "taskTitle": "Üç",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-de67-765f-b83b-0f63be959b8d",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-de33-74ef-9a43-4a02ef33c97a",
      "sortOrder": 3,
      "completedAt": null,
      "version": 1,
      "taskTitle": "Kalsın",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 4
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/daily-plans/{date}/items

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Açık, arşivsiz görevi (kapsayıcı dahil) güne saatsiz ekler; kapalı görev409 task_not_plannable. Aynı gün aynı görev için tek Planned öğe vardır:409 day_item_exists. Idempotency-Key yoktur; belirsiz sonuçta yeniden göndermeyin, listeyi GET ile okuyun.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Açık doğrudan işi (hasDirectWork, bitmemiş, arşivsiz) güne saatsiz ekler; kapsayıcı veya kapalı görev409 task_not_plannable. Aynı gün aynı görev için tek Planned öğe vardır:409 day_item_exists. Idempotency-Key yoktur; belirsiz sonuçta yeniden göndermeyin, listeyi GET ile okuyun.

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
POST /api/daily-plans/2026-10-16/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "01a16bfc-031a-7a8b-805d-5d39f827a9e5",
  "localDate": "2026-10-16",
  "taskId": "01a16bfc-0283-7501-bce1-75de05cbd99c",
  "sortOrder": 0,
  "completedAt": null,
  "version": 1,
  "taskTitle": "Yarının ilk işi",
  "parentTaskId": null,
  "parentTitle": null,
  "directEstimatedSeconds": null,
  "taskState": "Pending",
  "changeSetId": "01a16bfc-031b-7d43-a0de-aa8b041b132e",
  "planningVersion": 6
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
POST /api/daily-plans/2026-10-15/items/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemBatchResult](DTO-Sozlugu.md#dayitembatchresult).

```json
{
  "changeSetId": "01a16bfb-e03d-7e18-94e5-1d349bf0128c",
  "planningVersion": 12,
  "items": [
    {
      "id": "01a16bfb-db9e-7f84-b39f-2fed621688d3",
      "localDate": "2026-10-16",
      "taskId": "01a16bfb-da1a-7f24-9307-321457ebfed1",
      "sortOrder": 1,
      "completedAt": null,
      "version": 2,
      "taskTitle": "Bir",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-dd5f-73cf-8039-0b5e1e46f001",
      "localDate": "2026-10-16",
      "taskId": "01a16bfb-da84-7407-9d9a-48167d61dc85",
      "sortOrder": 2,
      "completedAt": null,
      "version": 3,
      "taskTitle": "İki",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-ddc1-7075-8126-d192e1290513",
      "localDate": "2026-10-16",
      "taskId": "01a16bfb-dacf-7803-b253-ccd625fe8b91",
      "sortOrder": 3,
      "completedAt": null,
      "version": 2,
      "taskTitle": "Üç",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    }
  ]
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
    "Items": [
      "The field Items must be a string or array type with a minimum length of '1'."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URRTA"
}
```

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
GET /api/daily-plans/2026-10-16/revisions?limit=100
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionPage](DTO-Sozlugu.md#revisionpage).

```json
{
  "items": [
    {
      "id": "01a16bfc-0405-75dd-963a-8317ad62c0ac",
      "dailyPlanId": "01a16bfc-0140-7d11-a6bb-b93524f320af",
      "number": 4,
      "previousRevisionId": "01a16bfc-0331-7663-a3a0-a7a70ea87269",
      "changeSetId": "01a16bfc-03fe-7ba0-86d8-65093d73660f",
      "trigger": "DayItem",
      "reason": "Plana eklendi",
      "createdAt": "2026-10-15T06:00:00+00:00",
      "effectiveAt": "2026-10-15T06:00:00+00:00",
      "algorithmVersion": "manual-v1",
      "snapshotSchemaVersion": 1,
      "reversesChangeSetId": null
    },
    {
      "id": "01a16bfc-0331-7663-a3a0-a7a70ea87269",
      "dailyPlanId": "01a16bfc-0140-7d11-a6bb-b93524f320af",
      "number": 3,
      "previousRevisionId": "01a16bfc-0230-7f38-9303-3ddffd122aec",
      "changeSetId": "01a16bfc-031b-7d43-a0de-aa8b041b132e",
      "trigger": "DayItem",
      "reason": "Plana eklendi",
      "createdAt": "2026-10-15T06:00:00+00:00",
      "effectiveAt": "2026-10-15T06:00:00+00:00",
      "algorithmVersion": "manual-v1",
      "snapshotSchemaVersion": 1,
      "reversesChangeSetId": null
    },
    {
      "id": "01a16bfc-0230-7f38-9303-3ddffd122aec",
      "dailyPlanId": "01a16bfc-0140-7d11-a6bb-b93524f320af",
      "number": 2,
      "previousRevisionId": "01a16bfc-017f-7a97-83f0-5797edf33d04",
      "changeSetId": "01a16bfc-0210-7c2c-a624-8ceef1e1b3d6",
      "trigger": "DayItem",
      "reason": "Plana eklendi",
      "createdAt": "2026-10-15T06:00:00+00:00",
      "effectiveAt": "2026-10-15T06:00:00+00:00",
      "algorithmVersion": "manual-v1",
      "snapshotSchemaVersion": 1,
      "reversesChangeSetId": null
    },
    {
      "id": "01a16bfc-017f-7a97-83f0-5797edf33d04",
      "dailyPlanId": "01a16bfc-0140-7d11-a6bb-b93524f320af",
      "number": 1,
      "previousRevisionId": null,
      "changeSetId": "01a16bfc-0148-79d5-8050-d325bf0003a9",
      "trigger": "DayItem",
      "reason": "Plana eklendi",
      "createdAt": "2026-10-15T06:00:00+00:00",
      "effectiveAt": "2026-10-15T06:00:00+00:00",
      "algorithmVersion": "manual-v1",
      "snapshotSchemaVersion": 1,
      "reversesChangeSetId": null
    }
  ],
  "offset": 0,
  "limit": 100,
  "total": 4
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "changeSetId": "01a16bfb-e33f-7dd0-863a-cfd4298ff1ba",
  "planningVersion": 13,
  "items": [
    {
      "id": "01a16bfb-db9e-7f84-b39f-2fed621688d3",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-da1a-7f24-9307-321457ebfed1",
      "sortOrder": 0,
      "completedAt": null,
      "version": 3,
      "taskTitle": "Bir",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-dd5f-73cf-8039-0b5e1e46f001",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-da84-7407-9d9a-48167d61dc85",
      "sortOrder": 1,
      "completedAt": "2026-10-15T06:00:00+00:00",
      "version": 4,
      "taskTitle": "İki",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a16bfb-ddc1-7075-8126-d192e1290513",
      "localDate": "2026-10-15",
      "taskId": "01a16bfb-dacf-7803-b253-ccd625fe8b91",
      "sortOrder": 2,
      "completedAt": null,
      "version": 3,
      "taskTitle": "Üç",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Yalnız günün son plan değişikliğini geri alabilirsin.",
  "status": 409,
  "code": "undo_not_latest",
  "traceId": "00-bb86e925c8ceb493636e1858a8df3f35-6bd0f5b11d952dcb-00"
}
```

## POST /api/day-items/{id}/complete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. complete/reopen yalnız o günün öğesini işaretler; görevi tamamlamaz veya yeniden açmaz.

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
POST /api/day-items/01a16bfd-2601-7fd4-a284-2c5a7bd1dc43/complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "01a16bfd-2601-7fd4-a284-2c5a7bd1dc43",
  "localDate": "2026-10-15",
  "taskId": "01a16bfd-2491-72dd-aaaa-289b987c8b93",
  "sortOrder": 0,
  "completedAt": "2026-10-15T06:00:00+00:00",
  "version": 2,
  "taskTitle": "Alt adım",
  "parentTaskId": "01a16bfd-2405-7149-bf7f-464a8c9151f8",
  "parentTitle": "Ana görev",
  "directEstimatedSeconds": 1500,
  "taskState": "Pending",
  "changeSetId": "01a16bfd-278f-7f9b-8c67-a677ef1e59c7",
  "planningVersion": 7
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Gün öğesi artık planda değil.",
  "status": 409,
  "code": "day_item_not_planned",
  "traceId": "00-83d50f954e728978dd9298d97d217134-dfcd971a390d56bf-00"
}
```

## POST /api/day-items/{id}/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır. Öğeyi saatsiz olarak hedef güne taşır ve tamamlanma işaretini kaldırır. Aynı gün400 day_item_same_day; hedefte aynı görev varsa409 day_item_exists.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. complete/reopen yalnız o günün öğesini işaretler; görevi tamamlamaz veya yeniden açmaz.

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
POST /api/day-items/01a16bfb-de67-765f-b83b-0f63be959b8d/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "01a16bfb-de67-765f-b83b-0f63be959b8d",
  "localDate": "2026-10-16",
  "taskId": "01a16bfb-de33-74ef-9a43-4a02ef33c97a",
  "sortOrder": 1,
  "completedAt": null,
  "version": 2,
  "taskTitle": "Kalsın",
  "parentTaskId": null,
  "parentTitle": null,
  "directEstimatedSeconds": null,
  "taskState": "Pending",
  "changeSetId": "01a16bfb-e436-7380-9c3c-604ad0b9d3ce",
  "planningVersion": 14
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu görev hedef günün planında zaten var.",
  "status": 409,
  "code": "day_item_exists",
  "traceId": "00-3cfe16c33225eb03a1a42ebfca5814fd-6ef5536b754e6ea4-00"
}
```

## POST /api/day-items/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. complete/reopen yalnız o günün öğesini işaretler; görevi tamamlamaz veya yeniden açmaz.

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
POST /api/day-items/01a16bfd-2601-7fd4-a284-2c5a7bd1dc43/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "01a16bfd-2601-7fd4-a284-2c5a7bd1dc43",
  "localDate": "2026-10-15",
  "taskId": "01a16bfd-2491-72dd-aaaa-289b987c8b93",
  "sortOrder": 0,
  "completedAt": null,
  "version": 4,
  "taskTitle": "Alt adım",
  "parentTaskId": "01a16bfd-2405-7149-bf7f-464a8c9151f8",
  "parentTitle": "Ana görev",
  "directEstimatedSeconds": 1500,
  "taskState": "Pending",
  "changeSetId": "01a16bfd-28f8-7e80-a400-412878f299eb",
  "planningVersion": 9
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/day-items/{id}/reopen

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. completeTask=false varsayılanında complete/reopen yalnız plan öğesini işaretler. completeTask=true tamamlamada görev alt ağacını da tamamlar ve açık sayaçları kapatır; yeniden açmada yalnız seçili görev açılır. Bu görev durumu değişikliği genel plan undo yerine tamamlanma kutusuyla geri açılır.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. complete/reopen yalnız o günün öğesini işaretler; görevi tamamlamaz veya yeniden açmaz.

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
POST /api/day-items/01a16bfd-2601-7fd4-a284-2c5a7bd1dc43/reopen
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayItemView](DTO-Sozlugu.md#dayitemview).

```json
{
  "id": "01a16bfd-2601-7fd4-a284-2c5a7bd1dc43",
  "localDate": "2026-10-15",
  "taskId": "01a16bfd-2491-72dd-aaaa-289b987c8b93",
  "sortOrder": 0,
  "completedAt": null,
  "version": 3,
  "taskTitle": "Alt adım",
  "parentTaskId": "01a16bfd-2405-7149-bf7f-464a8c9151f8",
  "parentTitle": "Ana görev",
  "directEstimatedSeconds": 1500,
  "taskState": "Pending",
  "changeSetId": "01a16bfd-2879-7362-a422-607213bf0a34",
  "planningVersion": 8
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Gün öğesi değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-1860b1c0b44d0c72c58cfed6ec8f11b2-4943fd20841b3c0e-00"
}
```

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
GET /api/plan-revisions/01a16bfa-f647-7944-8850-9cd6175a2a5b
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionView](DTO-Sozlugu.md#revisionview).

```json
{
  "id": "01a16bfa-f647-7944-8850-9cd6175a2a5b",
  "dailyPlanId": "01a16bfa-f251-7c3c-b0b4-c82742320985",
  "number": 3,
  "previousRevisionId": "01a16bfa-f485-7478-a369-03785506e574",
  "changeSetId": "01a16bfa-f638-7ea3-a366-b5ac74c1eaff",
  "trigger": "Undo",
  "reason": "Geleceğe dönük geri alma telafisi uygulandı.",
  "createdAt": "2026-10-15T06:00:00+00:00",
  "effectiveAt": "2026-10-15T06:00:00+00:00",
  "algorithmVersion": "undo-v1",
  "snapshotSchemaVersion": 1,
  "reversesChangeSetId": "01a16bfa-f475-7ecd-afe2-fbe47dd28df9"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Revizyon bulunamadı.",
  "status": 404,
  "code": "revision_not_found",
  "traceId": "00-4eecdf1b9f8ca5d8b5466c93bfbb7391-57261d34f8c9afa8-00"
}
```

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
GET /api/plan-revisions/01a16bfb-11da-7221-b339-bfe238398630/changes
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionChangePage](DTO-Sozlugu.md#revisionchangepage).

```json
{
  "items": [
    {
      "id": "01a16bfb-11da-72a9-a7ca-5c4830b8a15b",
      "scheduleId": "01a16bfb-0f1b-70be-becb-d1e7015fb91e",
      "type": "MovedOut",
      "before": {
        "id": "01a16bfb-0f1b-70be-becb-d1e7015fb91e",
        "dailyPlanId": "01a16bfb-0ece-736a-8c07-5a8b97e87463",
        "taskId": "01a16bfb-0d5b-7c7f-ab9f-9a3accc1b84d",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T06:30:00+00:00",
        "endsAt": "2026-10-15T07:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bfb-0d5b-7c7f-ab9f-9a3accc1b84d",
            "taskVersion": 2,
            "title": "Project",
            "ancestors": [],
            "project": null,
            "pool": null,
            "category": null,
            "tags": [],
            "inputPlanningVersion": 2,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 7200,
          "targetBudgetSeconds": null
        },
        "isAutomatic": false,
        "completedAt": null
      },
      "after": {
        "id": "01a16bfb-0f1b-70be-becb-d1e7015fb91e",
        "dailyPlanId": "01a16bfb-0ece-736a-8c07-5a8b97e87463",
        "taskId": "01a16bfb-0d5b-7c7f-ab9f-9a3accc1b84d",
        "kind": "Work",
        "state": "Removed",
        "startsAt": "2026-10-15T06:30:00+00:00",
        "endsAt": "2026-10-15T07:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 2,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bfb-0d5b-7c7f-ab9f-9a3accc1b84d",
            "taskVersion": 2,
            "title": "Project",
            "ancestors": [],
            "project": null,
            "pool": null,
            "category": null,
            "tags": [],
            "inputPlanningVersion": 2,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 7200,
          "targetBudgetSeconds": null
        },
        "isAutomatic": false,
        "completedAt": null
      },
      "conflictsAccepted": false,
      "dayItemId": null,
      "dayItemBefore": null,
      "dayItemAfter": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Revizyon bulunamadı.",
  "status": 404,
  "code": "revision_not_found",
  "traceId": "00-2bd33a0bcd6390fa93f4cf3bd057dde9-03dcd1e65efa8838-00"
}
```

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
GET /api/plan-revisions/01a16c00-0489-7910-a221-279e011d3e7b/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RevisionItemPage](DTO-Sozlugu.md#revisionitempage).

```json
{
  "items": [
    {
      "id": "01a16c00-0489-7f79-ab7f-8252038b3c33",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-01ca-7f49-ab96-30cdf65eed00",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": null,
        "kind": "Break",
        "state": "Planned",
        "startsAt": "2026-10-15T08:00:00+00:00",
        "endsAt": "2026-10-15T08:30:00+00:00",
        "isFixed": true,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 1,
        "taskSnapshot": null,
        "isAutomatic": false,
        "completedAt": null
      }
    },
    {
      "id": "01a16c00-0489-726a-be2d-58b8adadc16f",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-044d-7f12-bc56-4071fb88e71b",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T06:01:00+00:00",
        "endsAt": "2026-10-15T07:01:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
            "taskVersion": 2,
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
            "inputPlanningVersion": 17,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 3600,
          "targetBudgetSeconds": null
        },
        "isAutomatic": true,
        "completedAt": null
      }
    },
    {
      "id": "01a16c00-0489-7e4b-8a78-d94b6e918989",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-0458-718d-881e-8ebdefda4ca8",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T07:01:00+00:00",
        "endsAt": "2026-10-15T07:16:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
            "taskVersion": 2,
            "title": "B1",
            "ancestors": [
              {
                "id": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
                "name": "Ana iş"
              },
              {
                "id": "01a16bff-fd72-79f4-8820-16c519fb2892",
                "name": "Adım B"
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
            "inputPlanningVersion": 17,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 900,
          "targetBudgetSeconds": null
        },
        "isAutomatic": true,
        "completedAt": null
      }
    },
    {
      "id": "01a16c00-0489-7548-b17f-89e0fa37f5d6",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-0463-7dd1-ae40-e18ece5b34c2",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T07:16:00+00:00",
        "endsAt": "2026-10-15T07:31:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
            "taskVersion": 2,
            "title": "B2",
            "ancestors": [
              {
                "id": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
                "name": "Ana iş"
              },
              {
                "id": "01a16bff-fd72-79f4-8820-16c519fb2892",
                "name": "Adım B"
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
            "inputPlanningVersion": 17,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 900,
          "targetBudgetSeconds": null
        },
        "isAutomatic": true,
        "completedAt": null
      }
    },
    {
      "id": "01a16c00-0489-79f3-8c5f-ca2cb7e140df",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-046f-789b-a97b-3820d989e165",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T07:31:00+00:00",
        "endsAt": "2026-10-15T08:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": "01a16c00-0477-75a9-83e9-77e82f9c9199",
        "originScheduleId": "01a16c00-046f-789b-a97b-3820d989e165",
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
            "taskVersion": 2,
            "title": "Adım C",
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
            "inputPlanningVersion": 17,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 1800,
          "targetBudgetSeconds": null
        },
        "isAutomatic": true,
        "completedAt": null
      }
    },
    {
      "id": "01a16c00-0489-7946-bdd8-30e1d172c837",
      "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
      "schedule": {
        "id": "01a16c00-0477-772d-b4b6-57d668877d83",
        "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
        "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
        "kind": "Work",
        "state": "Planned",
        "startsAt": "2026-10-15T08:30:00+00:00",
        "endsAt": "2026-10-15T08:31:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": "01a16c00-0477-75a9-83e9-77e82f9c9199",
        "originScheduleId": "01a16c00-046f-789b-a97b-3820d989e165",
        "version": 1,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
            "taskVersion": 2,
            "title": "Adım C",
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
            "inputPlanningVersion": 17,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 1800,
          "targetBudgetSeconds": null
        },
        "isAutomatic": true,
        "completedAt": null
      }
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 6
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Revizyon bulunamadı.",
  "status": 404,
  "code": "revision_not_found",
  "traceId": "00-0d87030e8d9ba22bc332e05683838647-38ab9a50216ca8a1-00"
}
```

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
GET /api/schedules?from=2026-11-01T21%3A00%3A00.0000000%2B00%3A00&to=2026-11-06T21%3A00%3A00.0000000%2B00%3A00
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SchedulePage](DTO-Sozlugu.md#schedulepage).

```json
{
  "items": [
    {
      "id": "01a16c00-515b-789a-a9bc-618cebf1b093",
      "dailyPlanId": "01a16c00-5151-7545-8b85-1d26f8b8f81e",
      "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-11-02T06:00:00+00:00",
      "endsAt": "2026-11-02T07:30:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16c00-515b-702c-aa84-1a3afcb81b22",
      "originScheduleId": "01a16c00-515b-789a-a9bc-618cebf1b093",
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
          "taskVersion": 4,
          "title": "Project",
          "ancestors": [],
          "project": {
            "id": "01a16c00-4b5a-7be3-a649-c3bd1435e02e",
            "name": "12 saatlik proje"
          },
          "pool": {
            "id": "01a16c00-4af7-7854-85b4-58df2356f66f",
            "name": "Havuz"
          },
          "category": null,
          "tags": [],
          "inputPlanningVersion": 7,
          "capturedAt": "2026-10-15T07:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 43200,
        "targetBudgetSeconds": null
      },
      "isAutomatic": true,
      "completedAt": null
    },
    {
      "id": "01a16c00-515b-75d1-a2c1-012a178978bf",
      "dailyPlanId": "01a16c00-515b-7133-955e-f4cb90b7bb7f",
      "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-11-03T06:00:00+00:00",
      "endsAt": "2026-11-03T07:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16c00-515b-702c-aa84-1a3afcb81b22",
      "originScheduleId": "01a16c00-515b-789a-a9bc-618cebf1b093",
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
          "taskVersion": 4,
          "title": "Project",
          "ancestors": [],
          "project": {
            "id": "01a16c00-4b5a-7be3-a649-c3bd1435e02e",
            "name": "12 saatlik proje"
          },
          "pool": {
            "id": "01a16c00-4af7-7854-85b4-58df2356f66f",
            "name": "Havuz"
          },
          "category": null,
          "tags": [],
          "inputPlanningVersion": 7,
          "capturedAt": "2026-10-15T07:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 43200,
        "targetBudgetSeconds": null
      },
      "isAutomatic": true,
      "completedAt": null
    },
    {
      "id": "01a16c00-515b-7fa6-84e8-fb1533785e2d",
      "dailyPlanId": "01a16c00-515b-72f8-97f9-9c5d5822b56a",
      "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-11-06T06:00:00+00:00",
      "endsAt": "2026-11-06T08:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16c00-515b-702c-aa84-1a3afcb81b22",
      "originScheduleId": "01a16c00-515b-789a-a9bc-618cebf1b093",
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
          "taskVersion": 4,
          "title": "Project",
          "ancestors": [],
          "project": {
            "id": "01a16c00-4b5a-7be3-a649-c3bd1435e02e",
            "name": "12 saatlik proje"
          },
          "pool": {
            "id": "01a16c00-4af7-7854-85b4-58df2356f66f",
            "name": "Havuz"
          },
          "category": null,
          "tags": [],
          "inputPlanningVersion": 7,
          "capturedAt": "2026-10-15T07:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 43200,
        "targetBudgetSeconds": null
      },
      "isAutomatic": true,
      "completedAt": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 3
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
    "To": [
      "The To field is required."
    ],
    "From": [
      "The From field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URSNN"
}
```

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `reason` | String | length:0..2000 |
| `dayItemId` | Guid? | DTO/modül iş kuralı |
| `dayItemVersion` | Int64? | range:1..9,223372036854776E+18 |

**Request şeması:** [CreateScheduleRequest](DTO-Sozlugu.md#createschedulerequest).

**Örnek request body:**

```json
{
  "localDate": "2026-10-15",
  "taskId": "01a16bfd-d002-7064-aa4a-214f8ab6bf8e",
  "kind": "Work",
  "startsAt": "2026-10-15T20:30:00+00:00",
  "endsAt": "2026-10-15T21:30:00+00:00",
  "isFixed": false,
  "allowConflicts": false,
  "expectedPlanningVersion": 2
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
  "changeSetId": "01a16bfd-d1f5-7371-b10e-c1f53d2c9c10",
  "planningVersion": 3,
  "schedules": [
    {
      "id": "01a16bfd-d1af-758c-acc7-68fcc757c8db",
      "dailyPlanId": "01a16bfd-d19e-72a0-82b1-1c7226487fd1",
      "taskId": "01a16bfd-d002-7064-aa4a-214f8ab6bf8e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T20:30:00+00:00",
      "endsAt": "2026-10-15T21:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-d1af-7b6a-aa88-cb14ec19f461",
      "originScheduleId": null,
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-d002-7064-aa4a-214f8ab6bf8e",
          "taskVersion": 2,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 2,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 5400,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    },
    {
      "id": "01a16bfd-d1b4-79ed-a39a-61914103f3d1",
      "dailyPlanId": "01a16bfd-d1b4-7743-9e44-3a148460b9f9",
      "taskId": "01a16bfd-d002-7064-aa4a-214f8ab6bf8e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T21:00:00+00:00",
      "endsAt": "2026-10-15T21:30:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-d1af-7b6a-aa88-cb14ec19f461",
      "originScheduleId": "01a16bfd-d1af-758c-acc7-68fcc757c8db",
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-d002-7064-aa4a-214f8ab6bf8e",
          "taskVersion": 2,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 2,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 5400,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ],
  "revisionIds": [
    "01a16bfd-d1fe-7c24-a10c-8ee5e628624b",
    "01a16bfd-d1fe-733e-816e-19b48715dbfd"
  ],
  "warnings": [
    {
      "code": "allocation_incomplete",
      "scheduleIds": [
        "01a16bfd-d1af-758c-acc7-68fcc757c8db",
        "01a16bfd-d1b4-79ed-a39a-61914103f3d1"
      ],
      "seconds": 1800
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Gün öğesi değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-5407bae61fa1e64afb4355c29b787496-143493d369affc65-00"
}
```

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
GET /api/schedules/01a16c00-515b-75d1-a2c1-012a178978bf
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleView](DTO-Sozlugu.md#scheduleview).

```json
{
  "id": "01a16c00-515b-75d1-a2c1-012a178978bf",
  "dailyPlanId": "01a16c00-515b-7133-955e-f4cb90b7bb7f",
  "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
  "kind": "Work",
  "state": "Planned",
  "startsAt": "2026-11-03T06:00:00+00:00",
  "endsAt": "2026-11-03T06:30:00+00:00",
  "isFixed": false,
  "isLocked": false,
  "splitGroupId": "01a16c00-515b-702c-aa84-1a3afcb81b22",
  "originScheduleId": "01a16c00-515b-789a-a9bc-618cebf1b093",
  "version": 2,
  "taskSnapshot": {
    "task": {
      "schemaVersion": 2,
      "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
      "taskVersion": 4,
      "title": "Project",
      "ancestors": [],
      "project": {
        "id": "01a16c00-4b5a-7be3-a649-c3bd1435e02e",
        "name": "12 saatlik proje"
      },
      "pool": {
        "id": "01a16c00-4af7-7854-85b4-58df2356f66f",
        "name": "Havuz"
      },
      "category": null,
      "tags": [],
      "inputPlanningVersion": 7,
      "capturedAt": "2026-10-15T07:00:00+00:00"
    },
    "state": "Pending",
    "hasDirectWork": true,
    "directWorkCompleted": false,
    "requiredForParent": true,
    "directEstimatedSeconds": 43200,
    "targetBudgetSeconds": null
  },
  "isAutomatic": false,
  "completedAt": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Blok bulunamadı.",
  "status": 404,
  "code": "schedule_not_found",
  "traceId": "00-39de779941141bfff5bf00b114eb545f-4a84ea4afaf18821-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [UpdateScheduleRequest](DTO-Sozlugu.md#updateschedulerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "expectedPlanningVersion": 8,
  "startsAt": "2026-11-03T06:00:00+00:00",
  "endsAt": "2026-11-03T06:30:00+00:00",
  "isFixed": false,
  "isLocked": false,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
PUT /api/schedules/01a16c00-515b-75d1-a2c1-012a178978bf
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "01a16c00-54ac-7300-b4bb-a4923966d72c",
  "planningVersion": 9,
  "schedules": [
    {
      "id": "01a16c00-515b-75d1-a2c1-012a178978bf",
      "dailyPlanId": "01a16c00-515b-7133-955e-f4cb90b7bb7f",
      "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-11-03T06:00:00+00:00",
      "endsAt": "2026-11-03T06:30:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16c00-515b-702c-aa84-1a3afcb81b22",
      "originScheduleId": "01a16c00-515b-789a-a9bc-618cebf1b093",
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16c00-4b85-78e7-b3a1-2dd236dc635e",
          "taskVersion": 4,
          "title": "Project",
          "ancestors": [],
          "project": {
            "id": "01a16c00-4b5a-7be3-a649-c3bd1435e02e",
            "name": "12 saatlik proje"
          },
          "pool": {
            "id": "01a16c00-4af7-7854-85b4-58df2356f66f",
            "name": "Havuz"
          },
          "category": null,
          "tags": [],
          "inputPlanningVersion": 7,
          "capturedAt": "2026-10-15T07:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 43200,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ],
  "revisionIds": [
    "01a16c00-54c2-760d-896e-b0bce26b3011"
  ],
  "warnings": [
    {
      "code": "allocation_incomplete",
      "scheduleIds": [
        "01a16c00-515b-789a-a9bc-618cebf1b093",
        "01a16c00-515b-75d1-a2c1-012a178978bf",
        "01a16c00-515b-7fa6-84e8-fb1533785e2d"
      ],
      "seconds": 25200
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sabit/kilitli bloğu değiştirme niyetini açık belirtin.",
  "status": 409,
  "code": "schedule_protected",
  "traceId": "00-2a3230612d1c7e388c5059fe0303f51b-3a1a65be002da73c-00"
}
```

## POST /api/schedules/{id}/complete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** completeTask=false varsayılanında yalnız saatli plan öğesi değişir. completeTask=true görev alt ağacını da tamamlar, seçili günün biten bloklarını görünür tutar ve planningVersion ilerler; yeniden açmada yalnız seçili görev açılır. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R2 saatli plan öğesini bitirir/yeniden açar; görev durumu, planningVersion ve revisionlar değişmez. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

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
POST /api/schedules/01a16bfd-0f25-72da-ae72-18337f2e3b0a/complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleCompletion](DTO-Sozlugu.md#schedulecompletion).

```json
{
  "schedules": [
    {
      "id": "01a16bfd-0f25-72da-ae72-18337f2e3b0a",
      "dailyPlanId": "01a16bfd-0f09-749d-8e23-bd871f82197c",
      "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T20:30:00+00:00",
      "endsAt": "2026-10-15T21:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-0f25-72d0-8cf3-59724ee7cbcf",
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
          "taskVersion": 1,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 1,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": "2026-10-15T06:00:00+00:00"
    },
    {
      "id": "01a16bfd-0f36-7a7e-83cc-31f493670101",
      "dailyPlanId": "01a16bfd-0f36-7f12-9f85-63638188b9db",
      "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T21:00:00+00:00",
      "endsAt": "2026-10-15T21:30:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-0f25-72d0-8cf3-59724ee7cbcf",
      "originScheduleId": "01a16bfd-0f25-72da-ae72-18337f2e3b0a",
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
          "taskVersion": 1,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 1,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": "2026-10-15T06:00:00+00:00"
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Blok kaldırılmış.",
  "status": 409,
  "code": "schedule_removed",
  "traceId": "00-3c847f2dcff80e876b67cf723632c68e-5efa03f087333667-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
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
  "expectedPlanningVersion": 5,
  "targetDate": "2026-10-17",
  "startsAt": "2026-10-17T06:00:00+00:00",
  "endsAt": "2026-10-17T07:00:00+00:00",
  "allowProtectedChange": false,
  "allowConflicts": false
}
```

**Örnek HTTP:**

```http
POST /api/schedules/01a16bfa-8215-7983-92ef-ca1aef2fea02/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "01a16bfa-8436-7861-9e17-2738ff2981aa",
  "planningVersion": 6,
  "schedules": [
    {
      "id": "01a16bfa-8215-7983-92ef-ca1aef2fea02",
      "dailyPlanId": "01a16bfa-8370-78f4-9e7f-3d5e94f792bf",
      "taskId": "01a16bfa-8084-7281-856e-bbac318f8786",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-17T06:00:00+00:00",
      "endsAt": "2026-10-17T07:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfa-8084-7281-856e-bbac318f8786",
          "taskVersion": 2,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 3,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": 7200,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ],
  "revisionIds": [
    "01a16bfa-843c-7dd5-992c-898f7256fe14",
    "01a16bfa-843d-7657-be18-3e1cf998510b"
  ],
  "warnings": [
    {
      "code": "allocation_incomplete",
      "scheduleIds": [
        "01a16bfa-8215-7983-92ef-ca1aef2fea02"
      ],
      "seconds": 3600
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Plan girdileri değişmiş; güncel planı alın.",
  "status": 409,
  "code": "planning_version_conflict",
  "traceId": "00-7fc992b82248159ac37e92216dbf752f-3e76e13d7a8a0afe-00"
}
```

## POST /api/schedules/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [RemoveScheduleRequest](DTO-Sozlugu.md#removeschedulerequest).

**Örnek request body:**

```json
{
  "version": 3,
  "expectedPlanningVersion": 2,
  "startsAt": "2026-10-15T20:30:00+00:00",
  "endsAt": "2026-10-15T21:00:00+00:00",
  "isFixed": false,
  "isLocked": false,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
POST /api/schedules/01a16bfd-0f25-72da-ae72-18337f2e3b0a/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "01a16bfd-12a7-727f-800e-d6fd367853e7",
  "planningVersion": 3,
  "schedules": [
    {
      "id": "01a16bfd-0f25-72da-ae72-18337f2e3b0a",
      "dailyPlanId": "01a16bfd-0f09-749d-8e23-bd871f82197c",
      "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
      "kind": "Work",
      "state": "Removed",
      "startsAt": "2026-10-15T20:30:00+00:00",
      "endsAt": "2026-10-15T21:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-0f25-72d0-8cf3-59724ee7cbcf",
      "originScheduleId": null,
      "version": 4,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
          "taskVersion": 1,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 1,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ],
  "revisionIds": [
    "01a16bfd-12d7-7a94-8ce5-4284860f7176"
  ],
  "warnings": [
    {
      "code": "estimate_unknown",
      "scheduleIds": [
        "01a16bfd-0f36-7a7e-83cc-31f493670101"
      ],
      "seconds": null
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sabit/kilitli bloğu değiştirme niyetini açık belirtin.",
  "status": 409,
  "code": "schedule_protected",
  "traceId": "00-31093a710046255cda89adf9c1bb453e-0309b1e43d670743-00"
}
```

## POST /api/schedules/{id}/reopen

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** completeTask=false varsayılanında yalnız saatli plan öğesi değişir. completeTask=true görev alt ağacını da tamamlar, seçili günün biten bloklarını görünür tutar ve planningVersion ilerler; yeniden açmada yalnız seçili görev açılır. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R2 saatli plan öğesini bitirir/yeniden açar; görev durumu, planningVersion ve revisionlar değişmez. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.

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
POST /api/schedules/01a16bfd-0f25-72da-ae72-18337f2e3b0a/reopen
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ScheduleCompletion](DTO-Sozlugu.md#schedulecompletion).

```json
{
  "schedules": [
    {
      "id": "01a16bfd-0f25-72da-ae72-18337f2e3b0a",
      "dailyPlanId": "01a16bfd-0f09-749d-8e23-bd871f82197c",
      "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T20:30:00+00:00",
      "endsAt": "2026-10-15T21:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-0f25-72d0-8cf3-59724ee7cbcf",
      "originScheduleId": null,
      "version": 3,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
          "taskVersion": 1,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 1,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    },
    {
      "id": "01a16bfd-0f36-7a7e-83cc-31f493670101",
      "dailyPlanId": "01a16bfd-0f36-7f12-9f85-63638188b9db",
      "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T21:00:00+00:00",
      "endsAt": "2026-10-15T21:30:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": "01a16bfd-0f25-72d0-8cf3-59724ee7cbcf",
      "originScheduleId": "01a16bfd-0f25-72da-ae72-18337f2e3b0a",
      "version": 3,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bfd-0e22-7d6b-ab80-362beded2512",
          "taskVersion": 1,
          "title": "Project",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 1,
          "capturedAt": "2026-10-15T06:00:00+00:00"
        },
        "state": "Pending",
        "hasDirectWork": true,
        "directWorkCompleted": false,
        "requiredForParent": true,
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Blok değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-5ee59ac6b8ad632bbaaa7740a6a44353-b98668ff7ec84433-00"
}
```

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
  "proposalId": "01a16c00-03ca-7d02-bf66-db1b59b1960c"
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
  "proposalId": "01a16c00-03ca-7d02-bf66-db1b59b1960c",
  "changeSetId": "01a16c00-0477-778c-93cb-255ba9035b4c",
  "planningVersion": 18,
  "revisionIds": [
    "01a16c00-0489-7910-a221-279e011d3e7b"
  ],
  "noChanges": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Plan girdileri veya önerinin geçerlilik zamanı değişmiş; yeniden önizleyin.",
  "status": 409,
  "code": "proposal_stale",
  "traceId": "00-daa40e965785ac3ad64eaeb0efaccfdf-7d3c8c27dc0d4d70-00"
}
```

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
  "proposalId": "01a16bfa-9f26-7e79-b9a3-1180ef600671"
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
  "proposalId": "01a16bfa-9f26-7e79-b9a3-1180ef600671",
  "changeSetId": "01a16bfa-a132-7bc4-a69c-01a3f8369905",
  "planningVersion": 6,
  "revisionIds": [
    "01a16bfa-a17d-705e-a26d-a5163d37f18b",
    "01a16bfa-a17d-707e-aba4-bc06359c8061",
    "01a16bfa-a17e-7240-9f22-fc1f9290b372"
  ],
  "noChanges": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Plan girdileri veya önerinin geçerlilik zamanı değişmiş; yeniden önizleyin.",
  "status": 409,
  "code": "proposal_stale",
  "traceId": "00-bddc79af849754199f5e79cfd6033af5-6a1d9b7ba868feda-00"
}
```

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
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |

**Request şeması:** [DistributionRequestDto](DTO-Sozlugu.md#distributionrequestdto).

**Örnek request body:**

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-18",
  "taskIds": [
    "01a16bfe-8e91-7957-abfb-31b89d8a6398"
  ],
  "expectedPlanningVersion": 3
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
  "proposalId": "01a16bfe-9004-7e10-b143-b1d7d3922306",
  "inputVersion": 3,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "planningMode": "Auto",
  "algorithmVersion": "distribution-v1",
  "status": "Applied",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "kind": "Work",
          "startsAt": "2026-10-16T06:00:00+00:00",
          "endsAt": "2026-10-16T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
            "kind": "Work",
            "startsAt": "2026-10-16T06:00:00+00:00",
            "endsAt": "2026-10-16T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "remainingSeconds": 14400,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-17",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "kind": "Work",
          "startsAt": "2026-10-17T06:00:00+00:00",
          "endsAt": "2026-10-17T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
            "kind": "Work",
            "startsAt": "2026-10-17T06:00:00+00:00",
            "endsAt": "2026-10-17T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "remainingSeconds": 7200,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-18",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "kind": "Work",
          "startsAt": "2026-10-18T06:00:00+00:00",
          "endsAt": "2026-10-18T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
            "kind": "Work",
            "startsAt": "2026-10-18T06:00:00+00:00",
            "endsAt": "2026-10-18T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-8e91-7957-abfb-31b89d8a6398",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    }
  ],
  "unplaced": [],
  "applied": {
    "proposalId": "01a16bfe-9004-7e10-b143-b1d7d3922306",
    "changeSetId": "01a16bfe-904d-7f26-9ee9-30797e8d2c5d",
    "planningVersion": 4,
    "revisionIds": [
      "01a16bfe-905e-7060-8195-c4b5b7ac5436",
      "01a16bfe-905e-7012-a710-739eaac7e0de",
      "01a16bfe-905e-7f06-9e32-ebab4ed047f7"
    ],
    "noChanges": false
  },
  "reversesChangeSetId": null,
  "isPartial": false
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
  "traceId": "00-e803c13bc6c0a4371ff2ed701c71d163-39c0f12e85cf88a8-00"
}
```

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
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |

**Request şeması:** [DistributionRequestDto](DTO-Sozlugu.md#distributionrequestdto).

**Örnek request body:**

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-18",
  "taskIds": [
    "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
    "01a16bfa-9dc6-762a-9666-4fb0939ecc0e"
  ]
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
  "proposalId": "01a16bfa-9f26-7e79-b9a3-1180ef600671",
  "inputVersion": 5,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "planningMode": "Preview",
  "algorithmVersion": "distribution-v1",
  "status": "Pending",
  "canApply": true,
  "hasConstraintConflicts": false,
  "days": [
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "kind": "Work",
          "startsAt": "2026-10-16T06:00:00+00:00",
          "endsAt": "2026-10-16T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
            "kind": "Work",
            "startsAt": "2026-10-16T06:00:00+00:00",
            "endsAt": "2026-10-16T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "remainingSeconds": 3600,
          "reason": "InsufficientCapacity"
        },
        {
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "remainingSeconds": 10800,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-17",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "kind": "Work",
          "startsAt": "2026-10-17T06:00:00+00:00",
          "endsAt": "2026-10-17T07:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        },
        {
          "existingScheduleId": null,
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "kind": "Work",
          "startsAt": "2026-10-17T07:00:00+00:00",
          "endsAt": "2026-10-17T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
            "kind": "Work",
            "startsAt": "2026-10-17T06:00:00+00:00",
            "endsAt": "2026-10-17T07:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        },
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
            "kind": "Work",
            "startsAt": "2026-10-17T07:00:00+00:00",
            "endsAt": "2026-10-17T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "remainingSeconds": 7200,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "seconds": 3600,
          "scheduleId": null
        },
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "seconds": 3600,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-18",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "kind": "Work",
          "startsAt": "2026-10-18T06:00:00+00:00",
          "endsAt": "2026-10-18T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
            "kind": "Work",
            "startsAt": "2026-10-18T06:00:00+00:00",
            "endsAt": "2026-10-18T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "AlreadyReserved",
          "taskId": "01a16bfa-9d21-733e-83a0-f2257d3aeefe",
          "seconds": 10800,
          "scheduleId": null
        },
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfa-9dc6-762a-9666-4fb0939ecc0e",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    }
  ],
  "unplaced": [],
  "applied": null,
  "reversesChangeSetId": null,
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Genel odak çalışması sürüyor; otomatik planlamadan önce duraklatın. Hedef süresi gerçek çalışmanın bitiş tahmini değildir.",
  "status": 409,
  "code": "general_work_active",
  "traceId": "00-f6030c120217e6774ac28199293cb87e-727fbceb22091b46-00"
}
```

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
GET /api/scheduling/distribution-proposals/01a16bfe-6a55-762b-9d5b-b344c7cdd7e4
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "01a16bfe-6a55-762b-9d5b-b344c7cdd7e4",
  "inputVersion": 3,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "planningMode": "Auto",
  "algorithmVersion": "distribution-v1",
  "status": "Applied",
  "canApply": false,
  "hasConstraintConflicts": false,
  "days": [
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "kind": "Work",
          "startsAt": "2026-10-16T06:00:00+00:00",
          "endsAt": "2026-10-16T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
            "kind": "Work",
            "startsAt": "2026-10-16T06:00:00+00:00",
            "endsAt": "2026-10-16T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "remainingSeconds": 14400,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-17",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "kind": "Work",
          "startsAt": "2026-10-17T06:00:00+00:00",
          "endsAt": "2026-10-17T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
            "kind": "Work",
            "startsAt": "2026-10-17T06:00:00+00:00",
            "endsAt": "2026-10-17T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [
        {
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "remainingSeconds": 7200,
          "reason": "InsufficientCapacity"
        }
      ],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    },
    {
      "localDate": "2026-10-18",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [
        {
          "existingScheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "kind": "Work",
          "startsAt": "2026-10-18T06:00:00+00:00",
          "endsAt": "2026-10-18T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      ],
      "changes": [
        {
          "type": "Added",
          "scheduleId": null,
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
            "kind": "Work",
            "startsAt": "2026-10-18T06:00:00+00:00",
            "endsAt": "2026-10-18T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "isActive": false,
            "isPreserved": false,
            "isAutomatic": true
          }
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "PlacedFragment",
          "taskId": "01a16bfe-692b-78c6-a554-aaaf6515faa4",
          "seconds": 7200,
          "scheduleId": null
        }
      ]
    }
  ],
  "unplaced": [],
  "applied": {
    "proposalId": "01a16bfe-6a55-762b-9d5b-b344c7cdd7e4",
    "changeSetId": "01a16bfe-6b9d-73f7-8f50-87d71a38b6ba",
    "planningVersion": 4,
    "revisionIds": [
      "01a16bfe-6bb4-712b-8356-037eca1917dc",
      "01a16bfe-6bb4-7255-834d-acbe1775cf3d",
      "01a16bfe-6bb5-79ae-9133-4d96f0054c36"
    ],
    "noChanges": false
  },
  "reversesChangeSetId": null,
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Öneri bulunamadı.",
  "status": 404,
  "code": "proposal_not_found",
  "traceId": "00-6feff931651bb61d3cec207678f82fa0-3a991f0498745cfe-00"
}
```

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
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-15",
  "taskIds": [
    "01a16bf9-6fc6-742d-ae9c-e657c253eda5"
  ],
  "expectedPlanningVersion": 5
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
  "proposalId": "01a16bf9-74ae-73a8-81f3-cfc5571d040d",
  "inputVersion": 5,
  "createdAt": "2026-10-15T06:45:00+00:00",
  "expiresAt": "2026-10-15T06:47:00+00:00",
  "anchorAt": "2026-10-15T06:45:00+00:00",
  "planningMode": "Auto",
  "algorithmVersion": "heuristic-v2",
  "hasConstraintConflicts": true,
  "canApply": false,
  "status": "Pending",
  "blocks": [
    {
      "existingScheduleId": null,
      "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
      "kind": "Work",
      "startsAt": "2026-10-15T06:00:00+00:00",
      "endsAt": "2026-10-15T21:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": true,
      "isPreserved": true,
      "isAutomatic": true
    },
    {
      "existingScheduleId": "01a16bf9-7107-7bad-9c52-20cb8b850238",
      "taskId": null,
      "kind": "Break",
      "startsAt": "2026-10-15T06:40:00+00:00",
      "endsAt": "2026-10-15T07:10:00+00:00",
      "isFixed": true,
      "isLocked": false,
      "isActive": false,
      "isPreserved": true,
      "isAutomatic": false
    }
  ],
  "changes": [
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
        "kind": "Work",
        "startsAt": "2026-10-15T06:00:00+00:00",
        "endsAt": "2026-10-15T21:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": true,
        "isPreserved": true,
        "isAutomatic": true
      }
    }
  ],
  "unplaced": [
    {
      "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
      "remainingSeconds": 0,
      "reason": "NeedsEstimateExtension"
    }
  ],
  "warnings": [
    {
      "code": "ActiveEndUnknown",
      "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
      "seconds": null,
      "scheduleId": null
    },
    {
      "code": "ProtectedConflict",
      "taskId": null,
      "seconds": null,
      "scheduleId": null
    },
    {
      "code": "ReservedExceedsRemaining",
      "taskId": "01a16bf9-6fc6-742d-ae9c-e657c253eda5",
      "seconds": 51300,
      "scheduleId": null
    }
  ],
  "explanations": [],
  "applied": null,
  "reversesChangeSetId": null,
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-15",
  "taskIds": [
    "01a16bff-f9f5-77c4-a2e0-6fe58fb11360"
  ]
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
  "proposalId": "01a16c00-03ca-7d02-bf66-db1b59b1960c",
  "inputVersion": 17,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "anchorAt": "2026-10-15T06:00:00+00:00",
  "planningMode": "Preview",
  "algorithmVersion": "heuristic-v2",
  "hasConstraintConflicts": false,
  "canApply": true,
  "status": "Pending",
  "blocks": [
    {
      "existingScheduleId": null,
      "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
      "kind": "Work",
      "startsAt": "2026-10-15T06:01:00+00:00",
      "endsAt": "2026-10-15T07:01:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
      "kind": "Work",
      "startsAt": "2026-10-15T07:01:00+00:00",
      "endsAt": "2026-10-15T07:16:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
      "kind": "Work",
      "startsAt": "2026-10-15T07:16:00+00:00",
      "endsAt": "2026-10-15T07:31:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "kind": "Work",
      "startsAt": "2026-10-15T07:31:00+00:00",
      "endsAt": "2026-10-15T08:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": "01a16c00-01ca-7f49-ab96-30cdf65eed00",
      "taskId": null,
      "kind": "Break",
      "startsAt": "2026-10-15T08:00:00+00:00",
      "endsAt": "2026-10-15T08:30:00+00:00",
      "isFixed": true,
      "isLocked": false,
      "isActive": false,
      "isPreserved": true,
      "isAutomatic": false
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "kind": "Work",
      "startsAt": "2026-10-15T08:30:00+00:00",
      "endsAt": "2026-10-15T08:31:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    }
  ],
  "changes": [
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
        "kind": "Work",
        "startsAt": "2026-10-15T06:01:00+00:00",
        "endsAt": "2026-10-15T07:01:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
        "kind": "Work",
        "startsAt": "2026-10-15T07:01:00+00:00",
        "endsAt": "2026-10-15T07:16:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
        "kind": "Work",
        "startsAt": "2026-10-15T07:16:00+00:00",
        "endsAt": "2026-10-15T07:31:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
        "kind": "Work",
        "startsAt": "2026-10-15T07:31:00+00:00",
        "endsAt": "2026-10-15T08:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
        "kind": "Work",
        "startsAt": "2026-10-15T08:30:00+00:00",
        "endsAt": "2026-10-15T08:31:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    }
  ],
  "unplaced": [],
  "warnings": [],
  "explanations": [
    {
      "code": "PlacedFragment",
      "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
      "seconds": 3600,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
      "seconds": 900,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
      "seconds": 900,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "seconds": 60,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
      "seconds": 1740,
      "scheduleId": null
    }
  ],
  "applied": null,
  "reversesChangeSetId": null,
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Genel odak çalışması sürüyor; otomatik planlamadan önce duraklatın. Hedef süresi gerçek çalışmanın bitiş tahmini değildir.",
  "status": 409,
  "code": "general_work_active",
  "traceId": "00-c35c754b4fa1e74521cd93837311c50e-7c9267aa763f0d05-00"
}
```

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
GET /api/scheduling/proposals/01a16bf9-11fd-71b7-8dd1-c1f255a62cbe
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "01a16bf9-11fd-71b7-8dd1-c1f255a62cbe",
  "inputVersion": 5,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "anchorAt": "2026-10-15T06:00:00+00:00",
  "planningMode": "Preview",
  "algorithmVersion": "heuristic-v2",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "Applied",
  "blocks": [
    {
      "existingScheduleId": null,
      "taskId": "01a16bf9-0fe6-7768-84da-96b74cae8381",
      "kind": "Work",
      "startsAt": "2026-10-15T06:01:00+00:00",
      "endsAt": "2026-10-15T06:31:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": null,
      "taskId": null,
      "kind": "Buffer",
      "startsAt": "2026-10-15T06:31:00+00:00",
      "endsAt": "2026-10-15T06:36:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bf9-1137-7482-b6fb-7ffffb9b80c2",
      "kind": "Work",
      "startsAt": "2026-10-15T06:36:00+00:00",
      "endsAt": "2026-10-15T06:56:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": true
    }
  ],
  "changes": [
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": null,
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": null,
        "kind": "Buffer",
        "startsAt": "2026-10-15T06:31:00+00:00",
        "endsAt": "2026-10-15T06:36:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bf9-0fe6-7768-84da-96b74cae8381",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bf9-0fe6-7768-84da-96b74cae8381",
        "kind": "Work",
        "startsAt": "2026-10-15T06:01:00+00:00",
        "endsAt": "2026-10-15T06:31:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    },
    {
      "type": "Added",
      "scheduleId": null,
      "taskId": "01a16bf9-1137-7482-b6fb-7ffffb9b80c2",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bf9-1137-7482-b6fb-7ffffb9b80c2",
        "kind": "Work",
        "startsAt": "2026-10-15T06:36:00+00:00",
        "endsAt": "2026-10-15T06:56:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    }
  ],
  "unplaced": [],
  "warnings": [],
  "explanations": [
    {
      "code": "PlacedFragment",
      "taskId": "01a16bf9-0fe6-7768-84da-96b74cae8381",
      "seconds": 1800,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bf9-1137-7482-b6fb-7ffffb9b80c2",
      "seconds": 1200,
      "scheduleId": null
    }
  ],
  "applied": {
    "proposalId": "01a16bf9-11fd-71b7-8dd1-c1f255a62cbe",
    "changeSetId": "01a16bf9-12a4-747c-be2a-ba011c4cb325",
    "planningVersion": 6,
    "revisionIds": [
      "01a16bf9-12b4-78aa-a487-bbc744a8ae79"
    ],
    "noChanges": false
  },
  "reversesChangeSetId": null,
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Öneri bulunamadı.",
  "status": 404,
  "code": "proposal_not_found",
  "traceId": "00-8ad8ad439e71c29e560e73d3fa638691-c4813152157277b1-00"
}
```

## POST /api/scheduling/undo-multi-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `changeSetId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UndoSchedulingRequest](DTO-Sozlugu.md#undoschedulingrequest).

**Örnek request body:**

```json
{
  "changeSetId": "01a16bfa-aebe-7359-b12d-101161ead858"
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
  "proposalId": "01a16bfa-b08d-71d0-a66c-3e0e4860e787",
  "inputVersion": 4,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "expiresAt": "2026-10-15T06:02:00+00:00",
  "planningMode": "Preview",
  "algorithmVersion": "undo-multi-v1",
  "status": "Pending",
  "canApply": true,
  "hasConstraintConflicts": false,
  "days": [
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [],
      "changes": [
        {
          "type": "Removed",
          "scheduleId": "01a16bfa-aebe-7615-bb4c-3290de4f7034",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "before": {
            "id": "01a16bfa-aebe-7615-bb4c-3290de4f7034",
            "dailyPlanId": "01a16bfa-aea4-7de3-adab-fb0f498e341d",
            "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
            "kind": "Work",
            "state": "Planned",
            "startsAt": "2026-10-16T06:00:00+00:00",
            "endsAt": "2026-10-16T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "splitGroupId": "01a16bfa-aebe-7728-b1ba-db18e946d872",
            "originScheduleId": "01a16bfa-aebe-7615-bb4c-3290de4f7034",
            "version": 1,
            "taskSnapshot": {
              "task": {
                "schemaVersion": 2,
                "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
                "taskVersion": 2,
                "title": "Project",
                "ancestors": [],
                "project": null,
                "pool": null,
                "category": null,
                "tags": [],
                "inputPlanningVersion": 3,
                "capturedAt": "2026-10-15T06:00:00+00:00"
              },
              "state": "Pending",
              "hasDirectWork": true,
              "directWorkCompleted": false,
              "requiredForParent": true,
              "directEstimatedSeconds": 21600,
              "targetBudgetSeconds": null
            },
            "isAutomatic": true,
            "completedAt": null
          },
          "after": null
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "UndoFutureCompensation",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "seconds": null,
          "scheduleId": "01a16bfa-aebe-7615-bb4c-3290de4f7034"
        }
      ]
    },
    {
      "localDate": "2026-10-17",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [],
      "changes": [
        {
          "type": "Removed",
          "scheduleId": "01a16bfa-aebe-76ed-9005-5f07ca0b537a",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "before": {
            "id": "01a16bfa-aebe-76ed-9005-5f07ca0b537a",
            "dailyPlanId": "01a16bfa-aebe-7a5f-9519-b29d311bbe65",
            "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
            "kind": "Work",
            "state": "Planned",
            "startsAt": "2026-10-17T06:00:00+00:00",
            "endsAt": "2026-10-17T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "splitGroupId": "01a16bfa-aebe-7728-b1ba-db18e946d872",
            "originScheduleId": "01a16bfa-aebe-7615-bb4c-3290de4f7034",
            "version": 1,
            "taskSnapshot": {
              "task": {
                "schemaVersion": 2,
                "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
                "taskVersion": 2,
                "title": "Project",
                "ancestors": [],
                "project": null,
                "pool": null,
                "category": null,
                "tags": [],
                "inputPlanningVersion": 3,
                "capturedAt": "2026-10-15T06:00:00+00:00"
              },
              "state": "Pending",
              "hasDirectWork": true,
              "directWorkCompleted": false,
              "requiredForParent": true,
              "directEstimatedSeconds": 21600,
              "targetBudgetSeconds": null
            },
            "isAutomatic": true,
            "completedAt": null
          },
          "after": null
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "UndoFutureCompensation",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "seconds": null,
          "scheduleId": "01a16bfa-aebe-76ed-9005-5f07ca0b537a"
        }
      ]
    },
    {
      "localDate": "2026-10-18",
      "timeZoneId": "Europe/Istanbul",
      "blocks": [],
      "changes": [
        {
          "type": "Removed",
          "scheduleId": "01a16bfa-aebe-70f5-97b1-c9f570fe16cd",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "before": {
            "id": "01a16bfa-aebe-70f5-97b1-c9f570fe16cd",
            "dailyPlanId": "01a16bfa-aebe-74d0-8ff3-b6fa10b4bb82",
            "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
            "kind": "Work",
            "state": "Planned",
            "startsAt": "2026-10-18T06:00:00+00:00",
            "endsAt": "2026-10-18T08:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "splitGroupId": "01a16bfa-aebe-7728-b1ba-db18e946d872",
            "originScheduleId": "01a16bfa-aebe-7615-bb4c-3290de4f7034",
            "version": 1,
            "taskSnapshot": {
              "task": {
                "schemaVersion": 2,
                "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
                "taskVersion": 2,
                "title": "Project",
                "ancestors": [],
                "project": null,
                "pool": null,
                "category": null,
                "tags": [],
                "inputPlanningVersion": 3,
                "capturedAt": "2026-10-15T06:00:00+00:00"
              },
              "state": "Pending",
              "hasDirectWork": true,
              "directWorkCompleted": false,
              "requiredForParent": true,
              "directEstimatedSeconds": 21600,
              "targetBudgetSeconds": null
            },
            "isAutomatic": true,
            "completedAt": null
          },
          "after": null
        }
      ],
      "unplaced": [],
      "warnings": [],
      "explanations": [
        {
          "code": "UndoFutureCompensation",
          "taskId": "01a16bfa-abf7-7059-83d1-4f6b3f091ac6",
          "seconds": null,
          "scheduleId": "01a16bfa-aebe-70f5-97b1-c9f570fe16cd"
        }
      ]
    }
  ],
  "unplaced": [],
  "applied": null,
  "reversesChangeSetId": "01a16bfa-aebe-7359-b12d-101161ead858",
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Etkilenen günlerin birinde daha yeni kullanıcı plan kararı var.",
  "status": 409,
  "code": "undo_not_latest",
  "traceId": "00-e46d3b49e371e8cf934b65ff4ab53b2e-66f52cfd65b9b775-00"
}
```

## POST /api/scheduling/undo-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `changeSetId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UndoSchedulingRequest](DTO-Sozlugu.md#undoschedulingrequest).

**Örnek request body:**

```json
{
  "changeSetId": "01a16bfb-5183-7772-bf3e-8acac1eecd04",
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
  "proposalId": "01a16bfb-52f1-712c-b2c5-ccfeeecbe80e",
  "inputVersion": 7,
  "createdAt": "2026-10-15T06:10:00+00:00",
  "expiresAt": "2026-10-15T06:12:00+00:00",
  "anchorAt": "2026-10-15T06:10:00+00:00",
  "planningMode": "Preview",
  "algorithmVersion": "undo-v1",
  "hasConstraintConflicts": false,
  "canApply": true,
  "status": "Pending",
  "blocks": [
    {
      "existingScheduleId": "01a16bfb-4e97-7d58-a72c-fb9e125c1da5",
      "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
      "kind": "Work",
      "startsAt": "2026-10-15T06:30:00+00:00",
      "endsAt": "2026-10-15T07:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": false
    }
  ],
  "changes": [
    {
      "type": "Restored",
      "scheduleId": "01a16bfb-4e97-7d58-a72c-fb9e125c1da5",
      "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
      "before": {
        "id": "01a16bfb-4e97-7d58-a72c-fb9e125c1da5",
        "dailyPlanId": "01a16bfb-4e7e-76a6-bd2f-3e1adbc751a1",
        "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
        "kind": "Work",
        "state": "Removed",
        "startsAt": "2026-10-15T06:30:00+00:00",
        "endsAt": "2026-10-15T07:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "splitGroupId": null,
        "originScheduleId": null,
        "version": 2,
        "taskSnapshot": {
          "task": {
            "schemaVersion": 2,
            "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
            "taskVersion": 2,
            "title": "Original title",
            "ancestors": [],
            "project": null,
            "pool": null,
            "category": null,
            "tags": [],
            "inputPlanningVersion": 3,
            "capturedAt": "2026-10-15T06:00:00+00:00"
          },
          "state": "Pending",
          "hasDirectWork": true,
          "directWorkCompleted": false,
          "requiredForParent": true,
          "directEstimatedSeconds": 3600,
          "targetBudgetSeconds": null
        },
        "isAutomatic": false,
        "completedAt": null
      },
      "after": {
        "existingScheduleId": "01a16bfb-4e97-7d58-a72c-fb9e125c1da5",
        "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
        "kind": "Work",
        "startsAt": "2026-10-15T06:30:00+00:00",
        "endsAt": "2026-10-15T07:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": false
      }
    }
  ],
  "unplaced": [],
  "warnings": [],
  "explanations": [
    {
      "code": "UndoFutureCompensation",
      "taskId": "01a16bfb-4c89-78c0-a33b-afc6551fea35",
      "seconds": null,
      "scheduleId": "01a16bfb-4e97-7d58-a72c-fb9e125c1da5"
    }
  ],
  "applied": null,
  "reversesChangeSetId": "01a16bfb-5183-7772-bf3e-8acac1eecd04",
  "isPartial": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Yalnız günün son kullanıcı plan değişikliğini geri alabilirsiniz.",
  "status": 409,
  "code": "undo_not_latest",
  "traceId": "00-1584377f4802ec48e337e0a7cef844e5-2501422f8c647e8d-00"
}
```

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
GET /api/tasks/01a16bfd-ff30-7cc8-af61-5db446ea61a8/allocation?from=2026-10-15T09%3A00%3A00.0000000%2B03%3A00&to=2026-10-16T09%3A00%3A00.0000000%2B03%3A00
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskAllocation](DTO-Sozlugu.md#taskallocation).

```json
{
  "taskId": "01a16bfd-ff30-7cc8-af61-5db446ea61a8",
  "from": "2026-10-15T06:00:00+00:00",
  "to": "2026-10-16T06:00:00+00:00",
  "cutoff": "2026-10-15T06:00:00+00:00",
  "directActualSeconds": 0,
  "allocatedSeconds": 3600,
  "remainingSeconds": null,
  "unallocatedSeconds": null,
  "excessAllocatedSeconds": null
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
  "traceId": "00-8cb6386924b7ddfe20f676796b5aba71-2e98de9692bb7c41-00"
}
```

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `expectedSessionId` | Guid? | DTO/modül iş kuralı |
| `expectedSessionVersion` | Int64? | range:1..9,223372036854776E+18 |
| `remainingTaskIds` | Guid[] | maxLength:1000 |

**Request şeması:** [ImmediateWorkRequest](DTO-Sozlugu.md#immediateworkrequest).

**Örnek request body:**

```json
{
  "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
  "expectedPlanningVersion": 11,
  "expectedSessionId": "01a16bf9-2945-7855-a070-6321bfd5b839",
  "expectedSessionVersion": 1
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
      "id": "01a16bf9-2a3c-7679-8402-0cda07e6652b",
      "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
      "state": "Running",
      "source": "Timer",
      "startedAt": "2026-10-15T06:20:00+00:00",
      "endedAt": null,
      "timeZoneId": "Europe/Istanbul",
      "taskAtStart": {
        "schemaVersion": 2,
        "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
        "taskVersion": 3,
        "title": "Acil",
        "ancestors": [],
        "project": null,
        "pool": null,
        "category": null,
        "tags": [],
        "inputPlanningVersion": 11,
        "capturedAt": "2026-10-15T06:20:00+00:00"
      },
      "version": 1,
      "activeSeconds": 0,
      "serverNow": "2026-10-15T06:20:00+00:00",
      "recordedAt": "2026-10-15T06:20:00+00:00",
      "startedScheduleId": null,
      "startedRevisionItemId": null
    },
    "pausedSession": {
      "id": "01a16bf9-2945-7855-a070-6321bfd5b839",
      "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
      "state": "Paused",
      "source": "Timer",
      "startedAt": "2026-10-15T06:00:00+00:00",
      "endedAt": null,
      "timeZoneId": "Europe/Istanbul",
      "taskAtStart": {
        "schemaVersion": 2,
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "taskVersion": 3,
        "title": "React",
        "ancestors": [],
        "project": null,
        "pool": null,
        "category": null,
        "tags": [],
        "inputPlanningVersion": 10,
        "capturedAt": "2026-10-15T06:00:00+00:00"
      },
      "version": 2,
      "activeSeconds": 1200,
      "serverNow": "2026-10-15T06:20:00+00:00",
      "recordedAt": "2026-10-15T06:00:00+00:00",
      "startedScheduleId": "01a16bf9-2758-731f-9e8f-ffa713cf491e",
      "startedRevisionItemId": "01a16bf9-2901-7b42-ba44-ae3ca3d4f658"
    },
    "localDate": "2026-10-15",
    "planningVersion": 12,
    "taskIds": [
      "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
      "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
      "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7"
    ],
    "resumed": false
  },
  "plan": {
    "proposalId": "01a16bf9-2cfd-736f-ba51-565eba809047",
    "inputVersion": 12,
    "createdAt": "2026-10-15T06:20:00+00:00",
    "expiresAt": "2026-10-15T06:22:00+00:00",
    "anchorAt": "2026-10-15T06:20:00+00:00",
    "planningMode": "Auto",
    "algorithmVersion": "heuristic-v2",
    "hasConstraintConflicts": false,
    "canApply": false,
    "status": "Applied",
    "blocks": [
      {
        "existingScheduleId": "01a16bf9-2758-731f-9e8f-ffa713cf491e",
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "kind": "Work",
        "startsAt": "2026-10-15T06:00:00+00:00",
        "endsAt": "2026-10-15T06:20:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": true,
        "isAutomatic": false
      },
      {
        "existingScheduleId": null,
        "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
        "kind": "Work",
        "startsAt": "2026-10-15T06:20:00+00:00",
        "endsAt": "2026-10-15T06:50:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": true,
        "isPreserved": true,
        "isAutomatic": true
      },
      {
        "existingScheduleId": null,
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "kind": "Work",
        "startsAt": "2026-10-15T06:50:00+00:00",
        "endsAt": "2026-10-15T07:30:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      },
      {
        "existingScheduleId": null,
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "kind": "Work",
        "startsAt": "2026-10-15T07:30:00+00:00",
        "endsAt": "2026-10-15T08:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      },
      {
        "existingScheduleId": "01a16bf9-28ee-749b-9518-6120e9302edf",
        "taskId": null,
        "kind": "Break",
        "startsAt": "2026-10-15T08:00:00+00:00",
        "endsAt": "2026-10-15T08:30:00+00:00",
        "isFixed": true,
        "isLocked": false,
        "isActive": false,
        "isPreserved": true,
        "isAutomatic": false
      },
      {
        "existingScheduleId": null,
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "kind": "Work",
        "startsAt": "2026-10-15T08:30:00+00:00",
        "endsAt": "2026-10-15T09:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    ],
    "changes": [
      {
        "type": "Added",
        "scheduleId": null,
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "before": null,
        "after": {
          "existingScheduleId": null,
          "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
          "kind": "Work",
          "startsAt": "2026-10-15T06:50:00+00:00",
          "endsAt": "2026-10-15T07:30:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      },
      {
        "type": "Added",
        "scheduleId": null,
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "before": null,
        "after": {
          "existingScheduleId": null,
          "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
          "kind": "Work",
          "startsAt": "2026-10-15T07:30:00+00:00",
          "endsAt": "2026-10-15T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      },
      {
        "type": "Added",
        "scheduleId": null,
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "before": null,
        "after": {
          "existingScheduleId": null,
          "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
          "kind": "Work",
          "startsAt": "2026-10-15T08:30:00+00:00",
          "endsAt": "2026-10-15T09:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": false,
          "isAutomatic": true
        }
      },
      {
        "type": "Added",
        "scheduleId": null,
        "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
        "before": null,
        "after": {
          "existingScheduleId": null,
          "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
          "kind": "Work",
          "startsAt": "2026-10-15T06:20:00+00:00",
          "endsAt": "2026-10-15T06:50:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": true,
          "isPreserved": true,
          "isAutomatic": true
        }
      },
      {
        "type": "Removed",
        "scheduleId": "01a16bf9-286a-7610-b5c1-c21b4bbbdc29",
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "before": {
          "id": "01a16bf9-286a-7610-b5c1-c21b4bbbdc29",
          "dailyPlanId": "01a16bf9-274f-7ccb-8926-4b118c71a174",
          "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
          "kind": "Work",
          "state": "Planned",
          "startsAt": "2026-10-15T07:00:00+00:00",
          "endsAt": "2026-10-15T08:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "splitGroupId": null,
          "originScheduleId": null,
          "version": 1,
          "taskSnapshot": {
            "task": {
              "schemaVersion": 2,
              "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
              "taskVersion": 2,
              "title": "Backend",
              "ancestors": [],
              "project": null,
              "pool": null,
              "category": null,
              "tags": [],
              "inputPlanningVersion": 8,
              "capturedAt": "2026-10-15T06:00:00+00:00"
            },
            "state": "Pending",
            "hasDirectWork": true,
            "directWorkCompleted": false,
            "requiredForParent": true,
            "directEstimatedSeconds": 3600,
            "targetBudgetSeconds": null
          },
          "isAutomatic": false,
          "completedAt": null
        },
        "after": null
      },
      {
        "type": "Updated",
        "scheduleId": "01a16bf9-2758-731f-9e8f-ffa713cf491e",
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "before": {
          "id": "01a16bf9-2758-731f-9e8f-ffa713cf491e",
          "dailyPlanId": "01a16bf9-274f-7ccb-8926-4b118c71a174",
          "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
          "kind": "Work",
          "state": "Planned",
          "startsAt": "2026-10-15T06:00:00+00:00",
          "endsAt": "2026-10-15T07:00:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "splitGroupId": null,
          "originScheduleId": null,
          "version": 1,
          "taskSnapshot": {
            "task": {
              "schemaVersion": 2,
              "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
              "taskVersion": 2,
              "title": "React",
              "ancestors": [],
              "project": null,
              "pool": null,
              "category": null,
              "tags": [],
              "inputPlanningVersion": 7,
              "capturedAt": "2026-10-15T06:00:00+00:00"
            },
            "state": "Pending",
            "hasDirectWork": true,
            "directWorkCompleted": false,
            "requiredForParent": true,
            "directEstimatedSeconds": 3600,
            "targetBudgetSeconds": null
          },
          "isAutomatic": false,
          "completedAt": null
        },
        "after": {
          "existingScheduleId": "01a16bf9-2758-731f-9e8f-ffa713cf491e",
          "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
          "kind": "Work",
          "startsAt": "2026-10-15T06:00:00+00:00",
          "endsAt": "2026-10-15T06:20:00+00:00",
          "isFixed": false,
          "isLocked": false,
          "isActive": false,
          "isPreserved": true,
          "isAutomatic": false
        }
      }
    ],
    "unplaced": [],
    "warnings": [],
    "explanations": [
      {
        "code": "AlreadyReserved",
        "taskId": "01a16bf9-250a-74e0-a9e9-e2d9fcd471e7",
        "seconds": 1800.0,
        "scheduleId": null
      },
      {
        "code": "PlacedFragment",
        "taskId": "01a16bf9-2012-7a29-bcd8-2de2bfc4c5de",
        "seconds": 2400,
        "scheduleId": null
      },
      {
        "code": "PlacedFragment",
        "taskId": "01a16bf9-21b8-7b03-8e7b-162ef408d3c5",
        "seconds": 1800,
        "scheduleId": null
      }
    ],
    "applied": {
      "proposalId": "01a16bf9-2cfd-736f-ba51-565eba809047",
      "changeSetId": "01a16bf9-2de7-7ba4-a0a2-c8402bc4918b",
      "planningVersion": 13,
      "revisionIds": [
        "01a16bf9-2dfa-7a66-9d1a-739afbdc76c0"
      ],
      "noChanges": false
    },
    "reversesChangeSetId": null,
    "isPartial": false
  },
  "planningStatus": "Applied",
  "planningError": null,
  "replayed": false
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Beklenen aktif oturum değişmiş; güncel durumu alın.",
  "status": 409,
  "code": "session_conflict",
  "traceId": "00-e75603985c39e3067326cdf273b846ae-e2f3adbc183b6514-00"
}
```

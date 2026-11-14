# Takvim ve gün sonu taşıma

Range iki uç dahil1..42yerel gün; olmayan güne boş görünüm okumak DailyPlan yaratmaz. Day plan/actual/completion listelerinin bağımsız offset/limit’leri vardır. revisionId yalnız o owner/güne ait eski planı seçer. Task adı/yolu ve geçmiş completion bugünkü task satırından yeniden yazılmaz. Actual source session zone’uyla kesişir; legacy bilinmeyen zone açık kapsam sayacıdır. Carry açık hedef aralığında kalan tahsisi önerir; sessiz yarına taşıma yoktur. Pool işlemi task bağını ve gelecekteki tahsisi revision’la değiştirir, actual geçmişini korur. [Ayrıntı](../calendar-history.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/calendar

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `FromDate` | query | hayır | string (date); — |
| `ToDate` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/calendar
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarRangeView](DTO-Sozlugu.md#calendarrangeview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "serverNow": "2026-10-16T06:00:00Z",
  "days": [],
  "legacyZoneCompletionCount": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/calendar/days/{date}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `RevisionId` | query | hayır | string (uuid); — |
| `PlanOffset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `PlanLimit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `ActualOffset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `ActualLimit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `CompletionOffset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `CompletionLimit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/calendar/days/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarDayView](DTO-Sozlugu.md#calendardayview).

```json
{
  "summary": {
    "localDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "dailyPlanId": "11111111-1111-4111-8111-111111111111",
    "currentRevisionId": "11111111-1111-4111-8111-111111111111",
    "baselineRevisionId": "11111111-1111-4111-8111-111111111111",
    "revisionNumber": 1,
    "planningVersion": 0,
    "plannedWorkSeconds": 1,
    "plannedBreakSeconds": 1,
    "plannedBufferSeconds": 1,
    "baselineWorkSeconds": 1,
    "plannedBlockCount": 1,
    "actualSeconds": 1,
    "actualSegmentCount": 1,
    "completedTaskCount": 1,
    "hasOpenWork": false
  },
  "serverNow": "2026-10-16T06:00:00Z",
  "plan": {
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1,
    "revisionId": "11111111-1111-4111-8111-111111111111"
  },
  "actual": {
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1
  },
  "completions": {
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1
  },
  "legacyZoneCompletionCount": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/calendar/days/{date}/carry

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Kullanıcının Preview/Auto tercihini izler; yanıtın status/applied alanını okuyun, her200 sonucu accepted revision sanmayın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
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
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/carry
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

## POST /api/calendar/days/{date}/defer

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R3 erteleme: atanmış saatleri iptal et ve aynı görevleri targetDate gününe saatsiz al. Hedef saat/çakışma hesabı yoktur. schedules + items toplam 1–50 id/version; expectedPlanningVersion, açık koruma izni. Önizleme planı değiştirmez; apply bütün kontrolleri yeniden yapar ve Idempotency-Key ister. Bir görev için mevcut hedef saatsiz öğe korunur, aksi halde kaynak saatsiz öğe taşınır veya yeni plan öğesi eklenir. Tamamlanmış öğe/gerçek çalışma korunur; çalışan iş durdurulmaz. Tek ChangeSet, herhangi bir hatada tam rollback; day-items/undo ile telafi. Aynı key makbuz replayidir, undo sonrasında tekrar uygulamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `targetDate` | DateOnly? | required |
| `schedules` | PlanEntryVersionRequest[] | required; maxLength:50 |
| `items` | PlanEntryVersionRequest[] | required; maxLength:50 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [DeferDaySelectionRequest](DTO-Sozlugu.md#deferdayselectionrequest).

**Örnek request body:**

```json
{
  "targetDate": "2026-10-16",
  "schedules": [],
  "items": [],
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/defer
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayDeferralResult](DTO-Sozlugu.md#daydeferralresult).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "items": [],
  "revisionIds": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/calendar/days/{date}/defer-preview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R3 erteleme: atanmış saatleri iptal et ve aynı görevleri targetDate gününe saatsiz al. Hedef saat/çakışma hesabı yoktur. schedules + items toplam 1–50 id/version; expectedPlanningVersion, açık koruma izni. Önizleme planı değiştirmez; apply bütün kontrolleri yeniden yapar ve Idempotency-Key ister. Bir görev için mevcut hedef saatsiz öğe korunur, aksi halde kaynak saatsiz öğe taşınır veya yeni plan öğesi eklenir. Tamamlanmış öğe/gerçek çalışma korunur; çalışan iş durdurulmaz. Tek ChangeSet, herhangi bir hatada tam rollback; day-items/undo ile telafi. Aynı key makbuz replayidir, undo sonrasında tekrar uygulamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `targetDate` | DateOnly? | required |
| `schedules` | PlanEntryVersionRequest[] | required; maxLength:50 |
| `items` | PlanEntryVersionRequest[] | required; maxLength:50 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [DeferDaySelectionRequest](DTO-Sozlugu.md#deferdayselectionrequest).

**Örnek request body:**

```json
{
  "targetDate": "2026-10-16",
  "schedules": [],
  "items": [],
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/defer-preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayDeferralPreview](DTO-Sozlugu.md#daydeferralpreview).

```json
{
  "sourceDate": "2026-10-16",
  "targetDate": "2026-10-16",
  "planningVersion": 0,
  "schedules": [],
  "items": [],
  "tasks": [],
  "issues": [],
  "canApply": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/calendar/days/{date}/defer-tasks

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Görev Ertele: tasks[{taskId,targetDate}] 1–50 farklı görev ve her birinin kaynak günden sonraki hedefi; expectedPlanningVersion ve zorunlu Idempotency-Key. Sunucu görevlerin kaynak gündeki bütün açık saatli/saatsiz parçalarını bulur (en çok500 öğe); UI sayfaları tam olmak zorunda değildir. Önizleme/onay adımı yok. Tüm hedefler tek transaction/ChangeSet, tek planning version artışı; rutin görevi/protected/running/stale/owner/hedefte tamamlanmış öğe veya DB hatasında tamamı rollback. Hedefte mevcut açık öğe korunur; diğerleri saatsiz taşınır, görev ve actual değişmez. Sonuç items farklı localDate içerebilir. Aynı normalize seçim+key özgün sonucu döndürür; belirsiz yazı yalnız açık kullanıcı isteğiyle aynı key ile alınır. [Ayrıntı](../task-deferral.md).

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `tasks` | DeferTaskTargetRequest[] | required; minLength:1; maxLength:50 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |

**Request şeması:** [DeferTasksRequest](DTO-Sozlugu.md#defertasksrequest).

**Örnek request body:**

```json
{
  "tasks": [
    {
      "taskId": "11111111-1111-4111-8111-111111111111",
      "targetDate": "2026-10-16"
    }
  ],
  "expectedPlanningVersion": 0
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/defer-tasks
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayDeferralResult](DTO-Sozlugu.md#daydeferralresult).

```json
{
  "changeSetId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "schedules": [],
  "items": [],
  "revisionIds": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/calendar/days/{date}/pool-batch

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** UI-R3 Hafiflet: 1–50 farklı tasks[{id,version}], poolId ve expectedPlanningVersion; zorunlu Idempotency-Key. Tek transaction/ChangeSet: seçilen görevlerin kendi havuzu değişir, gelecekteki saatli tahsisleri ve kaynak günün açık saatsiz öğeleri kaldırılır; tamamlanmış öğeler/gerçek çalışma korunur. Owner/stale/running/protected hatasında tamamı rollback olur. PlanMutation receipt sonrası GET ile güncelleyin; aynı key yeniden etki uygulamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `tasks` | PoolTaskVersionRequest[] | required; minLength:1; maxLength:50 |
| `poolId` | Guid? | required |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [ReturnManyToPoolRequest](DTO-Sozlugu.md#returnmanytopoolrequest).

**Örnek request body:**

```json
{
  "tasks": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "version": 1
    }
  ],
  "poolId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0,
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/pool-batch
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

## POST /api/calendar/days/{date}/tasks/{id}/pool

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9.223372036854776E+18 |
| `poolId` | Guid? | required |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:2000 |

**Request şeması:** [ReturnToPoolRequest](DTO-Sozlugu.md#returntopoolrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "expectedPlanningVersion": 0,
  "poolId": "11111111-1111-4111-8111-111111111111",
  "allowProtectedChange": false,
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/11111111-1111-4111-8111-111111111111/tasks/11111111-1111-4111-8111-111111111111/pool
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

## GET /api/calendar/items

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R2 takvim öğeleri: 1–42 günlük aralıkta her günün güncel planı (saatli Work blokları ve saatsiz gün öğeleri). Mola/tampon, kaldırılmış bloklar ve silinmiş görevler dönmez. Her öğe görevin, doğrudan üst görevin ve kök görevin güncel başlığını taşır; ay/hafta görünümü kök göreve göre gruplar. Sıra: gün, saatliler başlangıca göre, sonra saatsizler ekleme sırasıyla. offset/limit (en çok500) ve total ile sayfalanır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `FromDate` | query | hayır | string (date); — |
| `ToDate` | query | hayır | string (date); — |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=500; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/calendar/items
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarItemPage](DTO-Sozlugu.md#calendaritempage).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/calendar/overview

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** 1–42 yerel gün; her günün tüm item/completed/root-group toplamları ve ilk görünüm sırasındaki en çok3 kök önizlemesi. Saatli Work ve saatsiz öğe filtreleri calendar/items ile aynıdır. Grup done bütün grup üzerinden hesaplanır; görünmeyen öğeler istemciye taşınmaz. Frozen gün zone, owner planningVersion ve serverNow aynı RepeatableRead snapshotındadır. Read gün yaratmaz; private/no-store.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `FromDate` | query | hayır | string (date); — |
| `ToDate` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/calendar/overview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarOverviewView](DTO-Sozlugu.md#calendaroverviewview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0,
  "days": [
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "itemCount": 0,
      "completedItemCount": 0,
      "rootGroupCount": 0,
      "roots": []
    }
  ]
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

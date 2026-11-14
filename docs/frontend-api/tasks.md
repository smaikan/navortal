# Görev, ağaç, yaşam döngüsü ve ilişkiler

Yalnız title ile task oluşturulur; tahmin null kalabilir. PUT task alan belgesini değiştirir: gönderilmeyen description/deadline null, priority Normal, canSplit true varsayılanına dönebilir; partial PATCH gibi kullanmayın. Server süre/status/timestamps genel PUT ile yazılmaz. DirectEstimate kendi işidir, TargetBudget toplam hedeftir ve çocuk toplamına eklenmez. Container toplamını çocuklarla tekrar saymayın. State komutunda action=Complete ile state=Completed farklı kavramlardır; CompleteDirectWork yalnız parent’ın kendi işini kapatabilir. Parent completion choice, tree move ve child oluşturma parentWorkDisposition koşullarını ilgili DTO ve [iş yükü sözleşmesinden](../database-design.md) izleyin. Gerçek dependency çalışma başlangıcını engeller; ordering yumuşak sıradır. Döngü/self/ancestor beklemeleri reddedilir. Archive soft’tur; tarihsel FK koparılmaz. Arşivi geri açma endpointi yoktur; her task create key destekler varsaymayın.

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/tasks

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** excludeRecurring varsayılan false; true olduğunda aynı owner recurrence occurrence kaydına bağlı görevler sayım/sayfalama öncesinde dışlanır. Şablon kapalı veya görev tamamlanmış olsa da köken bağı sürer. Görevler ekranı true kullanır; gün planı, rutin, görev ayrıntısı ve seçicilerin varsayılan okumaları değişmez. Çocuk özetleri tüm domain alt ağacını anlatmayı sürdürür.

**Ek entegrasyon kuralı:** orderBy: CreatedDesc/Title/Priority/Deadline/CompletedDesc (UI-R2: tamamlananlar en yeni önce). Silinmiş görevler includeArchived ile de dönmez. assignedOn=YYYY-MM-DD kendi atanmış aralığı o günü kapsayan görevleri döndürür (kapsayıcılar dahil; çocuklardan türeyen aralık bu filtreye girmez). Search literal case-insensitive başlık alt dizisi, en çok200karakter; %/_ joker değildir. isPlanned verilirse from/to pozitif ve en çok366gün zorunlu; yalnız now sonrası Planned Work kesişimi aranır. from/to tek başına deadline veya create filtresi değildir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `search` | query | hayır | string; — |
| `includeArchived` | query | hayır | boolean; default=false |
| `priority` | query | hayır | object: Low, Normal, High, Urgent, null; — |
| `projectId` | query | hayır | string (uuid); — |
| `poolId` | query | hayır | string (uuid); — |
| `categoryId` | query | hayır | string (uuid); — |
| `tagId` | query | hayır | string (uuid); — |
| `orderBy` | query | hayır | string; default="CreatedDesc" |
| `state` | query | hayır | [TaskState](DTO-Sozlugu.md#taskstate); — |
| `includeCompleted` | query | hayır | boolean; default=true |
| `isPlanned` | query | hayır | boolean; — |
| `from` | query | hayır | string (date-time); — |
| `to` | query | hayır | string (date-time); — |
| `assignedOn` | query | hayır | string (date); — |
| `energyDemand` | query | hayır | [EnergyLevel](DTO-Sozlugu.md#energylevel); — |
| `excludeRecurring` | query | hayır | boolean; default=false |
| `minEstimateSeconds` | query | hayır | integer\|string (int64); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `maxEstimateSeconds` | query | hayır | integer\|string (int64); pattern="^-?(?:0\|[1-9]\\d*)$" |
| `dateFrom` | query | hayır | string (date); — |
| `dateTo` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskPage](DTO-Sozlugu.md#taskpage).

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

## POST /api/tasks

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `title` | String | required; length:0..300 |
| `description` | String | length:0..10000 |
| `priority` | TaskPriority | DTO/modül iş kuralı |
| `deadlineAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `canSplit` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [TaskFieldsRequest](DTO-Sozlugu.md#taskfieldsrequest).

**Örnek request body:**

```json
{
  "title": "Raporu yaz",
  "description": "örnek",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false
}
```

**Örnek HTTP:**

```http
POST /api/tasks
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/batch

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `titles` | String[] | required; minLength:1; maxLength:50 |
| `poolId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [TaskBatchRequest](DTO-Sozlugu.md#taskbatchrequest).

**Örnek request body:**

```json
{
  "titles": [
    "örnek"
  ],
  "poolId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/batch
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskBatchResult](DTO-Sozlugu.md#taskbatchresult).

```json
{
  "items": [],
  "planningVersion": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/children

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** excludeRecurring varsayılan false; true olduğunda aynı owner recurrence occurrence kaydına bağlı görevler sayım/sayfalama öncesinde dışlanır. Şablon kapalı veya görev tamamlanmış olsa da köken bağı sürer. Görevler ekranı true kullanır; gün planı, rutin, görev ayrıntısı ve seçicilerin varsayılan okumaları değişmez. Çocuk özetleri tüm domain alt ağacını anlatmayı sürdürür.

**Ek entegrasyon kuralı:** UI-R2: completed=false açık kardeşleri kardeş sırasıyla, completed=true tamamlananları en yeni tamamlanma önce döndürür; boşsa ikisi birlikte. summaries her satır için doğrudan çocuk sayıları ve bilinen alt ağaç tahminini taşır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `parentId` | query | hayır | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `includeArchived` | query | hayır | boolean; default=false |
| `completed` | query | hayır | boolean; — |
| `excludeRecurring` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/children
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreePage](DTO-Sozlugu.md#treepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "hasMore": false,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/picker

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Varsayılan düz seçici uyumludur. hierarchy=true kapsayıcı kökleri ve Children ağacını da döndürür; sayfalama kökler üzerinden, arama üst bağlamı koruyarak yapılır. date atanmış/diğer grupları ayrılır. offset/assignedOffset bağımsız, limit1..100; UI25. Ebeveyn başlığı aynı sorguda, HasExactMatch bütün uygun kümede. Literal Türkçe substring; her satır için ek parent GET yok. Coverage aynı repeatable-read snapshot içindeki owner sürümleridir; UI yalnız bütün sayfalar güncel planning sürümü ve ±15sn tazelik taşıyorsa handshake tekrar okumasını atlar; eksik/eski sertifika yeniden okunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | query | hayır | string (date); — |
| `search` | query | hayır | string; — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `assignedOffset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=25 |
| `hierarchy` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/picker
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskPickerView](DTO-Sozlugu.md#taskpickerview).

```json
{
  "assigned": {
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1
  },
  "other": {
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1
  },
  "hasExactMatch": false,
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

## POST /api/tasks/tree

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** F7 satır içi ekleme: yeni kök görev ve iç içe alt görevleri tek transaction ile açar. Kök dahil en çok50 görev, en çok5 seviye; başlıklar kırpılır ve1..300 olmalı, boş satır gönderilmez. Alt görevi olan görev kapsayıcıdır (doğrudan iş yok), yapraklar doğrudan iştir; sıra gönderilen sıradır. Geçersiz ağaç400 task_tree_invalid ve hiçbir kayıt oluşmaz. Idempotency-Key zorunlu: aynı key + aynı ağaç özgün sonucu Idempotent-Replay ile döndürür, farklı ağaç409 idempotency_conflict. Yanıt root, oluşturulma sırasıyla created ve planningVersion içerir; ağaç okumaları sonra yenilenir. Alt görevsiz tek başlık için POST /api/tasks yeterlidir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `title` | String | required; length:0..300 |
| `children` | TaskTreeRequest[] | maxLength:50 |

**Request şeması:** [TaskTreeRequest](DTO-Sozlugu.md#tasktreerequest).

**Örnek request body:**

```json
{
  "title": "Raporu yaz",
  "children": null
}
```

**Örnek HTTP:**

```http
POST /api/tasks/tree
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskTreeCreateResult](DTO-Sozlugu.md#tasktreecreateresult).

```json
{
  "root": {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Raporu yaz",
    "description": "örnek",
    "state": "Pending",
    "priority": "Low",
    "deadlineAt": "2026-10-16T06:00:00Z",
    "canSplit": false,
    "directEstimatedSeconds": 1,
    "createdAt": "2026-10-16T06:00:00Z",
    "updatedAt": "2026-10-16T06:00:00Z",
    "archivedAt": "2026-10-16T06:00:00Z",
    "version": 1,
    "parentTaskId": "11111111-1111-4111-8111-111111111111",
    "sortOrder": 1,
    "hasDirectWork": false,
    "targetBudgetSeconds": 1,
    "directWorkCompleted": false,
    "requiredForParent": false,
    "completionOrigin": "Manual",
    "completedAt": "2026-10-16T06:00:00Z",
    "projectId": "11111111-1111-4111-8111-111111111111",
    "poolId": "11111111-1111-4111-8111-111111111111",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "energyDemand": "Low",
    "autoCompleteFromChildren": true,
    "plannedFrom": "2026-10-16",
    "plannedTo": "2026-10-16"
  },
  "created": [],
  "planningVersion": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Tam alan güncellemesidir: title gerekli; optional alanın gönderilmemesi null/default’a dönüşebilir. Mevcut alanları korumak için son TaskView’den uygun request alanlarını gönderin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `title` | String | required; length:0..300 |
| `description` | String | length:0..10000 |
| `priority` | TaskPriority | DTO/modül iş kuralı |
| `deadlineAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `canSplit` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [UpdateTaskRequest](DTO-Sozlugu.md#updatetaskrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "title": "Raporu yaz",
  "description": "örnek",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/ancestors

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Yakından uzağa üst görev yolu; başlangıç görevi hariç. limit varsayılan16,1..100; sınırsız mantıksal derinliğin açık sayfalı okuması. nextCursor null bitiştir; imleç owner/task/planningVersion/offset ve HMAC ile doğrulanır. Değişmiş planning sürümünde409 ancestor_cursor_stale ile baştan oku; bozuk/yabancı imleç400. Owner filtreli recursive SQL, döngü güvenliği; SQL komut sayısı derinlikle artmaz fakat traversal satır/CPU maliyeti ücretsiz değildir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=16 |
| `cursor` | query | hayır | string; — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/ancestors
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskAncestorPage](DTO-Sozlugu.md#taskancestorpage).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "items": [],
  "nextCursor": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Açık/arşivlenmemiş çocuk veya Running/Paused work varsa409. Soft archive200TaskView döndürür; ilgili gelecekteki bloklar revisionla kapanabilir. Unarchive endpointi yoktur.

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
POST /api/tasks/11111111-1111-4111-8111-111111111111/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}/auto-complete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R2 görev başına otomatik tamamlama anahtarı. true yapıldığında görev hemen uzlaştırılır (çocukları bitmişse Automatic tamamlanır); false yapmak tamamlanmış görevi yeniden açmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `autoCompleteFromChildren` | Boolean? | required |

**Request şeması:** [TaskAutoCompleteRequest](DTO-Sozlugu.md#taskautocompleterequest).

**Örnek request body:**

```json
{
  "version": 1,
  "autoCompleteFromChildren": false
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/auto-complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/children

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Çocuk parentın project/pool/category/tag bağlarını başlangıçta miras alır. İlk çocukta parentın direct estimate/history/future plan durumuna göre PreserveDirect/ConvertToContainer seçimi gerekebilir. Yanıt çocuktur; parent sürümünü de refetch edin.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `parentVersion` | Int64 | range:1..9.223372036854776E+18 |
| `parentWorkDisposition` | ParentWorkDisposition? | DTO/modül iş kuralı |
| `title` | String | required; length:0..300 |
| `description` | String | length:0..10000 |
| `priority` | TaskPriority | DTO/modül iş kuralı |
| `deadlineAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `canSplit` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [CreateChildRequest](DTO-Sozlugu.md#createchildrequest).

**Örnek request body:**

```json
{
  "parentVersion": 1,
  "parentWorkDisposition": "PreserveDirect",
  "title": "Raporu yaz",
  "description": "örnek",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false
}
```

**Örnek HTTP:**

```http
POST /api/tasks/11111111-1111-4111-8111-111111111111/children
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/classification

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/classification
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ClassificationView](DTO-Sozlugu.md#classificationview).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "planningVersion": 0,
  "values": {
    "projectId": "11111111-1111-4111-8111-111111111111",
    "poolId": "11111111-1111-4111-8111-111111111111",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "tagIds": []
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}/classification

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `projectId` | Guid? | DTO/modül iş kuralı |
| `poolId` | Guid? | DTO/modül iş kuralı |
| `categoryId` | Guid? | DTO/modül iş kuralı |
| `tagIds` | Guid[] | required; maxLength:50 |
| `applyToSubtree` | Boolean | DTO/modül iş kuralı |
| `detachKind` | String | DTO/modül iş kuralı |
| `detachResourceId` | Guid? | DTO/modül iş kuralı |
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |

**Request şeması:** [ClassificationRequest](DTO-Sozlugu.md#classificationrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "tagIds": [],
  "applyToSubtree": false,
  "detachKind": "örnek",
  "detachResourceId": "11111111-1111-4111-8111-111111111111",
  "expectedPlanningVersion": 0
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/classification
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ClassificationView](DTO-Sozlugu.md#classificationview).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "planningVersion": 0,
  "values": {
    "projectId": "11111111-1111-4111-8111-111111111111",
    "poolId": "11111111-1111-4111-8111-111111111111",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "tagIds": []
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/delete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R2 soft delete: görev ve açık alt ağacı tek işlemde bütün listelerden düşer; Running/Paused work bitirilir, gelecekteki bloklar revisionla kapanır, üst görevin otomatik tamamlanması uzlaştırılır. Geçmiş work/revision silinmez. Aynı sürümle tekrar200; arşivlenmiş görev409 task_archived. Geri alma /restore.

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
POST /api/tasks/11111111-1111-4111-8111-111111111111/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/dependencies

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/dependencies
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskRelationPage](DTO-Sozlugu.md#taskrelationpage).

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

## POST /api/tasks/{id}/dependencies

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `predecessorTaskId` | Guid | DTO/modül iş kuralı |

**Request şeması:** [DependencyRequest](DTO-Sozlugu.md#dependencyrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "predecessorTaskId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/11111111-1111-4111-8111-111111111111/dependencies
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskRelationView](DTO-Sozlugu.md#taskrelationview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "sourceTaskId": "11111111-1111-4111-8111-111111111111",
  "targetTaskId": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## DELETE /api/tasks/{id}/dependencies/{sourceId}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Path sourceId ilişki kaydının Id alanı değil, predecessor/before task kimliğidir. Query version hedef /tasks/{id} görevinin güncel sürümüdür;204sonrası hedef task sürümünü yeniden okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `sourceId` | path | evet | string (uuid); — |
| `version` | query | hayır | integer\|string (int64); minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
DELETE /api/tasks/11111111-1111-4111-8111-111111111111/dependencies/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/detail-view

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Görev panelinin tam task belgesi, row summary, workload/time/progress, mevcut sınıflandırma ve yalnız seçili kaynak adları aynı RepeatableRead snapshotında üretilir. Alt ağaç girdisi bir kez paylaşılır; gerçek çalışma arşivli dalları da korur. Not/ilişki/iş bileşeni/çocuk listesi burada yoktur. Küçük etiket/parent satırı tam resource/TaskView cache girdisi değildir. Salt okuma, private/no-store.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/detail-view
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskDetailView](DTO-Sozlugu.md#taskdetailview).

```json
{
  "task": {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Raporu yaz",
    "description": "örnek",
    "state": "Pending",
    "priority": "Low",
    "deadlineAt": "2026-10-16T06:00:00Z",
    "canSplit": false,
    "directEstimatedSeconds": 1,
    "createdAt": "2026-10-16T06:00:00Z",
    "updatedAt": "2026-10-16T06:00:00Z",
    "archivedAt": "2026-10-16T06:00:00Z",
    "version": 1,
    "parentTaskId": "11111111-1111-4111-8111-111111111111",
    "sortOrder": 1,
    "hasDirectWork": false,
    "targetBudgetSeconds": 1,
    "directWorkCompleted": false,
    "requiredForParent": false,
    "completionOrigin": "Manual",
    "completedAt": "2026-10-16T06:00:00Z",
    "projectId": "11111111-1111-4111-8111-111111111111",
    "poolId": "11111111-1111-4111-8111-111111111111",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "energyDemand": "Low",
    "autoCompleteFromChildren": true,
    "plannedFrom": "2026-10-16",
    "plannedTo": "2026-10-16"
  },
  "rowSummary": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "childCount": 1,
    "completedChildCount": 1,
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "effectiveFrom": "2026-10-16",
    "effectiveTo": "2026-10-16",
    "rangeFromChildren": false,
    "urgentPlanDate": "2026-10-16"
  },
  "workload": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "calculatedTotalSeconds": 1,
    "targetBudgetSeconds": 1,
    "targetDifferenceSeconds": 1
  },
  "time": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "directActualSeconds": 1,
    "subtreeActualSeconds": 1,
    "knownRemainingSeconds": 1,
    "unknownRemainingCount": 1,
    "remainingSeconds": 1,
    "knownOvertimeSeconds": 1,
    "unknownEstimateCount": 1,
    "serverNow": "2026-10-16T06:00:00Z"
  },
  "progress": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "totalTaskCount": 1,
    "completedTaskCount": 1,
    "componentCount": 1,
    "completedComponentCount": 1,
    "countProgress": 1,
    "knownEstimatedSeconds": 1,
    "knownCompletedEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "durationProgress": 1,
    "requiredChildCount": 1,
    "incompleteRequiredChildCount": 1,
    "hasOpenChildren": false,
    "hasOpenDescendants": false
  },
  "classification": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "version": 1,
    "planningVersion": 0,
    "values": {
      "projectId": "11111111-1111-4111-8111-111111111111",
      "poolId": "11111111-1111-4111-8111-111111111111",
      "categoryId": "11111111-1111-4111-8111-111111111111",
      "tagIds": []
    }
  },
  "labels": [],
  "parent": {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Raporu yaz",
    "parentTaskId": "11111111-1111-4111-8111-111111111111",
    "version": 1
  },
  "planningVersion": 0,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `parentTaskId` | Guid? | DTO/modül iş kuralı |
| `parentVersion` | Int64? | range:1..9.223372036854776E+18 |
| `beforeSiblingId` | Guid? | DTO/modül iş kuralı |
| `parentWorkDisposition` | ParentWorkDisposition? | DTO/modül iş kuralı |

**Request şeması:** [MoveTaskRequest](DTO-Sozlugu.md#movetaskrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "parentVersion": 1,
  "beforeSiblingId": "11111111-1111-4111-8111-111111111111",
  "parentWorkDisposition": "PreserveDirect"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/11111111-1111-4111-8111-111111111111/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/ordering

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/ordering
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskRelationPage](DTO-Sozlugu.md#taskrelationpage).

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

## POST /api/tasks/{id}/ordering

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `beforeTaskId` | Guid | DTO/modül iş kuralı |

**Request şeması:** [OrderingRequest](DTO-Sozlugu.md#orderingrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "beforeTaskId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/11111111-1111-4111-8111-111111111111/ordering
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskRelationView](DTO-Sozlugu.md#taskrelationview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "sourceTaskId": "11111111-1111-4111-8111-111111111111",
  "targetTaskId": "11111111-1111-4111-8111-111111111111",
  "kind": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## DELETE /api/tasks/{id}/ordering/{sourceId}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Path sourceId ilişki kaydının Id alanı değil, predecessor/before task kimliğidir. Query version hedef /tasks/{id} görevinin güncel sürümüdür;204sonrası hedef task sürümünü yeniden okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `sourceId` | path | evet | string (uuid); — |
| `version` | query | hayır | integer\|string (int64); minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
DELETE /api/tasks/11111111-1111-4111-8111-111111111111/ordering/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}/planned-range

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Tam alan güncellemesidir: title gerekli; optional alanın gönderilmemesi null/default’a dönüşebilir. Mevcut alanları korumak için son TaskView’den uygun request alanlarını gönderin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** UI-R2: plannedFrom/plannedTo birlikte gönderilir veya ikisi null ile temizlenir; from<=to ve en çok367gün. Plan bloğu oluşturmaz/engellemez. Çocuklardan türeyen üst aralık /summary ve children summaries içindedir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `plannedFrom` | DateOnly? | DTO/modül iş kuralı |
| `plannedTo` | DateOnly? | DTO/modül iş kuralı |

**Request şeması:** [TaskPlannedRangeRequest](DTO-Sozlugu.md#taskplannedrangerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/planned-range
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/progress

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/progress
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskProgress](DTO-Sozlugu.md#taskprogress).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "totalTaskCount": 1,
  "completedTaskCount": 1,
  "componentCount": 1,
  "completedComponentCount": 1,
  "countProgress": 1,
  "knownEstimatedSeconds": 1,
  "knownCompletedEstimatedSeconds": 1,
  "unknownEstimateCount": 1,
  "durationProgress": 1,
  "requiredChildCount": 1,
  "incompleteRequiredChildCount": 1,
  "hasOpenChildren": false,
  "hasOpenDescendants": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}/required

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `requiredForParent` | Boolean? | required |

**Request şeması:** [TaskRequiredRequest](DTO-Sozlugu.md#taskrequiredrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "requiredForParent": false
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/required
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/restore

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Yalnız aynı silme işleminin batchini geri getirir; kapatılan work ve kaldırılan bloklar geri gelmez. Silinmemiş görev409 task_not_deleted, silinmiş/arşivli üst409 parent_deleted.

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
POST /api/tasks/11111111-1111-4111-8111-111111111111/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/start-eligibility

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/start-eligibility
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskStartDecision](DTO-Sozlugu.md#taskstartdecision).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "canStart": false,
  "reasons": [],
  "blockingPredecessorIds": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tasks/{id}/state

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Action enum’u kullanın. Complete parent’ta choice gerekebilir; optional reason yalnız gerçek geçiş olayına kaydedilir. Tamamlama açık work’ü aynı işlemde kapatır.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** reason en çok2000karakter. ParentCompletionChoice.Cancel komutu iptal eder; TaskAction.Cancel görevi Canceled yapar. InProgress/Paused bu endpointte action olarak gönderilmez; work komutlarından türetilir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `action` | TaskAction? | required |
| `parentCompletionChoice` | ParentCompletionChoice? | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [TaskStateRequest](DTO-Sozlugu.md#taskstaterequest).

**Örnek request body:**

```json
{
  "version": 1,
  "action": "Complete",
  "parentCompletionChoice": "CompleteSubtree",
  "reason": "Takvim düzenlendi"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/11111111-1111-4111-8111-111111111111/state
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/subtree

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `includeArchived` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/subtree
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreePage](DTO-Sozlugu.md#treepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "hasMore": false,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/summary

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R2 tek görev satır özeti: doğrudan çocuk sayıları, bilinen alt ağaç tahmini ve etkin gün aralığı. Silinmiş görev404.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/summary
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreeRowSummary](DTO-Sozlugu.md#treerowsummary).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "childCount": 1,
  "completedChildCount": 1,
  "knownEstimatedSeconds": 1,
  "unknownEstimateCount": 1,
  "effectiveFrom": "2026-10-16",
  "effectiveTo": "2026-10-16",
  "rangeFromChildren": false,
  "urgentPlanDate": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/work-components

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/work-components
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkComponentPage](DTO-Sozlugu.md#workcomponentpage).

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

## PUT /api/tasks/{id}/work-definition

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `hasDirectWork` | Boolean? | required |
| `directEstimatedSeconds` | Int64? | range:0..9.223372036854776E+18 |
| `targetBudgetSeconds` | Int64? | range:0..9.223372036854776E+18 |

**Request şeması:** [WorkDefinitionRequest](DTO-Sozlugu.md#workdefinitionrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "hasDirectWork": false,
  "directEstimatedSeconds": 1,
  "targetBudgetSeconds": 1
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/work-definition
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "description": "örnek",
  "state": "Pending",
  "priority": "Low",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "canSplit": false,
  "directEstimatedSeconds": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1,
  "parentTaskId": "11111111-1111-4111-8111-111111111111",
  "sortOrder": 1,
  "hasDirectWork": false,
  "targetBudgetSeconds": 1,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-16T06:00:00Z",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/workload

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/11111111-1111-4111-8111-111111111111/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkloadSummary](DTO-Sozlugu.md#workloadsummary).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "knownEstimatedSeconds": 1,
  "unknownEstimateCount": 1,
  "calculatedTotalSeconds": 1,
  "targetBudgetSeconds": 1,
  "targetDifferenceSeconds": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/{kind}/{id}/task-tree

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Projeler/havuzlar/kategoriler/etiketler için owner kapsamlı görev ağacı. Offset/limit kök gruplarına uygulanır; alt görevler bölünmez, aynı görev tek kök altında görünür. Alt görevlerin mevcut sınıflandırması değiştirilmez; bitmiş kökler sonradır.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `kind` | path | evet | string; pattern="^(projects\|pools\|categories\|tags)$" |
| `id` | path | evet | string (uuid); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=25 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/11111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111/task-tree
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ResourceTaskTreePage](DTO-Sozlugu.md#resourcetasktreepage).

```json
{
  "roots": [],
  "nodes": [],
  "parents": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "contextTaskIds": null,
  "taskCount": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
| `minEstimateSeconds` | query | hayır | int64; görevin kendi tahmini en az |
| `maxEstimateSeconds` | query | hayır | int64; görevin kendi tahmini en çok |
| `dateFrom` | query | hayır | date; dateTo ile birlikte, atanmış aralık, son tarih veya plan öğesi kesişimi |
| `dateTo` | query | hayır | date; dateFrom ile birlikte, en çok 366 gün |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks?poolId=01a16bfd-ab66-7f94-a6d1-29fcb8e10081
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskPage](DTO-Sozlugu.md#taskpage).

```json
{
  "items": [
    {
      "id": "01a16bfd-ab94-7e1f-b1a7-9f0325bcc293",
      "title": "Three steps",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 6,
      "parentTaskId": null,
      "sortOrder": 1024.0,
      "hasDirectWork": false,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": "Automatic",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfd-acfc-7ae9-9972-88f31691ee28",
      "title": "A",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": 1200,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 3,
      "parentTaskId": "01a16bfd-ab94-7e1f-b1a7-9f0325bcc293",
      "sortOrder": 1024.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": true,
      "requiredForParent": true,
      "completionOrigin": "Manual",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfd-ad59-73b4-b819-4853261f5eb2",
      "title": "B",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 4,
      "parentTaskId": "01a16bfd-ab94-7e1f-b1a7-9f0325bcc293",
      "sortOrder": 2048.0,
      "hasDirectWork": false,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": "Automatic",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfd-adbe-75da-9a64-86f6c5a1b1c4",
      "title": "C",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": 1800,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 4,
      "parentTaskId": "01a16bfd-ab94-7e1f-b1a7-9f0325bcc293",
      "sortOrder": 3072.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": true,
      "requiredForParent": true,
      "completionOrigin": "Manual",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfd-adf9-7dff-a242-3462be063f20",
      "title": "B1",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": 900,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 3,
      "parentTaskId": "01a16bfd-ad59-73b4-b819-4853261f5eb2",
      "sortOrder": 1024.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": true,
      "requiredForParent": true,
      "completionOrigin": "Manual",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfd-ae29-7e3a-be8d-03a222766561",
      "title": "B2",
      "description": null,
      "state": "Completed",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": 1200,
      "createdAt": "2026-10-24T03:39:08.183442+00:00",
      "updatedAt": "2026-10-24T03:39:08.183442+00:00",
      "archivedAt": null,
      "version": 3,
      "parentTaskId": "01a16bfd-ad59-73b4-b819-4853261f5eb2",
      "sortOrder": 2048.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": true,
      "requiredForParent": true,
      "completionOrigin": "Manual",
      "completedAt": "2026-10-24T03:39:08.183442+00:00",
      "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
      "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 6
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 401:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.2",
  "title": "Giriş yapmanız gerekiyor.",
  "status": 401,
  "code": "unauthorized",
  "traceId": "00-12e9bc803605ce9cd450298b55dc73d6-76a1eeecb0c618f5-00"
}
```

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
  "title": "Classification rollback sentinel"
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
  "id": "01a16bfa-8c1c-79cd-b668-5a6fe17da679",
  "title": "Classification rollback sentinel",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:35:43.633008+00:00",
  "updatedAt": "2026-10-24T03:35:43.633008+00:00",
  "archivedAt": null,
  "version": 1,
  "parentTaskId": null,
  "sortOrder": 1024,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
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
    "Title": [
      "The Title field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URQMA"
}
```

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
    "Fatura öde",
    " Annemi ara ",
    "Fatura öde"
  ],
  "poolId": "01a16bfe-6c1d-7a22-af1f-80cb4612deee"
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
  "items": [
    {
      "id": "01a16bfe-6c7f-7945-8ea3-8b6f6dae8970",
      "title": "Fatura öde",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "archivedAt": null,
      "version": 1,
      "parentTaskId": null,
      "sortOrder": 1024,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": "01a16bfe-6c1d-7a22-af1f-80cb4612deee",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfe-6c7f-7bcc-8861-cb9e5f54eaae",
      "title": "Annemi ara",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "archivedAt": null,
      "version": 1,
      "parentTaskId": null,
      "sortOrder": 2048,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": "01a16bfe-6c1d-7a22-af1f-80cb4612deee",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bfe-6c7f-7a14-a145-bd0152c48c69",
      "title": "Fatura öde",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "archivedAt": null,
      "version": 1,
      "parentTaskId": null,
      "sortOrder": 3072,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": "01a16bfe-6c1d-7a22-af1f-80cb4612deee",
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    }
  ],
  "planningVersion": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Anahtar başka bir komutta kullanılmış.",
  "status": 409,
  "code": "idempotency_conflict",
  "traceId": "00-07716758a11562cf7f01448758b71f9c-5aa6540d5fc0794e-00"
}
```

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
| `title` | String | required; maxLength:300 |
| `children` | TaskTreeRequest[]? | maxLength:50 |

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
GET /api/tasks/children?parentId=01a16bf9-ba48-7a3b-8a9a-09bd2ed95536
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreePage](DTO-Sozlugu.md#treepage).

```json
{
  "items": [
    {
      "id": "01a16bf9-bd48-7289-88a7-c5f4d8b8c08f",
      "title": "Three",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:49.694104+00:00",
      "updatedAt": "2026-10-24T03:34:49.694104+00:00",
      "archivedAt": null,
      "version": 2,
      "parentTaskId": "01a16bf9-ba48-7a3b-8a9a-09bd2ed95536",
      "sortOrder": 1024.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bf9-bba0-7d50-8093-d2b9d9c11f5d",
      "title": "One",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:49.694104+00:00",
      "updatedAt": "2026-10-24T03:34:49.694104+00:00",
      "archivedAt": null,
      "version": 2,
      "parentTaskId": "01a16bf9-ba48-7a3b-8a9a-09bd2ed95536",
      "sortOrder": 2048.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bf9-bc6c-786e-9665-bd19192abeed",
      "title": "Two",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:49.694104+00:00",
      "updatedAt": "2026-10-24T03:34:49.694104+00:00",
      "archivedAt": null,
      "version": 2,
      "parentTaskId": "01a16bf9-ba48-7a3b-8a9a-09bd2ed95536",
      "sortOrder": 3072.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "hasMore": false,
  "summaries": [
    {
      "taskId": "01a16bf9-bd48-7289-88a7-c5f4d8b8c08f",
      "childCount": 0,
      "completedChildCount": 0,
      "knownEstimatedSeconds": 0,
      "unknownEstimateCount": 1,
      "effectiveFrom": null,
      "effectiveTo": null,
      "rangeFromChildren": false
    },
    {
      "taskId": "01a16bf9-bba0-7d50-8093-d2b9d9c11f5d",
      "childCount": 0,
      "completedChildCount": 0,
      "knownEstimatedSeconds": 0,
      "unknownEstimateCount": 1,
      "effectiveFrom": null,
      "effectiveTo": null,
      "rangeFromChildren": false
    },
    {
      "taskId": "01a16bf9-bc6c-786e-9665-bd19192abeed",
      "childCount": 0,
      "completedChildCount": 0,
      "knownEstimatedSeconds": 0,
      "unknownEstimateCount": 1,
      "effectiveFrom": null,
      "effectiveTo": null,
      "rangeFromChildren": false
    }
  ]
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
  "traceId": "00-2026172d037646e1884cbd10566f61f0-da7a3b238d152d9e-00"
}
```

## GET /api/tasks/picker

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** UI-R4: owner açık/doğrudan işler; date atanmış/diğer grupları ayrılır. offset/assignedOffset bağımsız, limit1..100; UI25. Ebeveyn başlığı aynı sorguda, HasExactMatch bütün uygun kümede. Literal Türkçe substring; her satır için ek parent GET yok. Coverage aynı repeatable-read snapshot içindeki owner sürümleridir; UI yalnız bütün sayfalar güncel planning sürümü ve ±15sn tazelik taşıyorsa handshake tekrar okumasını atlar; eksik/eski sertifika yeniden okunur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | query | hayır | string (date); — |
| `search` | query | hayır | string; — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `assignedOffset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=25 |

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
GET /api/tasks/01a16bfa-7bec-77d6-9a06-3fd56881f8e2
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfa-7bec-77d6-9a06-3fd56881f8e2",
  "title": "A child",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:35:38.478503+00:00",
  "updatedAt": "2026-10-24T03:35:38.478503+00:00",
  "archivedAt": null,
  "version": 1,
  "parentTaskId": "01a16bfa-797c-769f-8585-29a2c0063eed",
  "sortOrder": 1024.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
  "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
  "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
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
  "traceId": "00-0e88266db2e7e93442efe0f41cb41c74-332893c03ad72309-00"
}
```

## PUT /api/tasks/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Tam alan güncellemesidir: title gerekli; optional alanın gönderilmemesi null/default’a dönüşebilir. Mevcut alanları korumak için son TaskView’den uygun request alanlarını gönderin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
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
  "title": "Read two pages",
  "description": "One step at a time",
  "priority": "High",
  "canSplit": false,
  "deadlineAt": "2026-11-01T12:00:00+03:00"
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bf9-ad4a-7e3e-aad4-9afcaa5f67ca
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bf9-ad4a-7e3e-aad4-9afcaa5f67ca",
  "title": "Read two pages",
  "description": "One step at a time",
  "state": "Pending",
  "priority": "High",
  "deadlineAt": "2026-11-01T09:00:00+00:00",
  "canSplit": false,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:34:47.005275+00:00",
  "updatedAt": "2026-10-24T03:36:47.005275+00:00",
  "archivedAt": null,
  "version": 2,
  "parentTaskId": null,
  "sortOrder": 1024.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Arşivlenmiş görev düzenlenemez.",
  "status": 409,
  "code": "task_archived",
  "traceId": "00-700b2db7f7ae9cb64735732a1f9becb6-ebab6fb202189fa2-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 2
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bf9-ad4a-7e3e-aad4-9afcaa5f67ca/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bf9-ad4a-7e3e-aad4-9afcaa5f67ca",
  "title": "Read two pages",
  "description": "One step at a time",
  "state": "Pending",
  "priority": "High",
  "deadlineAt": "2026-11-01T09:00:00+00:00",
  "canSplit": false,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:34:47.005275+00:00",
  "updatedAt": "2026-10-24T03:36:47.005275+00:00",
  "archivedAt": "2026-10-24T03:36:47.005275+00:00",
  "version": 3,
  "parentTaskId": null,
  "sortOrder": 1024.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Önce açık alt görevleri taşıyın veya arşivleyin.",
  "status": 409,
  "code": "task_has_children",
  "traceId": "00-296e468c701192d3ccc0e9741a3ddb2a-54433f2d65b13e43-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `autoCompleteFromChildren` | Boolean? | required |

**Request şeması:** [TaskAutoCompleteRequest](DTO-Sozlugu.md#taskautocompleterequest).

**Örnek request body:**

```json
{
  "version": 5,
  "autoCompleteFromChildren": false
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bff-eed5-7dfd-b138-964e826e7a32/auto-complete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bff-eed5-7dfd-b138-964e826e7a32",
  "title": "Project",
  "description": null,
  "state": "Completed",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:41:36.3916+00:00",
  "updatedAt": "2026-10-24T03:41:36.3916+00:00",
  "archivedAt": null,
  "version": 6,
  "parentTaskId": null,
  "sortOrder": 1024.0,
  "hasDirectWork": false,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": "Automatic",
  "completedAt": "2026-10-24T03:41:36.3916+00:00",
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": false,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Görev değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-41c90ca3c3169cefd8f8e306ffce2210-26e24ab388bb79e8-00"
}
```

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
| `parentVersion` | Int64 | range:1..9,223372036854776E+18 |
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
  "title": "Unknown step",
  "parentVersion": 5,
  "parentWorkDisposition": "PreserveDirect"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bfa-797c-769f-8585-29a2c0063eed/children
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfa-7f5a-7f81-ae2e-ffe1e5fa084d",
  "title": "Unknown step",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:35:38.478503+00:00",
  "updatedAt": "2026-10-24T03:35:38.478503+00:00",
  "archivedAt": null,
  "version": 1,
  "parentTaskId": "01a16bfa-797c-769f-8585-29a2c0063eed",
  "sortOrder": 2048.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
  "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
  "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Üst görevin kendi işini korumayı veya konteynere çevirmeyi seçin.",
  "status": 409,
  "code": "parent_work_decision_required",
  "traceId": "00-959d3faa8266a5d3a358792b3ecd2260-69f2e17e7e71ab4e-00"
}
```

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
GET /api/tasks/01a16bfa-7bec-77d6-9a06-3fd56881f8e2/classification
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ClassificationView](DTO-Sozlugu.md#classificationview).

```json
{
  "taskId": "01a16bfa-7bec-77d6-9a06-3fd56881f8e2",
  "version": 2,
  "planningVersion": 10,
  "values": {
    "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
    "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
    "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
    "tagIds": [
      "01a16bfa-78df-73d4-bf12-de393a860579",
      "01a16bfa-7944-71c9-9b63-bf8c4943a5d7"
    ]
  }
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
  "traceId": "00-0248a1b145771a1870ca57f2329522fa-5d31606079882a52-00"
}
```

## PUT /api/tasks/{id}/classification

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `projectId` | Guid? | DTO/modül iş kuralı |
| `poolId` | Guid? | DTO/modül iş kuralı |
| `categoryId` | Guid? | DTO/modül iş kuralı |
| `tagIds` | Guid[] | required; maxLength:50 |
| `applyToSubtree` | Boolean | DTO/modül iş kuralı |
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |

**Request şeması:** [ClassificationRequest](DTO-Sozlugu.md#classificationrequest).

**Örnek request body:**

```json
{
  "version": 2,
  "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
  "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
  "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
  "tagIds": [
    "01a16bfa-78df-73d4-bf12-de393a860579",
    "01a16bfa-7944-71c9-9b63-bf8c4943a5d7"
  ],
  "applyToSubtree": false,
  "expectedPlanningVersion": 7
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bfa-797c-769f-8585-29a2c0063eed/classification
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ClassificationView](DTO-Sozlugu.md#classificationview).

```json
{
  "taskId": "01a16bfa-797c-769f-8585-29a2c0063eed",
  "version": 3,
  "planningVersion": 8,
  "values": {
    "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
    "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
    "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
    "tagIds": [
      "01a16bfa-78df-73d4-bf12-de393a860579",
      "01a16bfa-7944-71c9-9b63-bf8c4943a5d7"
    ]
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Alt ağaç değişmiş; güncel bağlamı alın.",
  "status": 409,
  "code": "planning_version_conflict",
  "traceId": "00-7da2e8d591c1a9e1c04eefe6ce5370ee-89bc1adb40936a13-00"
}
```

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
POST /api/tasks/01a16bff-d2d7-7a69-92b6-271f487f3ce7/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bff-d2d7-7a69-92b6-271f487f3ce7",
  "title": "Step",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:41:29.012115+00:00",
  "updatedAt": "2026-10-24T03:41:29.012115+00:00",
  "archivedAt": "2026-10-24T03:41:29.012115+00:00",
  "version": 2,
  "parentTaskId": "01a16bff-d077-7c9f-bdef-e3e844e1a80f",
  "sortOrder": 2048.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Arşivlenmiş görev silinemez.",
  "status": 409,
  "code": "task_archived",
  "traceId": "00-faf3d1d065ec7b2819ec8398a7ad86f4-b105147cdb4c3de1-00"
}
```

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
GET /api/tasks/01a16c00-9f9f-74ea-8af3-8a2a61e69cb6/dependencies
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskRelationPage](DTO-Sozlugu.md#taskrelationpage).

```json
{
  "items": [
    {
      "id": "01a16c00-a0b8-7dd0-9224-483bddc44071",
      "sourceTaskId": "01a16c00-9f41-7961-8633-a63a1dd33ccc",
      "targetTaskId": "01a16c00-9f9f-74ea-8af3-8a2a61e69cb6",
      "kind": "FinishToStart"
    },
    {
      "id": "01a16c00-a24d-7f49-ad18-12080db573e0",
      "sourceTaskId": "01a16c00-9fb2-7b98-8274-e53ed7c0b016",
      "targetTaskId": "01a16c00-9f9f-74ea-8af3-8a2a61e69cb6",
      "kind": "FinishToStart"
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
  "title": "Görev bulunamadı.",
  "status": 404,
  "code": "task_not_found",
  "traceId": "00-a3b1b1051e1ebecd0a4da6d6dc6dd5d4-58d4941bfab29ebf-00"
}
```

## POST /api/tasks/{id}/dependencies

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `predecessorTaskId` | Guid | DTO/modül iş kuralı |

**Request şeması:** [DependencyRequest](DTO-Sozlugu.md#dependencyrequest).

**Örnek request body:**

```json
{
  "version": 2,
  "predecessorTaskId": "01a16bfc-ac1d-7392-9a25-2563eb3443b2"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bfc-ac5c-7d00-97d3-e83f17096f58/dependencies
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskRelationView](DTO-Sozlugu.md#taskrelationview).

```json
{
  "id": "01a16bfc-ad69-7e5d-9fda-6eb016779dc1",
  "sourceTaskId": "01a16bfc-ac1d-7392-9a25-2563eb3443b2",
  "targetTaskId": "01a16bfc-ac5c-7d00-97d3-e83f17096f58",
  "kind": "FinishToStart"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Görev değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-66c2e7337ca07cfb4c738b7ff0f6fb4a-fe770106828e515b-00"
}
```

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
DELETE /api/tasks/01a16c00-9f9f-74ea-8af3-8a2a61e69cb6/dependencies/01a16c00-9f41-7961-8633-a63a1dd33ccc?version=4
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `parentTaskId` | Guid? | DTO/modül iş kuralı |
| `parentVersion` | Int64? | range:1..9,223372036854776E+18 |
| `beforeSiblingId` | Guid? | DTO/modül iş kuralı |
| `parentWorkDisposition` | ParentWorkDisposition? | DTO/modül iş kuralı |

**Request şeması:** [MoveTaskRequest](DTO-Sozlugu.md#movetaskrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "parentTaskId": "01a16bf9-ba48-7a3b-8a9a-09bd2ed95536",
  "parentVersion": 4,
  "beforeSiblingId": "01a16bf9-bba0-7d50-8093-d2b9d9c11f5d"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bf9-bd48-7289-88a7-c5f4d8b8c08f/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bf9-bd48-7289-88a7-c5f4d8b8c08f",
  "title": "Three",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:34:49.694104+00:00",
  "updatedAt": "2026-10-24T03:34:49.694104+00:00",
  "archivedAt": null,
  "version": 2,
  "parentTaskId": "01a16bf9-ba48-7a3b-8a9a-09bd2ed95536",
  "sortOrder": 1024,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Görev değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-f8d1b014c0df642d21798178910c4cd8-c31fd4830a9f96e7-00"
}
```

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
GET /api/tasks/01a16c00-9f9f-74ea-8af3-8a2a61e69cb6/ordering
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskRelationPage](DTO-Sozlugu.md#taskrelationpage).

```json
{
  "items": [
    {
      "id": "01a16c00-a026-73db-a2d1-38bb7fcfb71d",
      "sourceTaskId": "01a16c00-9f41-7961-8633-a63a1dd33ccc",
      "targetTaskId": "01a16c00-9f9f-74ea-8af3-8a2a61e69cb6",
      "kind": "PreferredBefore"
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `beforeTaskId` | Guid | DTO/modül iş kuralı |

**Request şeması:** [OrderingRequest](DTO-Sozlugu.md#orderingrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "beforeTaskId": "01a16c00-9f41-7961-8633-a63a1dd33ccc"
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16c00-9f9f-74ea-8af3-8a2a61e69cb6/ordering
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [TaskRelationView](DTO-Sozlugu.md#taskrelationview).

```json
{
  "id": "01a16c00-a026-73db-a2d1-38bb7fcfb71d",
  "sourceTaskId": "01a16c00-9f41-7961-8633-a63a1dd33ccc",
  "targetTaskId": "01a16c00-9f9f-74ea-8af3-8a2a61e69cb6",
  "kind": "PreferredBefore"
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
  "traceId": "00-395801035e7a03960597d2c26469e9b2-8962678b9450a811-00"
}
```

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
DELETE /api/tasks/01a16c00-e556-7f2f-960d-b5ecf24436f4/ordering/01a16c00-e52a-7705-a392-77a3ad45075b?version=2
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `plannedFrom` | DateOnly? | DTO/modül iş kuralı |
| `plannedTo` | DateOnly? | DTO/modül iş kuralı |

**Request şeması:** [TaskPlannedRangeRequest](DTO-Sozlugu.md#taskplannedrangerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "plannedFrom": "2026-10-24",
  "plannedTo": "2026-10-26"
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bff-deff-7ba8-bc6a-82986fc5ac82/planned-range
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bff-deff-7ba8-bc6a-82986fc5ac82",
  "title": "A",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:41:30.994076+00:00",
  "updatedAt": "2026-10-24T03:41:30.994076+00:00",
  "archivedAt": null,
  "version": 2,
  "parentTaskId": "01a16bff-dc11-7773-9976-47964b47efc6",
  "sortOrder": 1024.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": "2026-10-24",
  "plannedTo": "2026-10-26"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Görev değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-7eefd2c7ee7e840329a4aadc58b0164d-e12b4046c125f74a-00"
}
```

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
GET /api/tasks/01a16c00-93f9-7d1c-8db3-61f86ad38604/progress
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskProgress](DTO-Sozlugu.md#taskprogress).

```json
{
  "taskId": "01a16c00-93f9-7d1c-8db3-61f86ad38604",
  "totalTaskCount": 3,
  "completedTaskCount": 1,
  "componentCount": 3,
  "completedComponentCount": 2,
  "countProgress": 0.6666666666666666,
  "knownEstimatedSeconds": 2400,
  "knownCompletedEstimatedSeconds": 1800,
  "unknownEstimateCount": 0,
  "durationProgress": 0.75,
  "requiredChildCount": 2,
  "incompleteRequiredChildCount": 1,
  "hasOpenChildren": true,
  "hasOpenDescendants": true
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
  "traceId": "00-a23c24bafe41e3a45590e76ed4ec85ac-2ab3e2a7fcd60b14-00"
}
```

## PUT /api/tasks/{id}/required

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
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
PUT /api/tasks/01a16bfb-c872-77be-b009-2fca1ca1d098/required
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfb-c872-77be-b009-2fca1ca1d098",
  "title": "Step",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:37:03.950919+00:00",
  "updatedAt": "2026-10-24T03:37:03.950919+00:00",
  "archivedAt": null,
  "version": 2,
  "parentTaskId": "01a16bfb-c64d-7938-b378-8ea44bc8538e",
  "sortOrder": 2048.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": false,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
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
  "traceId": "00-5cd865e270825a301fca336401ce95eb-9716c900ecf347af-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [TaskVersionRequest](DTO-Sozlugu.md#taskversionrequest).

**Örnek request body:**

```json
{
  "version": 2
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bff-d2d7-7a69-92b6-271f487f3ce7/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bff-d2d7-7a69-92b6-271f487f3ce7",
  "title": "Step",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": null,
  "createdAt": "2026-10-24T03:41:29.012115+00:00",
  "updatedAt": "2026-10-24T03:41:29.012115+00:00",
  "archivedAt": null,
  "version": 3,
  "parentTaskId": "01a16bff-d077-7c9f-bdef-e3e844e1a80f",
  "sortOrder": 2048.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": null,
  "poolId": null,
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Önce üst görevi geri alın.",
  "status": 409,
  "code": "parent_deleted",
  "traceId": "00-5b9e14f9c913e32a8e51274ea3cc1de0-2c9250ff77221e47-00"
}
```

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
GET /api/tasks/01a16bfd-adbe-75da-9a64-86f6c5a1b1c4/start-eligibility
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TaskStartDecision](DTO-Sozlugu.md#taskstartdecision).

```json
{
  "taskId": "01a16bfd-adbe-75da-9a64-86f6c5a1b1c4",
  "canStart": false,
  "reasons": [
    "predecessor_incomplete"
  ],
  "blockingPredecessorIds": [
    "01a16bfd-acfc-7ae9-9972-88f31691ee28"
  ]
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
  "traceId": "00-e011f8c083b96809fcc6cc966476afa8-f94e902dcfe82c90-00"
}
```

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `action` | TaskAction? | required |
| `parentCompletionChoice` | ParentCompletionChoice? | DTO/modül iş kuralı |
| `reason` | String | length:0..2000 |

**Request şeması:** [TaskStateRequest](DTO-Sozlugu.md#taskstaterequest).

**Örnek request body:**

```json
{
  "version": 2,
  "action": "Complete",
  "parentCompletionChoice": null
}
```

**Örnek HTTP:**

```http
POST /api/tasks/01a16bfd-ae29-7e3a-be8d-03a222766561/state
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfd-ae29-7e3a-be8d-03a222766561",
  "title": "B2",
  "description": null,
  "state": "Completed",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": 1200,
  "createdAt": "2026-10-24T03:39:08.183442+00:00",
  "updatedAt": "2026-10-24T03:39:08.183442+00:00",
  "archivedAt": null,
  "version": 3,
  "parentTaskId": "01a16bfd-ad59-73b4-b819-4853261f5eb2",
  "sortOrder": 2048.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": true,
  "requiredForParent": true,
  "completionOrigin": "Manual",
  "completedAt": "2026-10-24T03:39:08.183442+00:00",
  "projectId": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
  "poolId": "01a16bfd-ab66-7f94-a6d1-29fcb8e10081",
  "categoryId": null,
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Sunucu zamanÄ± Ã¶nceki kayÄ±ttan geride; tekrar deneyin.",
  "status": 409,
  "code": "server_clock_conflict",
  "traceId": "00-21d7dd952428ea8d613a854982b65d3d-e5f79c0e50f90b4c-00"
}
```

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
GET /api/tasks/01a16bf9-b094-735f-83af-41740e02a9f4/subtree
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreePage](DTO-Sozlugu.md#treepage).

```json
{
  "items": [
    {
      "id": "01a16bf9-b094-735f-83af-41740e02a9f4",
      "title": "A",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:47.42115+00:00",
      "updatedAt": "2026-10-24T03:34:47.42115+00:00",
      "archivedAt": null,
      "version": 2,
      "parentTaskId": null,
      "sortOrder": 1024.0,
      "hasDirectWork": false,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bf9-b1a9-78d5-85c3-64d14662b6bd",
      "title": "Child",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:47.42115+00:00",
      "updatedAt": "2026-10-24T03:34:47.42115+00:00",
      "archivedAt": null,
      "version": 2,
      "parentTaskId": "01a16bf9-b094-735f-83af-41740e02a9f4",
      "sortOrder": 1024.0,
      "hasDirectWork": false,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    },
    {
      "id": "01a16bf9-b29e-77fe-9bf7-66d1060126af",
      "title": "Grandchild",
      "description": null,
      "state": "Pending",
      "priority": "Normal",
      "deadlineAt": null,
      "canSplit": true,
      "directEstimatedSeconds": null,
      "createdAt": "2026-10-24T03:34:47.42115+00:00",
      "updatedAt": "2026-10-24T03:34:47.42115+00:00",
      "archivedAt": null,
      "version": 1,
      "parentTaskId": "01a16bf9-b1a9-78d5-85c3-64d14662b6bd",
      "sortOrder": 1024.0,
      "hasDirectWork": true,
      "targetBudgetSeconds": null,
      "directWorkCompleted": false,
      "requiredForParent": true,
      "completionOrigin": null,
      "completedAt": null,
      "projectId": null,
      "poolId": null,
      "categoryId": null,
      "energyDemand": null,
      "autoCompleteFromChildren": true,
      "plannedFrom": null,
      "plannedTo": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "hasMore": false,
  "summaries": null
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
  "traceId": "00-e7dee71510ed90b995d72b9158a682d0-db8cbb52a2b13d84-00"
}
```

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
GET /api/tasks/01a16bff-dc11-7773-9976-47964b47efc6/summary
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [TreeRowSummary](DTO-Sozlugu.md#treerowsummary).

```json
{
  "taskId": "01a16bff-dc11-7773-9976-47964b47efc6",
  "childCount": 2,
  "completedChildCount": 0,
  "knownEstimatedSeconds": 0,
  "unknownEstimateCount": 2,
  "effectiveFrom": "2026-10-01",
  "effectiveTo": "2026-12-31",
  "rangeFromChildren": false
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
  "traceId": "00-fa5d3079d76fdbd83c9856c3ab68ec3c-d692960b7e0f9507-00"
}
```

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
GET /api/tasks/01a16bfb-0d8d-7e57-986a-f8b9da29b200/work-components
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkComponentPage](DTO-Sozlugu.md#workcomponentpage).

```json
{
  "items": [
    {
      "taskId": "01a16bfb-0e18-7f19-8adb-5a63d1134f84",
      "estimatedSeconds": 1800
    },
    {
      "taskId": "01a16bfb-0eb5-7dbf-8366-f7cf3e52fa0a",
      "estimatedSeconds": 1500
    },
    {
      "taskId": "01a16bfb-1038-7c47-887a-293c7aaa4144",
      "estimatedSeconds": 900
    },
    {
      "taskId": "01a16bfb-10df-764b-9bc9-7f610e0fb837",
      "estimatedSeconds": 1200
    },
    {
      "taskId": "01a16bfb-1133-78e3-9c82-3d8e420cb9e3",
      "estimatedSeconds": 1500
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 5
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
  "traceId": "00-6e24549ee7278f06569bb827f9b4aae7-be657ac2f0b044e1-00"
}
```

## PUT /api/tasks/{id}/work-definition

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `hasDirectWork` | Boolean? | required |
| `directEstimatedSeconds` | Int64? | range:0..9,223372036854776E+18 |
| `targetBudgetSeconds` | Int64? | range:0..9,223372036854776E+18 |

**Request şeması:** [WorkDefinitionRequest](DTO-Sozlugu.md#workdefinitionrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "hasDirectWork": true,
  "directEstimatedSeconds": 1200,
  "targetBudgetSeconds": null
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bfa-7bec-77d6-9a06-3fd56881f8e2/work-definition
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfa-7bec-77d6-9a06-3fd56881f8e2",
  "title": "A child",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": 1200,
  "createdAt": "2026-10-24T03:35:38.478503+00:00",
  "updatedAt": "2026-10-24T03:35:38.478503+00:00",
  "archivedAt": null,
  "version": 2,
  "parentTaskId": "01a16bfa-797c-769f-8585-29a2c0063eed",
  "sortOrder": 1024.0,
  "hasDirectWork": true,
  "targetBudgetSeconds": null,
  "directWorkCompleted": false,
  "requiredForParent": true,
  "completionOrigin": null,
  "completedAt": null,
  "projectId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
  "poolId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
  "categoryId": "01a16bfa-78b1-73d6-9062-da70b69e143f",
  "energyDemand": null,
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Görev değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-d2fac0abfa421e85ad951da440668dd2-832d22befc9a3cb3-00"
}
```

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
GET /api/tasks/01a16bfb-2818-7619-b218-41aac16e8e8c/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkloadSummary](DTO-Sozlugu.md#workloadsummary).

```json
{
  "taskId": "01a16bfb-2818-7619-b218-41aac16e8e8c",
  "knownEstimatedSeconds": 9223372036854775807,
  "unknownEstimateCount": 0,
  "calculatedTotalSeconds": 9223372036854775807,
  "targetBudgetSeconds": null,
  "targetDifferenceSeconds": null
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
  "traceId": "00-2da5bf37ad65b244e83b392c18feedfa-7ed62cc1dbe3278a-00"
}
```

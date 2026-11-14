# Gerçek süre, odak ve plan analitiği

Raporlar salt okunur,1..366yerel gün ve50000kaynak yoğunluk sınırı kullanır. Actual/focus source-session frozen zone; plan reference kendi frozen zone’unda kalır. Day/week/month; weekly güncel WeekStartsOn sunum tercihidir. Parent roll-up ve focus actual’a ikinci kez eklenmez; düzeltme effective segmenti değiştirir, journal süre eklemez. Baseline/current paydalar ayrı, quota tamamlanma değildir; boş oranlar null, unknown tahmin kapsamı görünür. Task progress DurationProgress eksik tahminde null olabilirken plan DurationCompletion bilinen referans kapsamını ayrı gösterir. Estimate suggestion en az3 karşılaştırılabilir recorded completed actual’ın median’ıdır; Applied=false, plan/tahmin değişmez. Formül, kesim, DST, tarihsel kategori ve örneklem için [istatistik tanımları](../statistics-definitions.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/analytics/actual

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Ölçülen çalışma ve tahmini tamamlanan iş ayrı alanlardadır. Pozitif ölçülen çalışma varsa tahmin eklenmez. Tahmin tamamlanma anındaki kendi iş tahmini, sınıflandırma ve kaynak saat diliminden okunur; sahte çalışma oturumu yaratılmaz, ana hedef bütçesi tekrar sayılmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |
| `bucket` | query | hayır | [AnalyticsBucket](DTO-Sozlugu.md#analyticsbucket); default="Day" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/actual
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ActualAnalyticsView](DTO-Sozlugu.md#actualanalyticsview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "bucket": "Day",
  "weekStartsOn": 1,
  "timeZonePolicy": "örnek",
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0,
  "sourceTimeZones": [],
  "totals": {
    "workSeconds": 1,
    "taskWorkSeconds": 1,
    "generalWorkSeconds": 1,
    "manualWorkSeconds": 1,
    "sessionCount": 1,
    "segmentCount": 1,
    "missingSnapshotSeconds": 1,
    "focus": {
      "activeSeconds": 1,
      "overtimeSeconds": 1,
      "activeCycleCount": 1,
      "startedCount": 1,
      "finishedCount": 1,
      "effectiveTargetsReached": 1,
      "recordedTargetsReached": 1,
      "averageActiveSeconds": 1
    },
    "estimatedCompletedSeconds": 0,
    "estimatedCompletedCount": 0
  },
  "buckets": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/actual/breakdown

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Ölçülen çalışma ve tahmini tamamlanan iş ayrı alanlardadır. Pozitif ölçülen çalışma varsa tahmin eklenmez. Tahmin tamamlanma anındaki kendi iş tahmini, sınıflandırma ve kaynak saat diliminden okunur; sahte çalışma oturumu yaratılmaz, ana hedef bütçesi tekrar sayılmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |
| `dimension` | query | hayır | [AnalyticsDimension](DTO-Sozlugu.md#analyticsdimension); default="Task" |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/actual/breakdown
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ActualBreakdownPage](DTO-Sozlugu.md#actualbreakdownpage).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "dimension": "Task",
  "timeZonePolicy": "örnek",
  "serverNow": "2026-10-16T06:00:00Z",
  "totalWorkSeconds": 1,
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "totalEstimatedCompletedSeconds": 0
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/days/{date}/review

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `startToleranceSeconds` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=60 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/days/11111111-1111-4111-8111-111111111111/review
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PlanAnalyticsDay](DTO-Sozlugu.md#plananalyticsday).

```json
{
  "date": "2026-10-16",
  "planTimeZoneId": "örnek",
  "dailyPlanId": "11111111-1111-4111-8111-111111111111",
  "baselineRevisionId": "11111111-1111-4111-8111-111111111111",
  "currentRevisionId": "11111111-1111-4111-8111-111111111111",
  "actualSeconds": 1,
  "baseline": {
    "plannedWorkSeconds": 1,
    "conflictingPlannedSeconds": 1,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 1,
    "countCompletion": 1,
    "knownEstimatedSeconds": 1,
    "knownCompletedEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 1,
    "missingSnapshotBlockCount": 1,
    "quotaSeconds": 1,
    "quotaFulfilledSeconds": 1,
    "quotaRatio": 1,
    "unplannedActualSeconds": 1,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 1,
      "meanErrorSeconds": 1,
      "meanAbsoluteErrorSeconds": 1
    },
    "fixedStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    },
    "flexibleStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    }
  },
  "current": {
    "plannedWorkSeconds": 1,
    "conflictingPlannedSeconds": 1,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 1,
    "countCompletion": 1,
    "knownEstimatedSeconds": 1,
    "knownCompletedEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 1,
    "missingSnapshotBlockCount": 1,
    "quotaSeconds": 1,
    "quotaFulfilledSeconds": 1,
    "quotaRatio": 1,
    "unplannedActualSeconds": 1,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 1,
      "meanErrorSeconds": 1,
      "meanAbsoluteErrorSeconds": 1
    },
    "fixedStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    },
    "flexibleStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    }
  },
  "revisionCount": 1,
  "revisionReasons": [],
  "deferCount": 1,
  "deferReasons": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/estimate-accuracy

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/estimate-accuracy
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [EstimateAccuracyView](DTO-Sozlugu.md#estimateaccuracyview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "sampleCount": 1,
  "excludedWithoutWorkCount": 1,
  "medianRatio": 1,
  "p25Ratio": 1,
  "p75Ratio": 1,
  "unavailableReason": "örnek",
  "minimumSamples": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/estimate-suggestion

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner task gerekli. Template→category→project karşılaştırması;3pozitif recorded completed örnek yoksa null neden. Applied=false, kullanıcı ayrı komutla kabul eder.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `taskId` | query | hayır | string (uuid); — |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/estimate-suggestion
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [EstimateSuggestionView](DTO-Sozlugu.md#estimatesuggestionview).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "comparisonContext": "örnek",
  "contextId": "11111111-1111-4111-8111-111111111111",
  "sampleCount": 1,
  "excludedWithoutWorkCount": 1,
  "excludedUnknownZoneCount": 1,
  "suggestedSeconds": 1,
  "unavailableReason": "örnek",
  "method": "örnek",
  "applied": false,
  "sampleLimit": 1,
  "samples": [],
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/plans

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |
| `startToleranceSeconds` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=60 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/plans
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PlanAnalyticsView](DTO-Sozlugu.md#plananalyticsview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "serverNow": "2026-10-16T06:00:00Z",
  "planningVersion": 0,
  "actualTimeZonePolicy": "örnek",
  "startToleranceSeconds": 1,
  "actualSeconds": 1,
  "baseline": {
    "plannedWorkSeconds": 1,
    "conflictingPlannedSeconds": 1,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 1,
    "countCompletion": 1,
    "knownEstimatedSeconds": 1,
    "knownCompletedEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 1,
    "missingSnapshotBlockCount": 1,
    "quotaSeconds": 1,
    "quotaFulfilledSeconds": 1,
    "quotaRatio": 1,
    "unplannedActualSeconds": 1,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 1,
      "meanErrorSeconds": 1,
      "meanAbsoluteErrorSeconds": 1
    },
    "fixedStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    },
    "flexibleStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    }
  },
  "current": {
    "plannedWorkSeconds": 1,
    "conflictingPlannedSeconds": 1,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 1,
    "countCompletion": 1,
    "knownEstimatedSeconds": 1,
    "knownCompletedEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 1,
    "missingSnapshotBlockCount": 1,
    "quotaSeconds": 1,
    "quotaFulfilledSeconds": 1,
    "quotaRatio": 1,
    "unplannedActualSeconds": 1,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 1,
      "meanErrorSeconds": 1,
      "meanAbsoluteErrorSeconds": 1
    },
    "fixedStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    },
    "flexibleStarts": {
      "sampleCount": 1,
      "lateCount": 1,
      "earlyCount": 1,
      "onTimeCount": 1,
      "averageSignedDelaySeconds": 1,
      "averageLateSeconds": 1
    }
  },
  "revisionCount": 1,
  "deferCount": 1,
  "legacyZoneDeferCount": 1,
  "days": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/recurrences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Rutin tamamlama analizi; salt okunur, owner JWT sub. Oluşum, görev geçmişi ve o günün değişmez tanımından sınıflanır; gelecek günler sayılmaz. Bütün oranlar sunucudadır. Formüller statistics-definitions.md içindedir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |
| `compareFromDate` | query | hayır | string (date); — |
| `compareToDate` | query | hayır | string (date); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/recurrences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceAnalyticsView](DTO-Sozlugu.md#recurrenceanalyticsview).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "compareFromDate": "2026-10-16",
  "compareToDate": "2026-10-16",
  "weekStartsOn": 1,
  "minimumSamples": 1,
  "activeCount": 1,
  "totals": {
    "onTime": 1,
    "late": 1,
    "notDone": 1,
    "todayPending": 1,
    "skipped": 1,
    "notGenerated": 1,
    "completed": 1,
    "total": 1,
    "consistency": 1
  },
  "compare": {
    "onTime": 1,
    "late": 1,
    "notDone": 1,
    "todayPending": 1,
    "skipped": 1,
    "notGenerated": 1,
    "completed": 1,
    "total": 1,
    "consistency": 1
  },
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/analytics/recurrences/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Rutin tamamlama analizi; salt okunur, owner JWT sub. Oluşum, görev geçmişi ve o günün değişmez tanımından sınıflanır; gelecek günler sayılmaz. Bütün oranlar sunucudadır. Formüller statistics-definitions.md içindedir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/recurrences/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [RecurrenceAnalyticsDetail](DTO-Sozlugu.md#recurrenceanalyticsdetail).

```json
{
  "templateId": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "enabled": false,
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
  "today": "2026-10-16",
  "days": [],
  "weekdays": [],
  "recent": {
    "onTime": 1,
    "late": 1,
    "notDone": 1,
    "todayPending": 1,
    "skipped": 1,
    "notGenerated": 1,
    "completed": 1,
    "total": 1,
    "consistency": 1
  },
  "prior": {
    "onTime": 1,
    "late": 1,
    "notDone": 1,
    "todayPending": 1,
    "skipped": 1,
    "notGenerated": 1,
    "completed": 1,
    "total": 1,
    "consistency": 1
  },
  "longestRun": 1,
  "work": {
    "totalSeconds": 1,
    "sampleCount": 1,
    "averageSeconds": 1,
    "excludedWithoutWorkCount": 1,
    "estimatedSeconds": 1
  },
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

# Gerçek süre, odak ve plan analitiği

Raporlar salt okunur,1..366yerel gün ve50000kaynak yoğunluk sınırı kullanır. Actual/focus source-session frozen zone; plan reference kendi frozen zone’unda kalır. Day/week/month; weekly güncel WeekStartsOn sunum tercihidir. Parent roll-up ve focus actual’a ikinci kez eklenmez; düzeltme effective segmenti değiştirir, journal süre eklemez. Baseline/current paydalar ayrı, quota tamamlanma değildir; boş oranlar null, unknown tahmin kapsamı görünür. Task progress DurationProgress eksik tahminde null olabilirken plan DurationCompletion bilinen referans kapsamını ayrı gösterir. Estimate suggestion en az3 karşılaştırılabilir recorded completed actual’ın median’ıdır; Applied=false, plan/tahmin değişmez. Formül, kesim, DST, tarihsel kategori ve örneklem için [istatistik tanımları](../statistics-definitions.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/analytics/actual

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Ölçülen çalışma ve tahmini tamamlanan iş ayrı alanlardadır. Pozitif ölçülen çalışma varsa tahmin eklenmez. Tahmin tamamlanma anındaki kendi iş tahmini, sınıflandırma ve kaynak saat diliminden okunur; sahte çalışma oturumu yaratılmaz, ana hedef bütçesi tekrar sayılmaz.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | hayır | string (date); — |
| `toDate` | query | hayır | string (date); — |
| `bucket` | query | hayır | [AnalyticsBucket](DTO-Sozlugu.md#analyticsbucket); default="Day" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/analytics/actual?fromDate=2025-10-16&toDate=2026-10-15&bucket=Month
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ActualAnalyticsView](DTO-Sozlugu.md#actualanalyticsview).

```json
{
  "fromDate": "2025-10-16",
  "toDate": "2026-10-15",
  "bucket": "Month",
  "weekStartsOn": 1,
  "timeZonePolicy": "SourceSessionZone",
  "serverNow": "2026-10-15T06:00:00+00:00",
  "planningVersion": 0,
  "sourceTimeZones": [
    "Europe/Istanbul"
  ],
  "totals": {
    "workSeconds": 1314000,
    "taskWorkSeconds": 1314000,
    "generalWorkSeconds": 0,
    "manualWorkSeconds": 1314000,
    "sessionCount": 365,
    "segmentCount": 365,
    "missingSnapshotSeconds": 1314000,
    "focus": {
      "activeSeconds": 0,
      "overtimeSeconds": 0,
      "activeCycleCount": 0,
      "startedCount": 0,
      "finishedCount": 0,
      "effectiveTargetsReached": 0,
      "recordedTargetsReached": 0,
      "averageActiveSeconds": null
    }
  },
  "buckets": [
    {
      "bucketStart": "2025-10-01",
      "fromDate": "2025-10-16",
      "toDate": "2025-10-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 57600,
        "taskWorkSeconds": 57600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 57600,
        "sessionCount": 16,
        "segmentCount": 16,
        "missingSnapshotSeconds": 57600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2025-11-01",
      "fromDate": "2025-11-01",
      "toDate": "2025-11-30",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 108000,
        "taskWorkSeconds": 108000,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 108000,
        "sessionCount": 30,
        "segmentCount": 30,
        "missingSnapshotSeconds": 108000,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2025-12-01",
      "fromDate": "2025-12-01",
      "toDate": "2025-12-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-01-01",
      "fromDate": "2026-01-01",
      "toDate": "2026-01-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-02-01",
      "fromDate": "2026-02-01",
      "toDate": "2026-02-28",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 100800,
        "taskWorkSeconds": 100800,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 100800,
        "sessionCount": 28,
        "segmentCount": 28,
        "missingSnapshotSeconds": 100800,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-03-01",
      "fromDate": "2026-03-01",
      "toDate": "2026-03-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-04-01",
      "fromDate": "2026-04-01",
      "toDate": "2026-04-30",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 108000,
        "taskWorkSeconds": 108000,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 108000,
        "sessionCount": 30,
        "segmentCount": 30,
        "missingSnapshotSeconds": 108000,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-05-01",
      "fromDate": "2026-05-01",
      "toDate": "2026-05-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-06-01",
      "fromDate": "2026-06-01",
      "toDate": "2026-06-30",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 108000,
        "taskWorkSeconds": 108000,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 108000,
        "sessionCount": 30,
        "segmentCount": 30,
        "missingSnapshotSeconds": 108000,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-07-01",
      "fromDate": "2026-07-01",
      "toDate": "2026-07-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-08-01",
      "fromDate": "2026-08-01",
      "toDate": "2026-08-31",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 111600,
        "taskWorkSeconds": 111600,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 111600,
        "sessionCount": 31,
        "segmentCount": 31,
        "missingSnapshotSeconds": 111600,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-09-01",
      "fromDate": "2026-09-01",
      "toDate": "2026-09-30",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 108000,
        "taskWorkSeconds": 108000,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 108000,
        "sessionCount": 30,
        "segmentCount": 30,
        "missingSnapshotSeconds": 108000,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    },
    {
      "bucketStart": "2026-10-01",
      "fromDate": "2026-10-01",
      "toDate": "2026-10-15",
      "sourceTimeZones": [
        "Europe/Istanbul"
      ],
      "metrics": {
        "workSeconds": 54000,
        "taskWorkSeconds": 54000,
        "generalWorkSeconds": 0,
        "manualWorkSeconds": 54000,
        "sessionCount": 15,
        "segmentCount": 15,
        "missingSnapshotSeconds": 54000,
        "focus": {
          "activeSeconds": 0,
          "overtimeSeconds": 0,
          "activeCycleCount": 0,
          "startedCount": 0,
          "finishedCount": 0,
          "effectiveTargetsReached": 0,
          "recordedTargetsReached": 0,
          "averageActiveSeconds": null
        }
      }
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "1..366 gün, geçerli gruplama ve limit1..100/offset0..100000 seçin.",
  "status": 400,
  "code": "analytics_query_invalid",
  "traceId": "00-e3e3d037fcdc2eaf1c9cfa3b7f077e86-8f6858c0e1e991b5-00"
}
```

## GET /api/analytics/actual/breakdown

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Ölçülen çalışma ve tahmini tamamlanan iş ayrı alanlardadır. Pozitif ölçülen çalışma varsa tahmin eklenmez. Tahmin tamamlanma anındaki kendi iş tahmini, sınıflandırma ve kaynak saat diliminden okunur; sahte çalışma oturumu yaratılmaz, ana hedef bütçesi tekrar sayılmaz.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

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
GET /api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ActualBreakdownPage](DTO-Sozlugu.md#actualbreakdownpage).

```json
{
  "fromDate": "2026-10-15",
  "toDate": "2026-10-15",
  "dimension": "Task",
  "timeZonePolicy": "SourceSessionZone",
  "serverNow": "2026-10-15T07:05:00+00:00",
  "totalWorkSeconds": 2700,
  "items": [
    {
      "id": "01a16bf8-a147-7d6c-b495-57a785eae26e",
      "label": "Step",
      "snapshotAvailable": true,
      "workSeconds": 1200,
      "sessionCount": 1
    },
    {
      "id": null,
      "label": "Bağımsız odak",
      "snapshotAvailable": true,
      "workSeconds": 900,
      "sessionCount": 1
    },
    {
      "id": "01a16bf8-9f9b-71bb-92e2-367d7b7e00e9",
      "label": "Project",
      "snapshotAvailable": true,
      "workSeconds": 600,
      "sessionCount": 1
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
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "1..366 gün, geçerli gruplama ve limit1..100/offset0..100000 seçin.",
  "status": 400,
  "code": "analytics_query_invalid",
  "traceId": "00-60803e339b8eb10a55fc0f6b9debbfc1-f79bc43637c499eb-00"
}
```

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
GET /api/analytics/days/2026-10-15/review
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PlanAnalyticsDay](DTO-Sozlugu.md#plananalyticsday).

```json
{
  "date": "2026-10-15",
  "planTimeZoneId": "Europe/Istanbul",
  "dailyPlanId": null,
  "baselineRevisionId": null,
  "currentRevisionId": null,
  "actualSeconds": 0,
  "baseline": {
    "plannedWorkSeconds": 0,
    "conflictingPlannedSeconds": 0,
    "componentCount": 0,
    "completedComponentCount": 0,
    "unknownCompletionCount": 0,
    "countCompletion": null,
    "knownEstimatedSeconds": 0,
    "knownCompletedEstimatedSeconds": 0,
    "unknownEstimateCount": 0,
    "estimateCoverage": null,
    "durationCompletion": null,
    "conflictingEstimateCount": 0,
    "missingSnapshotBlockCount": 0,
    "quotaSeconds": 0,
    "quotaFulfilledSeconds": 0,
    "quotaRatio": null,
    "unplannedActualSeconds": 0,
    "accuracy": {
      "sampleCount": 0,
      "excludedWithoutRecordedWorkCount": 0,
      "meanErrorSeconds": null,
      "meanAbsoluteErrorSeconds": null
    },
    "fixedStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    },
    "flexibleStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    }
  },
  "current": {
    "plannedWorkSeconds": 0,
    "conflictingPlannedSeconds": 0,
    "componentCount": 0,
    "completedComponentCount": 0,
    "unknownCompletionCount": 0,
    "countCompletion": null,
    "knownEstimatedSeconds": 0,
    "knownCompletedEstimatedSeconds": 0,
    "unknownEstimateCount": 0,
    "estimateCoverage": null,
    "durationCompletion": null,
    "conflictingEstimateCount": 0,
    "missingSnapshotBlockCount": 0,
    "quotaSeconds": 0,
    "quotaFulfilledSeconds": 0,
    "quotaRatio": null,
    "unplannedActualSeconds": 0,
    "accuracy": {
      "sampleCount": 0,
      "excludedWithoutRecordedWorkCount": 0,
      "meanErrorSeconds": null,
      "meanAbsoluteErrorSeconds": null
    },
    "fixedStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    },
    "flexibleStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    }
  },
  "revisionCount": 0,
  "revisionReasons": [],
  "deferCount": 2,
  "deferReasons": [
    {
      "reason": null,
      "reasonAvailable": false,
      "count": 1
    },
    {
      "reason": "Toplantı uzadı",
      "reasonAvailable": true,
      "count": 1
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/analytics/estimate-accuracy?fromDate=2026-10-15&toDate=2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [EstimateAccuracyView](DTO-Sozlugu.md#estimateaccuracyview).

```json
{
  "fromDate": "2026-10-15",
  "toDate": "2026-10-15",
  "sampleCount": 4,
  "excludedWithoutWorkCount": 1,
  "medianRatio": null,
  "p25Ratio": null,
  "p75Ratio": null,
  "unavailableReason": "insufficient_samples",
  "minimumSamples": 5,
  "serverNow": "2026-10-15T18:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "1..366 gün ve tolerans0..3600sn seçin.",
  "status": 400,
  "code": "analytics_query_invalid",
  "traceId": "00-8b2625932fa153163a602f3e7eb63b0c-1847442ad731ea96-00"
}
```

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
GET /api/analytics/estimate-suggestion?taskId=01a16bfa-2d78-7b7a-bc2f-f3761243295f&fromDate=2026-10-15&toDate=2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [EstimateSuggestionView](DTO-Sozlugu.md#estimatesuggestionview).

```json
{
  "taskId": "01a16bfa-2d78-7b7a-bc2f-f3761243295f",
  "fromDate": "2026-10-15",
  "toDate": "2026-10-15",
  "comparisonContext": "Category",
  "contextId": "01a16bfa-2bbd-7369-9629-6caa69066274",
  "sampleCount": 3,
  "excludedWithoutWorkCount": 0,
  "excludedUnknownZoneCount": 0,
  "suggestedSeconds": 1200,
  "unavailableReason": null,
  "method": "MedianCompletedComparableActual",
  "applied": false,
  "sampleLimit": 20,
  "samples": [
    {
      "taskId": "01a16bfa-2c0f-7d1a-bee0-896bfa4cb05f",
      "title": "Örnek0",
      "completedAt": "2026-10-15T09:00:00+00:00",
      "estimatedSeconds": null,
      "actualSeconds": 600
    },
    {
      "taskId": "01a16bfa-2cb9-7b00-909a-2ac1f5e16ac4",
      "title": "Örnek1",
      "completedAt": "2026-10-15T09:00:00+00:00",
      "estimatedSeconds": null,
      "actualSeconds": 1200
    },
    {
      "taskId": "01a16bfa-2d12-7651-b6c7-cc80cb640c99",
      "title": "Örnek2",
      "completedAt": "2026-10-15T09:00:00+00:00",
      "estimatedSeconds": null,
      "actualSeconds": 1800
    }
  ],
  "serverNow": "2026-10-15T09:00:00+00:00"
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
  "traceId": "00-27c839cc17b8bf13dd8e1d7e1ae9c334-61d81cde55c7a834-00"
}
```

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
GET /api/analytics/plans?fromDate=2026-10-15&toDate=2026-10-16&startToleranceSeconds=60
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PlanAnalyticsView](DTO-Sozlugu.md#plananalyticsview).

```json
{
  "fromDate": "2026-10-15",
  "toDate": "2026-10-16",
  "serverNow": "2026-10-16T08:00:00+00:00",
  "planningVersion": 7,
  "actualTimeZonePolicy": "SourceSessionZone",
  "startToleranceSeconds": 60,
  "actualSeconds": 7200,
  "baseline": {
    "plannedWorkSeconds": 7200,
    "conflictingPlannedSeconds": 0,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 0,
    "countCompletion": 1,
    "knownEstimatedSeconds": 7200,
    "knownCompletedEstimatedSeconds": 7200,
    "unknownEstimateCount": 0,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 0,
    "missingSnapshotBlockCount": 0,
    "quotaSeconds": 7200,
    "quotaFulfilledSeconds": 7200,
    "quotaRatio": 1,
    "unplannedActualSeconds": 0,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 0,
      "meanErrorSeconds": 0,
      "meanAbsoluteErrorSeconds": 0
    },
    "fixedStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    },
    "flexibleStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    }
  },
  "current": {
    "plannedWorkSeconds": 7200,
    "conflictingPlannedSeconds": 0,
    "componentCount": 1,
    "completedComponentCount": 1,
    "unknownCompletionCount": 0,
    "countCompletion": 1,
    "knownEstimatedSeconds": 7200,
    "knownCompletedEstimatedSeconds": 7200,
    "unknownEstimateCount": 0,
    "estimateCoverage": 1,
    "durationCompletion": 1,
    "conflictingEstimateCount": 0,
    "missingSnapshotBlockCount": 0,
    "quotaSeconds": 7200,
    "quotaFulfilledSeconds": 7200,
    "quotaRatio": 1,
    "unplannedActualSeconds": 0,
    "accuracy": {
      "sampleCount": 1,
      "excludedWithoutRecordedWorkCount": 0,
      "meanErrorSeconds": 0,
      "meanAbsoluteErrorSeconds": 0
    },
    "fixedStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    },
    "flexibleStarts": {
      "sampleCount": 0,
      "lateCount": 0,
      "earlyCount": 0,
      "onTimeCount": 0,
      "averageSignedDelaySeconds": null,
      "averageLateSeconds": null
    }
  },
  "revisionCount": 2,
  "deferCount": 0,
  "legacyZoneDeferCount": 0,
  "days": [
    {
      "date": "2026-10-15",
      "planTimeZoneId": "Europe/Istanbul",
      "dailyPlanId": "01a16bfa-6994-71a3-9618-b706052e14d5",
      "baselineRevisionId": "01a16bfa-69b7-7c49-904f-230b1d8279c9",
      "currentRevisionId": "01a16bfa-69b7-7c49-904f-230b1d8279c9",
      "actualSeconds": 3600,
      "baseline": {
        "plannedWorkSeconds": 3600,
        "conflictingPlannedSeconds": 0,
        "componentCount": 1,
        "completedComponentCount": 0,
        "unknownCompletionCount": 0,
        "countCompletion": 0,
        "knownEstimatedSeconds": 7200,
        "knownCompletedEstimatedSeconds": 0,
        "unknownEstimateCount": 0,
        "estimateCoverage": 1,
        "durationCompletion": 0,
        "conflictingEstimateCount": 0,
        "missingSnapshotBlockCount": 0,
        "quotaSeconds": 3600,
        "quotaFulfilledSeconds": 3600,
        "quotaRatio": 1,
        "unplannedActualSeconds": 0,
        "accuracy": {
          "sampleCount": 0,
          "excludedWithoutRecordedWorkCount": 0,
          "meanErrorSeconds": null,
          "meanAbsoluteErrorSeconds": null
        },
        "fixedStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        },
        "flexibleStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        }
      },
      "current": {
        "plannedWorkSeconds": 3600,
        "conflictingPlannedSeconds": 0,
        "componentCount": 1,
        "completedComponentCount": 0,
        "unknownCompletionCount": 0,
        "countCompletion": 0,
        "knownEstimatedSeconds": 7200,
        "knownCompletedEstimatedSeconds": 0,
        "unknownEstimateCount": 0,
        "estimateCoverage": 1,
        "durationCompletion": 0,
        "conflictingEstimateCount": 0,
        "missingSnapshotBlockCount": 0,
        "quotaSeconds": 3600,
        "quotaFulfilledSeconds": 3600,
        "quotaRatio": 1,
        "unplannedActualSeconds": 0,
        "accuracy": {
          "sampleCount": 0,
          "excludedWithoutRecordedWorkCount": 0,
          "meanErrorSeconds": null,
          "meanAbsoluteErrorSeconds": null
        },
        "fixedStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        },
        "flexibleStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        }
      },
      "revisionCount": 1,
      "revisionReasons": [
        {
          "trigger": "Manual",
          "reason": "Manuel plan düzenlemesi",
          "count": 1
        }
      ],
      "deferCount": 0,
      "deferReasons": []
    },
    {
      "date": "2026-10-16",
      "planTimeZoneId": "Europe/Istanbul",
      "dailyPlanId": "01a16bfa-6a62-7239-bf3d-e63f3f7d8f31",
      "baselineRevisionId": "01a16bfa-6a80-70fc-8794-0d5ed22c8bb7",
      "currentRevisionId": "01a16bfa-6a80-70fc-8794-0d5ed22c8bb7",
      "actualSeconds": 3600,
      "baseline": {
        "plannedWorkSeconds": 3600,
        "conflictingPlannedSeconds": 0,
        "componentCount": 1,
        "completedComponentCount": 1,
        "unknownCompletionCount": 0,
        "countCompletion": 1,
        "knownEstimatedSeconds": 7200,
        "knownCompletedEstimatedSeconds": 7200,
        "unknownEstimateCount": 0,
        "estimateCoverage": 1,
        "durationCompletion": 1,
        "conflictingEstimateCount": 0,
        "missingSnapshotBlockCount": 0,
        "quotaSeconds": 3600,
        "quotaFulfilledSeconds": 3600,
        "quotaRatio": 1,
        "unplannedActualSeconds": 0,
        "accuracy": {
          "sampleCount": 1,
          "excludedWithoutRecordedWorkCount": 0,
          "meanErrorSeconds": 0,
          "meanAbsoluteErrorSeconds": 0
        },
        "fixedStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        },
        "flexibleStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        }
      },
      "current": {
        "plannedWorkSeconds": 3600,
        "conflictingPlannedSeconds": 0,
        "componentCount": 1,
        "completedComponentCount": 1,
        "unknownCompletionCount": 0,
        "countCompletion": 1,
        "knownEstimatedSeconds": 7200,
        "knownCompletedEstimatedSeconds": 7200,
        "unknownEstimateCount": 0,
        "estimateCoverage": 1,
        "durationCompletion": 1,
        "conflictingEstimateCount": 0,
        "missingSnapshotBlockCount": 0,
        "quotaSeconds": 3600,
        "quotaFulfilledSeconds": 3600,
        "quotaRatio": 1,
        "unplannedActualSeconds": 0,
        "accuracy": {
          "sampleCount": 1,
          "excludedWithoutRecordedWorkCount": 0,
          "meanErrorSeconds": 0,
          "meanAbsoluteErrorSeconds": 0
        },
        "fixedStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        },
        "flexibleStarts": {
          "sampleCount": 0,
          "lateCount": 0,
          "earlyCount": 0,
          "onTimeCount": 0,
          "averageSignedDelaySeconds": null,
          "averageLateSeconds": null
        }
      },
      "revisionCount": 1,
      "revisionReasons": [
        {
          "trigger": "Manual",
          "reason": "Manuel plan düzenlemesi",
          "count": 1
        }
      ],
      "deferCount": 0,
      "deferReasons": []
    }
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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

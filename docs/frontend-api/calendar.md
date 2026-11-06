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
GET /api/calendar?fromDate=2026-10-15&toDate=2026-10-16
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarRangeView](DTO-Sozlugu.md#calendarrangeview).

```json
{
  "fromDate": "2026-10-15",
  "toDate": "2026-10-16",
  "serverNow": "2026-10-16T06:00:00+00:00",
  "days": [
    {
      "localDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "dailyPlanId": null,
      "currentRevisionId": null,
      "baselineRevisionId": null,
      "revisionNumber": 0,
      "planningVersion": 3,
      "plannedWorkSeconds": 0,
      "plannedBreakSeconds": 0,
      "plannedBufferSeconds": 0,
      "baselineWorkSeconds": 0,
      "plannedBlockCount": 0,
      "actualSeconds": 1800.0,
      "actualSegmentCount": 1,
      "completedTaskCount": 0,
      "hasOpenWork": false
    },
    {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "dailyPlanId": null,
      "currentRevisionId": null,
      "baselineRevisionId": null,
      "revisionNumber": 0,
      "planningVersion": 3,
      "plannedWorkSeconds": 0,
      "plannedBreakSeconds": 0,
      "plannedBufferSeconds": 0,
      "baselineWorkSeconds": 0,
      "plannedBlockCount": 0,
      "actualSeconds": 1800.0,
      "actualSegmentCount": 1,
      "completedTaskCount": 0,
      "hasOpenWork": false
    }
  ],
  "legacyZoneCompletionCount": 0
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "1–42 günlük açık tarih aralığı seçin.",
  "status": 400,
  "code": "calendar_range_invalid",
  "traceId": "00-e1388d704dc5aaee2be1afffa2a60a57-9b10198e8d86351b-00"
}
```

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
GET /api/calendar/days/2026-10-15?revisionId=01a16c00-0489-7910-a221-279e011d3e7b
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarDayView](DTO-Sozlugu.md#calendardayview).

```json
{
  "summary": {
    "localDate": "2026-10-15",
    "timeZoneId": "Europe/Istanbul",
    "dailyPlanId": "01a16c00-01c9-7acc-b78f-bdb8cefe0702",
    "currentRevisionId": "01a16c00-1427-70f3-b93c-2a1fa8d72120",
    "baselineRevisionId": "01a16c00-0489-7910-a221-279e011d3e7b",
    "revisionNumber": 3,
    "planningVersion": 24,
    "plannedWorkSeconds": 6660.0,
    "plannedBreakSeconds": 1800.0,
    "plannedBufferSeconds": 0,
    "baselineWorkSeconds": 7200.0,
    "plannedBlockCount": 6,
    "actualSeconds": 2700.0,
    "actualSegmentCount": 2,
    "completedTaskCount": 1,
    "hasOpenWork": false
  },
  "serverNow": "2026-10-15T06:52:00+00:00",
  "plan": {
    "items": [
      {
        "revisionItemId": "01a16c00-0489-726a-be2d-58b8adadc16f",
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
        },
        "taskAtDayEnd": {
          "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
          "state": "Completed",
          "eventSequence": 7,
          "effectiveAt": "2026-10-15T06:52:00+00:00",
          "available": true
        }
      },
      {
        "revisionItemId": "01a16c00-0489-7e4b-8a78-d94b6e918989",
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
        },
        "taskAtDayEnd": {
          "taskId": "01a16bff-fdfd-705a-846a-c1cb8e5b64b2",
          "state": "Pending",
          "eventSequence": 2,
          "effectiveAt": "2026-10-15T06:00:00+00:00",
          "available": true
        }
      },
      {
        "revisionItemId": "01a16c00-0489-7548-b17f-89e0fa37f5d6",
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
        },
        "taskAtDayEnd": {
          "taskId": "01a16bff-ff0f-7b0f-8bed-818dd7c85627",
          "state": "Pending",
          "eventSequence": 2,
          "effectiveAt": "2026-10-15T06:00:00+00:00",
          "available": true
        }
      },
      {
        "revisionItemId": "01a16c00-0489-79f3-8c5f-ca2cb7e140df",
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
        },
        "taskAtDayEnd": {
          "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
          "state": "Pending",
          "eventSequence": 2,
          "effectiveAt": "2026-10-15T06:00:00+00:00",
          "available": true
        }
      },
      {
        "revisionItemId": "01a16c00-0489-7f79-ab7f-8252038b3c33",
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
        },
        "taskAtDayEnd": null
      },
      {
        "revisionItemId": "01a16c00-0489-7946-bdd8-30e1d172c837",
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
        },
        "taskAtDayEnd": {
          "taskId": "01a16bff-fff9-7f2b-a948-585c00df926b",
          "state": "Pending",
          "eventSequence": 2,
          "effectiveAt": "2026-10-15T06:00:00+00:00",
          "available": true
        }
      }
    ],
    "offset": 0,
    "limit": 50,
    "total": 6,
    "revisionId": "01a16c00-0489-7910-a221-279e011d3e7b"
  },
  "actual": {
    "items": [
      {
        "sessionId": "01a16c00-0537-7adf-9dda-93f7d32a7602",
        "segmentId": "01a16c00-0544-7075-9322-5bc9b2462a6b",
        "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
        "timeZoneId": "Europe/Istanbul",
        "startsAt": "2026-10-15T06:00:00+00:00",
        "endsAt": "2026-10-15T06:40:00+00:00",
        "sourceStartedAt": "2026-10-15T06:00:00+00:00",
        "sourceEndedAt": "2026-10-15T06:40:00+00:00",
        "activeSeconds": 2400,
        "sessionStillRunning": false,
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
        "taskAtDayEnd": {
          "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
          "state": "Completed",
          "eventSequence": 7,
          "effectiveAt": "2026-10-15T06:52:00+00:00",
          "available": true
        }
      },
      {
        "sessionId": "01a16c00-0537-7adf-9dda-93f7d32a7602",
        "segmentId": "01a16c00-0bff-79ca-b570-dc5dab862136",
        "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
        "timeZoneId": "Europe/Istanbul",
        "startsAt": "2026-10-15T06:47:00+00:00",
        "endsAt": "2026-10-15T06:52:00+00:00",
        "sourceStartedAt": "2026-10-15T06:47:00+00:00",
        "sourceEndedAt": "2026-10-15T06:52:00+00:00",
        "activeSeconds": 300,
        "sessionStillRunning": false,
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
        "taskAtDayEnd": {
          "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
          "state": "Completed",
          "eventSequence": 7,
          "effectiveAt": "2026-10-15T06:52:00+00:00",
          "available": true
        }
      }
    ],
    "offset": 0,
    "limit": 50,
    "total": 2
  },
  "completions": {
    "items": [
      {
        "eventId": "01a16c00-13c5-7c19-a3d3-4cb3aba88ab1",
        "taskId": "01a16bff-fc95-79d6-ad6e-47adcb96bbf2",
        "effectiveAt": "2026-10-15T06:52:00+00:00",
        "timeZoneId": "Europe/Istanbul",
        "title": "Adım A",
        "parentTaskId": "01a16bff-f9f5-77c4-a2e0-6fe58fb11360",
        "sequence": 6
      }
    ],
    "offset": 0,
    "limit": 50,
    "total": 1
  },
  "legacyZoneCompletionCount": 0
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Bu güne ait revizyon bulunamadı.",
  "status": 404,
  "code": "revision_not_found",
  "traceId": "00-1593ee71f2f1d249448b94642b5cb611-c99ee01161f6781c-00"
}
```

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
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |

**Request şeması:** [DistributionRequestDto](DTO-Sozlugu.md#distributionrequestdto).

**Örnek request body:**

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "taskIds": [
    "01a16bff-615c-7866-a38c-d4a9b33bb41f"
  ],
  "expectedPlanningVersion": 5
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/2026-10-15/carry
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DistributionPreviewView](DTO-Sozlugu.md#distributionpreviewview).

```json
{
  "proposalId": "01a16bff-633e-7b9b-8969-1c991b8269a9",
  "inputVersion": 5,
  "createdAt": "2026-10-16T06:00:00+00:00",
  "expiresAt": "2026-10-16T06:02:00+00:00",
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
          "taskId": "01a16bff-615c-7866-a38c-d4a9b33bb41f",
          "kind": "Work",
          "startsAt": "2026-10-16T06:01:00+00:00",
          "endsAt": "2026-10-16T07:01:00+00:00",
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
          "taskId": "01a16bff-615c-7866-a38c-d4a9b33bb41f",
          "before": null,
          "after": {
            "existingScheduleId": null,
            "taskId": "01a16bff-615c-7866-a38c-d4a9b33bb41f",
            "kind": "Work",
            "startsAt": "2026-10-16T06:01:00+00:00",
            "endsAt": "2026-10-16T07:01:00+00:00",
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
          "taskId": "01a16bff-615c-7866-a38c-d4a9b33bb41f",
          "seconds": 3600,
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
  "title": "Bu anahtar başka bir komutta kullanılmış.",
  "status": 409,
  "code": "idempotency_conflict",
  "traceId": "00-bb5b8a1539ecb28f041cdd0a8350bc2c-48e5d95ee04651e5-00"
}
```

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [DeferDaySelectionRequest](DTO-Sozlugu.md#deferdayselectionrequest).

**Örnek request body:**

```json
{
  "targetDate": "2026-10-16",
  "schedules": [
    {
      "id": "01a170c2-ebd5-7ac8-9791-9ae16e122483",
      "version": 1
    },
    {
      "id": "01a170c2-ece6-72fb-b197-8443b2ec184d",
      "version": 1
    }
  ],
  "items": [
    {
      "id": "01a170c2-e91d-7950-b4eb-6ba65bcc29ae",
      "version": 1
    }
  ],
  "expectedPlanningVersion": 12,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/2026-10-15/defer
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayDeferralResult](DTO-Sozlugu.md#daydeferralresult).

```json
{
  "changeSetId": "01a170c2-efad-7055-8660-b0bb426a09f8",
  "planningVersion": 13,
  "schedules": [
    {
      "id": "01a170c2-ebd5-7ac8-9791-9ae16e122483",
      "dailyPlanId": "01a170c2-e8ee-726e-aed5-67551d358848",
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "kind": "Work",
      "state": "Removed",
      "startsAt": "2026-10-15T07:00:00+00:00",
      "endsAt": "2026-10-15T07:20:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
          "taskVersion": 2,
          "title": "Saatli tahminsiz",
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
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    },
    {
      "id": "01a170c2-ece6-72fb-b197-8443b2ec184d",
      "dailyPlanId": "01a170c2-e8ee-726e-aed5-67551d358848",
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "kind": "Work",
      "state": "Removed",
      "startsAt": "2026-10-15T08:00:00+00:00",
      "endsAt": "2026-10-15T08:20:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
          "taskVersion": 2,
          "title": "Saatli tahminsiz",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 9,
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
  "items": [
    {
      "id": "01a170c2-eaf7-7a1b-a460-2861df681c1b",
      "localDate": "2026-10-16",
      "taskId": "01a170c2-e7ae-7313-b577-5ce9743dfb26",
      "sortOrder": 0,
      "completedAt": null,
      "version": 1,
      "taskTitle": "Saatsiz",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": 600,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    },
    {
      "id": "01a170c2-efad-7945-8af0-bec5495b54ef",
      "localDate": "2026-10-16",
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "sortOrder": 1,
      "completedAt": null,
      "version": 1,
      "taskTitle": "Saatli tahminsiz",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": null,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    }
  ],
  "revisionIds": [
    "01a170c2-efb4-725b-8d03-d5137d9fc82b",
    "01a170c2-efb5-749a-b185-a64fe424ad7a"
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [DeferDaySelectionRequest](DTO-Sozlugu.md#deferdayselectionrequest).

**Örnek request body:**

```json
{
  "targetDate": "2026-10-16",
  "schedules": [
    {
      "id": "01a170c2-ebd5-7ac8-9791-9ae16e122483",
      "version": 1
    },
    {
      "id": "01a170c2-ece6-72fb-b197-8443b2ec184d",
      "version": 1
    }
  ],
  "items": [
    {
      "id": "01a170c2-e91d-7950-b4eb-6ba65bcc29ae",
      "version": 1
    }
  ],
  "expectedPlanningVersion": 12,
  "allowProtectedChange": false
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/2026-10-15/defer-preview
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [DayDeferralPreview](DTO-Sozlugu.md#daydeferralpreview).

```json
{
  "sourceDate": "2026-10-15",
  "targetDate": "2026-10-16",
  "planningVersion": 12,
  "schedules": [
    {
      "id": "01a170c2-ebd5-7ac8-9791-9ae16e122483",
      "dailyPlanId": "01a170c2-e8ee-726e-aed5-67551d358848",
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T07:00:00+00:00",
      "endsAt": "2026-10-15T07:20:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
          "taskVersion": 2,
          "title": "Saatli tahminsiz",
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
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    },
    {
      "id": "01a170c2-ece6-72fb-b197-8443b2ec184d",
      "dailyPlanId": "01a170c2-e8ee-726e-aed5-67551d358848",
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T08:00:00+00:00",
      "endsAt": "2026-10-15T08:20:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 1,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
          "taskVersion": 2,
          "title": "Saatli tahminsiz",
          "ancestors": [],
          "project": null,
          "pool": null,
          "category": null,
          "tags": [],
          "inputPlanningVersion": 9,
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
  "items": [
    {
      "id": "01a170c2-e91d-7950-b4eb-6ba65bcc29ae",
      "localDate": "2026-10-15",
      "taskId": "01a170c2-e7ae-7313-b577-5ce9743dfb26",
      "sortOrder": 0,
      "completedAt": null,
      "version": 1,
      "taskTitle": "Saatsiz",
      "parentTaskId": null,
      "parentTitle": null,
      "directEstimatedSeconds": 600,
      "taskState": "Pending",
      "changeSetId": null,
      "planningVersion": null
    }
  ],
  "tasks": [
    {
      "taskId": "01a170c2-e5d9-763c-a0a1-f662c4b95bd9",
      "title": "Saatli tahminsiz",
      "alreadyPlanned": false
    },
    {
      "taskId": "01a170c2-e7ae-7313-b577-5ce9743dfb26",
      "title": "Saatsiz",
      "alreadyPlanned": true
    }
  ],
  "issues": [],
  "canApply": true
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |

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
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:500 |

**Request şeması:** [ReturnManyToPoolRequest](DTO-Sozlugu.md#returnmanytopoolrequest).

**Örnek request body:**

```json
{
  "poolId": "01a170c2-ee2a-7067-a43e-a1f6c1524de9",
  "expectedPlanningVersion": 11,
  "tasks": [
    {
      "id": "01a170c2-e5da-7c53-a23b-c554b25c55ab",
      "version": 3
    },
    {
      "id": "01a170c2-e7ae-7c2a-9ea0-db7f0e668ded",
      "version": 2
    }
  ]
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/2026-10-15/pool-batch
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "01a170c2-eedf-77ce-a1e5-6af548e4fcc2",
  "planningVersion": 12,
  "schedules": [
    {
      "id": "01a170c2-ebd5-7668-80b7-2c41cb3b6d90",
      "dailyPlanId": "01a170c2-eb8a-7955-90ed-0349eb1afd49",
      "taskId": "01a170c2-e7ae-7c2a-9ea0-db7f0e668ded",
      "kind": "Work",
      "state": "Removed",
      "startsAt": "2026-10-16T06:00:00+00:00",
      "endsAt": "2026-10-16T07:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a170c2-e7ae-7c2a-9ea0-db7f0e668ded",
          "taskVersion": 2,
          "title": "Saatli",
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
    }
  ],
  "revisionIds": [
    "01a170c2-eef3-7bb4-865d-45ed074220dc",
    "01a170c2-eef3-77fc-b379-a63a55f3d339"
  ],
  "warnings": []
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `expectedPlanningVersion` | Int64? | required; range:0..9,223372036854776E+18 |
| `poolId` | Guid? | required |
| `allowProtectedChange` | Boolean | DTO/modül iş kuralı |
| `reason` | String | maxLength:2000 |

**Request şeması:** [ReturnToPoolRequest](DTO-Sozlugu.md#returntopoolrequest).

**Örnek request body:**

```json
{
  "version": 3,
  "expectedPlanningVersion": 6,
  "poolId": "01a16bff-55f4-7e99-af65-c9a488bc6634",
  "allowProtectedChange": true
}
```

**Örnek HTTP:**

```http
POST /api/calendar/days/2026-10-15/tasks/01a16bff-553f-7e9f-85c4-e2dc00997cc7/pool
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PlanMutation](DTO-Sozlugu.md#planmutation).

```json
{
  "changeSetId": "01a16bff-5bbc-7f21-bf1a-75204a4fb382",
  "planningVersion": 7,
  "schedules": [
    {
      "id": "01a16bff-56ac-779f-8bbe-961dbfb8fb4d",
      "dailyPlanId": "01a16bff-567b-7e32-9b9a-76c83d6a81c7",
      "taskId": "01a16bff-553f-7e9f-85c4-e2dc00997cc7",
      "kind": "Work",
      "state": "Planned",
      "startsAt": "2026-10-15T06:00:00+00:00",
      "endsAt": "2026-10-15T06:20:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bff-553f-7e9f-85c4-e2dc00997cc7",
          "taskVersion": 1,
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
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    },
    {
      "id": "01a16bff-58ab-779f-80ae-a31194fb6d1c",
      "dailyPlanId": "01a16bff-5894-7343-bdfd-fb51bd1ea079",
      "taskId": "01a16bff-553f-7e9f-85c4-e2dc00997cc7",
      "kind": "Work",
      "state": "Removed",
      "startsAt": "2026-10-16T06:00:00+00:00",
      "endsAt": "2026-10-16T07:00:00+00:00",
      "isFixed": true,
      "isLocked": false,
      "splitGroupId": null,
      "originScheduleId": null,
      "version": 2,
      "taskSnapshot": {
        "task": {
          "schemaVersion": 2,
          "taskId": "01a16bff-553f-7e9f-85c4-e2dc00997cc7",
          "taskVersion": 1,
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
        "directEstimatedSeconds": null,
        "targetBudgetSeconds": null
      },
      "isAutomatic": false,
      "completedAt": null
    }
  ],
  "revisionIds": [
    "01a16bff-5bce-75b3-a105-e27543534f4b",
    "01a16bff-5bce-7dd7-9138-4cae339dbc15"
  ],
  "warnings": []
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Aktif işi havuzda bekletmeden önce duraklatın.",
  "status": 409,
  "code": "work_running",
  "traceId": "00-0d3abb39ef91cb7886695c9fb8e9bc9d-28b8a9b4bb055444-00"
}
```

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
GET /api/calendar/items?fromDate=2026-10-15&toDate=2026-10-16
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [CalendarItemPage](DTO-Sozlugu.md#calendaritempage).

```json
{
  "fromDate": "2026-10-15",
  "toDate": "2026-10-16",
  "items": [
    {
      "kind": "Timed",
      "id": "01a16bff-fdfb-7295-8392-3dcb0b206caf",
      "localDate": "2026-10-15",
      "taskId": "01a16bff-faa2-736c-87b3-1e0cfe4a4ea7",
      "title": "Kaynak notları",
      "parentTaskId": "01a16bff-fa07-7cbf-a2cc-f78b5a66f7d2",
      "parentTitle": "Bölüm 3",
      "rootTaskId": "01a16bff-f92a-73c7-bdd4-239266d114d2",
      "rootTitle": "Tez",
      "startsAt": "2026-10-15T07:00:00+00:00",
      "endsAt": "2026-10-15T08:00:00+00:00",
      "completedAt": null,
      "taskState": "Pending"
    },
    {
      "kind": "Timed",
      "id": "01a16bff-fc66-7f47-a167-5b8d5412769a",
      "localDate": "2026-10-15",
      "taskId": "01a16bff-fb65-72e5-91a5-5cef0fc157df",
      "title": "E-postalar",
      "parentTaskId": null,
      "parentTitle": null,
      "rootTaskId": "01a16bff-fb65-72e5-91a5-5cef0fc157df",
      "rootTitle": "E-postalar",
      "startsAt": "2026-10-15T11:00:00+00:00",
      "endsAt": "2026-10-15T12:00:00+00:00",
      "completedAt": null,
      "taskState": "Pending"
    },
    {
      "kind": "Untimed",
      "id": "01a16bff-ffa3-7d18-aed1-76f805ad5588",
      "localDate": "2026-10-15",
      "taskId": "01a16bff-fb81-7297-b648-67440ca7760b",
      "title": "Yürüyüş",
      "parentTaskId": null,
      "parentTitle": null,
      "rootTaskId": "01a16bff-fb81-7297-b648-67440ca7760b",
      "rootTitle": "Yürüyüş",
      "startsAt": null,
      "endsAt": null,
      "completedAt": null,
      "taskState": "Pending"
    },
    {
      "kind": "Untimed",
      "id": "01a16c00-006a-7bc6-9ae0-e8b191717ded",
      "localDate": "2026-10-16",
      "taskId": "01a16bff-fb65-72e5-91a5-5cef0fc157df",
      "title": "E-postalar",
      "parentTaskId": null,
      "parentTitle": null,
      "rootTaskId": "01a16bff-fb65-72e5-91a5-5cef0fc157df",
      "rootTitle": "E-postalar",
      "startsAt": null,
      "endsAt": null,
      "completedAt": null,
      "taskState": "Pending"
    }
  ],
  "offset": 0,
  "limit": 300,
  "total": 4
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "1–42 günlük açık tarih aralığı seçin.",
  "status": 400,
  "code": "calendar_range_invalid",
  "traceId": "00-c51162f9aa5b763ce3fb2ea050f29440-79810c6853d88d79-00"
}
```

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

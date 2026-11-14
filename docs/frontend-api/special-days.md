# Özel günler

UI-R3 özel günler: doğum günü, yıldönümü, tatil ve diğer. Yearly (isteğe bağlı başlangıç yılı) veya Once (yıl zorunlu); 29 Şubat artık olmayan yılda 28 Şubat gösterilir. Oluşumlar sunucuda hesaplanır (`occurrences`, ≤366 gün). Create Idempotency-Key ister; update/delete/restore version ile 409 verir; silme yumuşaktır ve geri alınabilir. Hatırlatma kullanıcının zaman diliminde 09:00 için bildirim niyetidir (SameDay/OneDayBefore/OneWeekBefore), sessiz saat ve `specialDay` tercihi uygulanır; değişiklik/silme bekleyen niyetleri Obsolete yapar. NonWorking o günün çalışma saatlerini boşaltır, açık tarih istisnası kazanır; plan kendiliğinden değişmez. Değişiklik `SpecialDayChanged` canlı olayı yayınlar.

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/special-days

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Offset` | query | hayır | integer\|string (int32); minimum=0; maximum=100000; pattern="^-?(?:0\|[1-9]\\d*)$" |
| `Limit` | query | hayır | integer\|string (int32); minimum=1; maximum=100; pattern="^-?(?:0\|[1-9]\\d*)$" |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/special-days
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayPage](DTO-Sozlugu.md#specialdaypage).

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

## POST /api/special-days

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `title` | String | required; length:1..120 |
| `kind` | SpecialDayKind? | required |
| `month` | Int32 | range:1..12 |
| `day` | Int32 | range:1..31 |
| `year` | Int32? | range:1..9998 |
| `recurrence` | SpecialDayRecurrence? | required |
| `nonWorking` | Boolean | DTO/modül iş kuralı |
| `reminder` | SpecialDayReminder | DTO/modül iş kuralı |

**Request şeması:** [SpecialDayRequest](DTO-Sozlugu.md#specialdayrequest).

**Örnek request body:**

```json
{
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None"
}
```

**Örnek HTTP:**

```http
POST /api/special-days
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None",
  "nextOccurrence": "2026-10-16",
  "version": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/special-days/occurrences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `fromDate` | query | evet | string (date); — |
| `toDate` | query | evet | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/special-days/occurrences?fromDate=2026-10-16&toDate=2026-10-16
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayOccurrencePage](DTO-Sozlugu.md#specialdayoccurrencepage).

```json
{
  "fromDate": "2026-10-16",
  "toDate": "2026-10-16",
  "items": [],
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

## PUT /api/special-days/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `title` | String | required; length:1..120 |
| `kind` | SpecialDayKind? | required |
| `month` | Int32 | range:1..12 |
| `day` | Int32 | range:1..31 |
| `year` | Int32? | range:1..9998 |
| `recurrence` | SpecialDayRecurrence? | required |
| `nonWorking` | Boolean | DTO/modül iş kuralı |
| `reminder` | SpecialDayReminder | DTO/modül iş kuralı |

**Request şeması:** [UpdateSpecialDayRequest](DTO-Sozlugu.md#updatespecialdayrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None"
}
```

**Örnek HTTP:**

```http
PUT /api/special-days/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None",
  "nextOccurrence": "2026-10-16",
  "version": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/special-days/{id}/delete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [SpecialDayVersionRequest](DTO-Sozlugu.md#specialdayversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/special-days/11111111-1111-4111-8111-111111111111/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None",
  "nextOccurrence": "2026-10-16",
  "version": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/special-days/{id}/restore

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [SpecialDayVersionRequest](DTO-Sozlugu.md#specialdayversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/special-days/11111111-1111-4111-8111-111111111111/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "Raporu yaz",
  "kind": "Birthday",
  "month": 1,
  "day": 1,
  "year": 1,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "None",
  "nextOccurrence": "2026-10-16",
  "version": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

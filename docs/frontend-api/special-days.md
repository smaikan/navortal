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
  "items": [
    {
      "id": "01a16bfe-7015-7c6a-842c-635ca6da88a0",
      "title": "Tatil",
      "kind": "Holiday",
      "month": 12,
      "day": 31,
      "year": 2026,
      "recurrence": "Once",
      "nonWorking": false,
      "reminder": "None",
      "nextOccurrence": "2026-12-31",
      "version": 1,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "deletedAt": null
    },
    {
      "id": "01a16bfe-703c-78f5-a3eb-41837433b736",
      "title": "Yılbaşı",
      "kind": "Holiday",
      "month": 1,
      "day": 1,
      "year": null,
      "recurrence": "Yearly",
      "nonWorking": false,
      "reminder": "None",
      "nextOccurrence": "2027-01-01",
      "version": 1,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "deletedAt": null
    },
    {
      "id": "01a16bfe-6f7c-728f-a8c4-a626816f51a3",
      "title": "Annem",
      "kind": "Birthday",
      "month": 2,
      "day": 29,
      "year": 1960,
      "recurrence": "Yearly",
      "nonWorking": false,
      "reminder": "None",
      "nextOccurrence": "2027-02-28",
      "version": 1,
      "createdAt": "2026-10-15T06:00:00+00:00",
      "updatedAt": "2026-10-15T06:00:00+00:00",
      "deletedAt": null
    }
  ],
  "offset": 0,
  "limit": 50,
  "total": 3
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
  "title": "Yaz",
  "kind": "Anniversary",
  "month": 7,
  "day": 10,
  "year": null,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "OneWeekBefore"
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
  "id": "01a16bfe-68a2-7df3-b7b0-3760875fa3b7",
  "title": "Yaz",
  "kind": "Anniversary",
  "month": 7,
  "day": 10,
  "year": null,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "OneWeekBefore",
  "nextOccurrence": "2027-07-10",
  "version": 1,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "updatedAt": "2026-10-15T06:00:00+00:00",
  "deletedAt": null
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
  "traceId": "00-179a8eeb54c427fed706ad099ecc5f43-aa16d15e70f28af4-00"
}
```

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
GET /api/special-days/occurrences?fromDate=2026-12-01&toDate=2027-11-30
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayOccurrencePage](DTO-Sozlugu.md#specialdayoccurrencepage).

```json
{
  "fromDate": "2026-12-01",
  "toDate": "2027-11-30",
  "items": [
    {
      "specialDayId": "01a16bfe-7015-7c6a-842c-635ca6da88a0",
      "date": "2026-12-31",
      "title": "Tatil",
      "kind": "Holiday",
      "nonWorking": false,
      "version": 1
    },
    {
      "specialDayId": "01a16bfe-703c-78f5-a3eb-41837433b736",
      "date": "2027-01-01",
      "title": "Yılbaşı",
      "kind": "Holiday",
      "nonWorking": false,
      "version": 1
    },
    {
      "specialDayId": "01a16bfe-6f7c-728f-a8c4-a626816f51a3",
      "date": "2027-02-28",
      "title": "Annem",
      "kind": "Birthday",
      "nonWorking": false,
      "version": 1
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
  "title": "1–366 günlük bir aralık seçin.",
  "status": 400,
  "code": "range_invalid",
  "traceId": "00-270c877ab12fb3a80b073d48b9dfd699-cf964bbe360f25f0-00"
}
```

## PUT /api/special-days/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
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
  "title": "Yeni yıl",
  "kind": "Holiday",
  "month": 1,
  "day": 1,
  "recurrence": "Yearly",
  "nonWorking": true,
  "reminder": "None"
}
```

**Örnek HTTP:**

```http
PUT /api/special-days/01a16bfe-703c-78f5-a3eb-41837433b736
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "01a16bfe-703c-78f5-a3eb-41837433b736",
  "title": "Yeni yıl",
  "kind": "Holiday",
  "month": 1,
  "day": 1,
  "year": null,
  "recurrence": "Yearly",
  "nonWorking": true,
  "reminder": "None",
  "nextOccurrence": "2027-01-01",
  "version": 2,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "updatedAt": "2026-10-15T06:00:00+00:00",
  "deletedAt": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Özel gün değişmiş; güncel kaydı alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-9b7fe8543e752b74d5646912e18e9d06-11781568a74bb470-00"
}
```

## POST /api/special-days/{id}/delete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [SpecialDayVersionRequest](DTO-Sozlugu.md#specialdayversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/special-days/01a16bfe-68a2-7df3-b7b0-3760875fa3b7/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "01a16bfe-68a2-7df3-b7b0-3760875fa3b7",
  "title": "Yaz",
  "kind": "Anniversary",
  "month": 7,
  "day": 10,
  "year": null,
  "recurrence": "Yearly",
  "nonWorking": false,
  "reminder": "OneWeekBefore",
  "nextOccurrence": null,
  "version": 2,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "updatedAt": "2026-10-15T06:00:00+00:00",
  "deletedAt": "2026-10-15T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Özel gün bulunamadı.",
  "status": 404,
  "code": "special_day_not_found",
  "traceId": "00-ad95fac268e3eeb257f3a36f36f0439e-0585e140c2fb6368-00"
}
```

## POST /api/special-days/{id}/restore

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [SpecialDayVersionRequest](DTO-Sozlugu.md#specialdayversionrequest).

**Örnek request body:**

```json
{
  "version": 2
}
```

**Örnek HTTP:**

```http
POST /api/special-days/01a16bfe-7015-7c6a-842c-635ca6da88a0/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SpecialDayView](DTO-Sozlugu.md#specialdayview).

```json
{
  "id": "01a16bfe-7015-7c6a-842c-635ca6da88a0",
  "title": "Tatil",
  "kind": "Holiday",
  "month": 12,
  "day": 31,
  "year": 2026,
  "recurrence": "Once",
  "nonWorking": false,
  "reminder": "None",
  "nextOccurrence": "2026-12-31",
  "version": 3,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "updatedAt": "2026-10-15T06:00:00+00:00",
  "deletedAt": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

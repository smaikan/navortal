# Proje, havuz, kategori ve etiket

Dört kaynak aynı create/get/list/update/archive/workload biçimini kullanır; kimlikler kullanıcıya aittir. Proje/havuz görev kopyası oluşturmaz; classification task üzerindeki bağları günceller. ApplyToSubtree gibi toplu niyetlerde planningVersion kontrol edilir. Workload roll-up bağımsız gerçek işlerden gelir; aynı parent/child iki kez eklenmez. Proje, havuz ve kategoride üyelik alt görevlere devralınır; açıkça çıkarılmış veya başka bölüme bağlı dallar kapsama girmez. taskCount ve completedCount yalnız aktif alt görevi olmayan görevleri sayar. Alt görevi olan ana görev ilerleme paydasına eklenmez. Arşivlenmiş kaynakla geçmiş snapshot’lar silinmez.

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/categories

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `search` | query | hayır | string; — |
| `includeArchived` | query | hayır | boolean; default=false |
| `includeSummary` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/categories
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/categories

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [ResourceFieldsRequest](DTO-Sozlugu.md#resourcefieldsrequest).

**Örnek request body:**

```json
{
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/categories
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/categories/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/categories/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/categories/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/categories/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/categories/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/categories/11111111-1111-4111-8111-111111111111/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/categories/{id}/workload

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/categories/11111111-1111-4111-8111-111111111111/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "11111111-1111-4111-8111-111111111111",
  "values": {
    "taskCount": 1,
    "directComponentCount": 1,
    "openComponentCount": 1,
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "calculatedTotalSeconds": 1
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/pools

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `search` | query | hayır | string; — |
| `includeArchived` | query | hayır | boolean; default=false |
| `includeSummary` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/pools
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/pools

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [ResourceFieldsRequest](DTO-Sozlugu.md#resourcefieldsrequest).

**Örnek request body:**

```json
{
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/pools
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/pools/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/pools/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/pools/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/pools/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/pools/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/pools/11111111-1111-4111-8111-111111111111/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/pools/{id}/workload

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/pools/11111111-1111-4111-8111-111111111111/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "11111111-1111-4111-8111-111111111111",
  "values": {
    "taskCount": 1,
    "directComponentCount": 1,
    "openComponentCount": 1,
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "calculatedTotalSeconds": 1
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/projects

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `search` | query | hayır | string; — |
| `includeArchived` | query | hayır | boolean; default=false |
| `includeSummary` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/projects
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/projects

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [ResourceFieldsRequest](DTO-Sozlugu.md#resourcefieldsrequest).

**Örnek request body:**

```json
{
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/projects
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/projects/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/projects/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/projects/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/projects/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/projects/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/projects/{id}/workload

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "11111111-1111-4111-8111-111111111111",
  "values": {
    "taskCount": 1,
    "directComponentCount": 1,
    "openComponentCount": 1,
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "calculatedTotalSeconds": 1
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tags

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |
| `search` | query | hayır | string; — |
| `includeArchived` | query | hayır | boolean; default=false |
| `includeSummary` | query | hayır | boolean; default=false |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tags
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1,
  "summaries": null
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tags

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [ResourceFieldsRequest](DTO-Sozlugu.md#resourcefieldsrequest).

**Örnek request body:**

```json
{
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/tags
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tags/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tags/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tags/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Çalışma",
  "description": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/tags/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/tags/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/tags/11111111-1111-4111-8111-111111111111/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "description": "örnek",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "archivedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tags/{id}/workload

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tags/11111111-1111-4111-8111-111111111111/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "11111111-1111-4111-8111-111111111111",
  "values": {
    "taskCount": 1,
    "directComponentCount": 1,
    "openComponentCount": 1,
    "knownEstimatedSeconds": 1,
    "unknownEstimateCount": 1,
    "calculatedTotalSeconds": 1
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

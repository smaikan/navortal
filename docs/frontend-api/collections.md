# Proje, havuz, kategori ve etiket

Dört kaynak aynı create/get/list/update/archive/workload biçimini kullanır; kimlikler kullanıcıya aittir. Proje/havuz görev kopyası oluşturmaz; classification task üzerindeki bağları günceller. ApplyToSubtree gibi toplu niyetlerde planningVersion kontrol edilir. Workload roll-up bağımsız gerçek işlerden gelir; aynı parent/child iki kez eklenmez. Arşivlenmiş kaynakla geçmiş snapshot’lar silinmez.

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
GET /api/categories?includeArchived=true
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [
    {
      "id": "01a16bfb-74c8-7dc4-815a-2cb4d02269f2",
      "name": "100%_Needle",
      "description": null,
      "createdAt": "2026-10-24T03:36:42.738677+00:00",
      "updatedAt": "2026-10-24T03:36:42.738677+00:00",
      "archivedAt": null,
      "version": 1
    },
    {
      "id": "01a16bfb-73d6-701c-9b99-009a0de17d96",
      "name": "Alpha",
      "description": null,
      "createdAt": "2026-10-24T03:36:42.738677+00:00",
      "updatedAt": "2026-10-24T03:36:42.738677+00:00",
      "archivedAt": "2026-10-24T03:36:42.738677+00:00",
      "version": 2
    },
    {
      "id": "01a16bfb-74a5-7bd8-9b99-a87446ce7287",
      "name": "Updated Beta",
      "description": "Context",
      "createdAt": "2026-10-24T03:36:42.738677+00:00",
      "updatedAt": "2026-10-24T03:36:42.738677+00:00",
      "archivedAt": null,
      "version": 2
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
  "title": "Liste filtreleri geçersiz.",
  "status": 400,
  "code": "resource_query_invalid",
  "traceId": "00-0498ad347e66876ff649e42b6c40ebe2-e1efc9f04665de4e-00"
}
```

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
  "name": "100%_Needle"
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
  "id": "01a16bfb-74c8-7dc4-815a-2cb4d02269f2",
  "name": "100%_Needle",
  "description": null,
  "createdAt": "2026-10-24T03:36:42.738677+00:00",
  "updatedAt": "2026-10-24T03:36:42.738677+00:00",
  "archivedAt": null,
  "version": 1
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
    "Name": [
      "The Name field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URROJ"
}
```

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
GET /api/categories/01a16bfb-73d6-701c-9b99-009a0de17d96
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-73d6-701c-9b99-009a0de17d96",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:42.738677+00:00",
  "updatedAt": "2026-10-24T03:36:42.738677+00:00",
  "archivedAt": "2026-10-24T03:36:42.738677+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-d5f573cc0e25fd86d20b16bb22dab13d-069dc015cd88ff37-00"
}
```

## PUT /api/categories/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Updated Beta",
  "description": "Context"
}
```

**Örnek HTTP:**

```http
PUT /api/categories/01a16bfb-74a5-7bd8-9b99-a87446ce7287
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-74a5-7bd8-9b99-a87446ce7287",
  "name": "Updated Beta",
  "description": "Context",
  "createdAt": "2026-10-24T03:36:42.738677+00:00",
  "updatedAt": "2026-10-24T03:36:42.738677+00:00",
  "archivedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel veriyi alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-d2016eaef620d47d9f6d249d4917bb1c-6159924b9abb61df-00"
}
```

## POST /api/categories/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/categories/01a16bfb-73d6-701c-9b99-009a0de17d96/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-73d6-701c-9b99-009a0de17d96",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:42.738677+00:00",
  "updatedAt": "2026-10-24T03:36:42.738677+00:00",
  "archivedAt": "2026-10-24T03:36:42.738677+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-ea6d1a2e18c5415ef535838d3a112e9e-af8f74e67a041317-00"
}
```

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
GET /api/categories/01a16c00-e423-7a97-ba79-2a4711d07023/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "01a16c00-e423-7a97-ba79-2a4711d07023",
  "values": {
    "taskCount": 0,
    "directComponentCount": 0,
    "openComponentCount": 0,
    "knownEstimatedSeconds": 0,
    "unknownEstimateCount": 0,
    "calculatedTotalSeconds": 0
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/pools?includeArchived=true
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [
    {
      "id": "01a16bfb-802d-742c-abf5-e56b1116ca15",
      "name": "100%_Needle",
      "description": null,
      "createdAt": "2026-10-24T03:36:46.142414+00:00",
      "updatedAt": "2026-10-24T03:36:46.142414+00:00",
      "archivedAt": null,
      "version": 1
    },
    {
      "id": "01a16bfb-7fd7-7eb5-9e49-e4e167980e33",
      "name": "Alpha",
      "description": null,
      "createdAt": "2026-10-24T03:36:46.142414+00:00",
      "updatedAt": "2026-10-24T03:36:46.142414+00:00",
      "archivedAt": "2026-10-24T03:36:46.142414+00:00",
      "version": 2
    },
    {
      "id": "01a16bfb-8007-7701-83ea-df4c7bb65eaf",
      "name": "Updated Beta",
      "description": "Context",
      "createdAt": "2026-10-24T03:36:46.142414+00:00",
      "updatedAt": "2026-10-24T03:36:46.142414+00:00",
      "archivedAt": null,
      "version": 2
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
  "title": "Liste filtreleri geçersiz.",
  "status": 400,
  "code": "resource_query_invalid",
  "traceId": "00-de51453a9be3dfd1f4ec41955a289462-7afd91f26c3042cc-00"
}
```

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
  "name": "100%_Needle"
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
  "id": "01a16bfb-802d-742c-abf5-e56b1116ca15",
  "name": "100%_Needle",
  "description": null,
  "createdAt": "2026-10-24T03:36:46.142414+00:00",
  "updatedAt": "2026-10-24T03:36:46.142414+00:00",
  "archivedAt": null,
  "version": 1
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
    "Name": [
      "The Name field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URRQ0"
}
```

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
GET /api/pools/01a16bfb-7fd7-7eb5-9e49-e4e167980e33
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-7fd7-7eb5-9e49-e4e167980e33",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:46.142414+00:00",
  "updatedAt": "2026-10-24T03:36:46.142414+00:00",
  "archivedAt": "2026-10-24T03:36:46.142414+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-2be2f622aa434a03cd63cadc83c4e5d2-c870cb3a42527767-00"
}
```

## PUT /api/pools/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Updated Beta",
  "description": "Context"
}
```

**Örnek HTTP:**

```http
PUT /api/pools/01a16bfb-8007-7701-83ea-df4c7bb65eaf
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-8007-7701-83ea-df4c7bb65eaf",
  "name": "Updated Beta",
  "description": "Context",
  "createdAt": "2026-10-24T03:36:46.142414+00:00",
  "updatedAt": "2026-10-24T03:36:46.142414+00:00",
  "archivedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel veriyi alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-c74c0dd7c3f2dec86a9d425b59f05067-836d4637a9ef565f-00"
}
```

## POST /api/pools/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/pools/01a16bfb-7fd7-7eb5-9e49-e4e167980e33/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-7fd7-7eb5-9e49-e4e167980e33",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:46.142414+00:00",
  "updatedAt": "2026-10-24T03:36:46.142414+00:00",
  "archivedAt": "2026-10-24T03:36:46.142414+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-ab1a296b14584b705d23e031a748efc1-4d15a024650cec8b-00"
}
```

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
GET /api/pools/01a16bfa-77fa-72f4-9231-a12e34d4b885/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "01a16bfa-77fa-72f4-9231-a12e34d4b885",
  "values": {
    "taskCount": 2,
    "directComponentCount": 2,
    "openComponentCount": 2,
    "knownEstimatedSeconds": 1800,
    "unknownEstimateCount": 0,
    "calculatedTotalSeconds": 1800
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/projects?includeArchived=true
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [
    {
      "id": "01a16bfb-85b6-79a2-a347-efb039de65e0",
      "name": "100%_Needle",
      "description": null,
      "createdAt": "2026-10-24T03:36:47.553547+00:00",
      "updatedAt": "2026-10-24T03:36:47.553547+00:00",
      "archivedAt": null,
      "version": 1
    },
    {
      "id": "01a16bfb-8590-7330-9d72-dea2062271f8",
      "name": "Alpha",
      "description": null,
      "createdAt": "2026-10-24T03:36:47.553547+00:00",
      "updatedAt": "2026-10-24T03:36:47.553547+00:00",
      "archivedAt": "2026-10-24T03:36:47.553547+00:00",
      "version": 2
    },
    {
      "id": "01a16bfb-85a5-7054-9e33-e00fa02225ce",
      "name": "Updated Beta",
      "description": "Context",
      "createdAt": "2026-10-24T03:36:47.553547+00:00",
      "updatedAt": "2026-10-24T03:36:47.553547+00:00",
      "archivedAt": null,
      "version": 2
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
  "title": "Liste filtreleri geçersiz.",
  "status": 400,
  "code": "resource_query_invalid",
  "traceId": "00-b6aab41d72abc78932a43884bddb15a0-a2076099aba9c5ff-00"
}
```

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
  "name": "Small project"
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
  "id": "01a16bfd-ab2a-726a-8d77-0f92f69477b2",
  "name": "Small project",
  "description": null,
  "createdAt": "2026-10-24T03:39:08.183442+00:00",
  "updatedAt": "2026-10-24T03:39:08.183442+00:00",
  "archivedAt": null,
  "version": 1
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
    "Name": [
      "The Name field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URRQM"
}
```

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
GET /api/projects/01a16bfb-8590-7330-9d72-dea2062271f8
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-8590-7330-9d72-dea2062271f8",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:47.553547+00:00",
  "updatedAt": "2026-10-24T03:36:47.553547+00:00",
  "archivedAt": "2026-10-24T03:36:47.553547+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-179fdebd046a8b340b87103f70b248e3-bf720ed76fb18705-00"
}
```

## PUT /api/projects/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Updated Beta",
  "description": "Context"
}
```

**Örnek HTTP:**

```http
PUT /api/projects/01a16bfb-85a5-7054-9e33-e00fa02225ce
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-85a5-7054-9e33-e00fa02225ce",
  "name": "Updated Beta",
  "description": "Context",
  "createdAt": "2026-10-24T03:36:47.553547+00:00",
  "updatedAt": "2026-10-24T03:36:47.553547+00:00",
  "archivedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel veriyi alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-75ac65fd9892fbf6093c7e914d31c4c9-ad74bc347968ba62-00"
}
```

## POST /api/projects/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/projects/01a16bfb-8590-7330-9d72-dea2062271f8/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-8590-7330-9d72-dea2062271f8",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:47.553547+00:00",
  "updatedAt": "2026-10-24T03:36:47.553547+00:00",
  "archivedAt": "2026-10-24T03:36:47.553547+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-73011da7c5dfd975fdef5972344edde4-fbe7fee3acfd4b32-00"
}
```

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
GET /api/projects/01a16bfa-77b2-7120-ad3f-6a01a7bd6596/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "01a16bfa-77b2-7120-ad3f-6a01a7bd6596",
  "values": {
    "taskCount": 2,
    "directComponentCount": 2,
    "openComponentCount": 2,
    "knownEstimatedSeconds": 1800,
    "unknownEstimateCount": 0,
    "calculatedTotalSeconds": 1800
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

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
GET /api/tags?includeArchived=true
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourcePage](DTO-Sozlugu.md#namedresourcepage).

```json
{
  "items": [
    {
      "id": "01a16bfb-7b25-7f18-8802-063803f5880c",
      "name": "100%_Needle",
      "description": null,
      "createdAt": "2026-10-24T03:36:44.875105+00:00",
      "updatedAt": "2026-10-24T03:36:44.875105+00:00",
      "archivedAt": null,
      "version": 1
    },
    {
      "id": "01a16bfb-7b00-775e-9b4c-769c280e0fe3",
      "name": "Alpha",
      "description": null,
      "createdAt": "2026-10-24T03:36:44.875105+00:00",
      "updatedAt": "2026-10-24T03:36:44.875105+00:00",
      "archivedAt": "2026-10-24T03:36:44.875105+00:00",
      "version": 2
    },
    {
      "id": "01a16bfb-7b16-7a64-9977-8389de6c6f52",
      "name": "Updated Beta",
      "description": "Context",
      "createdAt": "2026-10-24T03:36:44.875105+00:00",
      "updatedAt": "2026-10-24T03:36:44.875105+00:00",
      "archivedAt": null,
      "version": 2
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
  "title": "Liste filtreleri geçersiz.",
  "status": 400,
  "code": "resource_query_invalid",
  "traceId": "00-2610061ce659a0932a3007a7417abad9-d791e6fa0ceed7f2-00"
}
```

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
  "name": "100%_Needle"
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
  "id": "01a16bfb-7b25-7f18-8802-063803f5880c",
  "name": "100%_Needle",
  "description": null,
  "createdAt": "2026-10-24T03:36:44.875105+00:00",
  "updatedAt": "2026-10-24T03:36:44.875105+00:00",
  "archivedAt": null,
  "version": 1
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
    "Name": [
      "The Name field is required."
    ]
  },
  "code": "validation_failed",
  "traceId": "0HNPHFU9URRPA"
}
```

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
GET /api/tags/01a16bfb-7b00-775e-9b4c-769c280e0fe3
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-7b00-775e-9b4c-769c280e0fe3",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:44.875105+00:00",
  "updatedAt": "2026-10-24T03:36:44.875105+00:00",
  "archivedAt": "2026-10-24T03:36:44.875105+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-a7a087d5d711ff6e3b3037ff37c68ea7-89816fd05dd1b6ae-00"
}
```

## PUT /api/tags/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `name` | String | required; length:0..200 |
| `description` | String | length:0..10000 |

**Request şeması:** [UpdateResourceRequest](DTO-Sozlugu.md#updateresourcerequest).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Updated Beta",
  "description": "Context"
}
```

**Örnek HTTP:**

```http
PUT /api/tags/01a16bfb-7b16-7a64-9977-8389de6c6f52
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-7b16-7a64-9977-8389de6c6f52",
  "name": "Updated Beta",
  "description": "Context",
  "createdAt": "2026-10-24T03:36:44.875105+00:00",
  "updatedAt": "2026-10-24T03:36:44.875105+00:00",
  "archivedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel veriyi alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-bd49cbdc882f9e2f081b6ac2405caf89-020cceb6271e6933-00"
}
```

## POST /api/tags/{id}/archive

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [ResourceVersionRequest](DTO-Sozlugu.md#resourceversionrequest).

**Örnek request body:**

```json
{
  "version": 1
}
```

**Örnek HTTP:**

```http
POST /api/tags/01a16bfb-7b00-775e-9b4c-769c280e0fe3/archive
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceView](DTO-Sozlugu.md#namedresourceview).

```json
{
  "id": "01a16bfb-7b00-775e-9b4c-769c280e0fe3",
  "name": "Alpha",
  "description": null,
  "createdAt": "2026-10-24T03:36:44.875105+00:00",
  "updatedAt": "2026-10-24T03:36:44.875105+00:00",
  "archivedAt": "2026-10-24T03:36:44.875105+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 404:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Kayıt bulunamadı.",
  "status": 404,
  "code": "resource_not_found",
  "traceId": "00-1541df4c4eef8f9497223a4bc69f0425-7f981e1c6c48ba53-00"
}
```

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
GET /api/tags/01a16c00-e4aa-7394-b737-da48f9b32472/workload
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NamedResourceWorkload](DTO-Sozlugu.md#namedresourceworkload).

```json
{
  "resourceId": "01a16c00-e4aa-7394-b737-da48f9b32472",
  "values": {
    "taskCount": 0,
    "directComponentCount": 0,
    "openComponentCount": 0,
    "knownEstimatedSeconds": 0,
    "unknownEstimateCount": 0,
    "calculatedTotalSeconds": 0
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

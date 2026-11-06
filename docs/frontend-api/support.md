# Notlar ve DEHB destekleri

Notlar kütüphanesi: kullanıcı kategorileri (renk, sıra, çubuk/sabit, kaldır/geri getir), Short/Detailed/Toggle gösterimi ve başlık. Notlar ekranı General, gün notu alanı Daily oluşturur. Task/NextStep gerçek görev gerektirir. NextStep not listelerine girmez. Work bağlamı owner ve task ile uyuşmalıdır; genel focus’a uydurma task atanmaz. Convert key + version ile aynı notu ikinci task’a çoğaltmaz. Return-context gerçek son segment/not/completion ve uygun küçük adımdan gelir, veri yoksa null’dır. Critical1..3/energy isteğe bağlı yumuşak desteklerdir; SupportEnabled false quick-start/rescue’yu kapatabilir. Quick-start gerçek focus altyapısında5dk hedeftir. Rescue Preview/Auto tercihini izler. End-preparation salt okur; carry/pool seçimini ayrı komut yapın. [Ayrıntı](../support-tools.md).

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## POST /api/client-errors

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `message` | String | required; length:1..500 |
| `kind` | ClientErrorKind? | required |
| `route` | String | required; length:1..200 |
| `buildId` | String | required; length:1..100 |
| `browserFamily` | String | required; length:1..20 |
| `occurredAt` | DateTimeOffset? | required |

**Request şeması:** [ClientErrorRequest](DTO-Sozlugu.md#clienterrorrequest).

**Örnek request body:**

```json
{
  "message": "Boom <REDACTED-JWT> a@b.example.test Bearer abc.def 0123456789abcdef0123456789abcdef",
  "kind": "Error",
  "route": "/app/bugun",
  "buildId": "build-1",
  "browserFamily": "Chrome",
  "occurredAt": "2026-10-15T06:00:00+00:00"
}
```

**Örnek HTTP:**

```http
POST /api/client-errors
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 202.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 429 (Too Many Requests), 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 401:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.2",
  "title": "Giriş yapmanız gerekiyor.",
  "status": 401,
  "code": "unauthorized",
  "traceId": "00-b935c43693c706251ce22446f6787f1e-e5fa40d0086ec903-00"
}
```

## GET /api/note-categories

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/note-categories
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryList](DTO-Sozlugu.md#notecategorylist).

```json
{
  "items": [
    {
      "id": "01a184dc-ce89-74bb-9656-ab9897efe11d",
      "name": "Uyarı",
      "color": "Red",
      "showInBar": true,
      "pinInAll": true,
      "viewMode": "Cards",
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "removedAt": null,
      "version": 1
    },
    {
      "id": "01a184dc-d5b2-722a-9670-b3c04bf9c27a",
      "name": "Ders",
      "color": "Green",
      "showInBar": false,
      "pinInAll": true,
      "viewMode": "List",
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "removedAt": null,
      "version": 2
    },
    {
      "id": "01a184dc-d795-7e0b-b205-8119c9222c7f",
      "name": "Ev",
      "color": "Blue",
      "showInBar": true,
      "pinInAll": false,
      "viewMode": "Cards",
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "removedAt": null,
      "version": 1
    },
    {
      "id": "01a184dc-d7a0-7abc-91f5-be8810487501",
      "name": "Kitaplar",
      "color": "Blue",
      "showInBar": true,
      "pinInAll": false,
      "viewMode": "Cards",
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "removedAt": null,
      "version": 1
    }
  ],
  "allViewMode": "Cards",
  "taskViewMode": "List",
  "notesVersion": 4
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/note-categories

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `name` | String | DTO/modül iş kuralı |
| `color` | NoteCategoryColor | DTO/modül iş kuralı |
| `showInBar` | Boolean | DTO/modül iş kuralı |
| `pinInAll` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [NoteCategoryFields](DTO-Sozlugu.md#notecategoryfields).

**Örnek request body:**

```json
{
  "name": "İstatistik",
  "color": "Teal",
  "showInBar": true,
  "pinInAll": false
}
```

**Örnek HTTP:**

```http
POST /api/note-categories
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "01a184dc-d5b2-722a-9670-b3c04bf9c27a",
  "name": "İstatistik",
  "color": "Teal",
  "showInBar": true,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "removedAt": null,
  "version": 1
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu adla etkin bir kategori var.",
  "status": 409,
  "code": "note_category_name_taken",
  "traceId": "00-8cbbf63c31a8b6ff93483fd639cee925-3a9a31f046217125-00"
}
```

## PUT /api/note-categories/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `name` | String | DTO/modül iş kuralı |
| `color` | NoteCategoryColor | DTO/modül iş kuralı |
| `showInBar` | Boolean | DTO/modül iş kuralı |
| `pinInAll` | Boolean | DTO/modül iş kuralı |
| `viewMode` | NoteViewMode | DTO/modül iş kuralı |

**Request şeması:** [NoteCategoryChange](DTO-Sozlugu.md#notecategorychange).

**Örnek request body:**

```json
{
  "version": 1,
  "name": "Ders",
  "color": "Green",
  "showInBar": false,
  "pinInAll": true,
  "viewMode": "List"
}
```

**Örnek HTTP:**

```http
PUT /api/note-categories/01a184dc-d5b2-722a-9670-b3c04bf9c27a
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "01a184dc-d5b2-722a-9670-b3c04bf9c27a",
  "name": "Ders",
  "color": "Green",
  "showInBar": false,
  "pinInAll": true,
  "viewMode": "List",
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "removedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel değerleri alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-cbc2afa5a867645358bbeee27dd9bccb-92d32982e59e6721-00"
}
```

## POST /api/note-categories/{id}/move

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `beforeCategoryId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [NoteCategoryMove](DTO-Sozlugu.md#notecategorymove).

**Örnek request body:**

```json
{
  "version": 1,
  "beforeCategoryId": "01a184dc-ce89-74bb-9656-ab9897efe11d"
}
```

**Örnek HTTP:**

```http
POST /api/note-categories/01a184dc-d7a0-7abc-91f5-be8810487501/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "01a184dc-d7a0-7abc-91f5-be8810487501",
  "name": "Kitaplar",
  "color": "Blue",
  "showInBar": true,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "removedAt": null,
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Kategori kendi önüne taşınamaz.",
  "status": 400,
  "code": "note_category_move_invalid",
  "traceId": "00-ed928d640647545cfa4918432c5416d3-483b566d5474b134-00"
}
```

## POST /api/note-categories/{id}/remove

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

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
POST /api/note-categories/01a184dc-eb14-7814-a548-bcc36f637d44/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "01a184dc-eb14-7814-a548-bcc36f637d44",
  "name": "Ev",
  "color": "Purple",
  "showInBar": true,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "removedAt": "2026-10-28T06:00:00+00:00",
  "version": 2
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kategori zaten kaldırılmış; güncel listeyi alın.",
  "status": 409,
  "code": "note_category_removed",
  "traceId": "00-0c5befd2ddaecb070a79f311d08a5c0f-35ffbc4c2f8a14b8-00"
}
```

## POST /api/note-categories/{id}/restore

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

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
POST /api/note-categories/01a184dc-eb14-7814-a548-bcc36f637d44/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "01a184dc-eb14-7814-a548-bcc36f637d44",
  "name": "Ev",
  "color": "Purple",
  "showInBar": true,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "removedAt": null,
  "version": 3
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu adla etkin bir kategori var.",
  "status": 409,
  "code": "note_category_name_taken",
  "traceId": "00-993a2630c1495ecf0ceedba88112ba95-39fc61997833a69f-00"
}
```

## GET /api/notes

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** NextStep notları kind=NextStep istenmedikçe sayım/sayfalama öncesinde dışlanır (Gün Planlama sonraki adımı ayrı okur). categoryId tek kategori (kaldırılmış dahil), taskLinked=true göreve bağlı notlar (görev başlığına göre sıralı), excludePinned=true etkin ve Tümü'nde sabit kategorilerin notlarını dışlar. search başlık+metinde Türkçe büyük/küçük harf duyarsız, en çok200karakter. Takvim ve Gün Planlama gün notlarını kind=Daily ve date ile aynı kaynaktan okur.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `taskId` | query | hayır | string (uuid); — |
| `kind` | query | hayır | [NoteKind](DTO-Sozlugu.md#notekind); — |
| `date` | query | hayır | string (date); — |
| `categoryId` | query | hayır | string (uuid); — |
| `taskLinked` | query | hayır | boolean; default=false |
| `excludePinned` | query | hayır | boolean; default=false |
| `search` | query | hayır | string; — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/notes
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [NotePage](DTO-Sozlugu.md#notepage).

```json
{
  "items": [
    {
      "id": "01a184dc-de85-70a9-9dda-5f34424b5b3f",
      "kind": "General",
      "text": "Kira otomatik değil",
      "taskId": null,
      "workSessionId": null,
      "localDate": null,
      "timeZoneId": "Europe/Istanbul",
      "dueAt": null,
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "deletedAt": null,
      "convertedTaskId": null,
      "version": 1,
      "title": null,
      "categoryId": "01a184dc-da94-7b18-9666-5a8d07e93fff",
      "display": "Short",
      "taskTitle": null
    },
    {
      "id": "01a184dc-de6b-7c39-98a3-74d7ca2c9e64",
      "kind": "General",
      "text": "Adaptör\nSu",
      "taskId": "01a184dc-dc3d-7d15-9d91-9c48a3d36179",
      "workSessionId": null,
      "localDate": null,
      "timeZoneId": "Europe/Istanbul",
      "dueAt": null,
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "deletedAt": null,
      "convertedTaskId": null,
      "version": 1,
      "title": "Kontrol listesi",
      "categoryId": null,
      "display": "Toggle",
      "taskTitle": "Kargo iadesi"
    },
    {
      "id": "01a184dc-dddf-7dcb-8fc0-08642ca08c36",
      "kind": "General",
      "text": "H0: fark yok.\nH1: fark var.",
      "taskId": null,
      "workSessionId": null,
      "localDate": null,
      "timeZoneId": "Europe/Istanbul",
      "dueAt": null,
      "createdAt": "2026-10-28T06:00:00+00:00",
      "updatedAt": "2026-10-28T06:00:00+00:00",
      "deletedAt": null,
      "convertedTaskId": null,
      "version": 1,
      "title": "Hipotez testleri",
      "categoryId": "01a184dc-dc0e-7cc0-9be0-36b9f948a20f",
      "display": "Detailed",
      "taskTitle": null
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
  "title": "Arama en çok 200 karakter olmalı.",
  "status": 400,
  "code": "note_search_invalid",
  "traceId": "00-e257e3d8d692bd00344981d9bd441f90-d132755e59b8b1e1-00"
}
```

## POST /api/notes

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Daily notta localDate zorunludur, taskId ve workSessionId boş kalır. Diğer türlerde localDate boş kalır. Daily için categoryId boşsa Gün Notları kategorisi kullanılır. Kategori eksikse notla aynı işlemde eklenir. Otomatik ekleme manuel kategori sınırından bağımsızdır. Gün notu eklemek plan oluşturmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `kind` | NoteKind | DTO/modül iş kuralı |
| `text` | String | DTO/modül iş kuralı |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `workSessionId` | Guid? | DTO/modül iş kuralı |
| `localDate` | DateOnly? | DTO/modül iş kuralı |
| `dueAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `title` | String | DTO/modül iş kuralı |
| `categoryId` | Guid? | DTO/modül iş kuralı |
| `display` | NoteDisplay | DTO/modül iş kuralı |

**Request şeması:** [NoteFields](DTO-Sozlugu.md#notefields).

**Örnek request body:**

```json
{
  "kind": "General",
  "text": "H0: fark yok.\nH1: fark var.",
  "taskId": null,
  "workSessionId": null,
  "localDate": null,
  "dueAt": null,
  "title": "Hipotez testleri",
  "categoryId": "01a184dc-dc0e-7cc0-9be0-36b9f948a20f",
  "display": "Detailed"
}
```

**Örnek HTTP:**

```http
POST /api/notes
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "01a184dc-dddf-7dcb-8fc0-08642ca08c36",
  "kind": "General",
  "text": "H0: fark yok.\nH1: fark var.",
  "taskId": null,
  "workSessionId": null,
  "localDate": null,
  "timeZoneId": "Europe/Istanbul",
  "dueAt": null,
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "deletedAt": null,
  "convertedTaskId": null,
  "version": 1,
  "title": "Hipotez testleri",
  "categoryId": "01a184dc-dc0e-7cc0-9be0-36b9f948a20f",
  "display": "Detailed",
  "taskTitle": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kategori kaldırılmış; başka bir kategori seçin.",
  "status": 409,
  "code": "note_category_removed",
  "traceId": "00-ee8d727686b7739fd0d9a9925332b1bb-fbf661ad20753c48-00"
}
```

## PUT /api/notes/view-modes

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Manuel ekleme ve geri getirmede etkin kategori sınırı 100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `allViewMode` | NoteViewMode | DTO/modül iş kuralı |
| `taskViewMode` | NoteViewMode | DTO/modül iş kuralı |

**Request şeması:** [NoteSystemViews](DTO-Sozlugu.md#notesystemviews).

**Örnek request body:**

```json
{
  "allViewMode": "List",
  "taskViewMode": "Cards"
}
```

**Örnek HTTP:**

```http
PUT /api/notes/view-modes
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteSystemViews](DTO-Sozlugu.md#notesystemviews).

```json
{
  "allViewMode": "List",
  "taskViewMode": "Cards"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/notes/{id}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Yalnız text/dueAt güncellenir; dueAt gönderilmezse null olur. Kind/task/work/localDate bu komutla değiştirilemez.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `text` | String | required; length:0..10000 |
| `dueAt` | DateTimeOffset? | DTO/modül iş kuralı |
| `display` | NoteDisplay? | DTO/modül iş kuralı |
| `title` | String | length:0..200 |
| `categoryId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [EditNoteRequest](DTO-Sozlugu.md#editnoterequest).

**Örnek request body:**

```json
{
  "version": 1,
  "text": "Wi-Fi şifresi kartta (güncel)",
  "display": "Short",
  "categoryId": "01a184dc-eb14-7814-a548-bcc36f637d44"
}
```

**Örnek HTTP:**

```http
PUT /api/notes/01a184dc-eb71-70be-9429-33425ab89a7a
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "01a184dc-eb71-70be-9429-33425ab89a7a",
  "kind": "General",
  "text": "Wi-Fi şifresi kartta (güncel)",
  "taskId": null,
  "workSessionId": null,
  "localDate": null,
  "timeZoneId": "Europe/Istanbul",
  "dueAt": null,
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "deletedAt": null,
  "convertedTaskId": null,
  "version": 2,
  "title": null,
  "categoryId": "01a184dc-eb14-7814-a548-bcc36f637d44",
  "display": "Short",
  "taskTitle": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notes/{id}/convert

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `title` | String | DTO/modül iş kuralı |
| `poolId` | Guid? | DTO/modül iş kuralı |
| `deadlineAt` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [NoteConversion](DTO-Sozlugu.md#noteconversion).

**Örnek request body:**

```json
{
  "version": 1,
  "title": "Raporu yaz",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "deadlineAt": "2026-10-16T06:00:00Z"
}
```

**Örnek HTTP:**

```http
POST /api/notes/11111111-1111-4111-8111-111111111111/convert
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ConvertedNote](DTO-Sozlugu.md#convertednote).

```json
{
  "noteId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "noteVersion": 1,
  "planningVersion": 0,
  "replayed": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notes/{id}/delete

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

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
POST /api/notes/01a184dc-de85-70a9-9dda-5f34424b5b3f/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "01a184dc-de85-70a9-9dda-5f34424b5b3f",
  "kind": "General",
  "text": "Kira otomatik değil",
  "taskId": null,
  "workSessionId": null,
  "localDate": null,
  "timeZoneId": "Europe/Istanbul",
  "dueAt": null,
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "deletedAt": "2026-10-28T06:00:00+00:00",
  "convertedTaskId": null,
  "version": 2,
  "title": null,
  "categoryId": "01a184dc-da94-7b18-9666-5a8d07e93fff",
  "display": "Short",
  "taskTitle": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notes/{id}/restore

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Geri al: silinmiş notu aynı alanlarla geri getirir; version silme yanıtındaki sürümdür. Silinmemiş not için 409 note_not_deleted.

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
POST /api/notes/01a184dc-de85-70a9-9dda-5f34424b5b3f/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "01a184dc-de85-70a9-9dda-5f34424b5b3f",
  "kind": "General",
  "text": "Kira otomatik değil",
  "taskId": null,
  "workSessionId": null,
  "localDate": null,
  "timeZoneId": "Europe/Istanbul",
  "dueAt": null,
  "createdAt": "2026-10-28T06:00:00+00:00",
  "updatedAt": "2026-10-28T06:00:00+00:00",
  "deletedAt": null,
  "convertedTaskId": null,
  "version": 3,
  "title": null,
  "categoryId": "01a184dc-da94-7b18-9666-5a8d07e93fff",
  "display": "Short",
  "taskTitle": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Kayıt değişmiş; güncel değerleri alın.",
  "status": 409,
  "code": "version_conflict",
  "traceId": "00-1a1428e12f83b49b947b9972fe739d74-04c7fec148146cc8-00"
}
```

## GET /api/support/days/{date}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/support/days/2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SupportDayView](DTO-Sozlugu.md#supportdayview).

```json
{
  "localDate": "2026-10-15",
  "timeZoneId": "Europe/Istanbul",
  "availableEnergy": null,
  "criticalTaskIds": [],
  "version": 0,
  "planningVersion": 0,
  "enabled": true
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/support/days/{date}

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | DTO/modül iş kuralı |
| `availableEnergy` | EnergyLevel? | DTO/modül iş kuralı |
| `criticalTaskIds` | Guid[] | DTO/modül iş kuralı |

**Request şeması:** [SupportDayChange](DTO-Sozlugu.md#supportdaychange).

**Örnek request body:**

```json
{
  "version": 1,
  "availableEnergy": "High",
  "criticalTaskIds": [
    "01a16bfa-dfa6-7dc3-9c4b-9d5710ceadf2",
    "01a16bfa-de29-73be-b125-18422ec7226f"
  ]
}
```

**Örnek HTTP:**

```http
PUT /api/support/days/2026-10-15
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SupportDayView](DTO-Sozlugu.md#supportdayview).

```json
{
  "localDate": "2026-10-15",
  "timeZoneId": "Europe/Istanbul",
  "availableEnergy": "High",
  "criticalTaskIds": [
    "01a16bfa-dfa6-7dc3-9c4b-9d5710ceadf2",
    "01a16bfa-de29-73be-b125-18422ec7226f"
  ],
  "version": 2,
  "planningVersion": 10,
  "enabled": true
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "En çok3 benzersiz kritik iş ve geçerli enerji seçin.",
  "status": 400,
  "code": "support_day_invalid",
  "traceId": "00-d58085da107bed80aa9ec43de1db6851-9215b316995775ea-00"
}
```

## GET /api/support/days/{date}/end-preparation

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | path | evet | string (date); — |
| `offset` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 |
| `limit` | query | hayır | integer\|string (int32); pattern="^-?(?:0\|[1-9]\\d*)$"; default=50 |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/support/days/2026-10-15/end-preparation?limit=1
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayEndPreparation](DTO-Sozlugu.md#dayendpreparation).

```json
{
  "day": {
    "summary": {
      "localDate": "2026-10-15",
      "timeZoneId": "Europe/Istanbul",
      "dailyPlanId": "01a16bfb-1635-725d-8203-65f2b274135c",
      "currentRevisionId": "01a16bfb-16e8-70d5-b40d-218e7ee9086f",
      "baselineRevisionId": "01a16bfb-16e8-70d5-b40d-218e7ee9086f",
      "revisionNumber": 1,
      "planningVersion": 4,
      "plannedWorkSeconds": 3600.0,
      "plannedBreakSeconds": 0,
      "plannedBufferSeconds": 0,
      "baselineWorkSeconds": 3600.0,
      "plannedBlockCount": 1,
      "actualSeconds": 0,
      "actualSegmentCount": 0,
      "completedTaskCount": 0,
      "hasOpenWork": false
    },
    "serverNow": "2026-10-15T06:00:00+00:00",
    "plan": {
      "items": [
        {
          "revisionItemId": "01a16bfb-16e8-7d53-b118-42f7116aea78",
          "schedule": {
            "id": "01a16bfb-1654-7067-8ccf-62a995784830",
            "dailyPlanId": "01a16bfb-1635-725d-8203-65f2b274135c",
            "taskId": "01a16bfb-154e-7955-94fa-bdd620e87c0f",
            "kind": "Work",
            "state": "Planned",
            "startsAt": "2026-10-15T06:00:00+00:00",
            "endsAt": "2026-10-15T07:00:00+00:00",
            "isFixed": false,
            "isLocked": false,
            "splitGroupId": null,
            "originScheduleId": null,
            "version": 1,
            "taskSnapshot": {
              "task": {
                "schemaVersion": 2,
                "taskId": "01a16bfb-154e-7955-94fa-bdd620e87c0f",
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
          "taskAtDayEnd": {
            "taskId": "01a16bfb-154e-7955-94fa-bdd620e87c0f",
            "state": "Pending",
            "eventSequence": 1,
            "effectiveAt": "2026-10-15T06:00:00+00:00",
            "available": true
          }
        }
      ],
      "offset": 0,
      "limit": 50,
      "total": 1,
      "revisionId": "01a16bfb-16e8-70d5-b40d-218e7ee9086f"
    },
    "actual": {
      "items": [],
      "offset": 0,
      "limit": 50,
      "total": 0
    },
    "completions": {
      "items": [],
      "offset": 0,
      "limit": 50,
      "total": 0
    },
    "legacyZoneCompletionCount": 0
  },
  "openWork": {
    "localDate": "2026-10-15",
    "items": [
      {
        "id": "01a16bfb-154e-7955-94fa-bdd620e87c0f",
        "title": "Project",
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
    "limit": 1,
    "total": 2,
    "planningVersion": 4
  },
  "availableActions": [
    "Carry",
    "Move",
    "Pool",
    "Cancel"
  ]
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/support/quick-start

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `taskId` | Guid? | DTO/modül iş kuralı |
| `workSessionId` | Guid? | DTO/modül iş kuralı |
| `workSessionVersion` | Int64? | DTO/modül iş kuralı |

**Request şeması:** [QuickStartRequest](DTO-Sozlugu.md#quickstartrequest).

**Örnek request body:**

```json
{
  "taskId": "01a16bfa-c243-7e30-b7f2-54afb268944e"
}
```

**Örnek HTTP:**

```http
POST /api/support/quick-start
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [FocusView](DTO-Sozlugu.md#focusview).

```json
{
  "id": "01a16bfa-c36d-7035-9904-23a3066a5d4a",
  "workSessionId": "01a16bfa-c32c-76f7-9c4f-be3174eb8718",
  "taskId": "01a16bfa-c243-7e30-b7f2-54afb268944e",
  "previousFocusId": null,
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 300,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": null,
  "presetName": null,
  "presetVersion": null,
  "startedAt": "2026-10-15T06:00:00+00:00",
  "workEndedAt": null,
  "breakStartedAt": null,
  "breakEndedAt": null,
  "endedAt": null,
  "targetReachedAt": null,
  "targetObservedAt": null,
  "targetEventId": null,
  "activeSeconds": 0,
  "remainingSeconds": 300,
  "overtimeSeconds": 0,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 300,
  "breakElapsedSeconds": 0,
  "breakRemainingSeconds": 300,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-15T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "İsteğe bağlı destekler kapalı.",
  "status": 409,
  "code": "support_disabled",
  "traceId": "00-8f1c63b4bf32a9362d3741297ef79780-a3b6962cfa318fc9-00"
}
```

## POST /api/support/rescue

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Kullanıcının Preview/Auto tercihini izler; yanıtın status/applied alanını okuyun, her200 sonucu accepted revision sanmayın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `Idempotency-Key` | header | evet | string; —; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir) |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `date` | DateOnly? | required |
| `taskIds` | Guid[] | required; minLength:1; maxLength:1000 |
| `expectedPlanningVersion` | Int64? | range:0..9,223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-15",
  "taskIds": [
    "01a16bfb-062b-7013-bd2b-a92693d79066",
    "01a16bfb-0684-7440-82a4-08a27657a6ef"
  ],
  "expectedPlanningVersion": 9
}
```

**Örnek HTTP:**

```http
POST /api/support/rescue
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Idempotency-Key: <SAME_INTENT_KEY>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview).

```json
{
  "proposalId": "01a16bfb-0e10-76fe-a23c-405f3b1fb7cd",
  "inputVersion": 9,
  "createdAt": "2026-10-15T06:20:00+00:00",
  "expiresAt": "2026-10-15T06:22:00+00:00",
  "anchorAt": "2026-10-15T06:20:00+00:00",
  "planningMode": "Auto",
  "algorithmVersion": "heuristic-v2",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "Applied",
  "blocks": [
    {
      "existingScheduleId": "01a16bfb-0882-7991-ae96-811542fbe89d",
      "taskId": "01a16bfb-062b-7013-bd2b-a92693d79066",
      "kind": "Work",
      "startsAt": "2026-10-15T06:00:00+00:00",
      "endsAt": "2026-10-15T07:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": true,
      "isPreserved": true,
      "isAutomatic": false
    },
    {
      "existingScheduleId": "01a16bfb-0b93-7236-b7ce-b5a19b7426ce",
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "kind": "Work",
      "startsAt": "2026-10-15T07:00:00+00:00",
      "endsAt": "2026-10-15T08:00:00+00:00",
      "isFixed": false,
      "isLocked": false,
      "isActive": false,
      "isPreserved": false,
      "isAutomatic": false
    },
    {
      "existingScheduleId": "01a16bfb-0c61-7de9-b025-37c17b3e43e5",
      "taskId": null,
      "kind": "Break",
      "startsAt": "2026-10-15T08:00:00+00:00",
      "endsAt": "2026-10-15T08:30:00+00:00",
      "isFixed": true,
      "isLocked": false,
      "isActive": false,
      "isPreserved": true,
      "isAutomatic": false
    },
    {
      "existingScheduleId": null,
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "kind": "Work",
      "startsAt": "2026-10-15T08:30:00+00:00",
      "endsAt": "2026-10-15T09:00:00+00:00",
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
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "before": null,
      "after": {
        "existingScheduleId": null,
        "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
        "kind": "Work",
        "startsAt": "2026-10-15T08:30:00+00:00",
        "endsAt": "2026-10-15T09:00:00+00:00",
        "isFixed": false,
        "isLocked": false,
        "isActive": false,
        "isPreserved": false,
        "isAutomatic": true
      }
    }
  ],
  "unplaced": [
    {
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "remainingSeconds": 1800,
      "reason": "InsufficientCapacity"
    }
  ],
  "warnings": [],
  "explanations": [
    {
      "code": "AlreadyReserved",
      "taskId": "01a16bfb-062b-7013-bd2b-a92693d79066",
      "seconds": 2400.0,
      "scheduleId": null
    },
    {
      "code": "ExistingPlacementKept",
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "seconds": 3600,
      "scheduleId": null
    },
    {
      "code": "PlacedFragment",
      "taskId": "01a16bfb-0684-7440-82a4-08a27657a6ef",
      "seconds": 1800,
      "scheduleId": null
    }
  ],
  "applied": {
    "proposalId": "01a16bfb-0e10-76fe-a23c-405f3b1fb7cd",
    "changeSetId": "01a16bfb-0e4e-7378-8a33-8b9e34f3d53c",
    "planningVersion": 10,
    "revisionIds": [
      "01a16bfb-0e63-7ba7-9098-08f962bfa37f"
    ],
    "noChanges": false
  },
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
  "title": "İsteğe bağlı destekler kapalı.",
  "status": 409,
  "code": "support_disabled",
  "traceId": "00-10bc68a877c5a569b300c82bae7d1ebd-443cf0c5e602b29e-00"
}
```

## PUT /api/tasks/{id}/energy

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `energyDemand` | EnergyLevel? | DTO/modül iş kuralı |

**Request şeması:** [EnergyRequest](DTO-Sozlugu.md#energyrequest).

**Örnek request body:**

```json
{
  "version": 2,
  "energyDemand": "Low"
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/01a16bfa-dfa6-7dc3-9c4b-9d5710ceadf2/energy
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [TaskView](DTO-Sozlugu.md#taskview).

```json
{
  "id": "01a16bfa-dfa6-7dc3-9c4b-9d5710ceadf2",
  "title": "Küçük",
  "description": null,
  "state": "Pending",
  "priority": "Normal",
  "deadlineAt": null,
  "canSplit": true,
  "directEstimatedSeconds": 1800,
  "createdAt": "2026-10-15T06:00:00+00:00",
  "updatedAt": "2026-10-15T06:00:00+00:00",
  "archivedAt": null,
  "version": 3,
  "parentTaskId": "01a16bfa-de81-7294-9c8f-baa2c373aea8",
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
  "energyDemand": "Low",
  "autoCompleteFromChildren": true,
  "plannedFrom": null,
  "plannedTo": null
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/tasks/{id}/return-context

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/tasks/01a184dc-dc3d-7d15-9d91-9c48a3d36179/return-context
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ReturnContext](DTO-Sozlugu.md#returncontext).

```json
{
  "taskId": "01a184dc-dc3d-7d15-9d91-9c48a3d36179",
  "planningVersion": 1,
  "lastWork": null,
  "lastNote": {
    "id": "01a184dc-dea1-7cdb-b0eb-05de0fc179b8",
    "kind": "NextStep",
    "text": "Dosyayı aç",
    "taskId": "01a184dc-dc3d-7d15-9d91-9c48a3d36179",
    "workSessionId": null,
    "localDate": null,
    "timeZoneId": "Europe/Istanbul",
    "dueAt": null,
    "createdAt": "2026-10-28T06:00:00+00:00",
    "updatedAt": "2026-10-28T06:00:00+00:00",
    "deletedAt": null,
    "convertedTaskId": null,
    "version": 1,
    "title": null,
    "categoryId": null,
    "display": "Short",
    "taskTitle": "Kargo iadesi"
  },
  "nextStepNote": {
    "id": "01a184dc-dea1-7cdb-b0eb-05de0fc179b8",
    "kind": "NextStep",
    "text": "Dosyayı aç",
    "taskId": "01a184dc-dc3d-7d15-9d91-9c48a3d36179",
    "workSessionId": null,
    "localDate": null,
    "timeZoneId": "Europe/Istanbul",
    "dueAt": null,
    "createdAt": "2026-10-28T06:00:00+00:00",
    "updatedAt": "2026-10-28T06:00:00+00:00",
    "deletedAt": null,
    "convertedTaskId": null,
    "version": 1,
    "title": null,
    "categoryId": null,
    "display": "Short",
    "taskTitle": "Kargo iadesi"
  },
  "lastCompletion": null,
  "suggestedStep": {
    "id": "01a184dc-dc3d-7d15-9d91-9c48a3d36179",
    "title": "Kargo iadesi",
    "description": null,
    "state": "Pending",
    "priority": "Normal",
    "deadlineAt": null,
    "canSplit": true,
    "directEstimatedSeconds": null,
    "createdAt": "2026-10-28T06:00:00+00:00",
    "updatedAt": "2026-10-28T06:00:00+00:00",
    "archivedAt": null,
    "version": 1,
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
  },
  "openDirectTaskCount": 1,
  "serverNow": "2026-10-28T06:00:00+00:00"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

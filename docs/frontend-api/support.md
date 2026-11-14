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
  "message": "örnek",
  "kind": "Error",
  "route": "örnek",
  "buildId": "örnek",
  "browserFamily": "örnek",
  "occurredAt": "2026-10-16T06:00:00Z"
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

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 429 (Too Many Requests), 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "items": [],
  "allViewMode": "Cards",
  "taskViewMode": "Cards",
  "notesVersion": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "name": "Çalışma",
  "color": "Gray",
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
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "removedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards"
}
```

**Örnek HTTP:**

```http
PUT /api/note-categories/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "removedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "beforeCategoryId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/note-categories/11111111-1111-4111-8111-111111111111/move
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "removedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
POST /api/note-categories/11111111-1111-4111-8111-111111111111/remove
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "removedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
POST /api/note-categories/11111111-1111-4111-8111-111111111111/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteCategoryView](DTO-Sozlugu.md#notecategoryview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Çalışma",
  "color": "Gray",
  "showInBar": false,
  "pinInAll": false,
  "viewMode": "Cards",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "removedAt": "2026-10-16T06:00:00Z",
  "version": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "items": [],
  "offset": 0,
  "limit": 1,
  "total": 1
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "kind": "Task",
  "text": "Bir sonraki küçük adım",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "dueAt": "2026-10-16T06:00:00Z",
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "display": "Short"
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
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "Task",
  "text": "Bir sonraki küçük adım",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "dueAt": "2026-10-16T06:00:00Z",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z",
  "convertedTaskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "display": "Short",
  "taskTitle": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "allViewMode": "Cards",
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
  "allViewMode": "Cards",
  "taskViewMode": "Cards"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
| `version` | Int64 | range:1..9.223372036854776E+18 |
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
  "text": "Bir sonraki küçük adım",
  "dueAt": "2026-10-16T06:00:00Z",
  "display": "Short",
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
PUT /api/notes/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "Task",
  "text": "Bir sonraki küçük adım",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "dueAt": "2026-10-16T06:00:00Z",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z",
  "convertedTaskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "display": "Short",
  "taskTitle": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/notes/{id}/convert

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.

**Ek entegrasyon kuralı:** Not korunarak yeni göreve bağlanır. Yeni UI plannedFrom/plannedTo, energyDemand ve priority alanlarını isteğe bağlı gönderir; inheritNoteDueAt=false ile notun tarihi son teslim tarihine aktarılmaz. Aralık iki tarih birlikte veya ikisi null; tek gün için aynı tarih, en çok367 gün. Efor null, aciliyet null/eksikse Normal olabilir. Eski payload/son teslim ve kaydedilmiş idempotency makbuzları uyumludur. Aynı anahtar ve içerik aynı görevi döndürür; farklı içerik409, geçersiz seçim400; kayıt tek transaction içindedir.

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
| `plannedFrom` | DateOnly? | DTO/modül iş kuralı |
| `plannedTo` | DateOnly? | DTO/modül iş kuralı |
| `energyDemand` | EnergyLevel? | DTO/modül iş kuralı |
| `priority` | TaskPriority? | DTO/modül iş kuralı |
| `inheritNoteDueAt` | Boolean | DTO/modül iş kuralı |

**Request şeması:** [NoteConversion](DTO-Sozlugu.md#noteconversion).

**Örnek request body:**

```json
{
  "version": 1,
  "title": "Raporu yaz",
  "poolId": "11111111-1111-4111-8111-111111111111",
  "deadlineAt": "2026-10-16T06:00:00Z",
  "plannedFrom": "2026-10-16",
  "plannedTo": "2026-10-16",
  "energyDemand": "Low",
  "priority": "Low",
  "inheritNoteDueAt": true
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
POST /api/notes/11111111-1111-4111-8111-111111111111/delete
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "Task",
  "text": "Bir sonraki küçük adım",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "dueAt": "2026-10-16T06:00:00Z",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z",
  "convertedTaskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "display": "Short",
  "taskTitle": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
POST /api/notes/11111111-1111-4111-8111-111111111111/restore
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [NoteView](DTO-Sozlugu.md#noteview).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "kind": "Task",
  "text": "Bir sonraki küçük adım",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "dueAt": "2026-10-16T06:00:00Z",
  "createdAt": "2026-10-16T06:00:00Z",
  "updatedAt": "2026-10-16T06:00:00Z",
  "deletedAt": "2026-10-16T06:00:00Z",
  "convertedTaskId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "title": "Raporu yaz",
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "display": "Short",
  "taskTitle": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
GET /api/support/days/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [SupportDayView](DTO-Sozlugu.md#supportdayview).

```json
{
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "availableEnergy": "Low",
  "criticalTaskIds": [],
  "version": 1,
  "planningVersion": 0,
  "enabled": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "availableEnergy": "Low",
  "criticalTaskIds": []
}
```

**Örnek HTTP:**

```http
PUT /api/support/days/11111111-1111-4111-8111-111111111111
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [SupportDayView](DTO-Sozlugu.md#supportdayview).

```json
{
  "localDate": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "availableEnergy": "Low",
  "criticalTaskIds": [],
  "version": 1,
  "planningVersion": 0,
  "enabled": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
GET /api/support/days/11111111-1111-4111-8111-111111111111/end-preparation
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [DayEndPreparation](DTO-Sozlugu.md#dayendpreparation).

```json
{
  "day": {
    "summary": {
      "localDate": "2026-10-16",
      "timeZoneId": "Europe/Istanbul",
      "dailyPlanId": "11111111-1111-4111-8111-111111111111",
      "currentRevisionId": "11111111-1111-4111-8111-111111111111",
      "baselineRevisionId": "11111111-1111-4111-8111-111111111111",
      "revisionNumber": 1,
      "planningVersion": 0,
      "plannedWorkSeconds": 1,
      "plannedBreakSeconds": 1,
      "plannedBufferSeconds": 1,
      "baselineWorkSeconds": 1,
      "plannedBlockCount": 1,
      "actualSeconds": 1,
      "actualSegmentCount": 1,
      "completedTaskCount": 1,
      "hasOpenWork": false
    },
    "serverNow": "2026-10-16T06:00:00Z",
    "plan": {
      "items": [],
      "offset": 0,
      "limit": 1,
      "total": 1,
      "revisionId": "11111111-1111-4111-8111-111111111111"
    },
    "actual": {
      "items": [],
      "offset": 0,
      "limit": 1,
      "total": 1
    },
    "completions": {
      "items": [],
      "offset": 0,
      "limit": 1,
      "total": 1
    },
    "legacyZoneCompletionCount": 1
  },
  "openWork": {
    "localDate": "2026-10-16",
    "items": [],
    "offset": 0,
    "limit": 1,
    "total": 1,
    "planningVersion": 0
  },
  "availableActions": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "taskId": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "workSessionVersion": 1
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
  "id": "11111111-1111-4111-8111-111111111111",
  "workSessionId": "11111111-1111-4111-8111-111111111111",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "previousFocusId": "11111111-1111-4111-8111-111111111111",
  "cycleNumber": 1,
  "state": "Working",
  "settings": {
    "workSeconds": 1500,
    "shortBreakSeconds": 300,
    "longBreakSeconds": 900,
    "longBreakEvery": 4,
    "targetBehavior": "ContinueTracking",
    "soundEnabled": true,
    "notificationsEnabled": true
  },
  "presetId": "11111111-1111-4111-8111-111111111111",
  "presetName": "örnek",
  "presetVersion": 1,
  "startedAt": "2026-10-16T06:00:00Z",
  "workEndedAt": "2026-10-16T06:00:00Z",
  "breakStartedAt": "2026-10-16T06:00:00Z",
  "breakEndedAt": "2026-10-16T06:00:00Z",
  "endedAt": "2026-10-16T06:25:00Z",
  "targetReachedAt": "2026-10-16T06:00:00Z",
  "targetObservedAt": "2026-10-16T06:00:00Z",
  "targetEventId": "11111111-1111-4111-8111-111111111111",
  "activeSeconds": 1,
  "remainingSeconds": 1,
  "overtimeSeconds": 1,
  "effectiveTargetReached": false,
  "breakTargetSeconds": 1,
  "breakElapsedSeconds": 1,
  "breakRemainingSeconds": 1,
  "version": 1,
  "workSessionVersion": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
| `expectedPlanningVersion` | Int64? | range:0..9.223372036854776E+18 |
| `newWorkNotBefore` | DateTimeOffset? | DTO/modül iş kuralı |

**Request şeması:** [SchedulingRequestDto](DTO-Sozlugu.md#schedulingrequestdto).

**Örnek request body:**

```json
{
  "date": "2026-10-16",
  "taskIds": [
    "11111111-1111-4111-8111-111111111111"
  ],
  "expectedPlanningVersion": 0,
  "newWorkNotBefore": "2026-10-16T06:00:00Z"
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
  "proposalId": "11111111-1111-4111-8111-111111111111",
  "inputVersion": 1,
  "createdAt": "2026-10-16T06:00:00Z",
  "expiresAt": "2026-10-16T06:00:00Z",
  "anchorAt": "2026-10-16T06:00:00Z",
  "planningMode": "Preview",
  "algorithmVersion": "örnek",
  "hasConstraintConflicts": false,
  "canApply": false,
  "status": "örnek",
  "blocks": [],
  "changes": [],
  "unplaced": [],
  "warnings": [],
  "explanations": [],
  "applied": {
    "proposalId": "11111111-1111-4111-8111-111111111111",
    "changeSetId": "11111111-1111-4111-8111-111111111111",
    "planningVersion": 0,
    "revisionIds": [],
    "noChanges": false
  },
  "reversesChangeSetId": "11111111-1111-4111-8111-111111111111",
  "isPartial": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/tasks/{id}/energy

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `id` | path | evet | string (uuid); — |

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:1..9.223372036854776E+18 |
| `energyDemand` | EnergyLevel? | DTO/modül iş kuralı |

**Request şeması:** [EnergyRequest](DTO-Sozlugu.md#energyrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "energyDemand": "Low"
}
```

**Örnek HTTP:**

```http
PUT /api/tasks/11111111-1111-4111-8111-111111111111/energy
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
GET /api/tasks/11111111-1111-4111-8111-111111111111/return-context
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ReturnContext](DTO-Sozlugu.md#returncontext).

```json
{
  "taskId": "11111111-1111-4111-8111-111111111111",
  "planningVersion": 0,
  "lastWork": {
    "workSessionId": "11111111-1111-4111-8111-111111111111",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "segmentId": "11111111-1111-4111-8111-111111111111",
    "startedAt": "2026-10-16T06:00:00Z",
    "endedAt": "2026-10-16T06:25:00Z"
  },
  "lastNote": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "Task",
    "text": "Bir sonraki küçük adım",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "workSessionId": "11111111-1111-4111-8111-111111111111",
    "localDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "dueAt": "2026-10-16T06:00:00Z",
    "createdAt": "2026-10-16T06:00:00Z",
    "updatedAt": "2026-10-16T06:00:00Z",
    "deletedAt": "2026-10-16T06:00:00Z",
    "convertedTaskId": "11111111-1111-4111-8111-111111111111",
    "version": 1,
    "title": "Raporu yaz",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "display": "Short",
    "taskTitle": "örnek"
  },
  "nextStepNote": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "Task",
    "text": "Bir sonraki küçük adım",
    "taskId": "11111111-1111-4111-8111-111111111111",
    "workSessionId": "11111111-1111-4111-8111-111111111111",
    "localDate": "2026-10-16",
    "timeZoneId": "Europe/Istanbul",
    "dueAt": "2026-10-16T06:00:00Z",
    "createdAt": "2026-10-16T06:00:00Z",
    "updatedAt": "2026-10-16T06:00:00Z",
    "deletedAt": "2026-10-16T06:00:00Z",
    "convertedTaskId": "11111111-1111-4111-8111-111111111111",
    "version": 1,
    "title": "Raporu yaz",
    "categoryId": "11111111-1111-4111-8111-111111111111",
    "display": "Short",
    "taskTitle": "örnek"
  },
  "lastCompletion": {
    "taskId": "11111111-1111-4111-8111-111111111111",
    "completedAt": "2026-10-16T06:00:00Z",
    "eventSequence": 1
  },
  "suggestedStep": {
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
  "openDirectTaskCount": 1,
  "serverNow": "2026-10-16T06:00:00Z"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

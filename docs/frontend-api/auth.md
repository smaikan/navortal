# Kimlik doğrulama ve profil

UI-R3: Register201 ve login200 HttpOnly oturum cookie'si yazar (production'da `__Host-adhd_session`, Secure, SameSite=Strict, Path=/, ≈400 gün; Development/Testing loopback'te `adhd_session`). Tarayıcı `/api/auth/session/register` (201) ve `/api/auth/session/login` (200) uçlarını kullanır; bu yanıtlar yalnız UserSummary taşır, token içermez. `/api/auth/register` ve `/api/auth/login` Bearer istemci sözleşmesini korur; tarayıcı bu uçları kullanmaz. Açık Authorization: Bearer başlığı (tarayıcı dışı istemci) varsa o, yoksa cookie kullanılır; URL query token hiçbir yerde kabul edilmez. Her token bir `sid` oturumuna bağlıdır ve her istekte iptal kontrolü yapılır. Cookie ile kimliği doğrulanan POST/PUT/PATCH/DELETE aynı-host Origin (yoksa Referer) ve `X-ADHD-CSRF: 1` ister; Bearer muaftır. `GET /api/auth/me` bir günden eski cookie'yi aynı oturumla yeniler. Logout geçerli oturumu, logout-all bütün oturumları kapatır; parola sıfırlama da bütün oturumları kapatır; push abonelikleri değişmez. `session/adopt`, sid'siz eski tarayıcı token'ını bir kez cookie oturumuna çevirir. E-posta/parola etkin, parola yalnız en az6 karakter; Google kapalıdır (503). Forgot202 hesap uygunluğunu açıklamaz; reset ayrı30dk/tek kullanımlık koddur.

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/account/profile

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Profil sahibi JWT/cookie kimliğidir; istemci owner veya Cloudinary URL vermez. Ad (1–50) ve isteğe bağlı soyad (0–50) ayrı alanlardır; displayName sunucuda ad + soyaddan türetilir. Eski kayıtta firstName görünen adın tamamı (e-postaya eşitse boş), lastName boştur; ad bölünerek tahmin edilmez. Ad ve fotoğraf yazıları mevcut user.profileVersion ister; stale409. Key yok; belirsiz yazı otomatik tekrarlanmaz, GET ile uzlaştırılır. Fotoğraf en fazla2MiB JPEG/PNG/WebP base64; uploadId istemcinin niyet kimliği, Cloudinary asset kimliği sunucuda rastgele üretilir. Authenticated Cloudinary p1/<user-id>/ altında256px JPEG; signed URL/anahtar tarayıcıya dönmez. GET photo?version=<photoVersion> yalnız güncel kullanıcının aynı sürümünü image/jpeg ve private/no-store sunar. Kaldırma profil bağını CAS ile keser, eski varlık temizliği best-effort; sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/account/profile
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [ProfileView](DTO-Sozlugu.md#profileview).

```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/account/profile

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Profil sahibi JWT/cookie kimliğidir; istemci owner veya Cloudinary URL vermez. Ad (1–50) ve isteğe bağlı soyad (0–50) ayrı alanlardır; displayName sunucuda ad + soyaddan türetilir. Eski kayıtta firstName görünen adın tamamı (e-postaya eşitse boş), lastName boştur; ad bölünerek tahmin edilmez. Ad ve fotoğraf yazıları mevcut user.profileVersion ister; stale409. Key yok; belirsiz yazı otomatik tekrarlanmaz, GET ile uzlaştırılır. Fotoğraf en fazla2MiB JPEG/PNG/WebP base64; uploadId istemcinin niyet kimliği, Cloudinary asset kimliği sunucuda rastgele üretilir. Authenticated Cloudinary p1/<user-id>/ altında256px JPEG; signed URL/anahtar tarayıcıya dönmez. GET photo?version=<photoVersion> yalnız güncel kullanıcının aynı sürümünü image/jpeg ve private/no-store sunar. Kaldırma profil bağını CAS ile keser, eski varlık temizliği best-effort; sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `firstName` | String | required; length:1..50 |
| `lastName` | String | length:0..50 |

**Request şeması:** [UpdateProfileRequest](DTO-Sozlugu.md#updateprofilerequest).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "firstName": "örnek",
  "lastName": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/account/profile
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ProfileView](DTO-Sozlugu.md#profileview).

```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## DELETE /api/account/profile/photo

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Profil sahibi JWT/cookie kimliğidir; istemci owner veya Cloudinary URL vermez. Ad (1–50) ve isteğe bağlı soyad (0–50) ayrı alanlardır; displayName sunucuda ad + soyaddan türetilir. Eski kayıtta firstName görünen adın tamamı (e-postaya eşitse boş), lastName boştur; ad bölünerek tahmin edilmez. Ad ve fotoğraf yazıları mevcut user.profileVersion ister; stale409. Key yok; belirsiz yazı otomatik tekrarlanmaz, GET ile uzlaştırılır. Fotoğraf en fazla2MiB JPEG/PNG/WebP base64; uploadId istemcinin niyet kimliği, Cloudinary asset kimliği sunucuda rastgele üretilir. Authenticated Cloudinary p1/<user-id>/ altında256px JPEG; signed URL/anahtar tarayıcıya dönmez. GET photo?version=<photoVersion> yalnız güncel kullanıcının aynı sürümünü image/jpeg ve private/no-store sunar. Kaldırma profil bağını CAS ile keser, eski varlık temizliği best-effort; sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `version` | Int64 | range:1..9,223372036854776E+18 |

**Request şeması:** [ProfileVersionRequest](DTO-Sozlugu.md#profileversionrequest).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "version": 1
}
```

**Örnek HTTP:**

```http
DELETE /api/account/profile/photo
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ProfileView](DTO-Sozlugu.md#profileview).

```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/account/profile/photo

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Profil sahibi JWT/cookie kimliğidir; istemci owner veya Cloudinary URL vermez. Ad (1–50) ve isteğe bağlı soyad (0–50) ayrı alanlardır; displayName sunucuda ad + soyaddan türetilir. Eski kayıtta firstName görünen adın tamamı (e-postaya eşitse boş), lastName boştur; ad bölünerek tahmin edilmez. Ad ve fotoğraf yazıları mevcut user.profileVersion ister; stale409. Key yok; belirsiz yazı otomatik tekrarlanmaz, GET ile uzlaştırılır. Fotoğraf en fazla2MiB JPEG/PNG/WebP base64; uploadId istemcinin niyet kimliği, Cloudinary asset kimliği sunucuda rastgele üretilir. Authenticated Cloudinary p1/<user-id>/ altında256px JPEG; signed URL/anahtar tarayıcıya dönmez. GET photo?version=<photoVersion> yalnız güncel kullanıcının aynı sürümünü image/jpeg ve private/no-store sunar. Kaldırma profil bağını CAS ile keser, eski varlık temizliği best-effort; sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `version` | query | hayır | string (uuid); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/account/profile/photo
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/account/profile/photo

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Profil sahibi JWT/cookie kimliğidir; istemci owner veya Cloudinary URL vermez. Ad (1–50) ve isteğe bağlı soyad (0–50) ayrı alanlardır; displayName sunucuda ad + soyaddan türetilir. Eski kayıtta firstName görünen adın tamamı (e-postaya eşitse boş), lastName boştur; ad bölünerek tahmin edilmez. Ad ve fotoğraf yazıları mevcut user.profileVersion ister; stale409. Key yok; belirsiz yazı otomatik tekrarlanmaz, GET ile uzlaştırılır. Fotoğraf en fazla2MiB JPEG/PNG/WebP base64; uploadId istemcinin niyet kimliği, Cloudinary asset kimliği sunucuda rastgele üretilir. Authenticated Cloudinary p1/<user-id>/ altında256px JPEG; signed URL/anahtar tarayıcıya dönmez. GET photo?version=<photoVersion> yalnız güncel kullanıcının aynı sürümünü image/jpeg ve private/no-store sunar. Kaldırma profil bağını CAS ile keser, eski varlık temizliği best-effort; sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `version` | Int64 | range:1..9,223372036854776E+18 |
| `uploadId` | Guid | DTO/modül iş kuralı |
| `mediaType` | String | required; length:0..20 |
| `contentBase64` | String | required; length:0..2796204 |

**Request şeması:** [UploadProfilePhotoRequest](DTO-Sozlugu.md#uploadprofilephotorequest).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "version": 1,
  "uploadId": "11111111-1111-4111-8111-111111111111",
  "mediaType": "örnek",
  "contentBase64": "örnek"
}
```

**Örnek HTTP:**

```http
PUT /api/account/profile/photo
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [ProfileView](DTO-Sozlugu.md#profileview).

```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/forgot-password

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `email` | String | required; email; length:0..320 |

**Request şeması:** [ForgotPasswordRequest](DTO-Sozlugu.md#forgotpasswordrequest).

**Örnek request body:**

```json
{
  "email": "16ed5fe50c6e4c639378c74525b62dd0@example.test"
}
```

**Örnek HTTP:**

```http
POST /api/auth/forgot-password
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 202.
Şema: [ForgotPasswordResponse](DTO-Sozlugu.md#forgotpasswordresponse).

```json
{
  "message": "Hesabınız uygunsa şifre sıfırlama bağlantısı gönderilecek."
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/google

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Geliştirmede kapalı: Google gerçek provider kabulü ertelendi. UI giriş düğmesini etkin göstermeyin; request valid olsa da özellik503 verebilir.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `idToken` | String | required; length:0..20000 |

**Request şeması:** [GoogleRequest](DTO-Sozlugu.md#googlerequest).

**Örnek request body:**

```json
{
  "idToken": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/auth/google
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [AuthResponse](DTO-Sozlugu.md#authresponse).

```json
{
  "accessToken": "<APPLICATION_JWT>",
  "tokenType": "Bearer",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 503:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.4",
  "title": "Google girişi şu anda kapalı.",
  "status": 503,
  "code": "google_disabled",
  "traceId": "00-dfd8be99894efc0dc6039204fb15df0c-3d85fc33084aea81-00"
}
```

## POST /api/auth/google/link

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Geliştirmede kapalı: Google gerçek provider kabulü ertelendi. UI giriş düğmesini etkin göstermeyin; request valid olsa da özellik503 verebilir.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `idToken` | String | required; length:0..20000 |

**Request şeması:** [GoogleRequest](DTO-Sozlugu.md#googlerequest).

**Örnek request body:**

```json
{
  "idToken": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/auth/google/link
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 503:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.6.4",
  "title": "Google girişi şu anda kapalı.",
  "status": 503,
  "code": "google_disabled",
  "traceId": "00-858ad2ea038f6954665390098868f67b-e8eb1d364d09b9cd-00"
}
```

## POST /api/auth/login

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `email` | String | required; email; length:0..320 |
| `password` | String | required |

**Request şeması:** [LoginRequest](DTO-Sozlugu.md#loginrequest).

**Örnek request body:**

```json
{
  "email": "c07ee46abd2c48b1999df50a7d3d1f02@example.test",
  "password": "123456"
}
```

**Örnek HTTP:**

```http
POST /api/auth/login
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [AuthResponse](DTO-Sozlugu.md#authresponse).

```json
{
  "accessToken": "<REPLACE_ACCESSTOKEN>",
  "tokenType": "Bearer",
  "user": {
    "id": "01a16bf8-97a0-77d1-b807-d4a1b1967947",
    "email": "c07ee46abd2c48b1999df50a7d3d1f02@example.test",
    "displayName": "c07ee46abd2c48b1999df50a7d3d1f02@example.test"
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 401:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.2",
  "title": "E-posta veya parola hatalı.",
  "status": 401,
  "code": "invalid_credentials",
  "traceId": "00-31b4cfd97a7462ea63302840b0aa6baf-992f80d85d1c0254-00"
}
```

## POST /api/auth/logout

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Request body:** yok.

**Örnek HTTP:**

```http
POST /api/auth/logout
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/auth/logout-all

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Request body:** yok.

**Örnek HTTP:**

```http
POST /api/auth/logout-all
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/auth/me

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/auth/me
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [UserSummary](DTO-Sozlugu.md#usersummary).

```json
{
  "id": "01a16bf8-97a0-77d1-b807-d4a1b1967947",
  "email": "c07ee46abd2c48b1999df50a7d3d1f02@example.test",
  "displayName": "c07ee46abd2c48b1999df50a7d3d1f02@example.test"
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
  "traceId": "00-3ccbb97bbf729941b1482a79365d1bec-7b3fa81f70433395-00"
}
```

## POST /api/auth/register

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `email` | String | required; email; length:0..320 |
| `password` | String | required; minLength:6 |
| `displayName` | String | length:0..100 |

**Request şeması:** [RegisterRequest](DTO-Sozlugu.md#registerrequest).

**Örnek request body:**

```json
{
  "email": "fff8a6523f6d4378b971eab057559114@example.test",
  "password": "123456",
  "displayName": "Test Reader"
}
```

**Örnek HTTP:**

```http
POST /api/auth/register
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [AuthResponse](DTO-Sozlugu.md#authresponse).

```json
{
  "accessToken": "<REPLACE_ACCESSTOKEN>",
  "tokenType": "Bearer",
  "user": {
    "id": "01a16bfd-13f1-73d7-a63c-1c96c5aa14eb",
    "email": "fff8a6523f6d4378b971eab057559114@example.test",
    "displayName": "Test Reader"
  }
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Bu e-posta zaten kullanılıyor.",
  "status": 409,
  "code": "email_exists",
  "traceId": "00-9eda25c5fef176c8ef942f8af42cabd4-403bb7c61ae3e984-00"
}
```

## POST /api/auth/reset-password

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `token` | String | required; length:64..64 |
| `newPassword` | String | required; minLength:6 |

**Request şeması:** [ResetPasswordRequest](DTO-Sozlugu.md#resetpasswordrequest).

**Örnek request body:**

```json
{
  "token": "<REPLACE_TOKEN>",
  "newPassword": "123456"
}
```

**Örnek HTTP:**

```http
POST /api/auth/reset-password
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 204.

Response body yok; JSON parse etmeyin.

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.",
  "status": 400,
  "code": "reset_invalid",
  "traceId": "00-9ca47012c0b8585712aa434fc637823c-094574454bb85ce6-00"
}
```

## POST /api/auth/session/adopt

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Request body:** yok.

**Örnek HTTP:**

```http
POST /api/auth/session/adopt
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [UserSummary](DTO-Sozlugu.md#usersummary).

```json
{
  "id": "01a16bfe-07c5-77dd-9a89-92f86c062b35",
  "email": "f6116debae5e438386c6eadcc9cdb84b@example.test",
  "displayName": "f6116debae5e438386c6eadcc9cdb84b@example.test"
}
```

Örnek kaynağı: Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

Gerçek test hata örneği — HTTP 401:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.2",
  "title": "Oturum taşınamadı. Yeniden giriş yap.",
  "status": 401,
  "code": "adopt_refused",
  "traceId": "00-ba402c5cc6cb2d4075bb8a9912b99069-ab5877768fae0f7a-00"
}
```

## POST /api/auth/session/login

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `email` | String | required; email; length:0..320 |
| `password` | String | required |

**Request şeması:** [LoginRequest](DTO-Sozlugu.md#loginrequest).

**Örnek request body:**

```json
{
  "email": "developer@example.test",
  "password": "123456"
}
```

**Örnek HTTP:**

```http
POST /api/auth/session/login
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [UserSummary](DTO-Sozlugu.md#usersummary).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "developer@example.test",
  "displayName": "örnek",
  "profileVersion": 1,
  "photoVersion": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/session/register

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `email` | String | required; email; length:0..320 |
| `password` | String | required; minLength:6 |
| `displayName` | String | length:0..100 |

**Request şeması:** [RegisterRequest](DTO-Sozlugu.md#registerrequest).

**Örnek request body:**

```json
{
  "email": "developer@example.test",
  "password": "123456",
  "displayName": "örnek"
}
```

**Örnek HTTP:**

```http
POST /api/auth/session/register
Accept: application/json
Content-Type: application/json
```

**Başarılı response:** HTTP 201.
Şema: [UserSummary](DTO-Sozlugu.md#usersummary).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "developer@example.test",
  "displayName": "örnek",
  "profileVersion": 1,
  "photoVersion": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/change-password

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Mevcut parola doğrulanır. expectedUserId oturum sahibiyle aynı olmalıdır. Yeni parola yalnız en az 6 karakter ister, trim veya ek karmaşıklık uygulanmaz; mevcut paroladan farklı olmalıdır. Hash/version güncellemesi, açık reset bağlantılarının tüketilmesi, bütün eski sid oturumlarının iptali ve yeni sid oluşturulması tek PostgreSQL transaction içinde yapılır. Başarı UserSummary ve yeni HttpOnly cookie döndürür; JWT gövdede bulunmaz. Diğer cihazlar ve eski cookie/Bearer kopyaları reddedilir; başka hesaplar, çalışmalar ve push abonelikleri değişmez. Cookie yazısı aynı-host Origin ve X-ADHD-CSRF: 1 gerektirir. Auth rate limit geçerlidir.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse başarı varsaymayın; yeni parolayla giriş yaparak kontrol edin. GET me parola değişikliğini kanıtlamaz. Header eklemek duplicate koruması sağlamaz.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `currentPassword` | String | required |
| `newPassword` | String | required; minLength:6 |

**Request şeması:** [ChangePasswordRequest](DTO-Sozlugu.md#changepasswordrequest).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "currentPassword": "örnek",
  "newPassword": "123456"
}
```

**Örnek HTTP:**

```http
POST /api/auth/change-password
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [UserSummary](DTO-Sozlugu.md#usersummary).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "developer@example.test",
  "displayName": "örnek",
  "profileVersion": 1,
  "photoVersion": "11111111-1111-4111-8111-111111111111"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

**İşleme özgü hatalar:** 400 `current_password_invalid`, `password_unchanged`, `password_too_short`/`validation_failed`; 409 `account_changed`, `credentials_changed`; geçersiz oturum 401.

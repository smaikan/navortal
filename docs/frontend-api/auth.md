# Kimlik doğrulama ve profil

UI-R3: Register201 ve login200 HttpOnly oturum cookie'si yazar (production'da `__Host-adhd_session`, Secure, SameSite=Strict, Path=/, ≈400 gün; Development/Testing loopback'te `adhd_session`). Tarayıcı `/api/auth/session/register` (201) ve `/api/auth/session/login` (200) uçlarını kullanır; bu yanıtlar yalnız UserSummary taşır, token içermez. `/api/auth/register` ve `/api/auth/login` Bearer istemci sözleşmesini korur; tarayıcı bu uçları kullanmaz. Açık Authorization: Bearer başlığı (tarayıcı dışı istemci) varsa o, yoksa cookie kullanılır; URL query token hiçbir yerde kabul edilmez. Her token bir `sid` oturumuna bağlıdır ve her istekte iptal kontrolü yapılır. Cookie ile kimliği doğrulanan POST/PUT/PATCH/DELETE aynı-host Origin (yoksa Referer) ve `X-ADHD-CSRF: 1` ister; Bearer muaftır. `GET /api/auth/me` bir günden eski cookie'yi aynı oturumla yeniler. Logout geçerli oturumu, logout-all bütün oturumları kapatır; parola sıfırlama da bütün oturumları kapatır; push abonelikleri değişmez. `session/adopt`, sid'siz eski tarayıcı token'ını bir kez cookie oturumuna çevirir. E-posta/parola etkin, parola yalnız en az6 karakter. Google kimlik doğrulaması backend yapılandırmasına (`Google:Enabled`, `Google:ClientId`) bağlıdır; varsayılan olarak kapalıdır (503). `GET /api/auth/google/config` no-store önbellekleme ve etkin durumda kısa ömürlü HttpOnly SameSite=Strict tarayıcı challenge cookie ile enabled/clientId/nonce döndürür. Tarayıcı girişi `POST /api/auth/session/google {idToken}` yalnız UserSummary döndürür ve HttpOnly oturum cookie'si yazar; `POST /api/auth/google` Bearer uyumluluğunu korur. `POST /api/auth/google/link {idToken, expectedUserId}` oturum açmış kullanıcıya Google bağlar (tarayıcıda challenge cookie doğrulanır, Bearer uyumludur). Doğrulanmış Google token'ından ad/soyad/görünen ad/fotoğraf ilk aktarımda doldurulur, kullanıcının düzenlediği alanlar korunur; `sub` sabit harici kimliktir. Aynı e-postada otomatik bağlama yalnız doğrulanmış Gmail veya `hd` içeren kurumsal Google Workspace adreslerinde yapılır, mevcut kullanıcı ID/verileri ve parola korunur; diğer alan adları önce parolayla giriş ve ayarlardan bağlama gerektirir. `UserSummary.googlePictureUrl` özel yüklenen fotoğraftan ayrı isteğe bağlı HTTPS Googleusercontent fallback URL'sidir; kullanıcının yüklediği özel fotoğraf önceliklidir, fotoğraf kaldırma her ikisini temizler ve tarayıcı görseli doğrudan Google'dan no-referrer ile çeker (sunucuya indirilmez). Forgot202 hesap uygunluğunu açıklamaz; reset ayrı30dk/tek kullanımlık koddur.

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
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek",
  "hasPassword": true,
  "googleLinked": false
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
| `version` | Int64 | range:1..9.223372036854776E+18 |
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
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek",
  "hasPassword": true,
  "googleLinked": false
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
| `version` | Int64 | range:1..9.223372036854776E+18 |

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
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek",
  "hasPassword": true,
  "googleLinked": false
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
| `version` | Int64 | range:1..9.223372036854776E+18 |
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
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  },
  "photoUploadEnabled": false,
  "firstName": "örnek",
  "lastName": "örnek",
  "hasPassword": true,
  "googleLinked": false
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/change-password

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Mevcut parola ve expectedUserId doğrulanır. En az6 karakter yeni parola trim edilmez; mevcut paroladan farklıdır. Hash/version, reset bağlantıları, bütün eski sid iptalleri ve yeni sid tek transaction içindedir. Response yalnız UserSummary; yeni JWT HttpOnly cookie içindedir. Eski cookie/Bearer kopyaları ve diğer cihazlar kapanır. Cookie CSRF/Origin ve auth rate limit geçerlidir. Key/otomatik retry yok; belirsiz sonuçta yeni parolayla giriş yap. GET me parola değişikliğini kanıtlamaz.

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
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
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
  "email": "developer@example.test"
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
  "message": "örnek"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/google

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Bearer istemci uyumluluğu: doğrulanmış idToken ile JWT AccessToken ve UserSummary döner; tarayıcı /api/auth/session/google kullanır. Google kapalıysa 503.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Harici ve mobil istemciler için Bearer uyumluluk ucu. Doğrulanmış idToken ile JWT AccessToken ve UserSummary döner; tarayıcı /api/auth/session/google kullanır. Google kapalıysa 503 döner.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `idToken` | String | required; length:0..20000 |
| `expectedUserId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [GoogleRequest](DTO-Sozlugu.md#googlerequest).

**Örnek request body:**

```json
{
  "idToken": "<GOOGLE_ID_TOKEN_FROM_GIS>",
  "expectedUserId": "11111111-1111-4111-8111-111111111111"
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
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## GET /api/auth/google/config

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** No-store önbellekleme; sunucu yapılandırmasına (Google:Enabled, Google:ClientId) göre enabled, clientId ve tarayıcı replay koruması için kısa ömürlü HttpOnly SameSite=Strict challenge cookie ile eşleşen nonce döner.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Ek entegrasyon kuralı:** Google yapılandırması: no-store önbellekleme; sunucuda Google etkinse (Google:Enabled=true ve ClientId dolu) enabled=true, clientId ve tarayıcı giriş/bağlama akışında replay koruması için kısa ömürlü HttpOnly SameSite=Strict challenge cookie ile eşleşen nonce döner. Kapalıysa enabled=false ve boş clientId döner.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/auth/google/config
Accept: application/json
```

**Başarılı response:** HTTP 200.
Şema: [GoogleAuthConfigView](DTO-Sozlugu.md#googleauthconfigview).

```json
{
  "enabled": false,
  "clientId": "<GOOGLE_WEB_CLIENT_ID>",
  "nonce": "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## POST /api/auth/google/link

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Oturum açmış kullanıcıya Google bağlar (expectedUserId doğrulaması). Tarayıcıda challenge cookie ile idToken eşleşir, Bearer çağrısı da desteklenir. sub benzersizdir; Google kapalıysa 503.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Oturum açmış kullanıcıya Google kimliğini bağlar. Cookie isteklerinde expectedUserId zorunludur ve oturum sahibiyle eşleşmelidir (404); Bearer istemcide gönderilirse kontrol edilir. Tarayıcı isteklerinde challenge cookie doğrulanır, Bearer uyumludur. Geçersiz Google kanıtı/challenge 400 döner, mevcut uygulama oturumu kapanmaz. Bağlantı sonrası UserSummary.googlePictureUrl güncellenebilir. Başka hesaba bağlı sub için 409 google_already_linked döner.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `idToken` | String | required; length:0..20000 |
| `expectedUserId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [GoogleRequest](DTO-Sozlugu.md#googlerequest).

**Örnek request body:**

```json
{
  "idToken": "<GOOGLE_ID_TOKEN_FROM_GIS>",
  "expectedUserId": "11111111-1111-4111-8111-111111111111"
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
  "email": "developer@example.test",
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
  "accessToken": "<APPLICATION_JWT>",
  "tokenType": "Bearer",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

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

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

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
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "developer@example.test",
  "displayName": "örnek",
  "profileVersion": 1,
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

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
  "email": "developer@example.test",
  "password": "123456",
  "displayName": "örnek"
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
  "accessToken": "<APPLICATION_JWT>",
  "tokenType": "Bearer",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "örnek",
    "profileVersion": 1,
    "photoVersion": "11111111-1111-4111-8111-111111111111",
    "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

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
  "token": "<RESET_CODE_FROM_EMAIL>",
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

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

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
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "developer@example.test",
  "displayName": "örnek",
  "profileVersion": 1,
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/session/google

**Yetki:** Anonim erişim; aşağıdaki auth/provider koşulları geçerli.

**Amaç/koşul:** Tarayıcı Google girişi: doğrulanmış idToken ve challenge cookie ile HttpOnly oturum açar, yanıt yalnız UserSummary taşır. Sunucuda Google kapalıysa 503; yetkisiz e-postada google_link_required döner.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Tarayıcı Google oturumu: idToken Google Identity Services tarafından sağlanır. Sunucu tokenı doğrular, challenge cookie kontrolü yapar ve HttpOnly app session cookie yazar. Yanıt yalnız UserSummary taşır, Bearer token içermez. Sunucuda Google kapalıysa 503; yetkisiz üçüncü taraf e-postada mevcut hesap varsa 409 google_link_required döner.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `idToken` | String | required; length:0..20000 |
| `expectedUserId` | Guid? | DTO/modül iş kuralı |

**Request şeması:** [GoogleRequest](DTO-Sozlugu.md#googlerequest).

**Örnek request body:**

```json
{
  "idToken": "<GOOGLE_ID_TOKEN_FROM_GIS>",
  "expectedUserId": "11111111-1111-4111-8111-111111111111"
}
```

**Örnek HTTP:**

```http
POST /api/auth/session/google
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
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

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
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
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
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

## POST /api/auth/set-password

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Google ile açılmış, henüz parolası olmayan hesap için ilk parola oluşturur. expectedUserId oturum sahibiyle eşleşir; idToken sub aynı hesaba önceden bağlı Google kimliği olmalıdır, e-posta eşleşmesi yeterli değildir. Tarayıcıda taze Google challenge cookie/nonce zorunludur. Geçersiz kanıt 400 döner ve mevcut oturumu kapatmaz. Google kapalıysa 503, parola varsa 409 password_already_set döner. En az6 karakter parola trim edilmez. Hash/version, reset kodu iptali, eski oturumların kapanması ve yeni oturum tek transaction içindedir. Yanıt yalnız UserSummary; yeni JWT HttpOnly cookie içindedir. Google bağlantısı korunur; artık iki giriş yöntemi kullanılabilir. Cookie CSRF/Origin ve auth rate limit uygulanır. Otomatik yazım retry yok; belirsiz sonuçta yeni parolayla giriş yap.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `expectedUserId` | Guid | required |
| `idToken` | String | required; length:0..20000 |
| `newPassword` | String | required; minLength:6 |

**Request şeması:** [SetPasswordRequest](DTO-Sozlugu.md#setpasswordrequest).

**Örnek request body:**

```json
{
  "expectedUserId": "11111111-1111-4111-8111-111111111111",
  "idToken": "<GOOGLE_ID_TOKEN_FROM_GIS>",
  "newPassword": "123456"
}
```

**Örnek HTTP:**

```http
POST /api/auth/set-password
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
  "photoVersion": "11111111-1111-4111-8111-111111111111",
  "googlePictureUrl": "https://lh3.googleusercontent.com/a/example"
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.), 429 (Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin.).

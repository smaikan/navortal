# HTTP ve süresiz JWT sözleşmesi

## İlk sürüm kararı

15 Ekim 2026 kullanıcı değişikliği: yalnız e-posta/parola etkin, Google geliştirmede kapalı; Identity application cookie yerine basit JWT Bearer kullanılır. Uygulama access token'ı `exp` içermez ve zaman nedeniyle dolmaz. Refresh token, rotation, denylist ve token-version yoktur. Ortak ekipler ve rol matrisi kapsam dışıdır. Provider/domain/secrets ortamdan gelir.

Reverse proxy tek origin sunar; `/api` ve SignalR ASP.NET'e gider. API auth `Authorization: Bearer <accessToken>` kullanır. Tarayıcıdaki merkezi auth adaptörü localStorage'dan token alır; özel veri bootstrap'ı browser'da `/me` ile doğrulanır. localStorage server render sırasında okunmaz; cookie/BFF ikinci oturum sahibi eklenmez.

## Üretim ve doğrulama

- Framework JwtBearer ve standart JWT kütüphanesi; HS256 için ortamda en az 32 rastgele byte imza anahtarı. `alg:none` ve beklenmeyen algoritma reddedilir.
- Claims: `sub`, `iss`, `aud`, `iat`; `exp` yok. `jti` izleme için opsiyoneldir, revoke altyapısı değildir. Yanıt: `accessToken`, `tokenType: Bearer`, kullanıcı özeti; refreshToken veya sahte expiresIn yok.
- `RequireExpirationTime=false`, imza/issuer/audience kontrolleri açık. `ValidateLifetime=true` kalabilir: expiry zorunlu değilken varsa exp/nbf doğrulanır. Süresiz uygulama token'ında exp üretilmez; bütün doğrulamaları kapatma.
- JwtSecurityTokenHandler token descriptor'da Expires boşken varsayılan exp ekleyebilir; gerekiyorsa `SetDefaultTimesOnTokenCreation=false` kullan. Son imzalanmış token'ı okuyarak exp olmadığını ve ileri saatle doğrulamanın başarılı olduğunu test et.
- İmza anahtarı restart'ta değişmesin. Anahtar değişirse eski token'lar topluca geçersiz olur; ince taneli session revoke yok.
- `MapInboundClaims=false`; kullanıcı `sub` üzerinden açık çözülür. Silinmiş/bulunmayan kullanıcı için erişim reddedilir. UserId request alanı otorite değildir.
- Logout yerel token, kullanıcı cache'i ve SignalR bağlantısını temizler. `POST /api/auth/logout` stateless 204 onayı olabilir; revoke yapmaz. Eldeki token kopyası anahtar/kullanıcı geçerliyken çalışabilir. Parola reset de eski JWT'leri kendiliğinden iptal etmez. Aktif gerçek work session'ını logout gerekçesiyle bitirme.
- Token'ı yalnız beklenen login/register/google yanıtında döndür; DOM, normal URL, log, hata, screenshot ve test attachment'ına yazma. SignalR JS `accessTokenFactory` kullanır; browser WebSocket/SSE'de standart access_token query aktarımı yalnız hub yolunda kabul edilir ve query loglarından redakte edilir.

## Giriş ve kurtarma

- AppUser/ExternalLogins ve PasswordHasher kullan; tam Identity entity/store/UI/SignInManager kurma.
- Register/login/me gerçek JWT middleware ile test edilir. Yetkisiz yanıt JSON/ProblemDetails 401'dir, HTML login redirect değildir.
- Google girişi browser'daki Google Identity Services'ten gelen ID credential'ın backend doğrulamasıdır. Google subject provider anahtarıdır; audience app client ID ile doğrulanır. Dış kanıtın kısa expiry'si uygulama JWT'sinin süresizliğinden bağımsızdır.
- İlk kayıt, tekrar giriş, oturumlu hesaba link, yanlış audience/expired proof ve aynı e-postalı başka hesap ayrı sonuçlara sahiptir. Aynı e-postayla otomatik merge yok.
- Parola kurtarma: CSPRNG kodu, DB'de hash, 30 dk süre ve tek kullanım; ayarlı mail adaptörü. Kod yalnız parola reset içindir, JWT access veya refresh değildir. Google-only hesaplarda kurtarma parola oluşturmayı sessizce başlatmaz; varlık bilgisi sızdırmadan aynı genel yanıt politikası uygulanır.
- Test e-posta yakalayıcısı production teslim kanıtı değildir. Secret/reset bağlantısı/token loglama.

## HTTP davranışı

OpenAPI public sözleşmedir; entity şeması public API değildir. Yeni route ve enum değerlerini gerçek uygulamayla birlikte belgele. Nihai DTO'ları MVP-00 ve ilgili MVP'de kesinleştir; önerilen route'ları var sayma.

- Oluşturma, doğrulama, kimlik, sahiplik, conflict ve beklenmeyen hataları ayır.
- Validation hatasında alan bağlantısı; problem yanıtında güvenli kod ve trace kimliği sağla.
- `409` sonrası mutation'ı körlemesine tekrarlama. Eski plan önerisi yeni snapshot gerektirebilir.
- Idempotency, yanıtı kaybolan aynı niyetin tekrarını güvenli yapar; farklı payload'ın aynı anahtarı kullanmasını doğrula.
- Kullanıcıya özel plan ve görev yanıtlarını ortak public cache'e koyma.

## Anlamlı kontroller

Anonim erişim; iki kullanıcıyla izolasyon; JWT'de exp olmaması; ileri saatte doğrulama; bozuk imza/yanlış issuer/audience; token bulunmayan istek; logout'un yerel olması; Google kanıtı ve link; reset expiry/tek kullanım; DTO üzerinden server alanı yazma; OpenAPI bearer şeması. Belge değişikliği bu testlerin çalıştırıldığı anlamına gelmez.

## Teknik kaynaklar

- [JWT exp claim tanımı](https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.4): exp kullanımı opsiyoneldir; süresiz seçim bu projenin kullanıcı tercihidir.
- [Microsoft JWT Bearer](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0): imza ve token doğrulama mekanizması.
- [JWT handler kaynak kodu](https://github.com/AzureAD/azure-activedirectory-identitymodel-extensions-for-dotnet/blob/dev/src/System.IdentityModel.Tokens.Jwt/JwtSecurityTokenHandler.cs): varsayılan üretim zamanları; projeye kurulan sürümde davranışı test et.

## Güncel geliştirme kimlik kararı — 15 Ekim 2026

Yalnız e-posta/parola etkin. Şifrede yalnız en az 6 karakter şartı vardır; ek karmaşıklık, üst uzunluk politikası veya e-posta onayı yoktur. Register doğrudan JWT verir. Google varsayılan `Google:Enabled=false` ile kapalıdır; client ID eklemek tek başına etkinleştirmez. Google gerçek sağlayıcı smoke kabulü kullanıcı kararıyla ertelenmiştir; geliştirmeyi bloke etmez. Yeniden etkinleştirilirse Google proof doğrulama kuralları aynen geçerlidir. Parola kurtarma e-postası kayıt onayı değildir.

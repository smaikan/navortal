# Google girişini tamamlama planı

Durum: uygulama ve kontroller tamamlandı. Sonuçlar [doğrulama raporunda](google-auth-report.md), etkinleştirme adımları [kurulum rehberinde](google-auth-setup.md). Aşağıdaki metin başlangıç planını kaydeder.

## İstenen sonuç ve görev paylaşımı

Codex API analizini ve belge araştırmasını yaptı. Uygulamayı Antigravity üzerinden `gemini-3.8-flash-high` yapacak; Codex çıkan değişiklikleri inceleyip kontrolleri çalıştıracak. Kullanıcı bu modeli açıkça onayladı. Canlıya dağıtım, gerçek Google hesabıyla işlem veya gizli anahtar ayarlarını değiştirme bu görevin parçası değildir.

Google ile giriş/kayıt, ad, soyad, e-posta ve fotoğrafı uygulamanın mevcut kullanıcı/profil sistemine taşımalıdır. Aynı e-posta ile kayıtlı hesabın kimliği ve görevleri korunarak Google kimliği o hesaba bağlanmalıdır. E-posta/parola girişi çalışmaya devam etmelidir.

## Mevcut mimaride bulunanlar

- Backend .NET 10, EF Core/PostgreSQL; UI Next.js 16 ve React 19.
- `API/src/Adhd.Application/Auth/GoogleAuthService.cs`: `sub` ile harici kimlik arıyor, yeni hesap açabiliyor; aynı e-posta bulunduğunda `google_link_required` veriyor.
- `API/src/Adhd.Infrastructure/Auth/GoogleTokenVerifier.cs`: mevcut `Google.Apis.Auth` 1.77.0 ile imza, issuer, audience ve süre doğrulama altyapısı var. `Google:Enabled` varsayılan false. Şu anda yalnız subject/email/name/emailVerified aktarılıyor.
- `GoogleAccountStore`, `ExternalLogin` ve migration mevcut. `(Provider, Subject)` ve `NormalizedEmail` benzersiz. Bu yapıyı yeniden kurma.
- `AuthController` içinde `/api/auth/google` Bearer yanıtı, `/api/auth/google/link` yetkili bağlama ucu mevcut. Tarayıcıya token döndürmeyen `/api/auth/session/google` eklenmeli; mevcut Bearer sözleşmesi korunmalı.
- `AuthService.StartAsync` iptal edilebilir `sid` oturumu oluşturuyor; `SessionCookie.Write` HttpOnly cookie yazıyor. UI `createSession`, kimlik epoch'u, cache temizliği ve `/me` doğrulaması kullanıyor. Google girişi bunları atlamamalı.
- `AppUser` ad/soyad, profil sürümü ve Cloudinary fotoğraf bağını içeriyor. `ProfileAvatar` ve profil ekranı bugün yalnız özel yüklenen fotoğrafı destekliyor.
- `docs/operation-policies.json` Google işlemlerini disabled olarak işaretliyor; UI tipleri ve politikaları üretiliyor. Yeni uçlar canonical sözleşme/politika belgelerine eklenmeli, mevcut Google uçları etkinleştirilebilir hale getirilmeli.
- Çalışma başlangıcında git diff temizdi. Uygulama sırasında mevcut değişiklikleri koru.

## Belgelere dayanan kararlar

1. Google Identity Services JavaScript `initialize` + resmi `renderButton`, popup callback ve ID token kullan. `https://accounts.google.com/gsi/client` yalnız gereken giriş/bağlama ekranında yüklensin. One Tap veya otomatik giriş ekleme. Bu yöntem için Client ID yeterlidir; Client Secret ya da Google API access/refresh token saklama gerekmez.
2. Tüm kimlik/profil alanları backend tarafından doğrulanmış ID token'dan alınır. `sub` harici kimliğin sabit anahtarıdır; e-posta kalıcı harici kimlik anahtarı değildir. `email_verified` zorunlu. İmza/audience/issuer/exp kontrolünü mevcut Google SDK'sına bırak.
3. Aynı normalize e-posta varsa Gmail (`@gmail.com`) veya doğrulanmış Workspace (`hd` dolu) kimliği mevcut kullanıcı ID'sine otomatik bağlanır. Google'ın yetkili olmadığı üçüncü taraf e-posta adreslerinde otomatik bağlama yapma; `google_link_required` ile mevcut parolayla giriş ve açık Google bağlama akışı sun. Bu güvenlik istisnasını etkinleştirme rehberinde açıkla.
4. Google `sub` zaten başka kullanıcıya bağlıysa yeniden atama/hesap birleştirme yapma. `sub` eşleşmesi e-postadan önce gelir; Google e-posta değişince yeni uygulama hesabı açılmamalı. Uygulama e-postasını sessizce değiştirme.
5. Google profil aktarımı ilk oluşturma/bağlamada yapılır. Mevcut kullanıcı ad/soyadını veya yüklediği fotoğrafı ezme; boş/default alanları doldur. Sonraki girişlerde uygulamada düzenlenmiş/silinmiş profil verilerini geri getirme. `given_name`, `family_name`, `name`, `picture`, `hd`, `nonce` doğrulanmış payload'dan taşınmalı. Eksik/uzun ad alanları için 50 karakter sınırına uygun, Unicode'u bozmayan deterministik bir davranış belirle.

Kaynaklar:

- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token (özellikle authoritative email ve `sub`)
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid (Web Client ID, consent, script, CSP/COOP)
- https://developers.google.com/identity/gsi/web/guides/display-button
- https://developers.google.com/identity/gsi/web/reference/js-reference (callback, nonce, renderButton)
- https://cloud.google.com/dotnet/docs/reference/Google.Apis/latest/Google.Apis.Auth.GoogleJsonWebSignature.Payload
- https://github.com/googleapis/google-api-dotnet-client/blob/main/_autodocs/api-reference/google-apis-auth-tokens.md

## Uygulama adımları / Antigravity'ye görev

### API ve hesap bağlama

- Mevcut servisi/store'u geliştir. Yeni kullanıcı ve varsayılan planning state/note category mevcut transaction ile oluşsun.
- Aynı e-postalı otomatik bağlama, yarış koşullarında da tek kullanıcı ve tek subject bağı üretmeli. Benzersizlik hatasından sonra gerçek sahibi yeniden oku; başka hesabın subject'ini ya da şifresini değiştirme. Hesap verilerini başka kullanıcı ID'sine kopyalamaya gerek yok.
- Profil aktarımı ve harici bağın kaydı tutarlı olmalı; CAS/version concurrency hatalarını ele al. Parola hash'i korunmalı. Google-only kullanıcıya rastgele/sabit parola verme.
- Tarayıcı için `POST /api/auth/session/google` yalnız `UserSummary` döndürüp HttpOnly session cookie yazmalı. Yerel/session storage'a uygulama JWT'si veya Google ID token yazma.
- `GET /api/auth/google/config` gibi no-store bir uç yalnız public client ID ve etkinlik döndürsün; `Enabled=false` veya boş ClientId ile UI butonu görünmesin ve API işlemleri kapalı kalsın. UI ile API'nin ayrı client ID ayarlarına ihtiyaç duymaması tercih edilir.
- Tarayıcı Google giriş/bağlama akışında sunucunun ürettiği kısa ömürlü nonce'u GIS'e geçir; doğrulanmış token nonce'u browser'a bağlı HttpOnly, SameSite=Strict (production Secure) challenge cookie ile doğrula. Başarılı girişte challenge'ı temizle. Origin + özel CSRF başlığını Google session girişinde anonimken de zorunlu tut. Token/request body içindeki bir nonce'un kendi başına kabul edilmesi yeterli değildir. Mevcut Bearer endpoint sözleşmesini kırma; cookie ile authenticated link de challenge doğrulamalı.
- Auth rate limit, hata kodları ve no-store davranışını koru. Token/credential hiçbir log veya rapora yazılmasın.
- Açık Google bağlama akışında sahibi authenticated user ID'den al. UI gerekiyorsa profil/hesap ayarlarından bağlama sunmalı; üçüncü taraf e-posta için kullanıcı parolayla giriş yaptıktan sonra bu akışı kullanabilmeli. Body'den gelen owner'a güvenme.

### Profil fotoğrafı ve kullanıcı bilgileri

- Cloudinary yapılandırması olmadan da Google fotoğrafını gösterebilmek için nullable `GooglePictureUrl` gibi ayrı bir fallback alan ekle; migration ve model snapshot'ını güncelle. `UserSummary` bu nullable URL'yi döndürebilir.
- Yalnız doğrulanmış token'dan HTTPS, kullanıcı bilgisi/custom port içermeyen Googleusercontent host allowlist'ine uygun, sınırlı uzunlukta URL sakla. Genel URL'den sunucuda görsel indirme/SSRF yüzeyi açma. UI de URL'yi güvenli kuralla doğrulasın, hata halinde baş harfe düşsün, `referrerPolicy="no-referrer"` kullansın.
- Kullanıcının yüklediği özel fotoğraf öncelikli; Google URL'si ikinci; baş harf son seçenek. Google fotoğrafı URL ile gösteriliyorsa Google'a tarayıcı isteği gittiğini mevcut gizlilik açıklamasına ekle; hukuki sonuçlar hakkında iddiada bulunma.
- Fotoğraf kaldırma özel fotoğraf ve Google fallback'ini aynı version kontrollü işlemde temizlemeli; daha sonraki giriş fotoğrafı geri getirmemeli. Cloudinary kapalıyken Google fotoğrafını kaldırma yine kullanılabilmeli.
- `session.ts` validUser/updateUser, profil veri doğrulayıcısı ve fotoğraf seç/kaldır koşullarını yeni alanla güncelle. Profil değişiklikleri doğru version taşımalı.

### UI

- Login ve register ekranlarına resmi GIS butonu ekle; mevcut tasarımın içinde erişilebilir loading/error ve Türkçe metinler kullan. SDK yüklenememesi mevcut e-posta girişini bozmamalı. Register ekranının mevcut kullanım koşulları şartını Google akışında da koru.
- Kimlik durumunu mevcut session API'si üzerinden güncelle, önceki kullanıcının cache/isteklerini temizle ve `/me` ile doğrula; mevcut safeReturnPath yönlendirmesini kullan. Unmount veya epoch değişiminden sonra geç kalan callback farklı hesabı açmamalı.
- Giriş süresince çift tıklama/iki farklı auth işlemi yarışını engelle, belirsiz yazıyı otomatik tekrarlama. Google token'ı loglama veya kalıcı depoya yazma.
- Authenticated Google bağlama ekranı/eylemi ve `google_link_required` açıklaması erişilebilir olmalı. Geçici credential'ı localStorage'a taşıma; gerekiyorsa bağlama için kullanıcıya yeniden Google seçimi yaptır.
- Gerçek kullanılan CSP'yi ve proxy başlıklarını incele. Google script/frame/connect için gereken en dar değişikliği yap; genel güvenlik başlıklarını kaldırma. Popup için gerekiyorsa uygun COOP kullan.

### Sözleşmeler ve etkinleştirme rehberi

- `docs/openapi-v1.json`, endpoint catalog, operation-policies ve UI generated tip/politikaları gerçek API'den üret. Kaynak değişikliği gerektiriyorsa canonical politikaları güncelle; üretilmiş dosyalara tutarsız elle yama yapma.
- `docs/frontend-api/auth.md`, ilgili DTO/hata açıklamaları ve README'deki Google kapalı ifadelerini doğru koşullu davranışla güncelle. Örnek env'ye `Google__Enabled=false`, `Google__ClientId=` ekle. Gerçek env/secret dosyasına dokunma.
- `docs/google-auth-setup.md`: Google Cloud Console'da Branding/Audience/Data Access/Clients, Web application OAuth Client ID, `openid email profile`, yetkili JS origins `https://www.navortal.com.tr` ve yerel `http://localhost:3100` (gerekirse `http://127.0.0.1:3100`), domain `navortal.com.tr`, gizlilik `/privacy-notice`, koşullar `/terms`; Testing test users / Production geçişini anlat. Popup callback akışında redirect URI zorunlu değil; client secret gerekli değil.
- API ayarlarının ignore edilen `API/.local/api.env` içinde yapılabileceğini, migration + API/UI yeniden build/restart gerektiğini ve gerçek hesapla kabul kontrolünü açıkla. Canlı ayarları sen değiştirme/uygulamayı deploy etme.

## Kabul kontrolleri

- API anlamlı integration testleri: yeni Google kullanıcı/profil, aynı Gmail/Workspace ile mevcut ID korunarak bağlama ve parola girişinin çalışması, üçüncü taraf e-postada link-required + authenticated link, doğrulanmamış/bozuk proof reddi, mevcut sub ile e-posta değişimi, başka hesaba bağlı sub reddi, yarışta duplicate oluşmaması, kullanıcı profil düzenlemelerinin korunması, fotoğraf kaldırmanın kalıcı olması.
- Browser endpoint yalnız UserSummary + HttpOnly cookie dönmeli; bearer token sızıntısı olmamalı. Nonce/Origin/CSRF yanlışlığı reddedilmeli; disabled/missing config bozulmamalı.
- UI session testleri: Google kimlik geçişi/cache temizliği/late callback/logout yarışları, güvenli fotoğraf URL'si ve hata durumları. Gerekiyorsa kontrollü GIS stub ile akış testi; production'a sahte verifier ekleme.
- API build + uygun xUnit testleri, UI typecheck + unit tests + ilgili lint + api:check; mümkünse auth odaklı Playwright ve production build. Test DB sadece rastgele `adhd_test_` veritabanı; canlı veritabanı kullanılmaz.
- Bu hostta `dotnet` şu anda PATH üzerinde bulunamadı. Güvenli local SDK veya var olan Docker build/test ortamını araştır; test çalıştırılmadıysa açıkça raporla. Kurulu yazılımları veya canlı servisleri gelişi güzel değiştirme.

Antigravity sonunda değişen dosyaları, uygulanan davranışı, çalıştırdığı kontrollerin gerçek sonuçlarını, engelleri ve manuel Google kabul testinde kalanları raporlamalı. Commit/push/deploy yapmamalı.

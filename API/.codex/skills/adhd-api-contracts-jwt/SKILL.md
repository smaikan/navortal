---
name: adhd-api-contracts-jwt
description: ADHD planlayıcısının ASP.NET Core API/DTO/OpenAPI sözleşmelerini ve süresiz JWT Bearer, Google giriş, hesap bağlama, parola kurtarma akışlarını geliştir veya incele. Refresh token veya Identity cookie ekleme; görev ve motor kuralları için ilgili domain becerisini kullan.
---

# ADHD API sözleşmeleri ve JWT

Bu beceri projenin modüler monolit sınırlarını ve sade tarayıcı kimlik doğrulamasını korur. Genel framework bilgisi için mevcut `aspnet-core` becerisi uygunsa ondan yararlan; bu dosya projeye özgü kararları tanımlar.

## Başlamadan

- Varsa kök `AGENTS.md`, aktif MVP, ilgili endpoint/DTO/validator, OpenAPI ve testleri oku. Henüz bulunmayan bir belgeyi veya endpointi mevcut sayma.
- Belgelenen tasarım, uygulanmış sözleşme ve gerçek runtime davranışını ayır. Fark varsa açıkça kaydet.
- Kimlik veya HTTP sözleşmesini değiştirirken [JWT ve HTTP referansını](references/contracts-and-jwt.md) oku.

## Uygulama sınırları

- `API → Application → Domain`; Infrastructure uygulama arayüzlerini gerçekleştirir. Domain içine EF, HTTP veya JWT framework bağımlılığı taşıma.
- HTTP katmanı ince olsun; kullanım senaryoları, transaction ve iş kuralları Application/Domain'de kalsın.
- Request/response DTO'larını EF entity'lerinden ayır. Sunucuya ait kimlik, gerçek süre ve tamamlanma alanlarını genel update üzerinden yazdırma.
- Kullanıcı kararı: basit JWT Bearer, `exp` içermeyen süresiz access token; refresh token/tablo/endpoint/rotation veya Identity cookie oturumu yok.
- İmzalı JWT üret; HS256, imza, issuer ve audience kontrolü sürer. `exp` yokluğunu kabul et; token üreticisinin gizlice varsayılan expiration eklemediğini sınanmış token üzerinden doğrula. Referanstaki lifetime ayrımını uygula.
- Basit Users/ExternalLogins modeli kullan. Hazır PasswordHasher bağımsız kullanılabilir; bu, UserManager/SignInManager/Identity şeması kurmak anlamına gelmez. Özel parola hash algoritması yazma.
- API isteği `Authorization: Bearer` ile gelir. Mevcut kullanıcı `sub` claim'inden çözülür; sahipliği liste, ayrıntı, mutation, nested kaynak ve SignalR grubunda doğrula.
- Google'ın doğrulanmış ID token'ını yerel kullanıcıya eşle ve aynı uygulama JWT'sini üret. Google kanıtının imza/audience/issuer/expiry kontrolünü uygulamanın süresiz politikasıyla kapatma.
- Logout yerel token/cache/bağlantıyı temizler; eski token sunucuda revoke edilmiş sayılmaz. Denylist, token-version veya oturum mağazasını kullanıcı talebi olmadan ekleme.
- Browser token'ı merkezi auth adaptörüyle localStorage'da saklar; logout temizler. Private SSR/cookie-BFF veya refresh retry kurma. Sunucu token'ı login yanıtı dışında log/URL'ye yayma; SignalR'ın standart bearer taşıma istisnasını referanstan oku.
- Google e-postası eşleşti diye hesap birleştirme; link için mevcut yerel JWT ve Google kanıtı gerekir.
- Süreli/tek kullanımlık password-reset kodu access token değildir. HTTPS, parola hash'i, input validation ve temel giriş limiti korunur. Bearer yerine cookie otomatik gönderilmediği için API'ye cookie-CSRF sistemi ekleme. Rol/MFA/cihaz risk sistemi kapsamda değildir.
- Validation ve hatalarda `ProblemDetails`; sürüm uyuşmazlığında açık conflict kodu kullan. İç istisna ve secret döndürme.

## Teslim

İlgili HTTP integration testlerini, OpenAPI değişikliğini ve doğrulanan davranışı raporla. Eksik provider ayarını sahte başarıyla örtme. Domain becerilerinin plan/süre kurallarını endpoint içinde yeniden tanımlama.

## Güncel geliştirme kimlik kararı — 15 Ekim 2026

Yalnız e-posta/parola etkin. Şifrede yalnız en az 6 karakter şartı vardır; ek karmaşıklık, üst uzunluk politikası veya e-posta onayı yoktur. Register doğrudan JWT verir. Google varsayılan `Google:Enabled=false` ile kapalıdır; client ID eklemek tek başına etkinleştirmez. Google gerçek sağlayıcı smoke kabulü kullanıcı kararıyla ertelenmiştir; geliştirmeyi bloke etmez. Yeniden etkinleştirilirse Google proof doğrulama kuralları aynen geçerlidir. Parola kurtarma e-postası kayıt onayı değildir.

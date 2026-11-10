# Google giriş entegrasyonu doğrulaması

10 Kasım 2026 (Europe/Istanbul).

## Sonuç

Google giriş/kayıt ve açık hesap bağlama mevcut API, kullanıcı modeli, HttpOnly oturum ve profil ekranına entegre edildi. İlk değişiklikler Antigravity/Gemini ile yazıldı; kota dolduktan sonra kullanıcının onayıyla Codex kalan entegrasyonu ve düzeltmeleri tamamladı.

- Doğrulanmış Google `sub` harici kimliğin anahtarıdır. Aynı e-postalı Gmail/Workspace hesabı mevcut kullanıcı ID'sine bağlanır; görevler, parola ve diğer veriler korunur. Google'ın yetkili olmadığı üçüncü taraf e-postalar önce mevcut parolayla giriş ve açık bağlama ister.
- Ad/soyad ve fotoğraf ilk aktarımda alınır; kullanıcının düzenlemeleri korunur. Fotoğraf kaldırma Google fallback'ini de kaldırır, sonraki giriş fotoğrafı geri getirmez. Cloudinary kapalıyken Google fotoğrafı kullanılabilir ve kaldırılabilir.
- Tarayıcı Google girişi yalnız `UserSummary` ve HttpOnly cookie döndürür. Token'lar tarayıcı depolamasına yazılmaz. Nonce, kısa ömürlü korumalı challenge cookie, Origin ve CSRF kontrolü uygulanır. Geçersiz Google bağlama kanıtı mevcut uygulama oturumunu kapatmaz.
- Kullanıcının sağladığı Web application Client ID, git tarafından izlenmeyen `API/.local/api.env` dosyasına eklendi ve `Google__Enabled=true` yapıldı. Client Secret aktarılmadı. `API/.env.example` boş ve kapalı örnek olarak korundu.

## Kontroller

| Kontrol | Sonuç |
| --- | --- |
| .NET çözümü, Release | Başarılı; 0 hata, 0 uyarı |
| Backend birim testleri | 230 geçti |
| İlgili API entegrasyon senaryoları | 116 farklı senaryo geçti; gerçek, ayrı PostgreSQL 18.6 üzerinde |
| Google API son kontrolü | 20 senaryo geçti; bozuk/süresi dolmuş nonce, sahiplik, bağlama ve yarışlar dahil |
| UI birim testleri | 819 geçti |
| Playwright Google akışı | Masaüstü ve mobil Chromium'da toplam 8 test geçti |
| UI production build | Başarılı |
| UI TypeScript ve API tip/politika tutarlılığı | Başarılı |
| UI lint | Hata yok; değiştirilmeyen recurrence.spec.ts içindeki iki mevcut kullanılmayan değişken uyarısı var |
| EF model/migration karşılaştırması | Bekleyen model farkı yok |
| Docker Compose yapılandırması | Başarılı |

API test grupları `GoogleAuthTests`, `AuthSessionTests`, `SimpleLoginTests`, `ProfileTests`, `MigrationUpgradeTests`, `AuthTests`, `PasswordResetTests`, `PasswordChangeTests` ve `AuthConfigurationTests` sınıflarını kapsar. İlk grupta 55, ek auth kontrollerinde 58, son Google kontrolünde 20 test çalıştı; tekrar edilenler çıkarıldığında 116 farklı senaryo vardır. Google testi için provider doğrulayıcısı yalnız test sunucusunda değiştirilir; production'da `Google.Apis.Auth` imza/issuer/audience/süre doğrulamasını yapar.

OpenAPI ve frontend sözleşmesi **222 controller işlemi, 227 somut işlem, 308 şema** içerir. Doküman/type üretimi gerçek uygulama metadata'sından yapıldı; ilgisiz modüllerdeki mevcut HTTP örneklerinin kaynak kayıtları korundu.

## Sınırlar

- Gerçek Client ID canlıya uygulandı. İlk canlı kontrolde login/register metadata'sındaki eski `no-referrer` ayarının GIS origin doğrulamasını engellediği görüldü; bu iki sayfa `strict-origin` olarak düzeltildi. Yalnız HTTPS site kökü gönderilir; sayfa yolu ve sorgu gönderilmez. Parola sıfırlama ve avatarın `no-referrer` davranışı korunur. Tarayıcı regresyon testleri artık GIS isteğinin yalnız origin Referer'ını aldığını da doğrular. Düzeltmeden sonra üretim UI'ına karşı kontrollü endpoint taklitleriyle 8 masaüstü/mobil test yeniden geçti; ilgili CSP/SEO birim testlerinin 47'si de geçti. Gerçek sitede yenileme sonrası Google buton isteği 200 döndü ve tarayıcı konsolunda hata kalmadı. Playwright testlerinde GIS kontrollü olarak taklit edilir; gerçek Google hesabıyla popup ve hesap kabulü, [kurulum rehberindeki](google-auth-setup.md) manuel kontrolde tamamlanmalıdır. Firefox/WebKit ve fiziksel cihaz kabulü bu çalışma kapsamında çalıştırılmadı.
- Genel `validate-frontend-docs.py` denetimi depoda bulunmayan `API-AGENTS.md` girdisi nedeniyle çalışamadı. OpenAPI üretimi, şema/politika hash ve sayım kontrolleri ile `api:check` başarıyla tamamlandı.
- Testler ayrı veritabanlarında çalıştırıldı. 10 Kasım 2026 tarihinde canlı veritabanının doğrulanmış `pg_dump -Fc` yedeği alındıktan sonra `20261109225712_AddGooglePictureUrl` migration'ı canlıya uygulandı; API ve UI Docker imajları yeniden derlenip başlatıldı. API readiness 200/Healthy, canlı Google config 200/enabled/Client ID eşleşmesi ve nonce doğrulandı. Challenge cookie Secure/HttpOnly/SameSite=Strict ve config no-store başlıkları kontrol edildi. `https://www.navortal.com.tr/login` üzerinde gerçek GIS SDK ve Google buton iframe'i yüklendi.

Etkinleştirme için [Google Client ID alma ve env ayarları](google-auth-setup.md) rehberini izleyin. Yeni nullable profil alanı için `20261109225712_AddGooglePictureUrl` migration'ı canlıda uygulanmıştır.


## Google giriş alanı tasarımı

Giriş ve kayıt ekranlarında ana butonla Google butonu arasına ince bir “veya” ayracı eklendi. Resmî GIS outline butonu form genişliğini izler; ResizeObserver ile ekran boyutu değişiminde, yeni giriş challenge'ı oluşturmadan yeniden hizalanır. Yüklenme/bekleme, koşul kabulü ve yeniden deneme durumları ortak renk ve boşluklarla düzenlendi. Google kapalıyken ayraç dahil alan gizlenir.

- Playwright masaüstü/mobil Google senaryoları: 8 geçti. 320/390/1280 px boyut değişiminde buton hizası, koşul kabulü, eski callback, SDK hatası ve kapalı yapılandırma kontrol edildi.
- Canlıda gerçek Google SDK ve buton istekleri 200; 1440 px masaüstü, 390/320 px mobil giriş ve mobil kayıt ekranlarında taşma ve tarayıcı hatası yok. Görseller Playwright ile alınıp incelendi.
- Prettier ve ilgili ESLint kontrolü başarılı; Docker üretim derlemesi/TypeScript başarılı. Yalnız UI servisi yeniden yayımlandı.

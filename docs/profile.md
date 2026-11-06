# Profil ve Cloudinary — 29 Ekim 2026

Wire uçları ve DTO alanları [auth modülünde](frontend-api/auth.md) ve [OpenAPI](openapi-v1.json) kaynağındadır. Beş yeni işlemle213 OpenAPI/218somut işlem,292şema vardır. Bu bakım ana MVP sayacını artırmaz.

`GET/PUT /api/account/profile`, `PUT/DELETE /api/account/profile/photo`, `GET /api/account/profile/photo?version=...`. Her yazı `expectedUserId` + mevcut `user.profileVersion` ister; expectedUserId bir hedef seçici değildir, doğrulanmış JWT/cookie sahibiyle uyuşmazsa404 verilir. Bu, cookie başka hesapla değiştiği halde eski ekranın yanlış hesaba yazmasını önler. Kimlik, parola ve oturum değişmez; sürüm/owner/CSRF kuralları sürer. Key yok; belirsiz yazı otomatik tekrarlanmaz.

İsteğe bağlı profil fotoğrafı en fazla2MiB gerçek JPEG/PNG/WebP'dir. MVC request limiti3MB; salt base64 azami2796204karakter. Byte imzası ön kontroldür; Cloudinary görüntüyü decode edip 256×256 JPEG'e dönüştürür, metadata profilini temizler. SVG/GIF/uzak URL yükleme yoktur. Cloudinary public ID ve klasörü yalnız sunucuda `p1/<JWT-user-id>/<server-random-guid>` olarak üretilir. İstemcinin uploadId'si yalnız uzlaştırma sürümüdür; aynı niyetin eşzamanlı iki isteği ayrı Cloudinary varlığı kullanır, CAS kaybedeni kazananın dosyasını silemez.

Cloudinary `authenticated` delivery type; orijinal ve türetilmiş dosyalar imzasız açılmaz. SHA256 teslim imzası backend'de oluşturulur. API sabit HTTPS upload/CDN hostlarını kullanır, yönlendirmeleri izlemez. Tarayıcıya Cloudinary URL/imza/anahtar dönmez; fotoğraf mevcut sahibin `photoVersion` eşleşmesiyle private/no-store/nosniff image/jpeg olarak sunulur. Sahip değişiminde eski sürüm404 olur.

Fotoğraf yenilenince/kaldırılınca önce DB bağı CAS ile değiştirilir, sonra eski varlık best-effort silinir. Başarılı DB yazısı dış sağlayıcı temizlik hatasıyla geri alınmaz. Sağlayıcı/DB belirsizliğinde korumalı yetim varlık kalabilir; mevcut kapsamda kalıcı temizlik kuyruğu yoktur. Başarılı fotoğraf değiştirme/kaldırma akışı gerçek sağlayıcıyla test edilir; bu ifade bütün dış arızalarda silme garantisi değildir.

Yerel anahtarlar yalnız ignore edilen `API/.local/cloudinary.env` dosyasındadır. Launcher beyaz listeli `Cloudinary__Enabled/CloudName/ApiKey/ApiSecret` alanlarını literal olarak process environment'a alır, dosyayı çalıştırmaz veya loglamaz. Dosya OS erişimi mevcut kullanıcı ve SYSTEM ile sınırlandırılmıştır; `.gitignore`/Docker context dışında kalır. `.env.example` boş yer tutucudur. Production'da secret manager/enjekte edilen environment kullanılmalıdır; `NEXT_PUBLIC_*` veya frontend env alanına kopyalanmaz. Sağlayıcı anahtarı döndürme/yayın yapılmadı.

Gerçek tarayıcı testi için yalnız API hostlarına ignored env aktaran `UI_REAL_PROFILE=1` kullanılır. Next build/server ve Playwright istemcisine provider anahtarları verilmez. Testler yalnız rastgele sahipli DB ve sentetik resimlerle çalışır; gerçek kullanıcı fotoğrafı test fixture'ı değildir.

# Google ile girişi etkinleştirme

Gereken tek Google değeri **Web application Client ID**. Client Secret, Google API anahtarı veya Google access/refresh token gerekli değil. API, Google ID token imzasını ve bu Client ID için düzenlendiğini doğrular.

## 1. Client ID alma

1. [Google Cloud Console](https://console.cloud.google.com/) içinde proje oluştur veya mevcut projeyi seç.
2. **Google Auth Platform → Branding** bölümünde uygulama adını Navortal, yetkili alan adını `navortal.com.tr` yap. Destek adresi olarak sana ait adresi kullan. Bağlantılar:
   - Ana sayfa: `https://www.navortal.com.tr`
   - Gizlilik: `https://www.navortal.com.tr/privacy-notice`
   - Koşullar: `https://www.navortal.com.tr/terms`
3. **Audience** bölümünde genel kullanıma açık uygulama için External seç. Workspace kuruluşu ile sınırlandırmak istiyorsan Internal yalnız o kuruluşun kullanıcılarını kabul eder. Testing/Production durumunu burada yönetebilirsin. Yalnız `openid email profile` kullanan Sign in with Google akışı, Google'ın temel kimlik kapsamlarına ait test kullanıcısı istisnasına tabidir; ek Google API kapsamları eklersen test kullanıcısı ve doğrulama kuralları değişir.
4. **Data Access** bölümünde yalnız temel `openid`, `email` (`userinfo.email`) ve `profile` (`userinfo.profile`) kapsamlarını kullan.
5. **Clients → Create client → Web application** seç. Authorized JavaScript origins alanına kullanacağın adresleri ayrı satırlar olarak ekle:
   - `https://www.navortal.com.tr`
   - Yerel geliştirme için `http://localhost:3100`
   - Bu adresi de kullanacaksan `http://127.0.0.1:3100`
6. Kaydedince verilen, `.apps.googleusercontent.com` ile biten **Client ID** değerini kopyala. Origin alanına yol veya `/api` ekleme. Bu entegrasyon popup callback kullandığı için redirect URI eklemek gerekmez.

Google Console marka veya alan adı doğrulaması isterse oradaki adımları tamamla. Marka incelemesini **Branding** bölümünden başlat: `Ready to publish` sonucu onaylanan markanın yayımlanmaya hazır olduğunu gösterir; ardından `Publish branding` ile yayımla. `Need to fix issues` durumunda `View issues` ayrıntılarını düzelt. Ek inceleme ve veri erişim durumları **Verification Center** bölümünde izlenir. Audience içindeki Production durumu marka doğrulamasından ayrıdır. Gerçek Google hesabıyla ilk kontrol, yapılandırma tamamlandıktan sonra yapılır.

## 2. Projedeki boş alanı doldurma

Docker Compose'un API için okuduğu `API/.local/api.env` içine alanlar eklendi. Mevcut diğer ayarlara dokunmadan şu iki satırı doldur:

```dotenv
Google__Enabled=true
Google__ClientId=BURAYA_WEB_APPLICATION_CLIENT_ID
```

`API/.env.example`, `Google__Enabled=false` ve `Google__ClientId=` şeklinde boş başlangıç örneğini içerir. Gerçek Client ID yalnız git tarafından izlenmeyen yerel env dosyasında tutulur; Client Secret kopyalanmaz. Yerel .NET süreci için bu anahtarlar süreç ortamında ayarlanmalıdır; .NET `.env` dosyasını kendiliğinden okumaz. Kök `.env` veya UI için ayrı Google değeri gerekli değildir: arayüz ayarı API'den okur.

## 3. Yeni sürümü çalıştırma

Depo kökünden, mevcut Docker Compose kurulumunda:

```bash
docker compose up -d --build
```

Compose'un migration servisi yeni `AddGooglePictureUrl` migration'ını API açılmadan önce uygular; API ve UI yeni kodla oluşturulur. Yalnız `restart`, değişmiş env dosyasını veya yeni kodu konteynere taşımaz. 10 Kasım 2026 tarihinde kullanıcı tarafından sağlanan Client ID ile canlı dağıtım yapıldı; migration uygulandı, API readiness ve gerçek Google butonunun yüklenmesi doğrulandı.

.NET ile elle çalıştırıyorsan önce API'de migration'ları uygula, sonra API ve UI'yı yeniden derleyip çalıştır. UI `npm` kullanır. Birden fazla API örneği çalıştırılırsa kısa ömürlü challenge doğrulaması için Data Protection anahtarlarının paylaşılması veya aynı örneğe yönlendirme gerekir.

## 4. Beklenen davranış ve kontrol

- Ayar kapalı veya Client ID boşsa Google butonu gösterilmez. API `GET /api/auth/google/config` için `{ "enabled": false, "clientId": null, "nonce": null }` döndürür.
- Google ile yeni girişte doğrulanmış ad, soyad, e-posta ve varsa fotoğraf alınır. Fotoğraf yoksa adın baş harfi kullanılır. Kullanıcının sonradan yaptığı değişiklikler sonraki girişte ezilmez.
- Aynı normalize e-postada doğrulanmış **Gmail** veya **Google Workspace (`hd`)** kimliği mevcut kullanıcıya bağlanır. Mevcut kullanıcı ID'si, görevleri, verileri ve parolası korunur.
- Google hesabında başka sağlayıcıya ait e-posta kullanılıyorsa önce mevcut e-posta/parolayla giriş yap, sonra **Ayarlar → Profil** içindeki resmi Google butonuyla bağla. `google_link_required` bu yönlendirmeyi gösterir.
- Uygulamaya yüklenen fotoğraf Google fotoğrafından önce gelir. Fotoğrafı kaldırmak Google fotoğrafını da kaldırır; sonraki giriş onu geri getirmez. Google fotoğrafı gösterildiğinde tarayıcı Google'a görsel isteği gönderir; referrer gönderilmez.
- Tarayıcı oturumu HttpOnly çerezde kalır. Google token'ı veya uygulama JWT'si localStorage/sessionStorage'a yazılmaz. Tarayıcı girişi, kısa ömürlü `__Host-adhd_google_challenge` (yerelde `adhd_google_challenge`) çerezi ve nonce doğrulaması kullanır.

Gerçek hesapla yeni giriş, eski Gmail hesabıyla birleşme, mevcut parola ile giriş ve fotoğraf kaldırmanın kalıcılığını kontrol et. Gerçek Google popup girişinin son kabulü kendi Google hesabınla bu manuel adımda yapılmalıdır. Otomatik tarayıcı testleri GIS'i kontrollü olarak taklit eder; API entegrasyon testleri gerçek PostgreSQL kullanır.

## Kaynaklar

- [Google Identity Services kurulumu](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [ID token doğrulama ve e-posta sahipliği](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Resmi giriş butonu](https://developers.google.com/identity/gsi/web/guides/display-button)
- [JavaScript API ve nonce](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Google uygulama kitlesi ve Testing istisnası](https://support.google.com/cloud/answer/15549945?hl=en)

- [Google marka doğrulaması ve durumları](https://support.google.com/cloud/answer/15549049?hl=en)

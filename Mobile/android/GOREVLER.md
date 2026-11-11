# Android: biten ve kalan görevler

Son güncelleme: 11 Kasım 2026.

**Durum:** geliştirme sürümü. Test APK'sı üretildi; uygulama henüz mağaza yayınına
hazır değil. Tamamlanan kod işleri gerçek telefonda doğrulanmış özellikler anlamına gelmez.

## Biten işler

- [x] `tr.com.navortal` paket adıyla Android projesi ve Gradle Wrapper oluşturuldu.
- [x] Navortal'ın mevcut Next.js arayüzünü `/planning` adresinden açan WebView kabuğu yazıldı.
- [x] HTTPS ve Navortal ana çerçevesiyle sınırlı sayaç mesajı bağlantısı yazıldı.
- [x] Sunucunun onayladığı başlatma, duraklatma, devam etme ve bitirme durumları UI'den Android'e bağlandı.
- [x] Birikmiş aktif süreyi kullanan yerel kronometre bildirimi yazıldı. Mola süresi sayılmıyor; saniyelik ağ isteği gerekmiyor.
- [x] Sayaç için bildirim izni isteme, tek bildirim kimliğiyle güncelleme ve çıkışta temizleme kodu yazıldı.
- [x] Eski sürüm ve eski sunucu durumlarının sayacı geri almaması için doğrulama yazıldı.
- [x] Geri hareketi, uygulamaya dönüşte durum yenileme ve dosya seçme bağlantısının ilk sürümü yazıldı.
- [x] Test APK'sı derlendi: `app/build/outputs/apk/debug/app-debug.apk`.
- [x] 6 Java testi ve Android lint kontrolü geçti. Lint sonucu 0 hata, 6 uyarı; uyarılar yayın hazırlığında tekrar değerlendirilecek.
- [x] Web köprüsü için masaüstü/mobil Chromium üzerinde 8 senaryo geçti. Telefon köprüleri taklit edildi; Android sistem bildirimi test edilmedi.
- [x] Firebase ve OAuth hazırlık şablonu, yerel dosya yerleri ve hazırlık kontrol komutu oluşturuldu. Kontrol komutunun 8 senaryosu geçti.

## Kalan geliştirme işleri

- [ ] İnternet kesintisi ve WebView yükleme hatası ekranı, yeniden deneme ve bağlantı geri geldiğinde toparlanma.
- [ ] Uygulamanın yeniden oluşturulması, süreç kapanması ve tekrar açılması sırasında oturum/sayaç davranışının tamamlanması.
- [ ] İznin veya bildirim kanalının sonradan kapatılması ve telefon ayarlarından dönüş davranışı.
- [ ] Google girişinin Android Credential Manager bağlantısı. Mevcut nonce, kimlik doğrulama ve hesap bağlama kontrolleri korunacak; giriş WebView açılır penceresine bırakılmayacak. Bu bağlantı henüz yazılmadı.
- [ ] Firebase Android SDK, bildirim alıcı servisi, cihaz tokenı alma/yenileme ve izin bağlantıları. Bunlar henüz eklenmedi.
- [ ] API'de FCM cihaz kaydı, kullanıcıya göre sahiplik, çıkışta kayıt kapatma ve FCM gönderimi. Mevcut web/PWA Web Push akışı korunacak.
- [ ] Okunmuş/eski bildirimi bastırma, çift bildirimi önleme, doğru ekrana yönlendirme ve teslim geri bildirimleri.
- [ ] Başka cihazdaki duraklatma/bitirme işlemlerini Android uygulaması arka planda veya kapalıyken bildirim sayacına yansıtma. Mevcut yerel sayaç kodu bu uzaktan güncelleme akışını sağlamıyor.

## Kullanıcının daha sonra oluşturacağı kayıtlar

Firebase ve Android OAuth kurulumu kullanıcının isteğiyle açık bırakıldı.

- [ ] Mevcut web Google girişinin bulunduğu Google Cloud projesinde Android OAuth istemcisi oluşturulacak.
- [ ] Android istemcisi `tr.com.navortal` paket adı ve aşağıdaki test APK imzasıyla kaydedilecek. Başka anahtarla derlenen APK için SHA-1 yeniden okunacak.

```text
7C:73:0F:66:C7:23:98:3C:A2:10:DC:60:F9:6F:B4:E7:95:58:3E:A9
```

- [ ] `/opt/navortal/Mobile/.local/android-setup.json` içindeki `google.webClientId`, `google.androidClientId` ve `google.certificateSha1` tamamlanacak. Mevcut web istemcisi silinmeyecek; API'deki web istemci kimliğinin yerine Android kimliği konmayacak.
- [ ] Firebase mevcut Navortal Google Cloud projesine eklenecek ve `tr.com.navortal` Android uygulaması kaydedilecek.
- [ ] İndirilen dosya `/opt/navortal/Mobile/.local/google-services.json` konumuna konacak.
- [ ] API'nin FCM gönderimi için sunucu kimlik doğrulama yöntemi belirlenecek. Hizmet hesabı dosyası kullanılacaksa `/opt/navortal/API/.local/firebase-service-account.json` altında saklanacak, mobil pakete konmayacak. Dosya ve onu okuyacak API entegrasyonu henüz yok.
- [ ] Play Store aşamasında Play App Signing **uygulama imzasının** SHA-1'i için de Android OAuth kaydı hazırlanacak; test ve upload anahtarlarıyla karıştırılmayacak.

Şablon: [android-setup.example.json](../config/android-setup.example.json).
Yerel kayıtlar Git dışında tutulur. Dosyaları eklemek SDK/API entegrasyonlarını
etkinleştirmez. Mevcut API'nin Google ayarları bu hazırlık dosyasından okunmaz.

Repo kökünden hazırlık kontrolü:

```sh
node Mobile/tools/check-android-setup.mjs
```

Eksikler `BEKLİYOR`, hatalı dosyalar `GEÇERSİZ` olarak gösterilir. Bu komut yalnız
yerel biçimi ve Firebase paket adını kontrol eder; Google Cloud kaydını veya gerçek
cihazda çalışmayı doğrulamaz. Dosya içeriklerini yazdırmaz.

## Gerçek Android cihazda kalan doğrulamalar

- [ ] E-posta ile giriş, yeniden açılınca oturumun korunması, çıkış ve hesap değişimi.
- [ ] Google ile giriş, iptal, hata ve mevcut hesaba Google hesabı bağlama.
- [ ] Bildirimde sayacın ilerlemesi, duraklaması, birikmiş süreden devam etmesi ve bitince kapanması.
- [ ] Ekran kilidi, uygulamanın kapanması, izin geri alma, yeniden açma ve başka cihazdan çalışma değişikliği.
- [ ] Uygulama açık/arka planda/kapalıyken hatırlatmalar; izin kapalıyken ve hesap değişiminde doğru alıcı.
- [ ] Klavye, geri hareketi, ekran döndürme, dosya seçme ve erişilebilirlik.

## Yayın öncesi kalanlar

- [ ] UI'deki yeni sayaç köprüsü sunucuda yayımlanacak. Mevcut canlı arayüzde bu bağlantı henüz yok; yalnız APK dağıtmak sayacı etkinleştirmez.
- [ ] Uygulama simgesi, release imzalama, sürümleme ve AAB hazırlanacak. Test APK'sı mağaza yayın paketi değildir.
- [ ] Mağaza bilgileri, gizlilik/Veri Güvenliği beyanları ve geliştirici hesabına uygulanıyorsa kapalı test tamamlanacak.
- [ ] Gerçek cihaz doğrulaması ve yayın öncesi son kontroller tamamlanacak.
- [ ] Commit, push ve canlıya alma kullanıcı istediğinde yapılacak; bu Android geliştirmesi için henüz yapılmadı.

## Daha sonra planlanacak

- [ ] İlk karşılama ekranının içeriği ve tasarımı kullanıcıyla ayrıca planlanacak.

iOS bu Android listesinin kapsamı dışında ve kullanıcının isteğiyle bekliyor.

## Kaynaklar

- [Android Google giriş kurulumu](https://codelabs.developers.google.com/sign-in-with-google-android)
- [İmza parmak izleri](https://developers.google.com/android/guides/client-auth)
- [Firebase Android kurulumu](https://firebase.google.com/docs/android/setup)
- [FCM Android kurulumu](https://firebase.google.com/docs/cloud-messaging/android/get-started)

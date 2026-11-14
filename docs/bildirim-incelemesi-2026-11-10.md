# Bildirim incelemesi — 10 Kasım 2026

## Kapsam ve doğrulanan kök neden

İnceleme zil paneli, cihaz etkinleştirme, tarayıcı izni, Service Worker, alıcı hesabı, abonelik kaydı, VAPID, arka plan işleri, gönderim, ses tekilleştirme ve tıklama bağlantısını kapsar. Masaüstü düzeltmesi mevcut sayfa ve panel tasarımını korur.

Canlı `navortal-api-1` ortamında hiçbir `Push__*` ayarı yoktu. Uygulamanın `Push.Enabled=false` varsayılanı geçerliydi. Tarayıcıdaki karşılığı `push-config: {enabled:false,publicKey:null}` ve devre dışı etkinleştirme düğmesidir. Gerçek yerel API ile bu durum yeniden üretildi. Zil paneli açılabiliyordu; uygulama içi kutu ile harici cihaz bildirimi farklı kanallardır.

## Düzeltilen sorunlar

| Bulgu | Etkisi | Düzeltme |
| --- | --- | --- |
| Üretimde VAPID yapılandırması yok | Kullanıcı cihaz bildirimlerini açamaz | API'ye özel, kalıcı ve git dışında `push.env`; mevcut anahtarı değiştirmeyen kurulum/doğrulama scripti; Compose bağlantısı |
| Arayüz yalnız sunucudaki cihaz etiketini kontrol ediyordu | Yerel abonelik silinse bile “Açık” görünebilirdi | Gerçek `getSubscription`, izin, geçerlilik ve VAPID anahtarı kontrolü; odak/görünürlük/elle yenilemede tekrar okuma |
| Eski VAPID anahtarlı yerel abonelik yeniden kullanılabiliyordu | Açıldığı sanılan kanal provider tarafından reddedilebilirdi | Açık kullanıcı etkinleştirmesinde eski/süresi dolmuş aboneliği değiştir; uyumlu aboneliği koru |
| İzin beklerken hesap değişimi yeterince kontrol edilmiyordu | Eski etkileşim yeni hesapta yazım başlatabilirdi | Asenkron izin, hazırlık, abonelik ve tercih adımları arasında owner/epoch kontrolü |
| İzin, ağ ve yerel depolama hataları tek mesajdı | Kullanıcı nasıl toparlayacağını anlayamazdı | Ayrı açıklama ve yeniden deneme; ret durumunda gelen kutusu korunur |
| IndexedDB açılışı engellendiğinde veya yanıtsız kaldığında hazırlık bitmeyebilirdi | Etkinleştirme süresiz beklerdi | Engellenen açılışta hata; yanıtsız açılışta 1,5 saniye sınırı; geç dönen bağlantıyı kapat; tüm alıcı hazırlığı için ayrıca üst zaman sınırı |
| Genel bildirim tercihi kapalıyken cihaz kaydı başarı mesajı tek başına yeterli değildi | Bildirim beklenir fakat politika göndermez | Genel kapalı tercihi açıkça belirt; tercihi kendiliğinden açma |
| Native gösterimden önce kalıcı tekilleştirme kaydı tüketiliyordu | `showNotification` hatasından sonra aynı olayın tekrar teslimi engellenirdi | Gösterim başarısızsa yalnız o alıcı/olayın makbuzunu serbest bırak; başarılı gösterimi tekilleştirmeye devam et |
| Eski pasif aboneliği açmak 20 aktif cihaz sınırını aşabiliyordu | Aynı endpoint'i yeniden açarak sınır aşılırdı | Sınırı yeni kayıt ve yeniden etkinleştirmede kontrol et; mevcut aktif cihazın yenilenmesine izin ver |
| Cihaz listesi en yeni 100 kaydı döndürüyordu | Çok sayıda pasif geçmiş kaydı eski aktif cihazı listeden düşürebilirdi | En fazla 20 aktif cihazı önce listele, sonra pasif geçmişi getir; toplam 100 kayıt sınırını koru |

Sunucuya veya loglara görev adı, abonelik endpoint'i/anahtarları, JWT ya da VAPID private key eklenmedi. İzin istemi yalnız kullanıcının etkinleştirme tıklamasında başlar. Yenileme ve durum kontrolü otomatik izin istemez.

## Korunan davranışlar ve inceleme bulguları

- Sunucu olay zamanını, kaynak geçerliliğini, sessiz saatleri ve iki dakikalık tazeliği belirler. Açılışta eski alarm yığını çalınmaz. İşlemci yeniden denemeleri sınırlıdır; 404/410 aboneliği pasifleştirir.
- Zil açıldığında mevcut hazır kayıtların toplu okunması mevcut ürün davranışıdır. Sonradan gelen kayıtlar okunmamış kalır. Mobil planda bunun görünürlük ve erişilebilirlik etkisi ayrıca değerlendirilmelidir.
- Zil rozeti ilk 10 kayıttan okunmamışı sayar. Daha eski okunmamış kayıtlar bu pencerenin dışında kaldığında eksik gösterge oluşabilir. Bu inceleme bu sınırlamayı saptadı; tam okunmamış sayısı için sunucudan bağımsız sayaç sözleşmesi gerekir. Bu yayında tüm listeyi arka planda tarayan bir çözüm eklenmedi.
- Tercihlerde ön süre seçimi plan başlangıcı satırındadır; sunucuda aynı `leadSeconds` başlangıç, bitiş ve son teslim türlerine uygulanır. Mevcut politika bu yayında değiştirilmedi; mobil metinleri bu kapsamı açıkça anlatmalıdır. API'nin `specialDay` tercihi genel tür anahtarları arasında ayrı sunulmuyor; özel gün bildirimi kontrolü mobil tercih planına dahil edilmelidir.
- Push gönderimindeki son kaynak kontrolü ile dış HTTP isteği arasında kaçınılmaz bir yarış penceresi vardır. Uygulama içi okundu kaydı mevcut push kuyruğunu otomatik iptal etmez. Kanal politikası değişikliği ayrı kabul testleriyle ele alınmalıdır.
- Sekme sesi ve native ses ortak atomik makbuz kullanır. Özel ses için tarayıcı etkileşimi gerekir; işletim sistemi veya sessiz mod üzerinde garanti verilemez.
- Service Worker tıklaması yalnız doğrulanmış aynı origin bildirim yoluna gider; alıcı hesabı eşleşmezse gösterim/gezinti yapılmaz. Oturum kapanınca kalıcı alıcı bağlamı temizlenir.
- Mobil arka plan teslimini sayfa zamanlayıcısına bağlamak güvenilir değildir. Mevcut sunucu kuyruğu ve Web Push temeli korunmalıdır.

## Doğrulama yöntemi

API testleri üretim verisi yerine rastgele, sonradan kaldırılan PostgreSQL veritabanları kullanır. Tarayıcı senaryoları izole API ve gerçek oturum formuyla çalışır. Kontrollü tarayıcı testlerinde yalnız sağlayıcı aboneliği taklit edilir; API kayıt/tercih yazımları gerçektir. Native Worker testi CDP ile push enjekte ederek gerçek `showNotification/getNotifications` yolunu sınar; bu, dış sağlayıcı teslimi değildir.

Bu sunucudaki kurulu Chromium ve Google Chrome ile taklitsiz abonelik denemeleri tarayıcı bildirim hizmeti bağlantı hatasıyla sonuçlandı. Bu ortamdan gerçek dış sağlayıcı teslimi ve fiziksel Windows/macOS bildirimi doğrulanmış sayılmaz. Başarısızlık kullanıcıya bağlantı hatası olarak gösterilir; “Açık” veya başarılı teslim olarak sunulmaz.

## Son kabul ve canlı yayın

| Kontrol | Sonuç |
| --- | --- |
| Bildirim/push/hatırlatma API entegrasyon paketi | Son kodda 37 test başarılı; cihaz sınırı ve 106 kayıt içinden aktif cihazı listeleme dahil |
| Bildirim/push/ses birim testleri | 90 test başarılı; depolama engeli/zaman aşımı ve başarısız native gösterimden sonra tekrar teslim dahil |
| Üretim UI imajıyla tarayıcı kabulü | 12/12 başarılı; gerçek API yazımları, izin reddi, çift tıklama, eski/eksik/uyumlu abonelik, yerel kapatma, bağlantı hatası, genel kapalı tercih, native Worker tekilleştirme, engelli depolama ve izin sırasında hesap değişimi |
| TypeScript, ilgili ESLint/Prettier, JavaScript/Python sözdizimi ve diff | Başarılı |
| API ve UI Docker üretim derlemeleri | Başarılı; çalışan canlı imajlar doğrulandı |
| Masaüstü 1440 ve mobil 390 piksel UX kontrolü | Yatay taşma ve JavaScript hatası yok; cihaz kartında WCAG 2 A/AA, 2.1 AA ve 2.2 AA kurallarıyla axe taramasında ihlal yok |
| Chrome DevTools MCP | Gerçek izin reddi ve toparlanma metni; worker hazırlığı; gerçek IndexedDB üzerinde tekilleştirme/serbest bırakma ve yanlış owner koruması doğrulandı |
| Canlı HTTPS kabulü | Gerçek form girişi, `enabled=true`, kalıcı public key eşleşmesi, kullanılabilir etkinleştirme düğmesi ve zil açma/kapatma başarılı |
| Canlı statik dosyalar | Giriş, worker ve alıcı deposu HTTP 200; iki JavaScript dosyası kaynakla birebir eşleşiyor |

Yayın 10 Kasım 2026 19:27 UTC'de tamamlandı. API veritabanı readiness ve UI giriş sayfası 200 döndü. Veritabanı dump'ı ve katalog okunabilirliği kontrol edildi; önceki API/UI imajları geri dönüş için korundu. Yeni migration gerekmedi. Önceki gün grubu kaldırma düzeltmesi de bu yayına dahildir.

Canlıdaki geçici kabul hesabının oturumları iptal edilip yalnız o hesaba ait kayıtlar temizlendi; önceden bırakılmış probe hesapları korundu. Yerel kabul konteynerleri, ağı, veritabanı ve geçici kimlik bilgileri temizlendi. Kalıcı `push.env` korundu. Diğer projelerin servisleri değiştirilmedi. Commit ve push yapılmadı.

Mobil için önerilen yeni davranışlar ve kalan UX işleri [ayrı planda](mobil-bildirim-plani-2026-11-10.md) açıklanır; bu mobil plan henüz uygulanmadı.

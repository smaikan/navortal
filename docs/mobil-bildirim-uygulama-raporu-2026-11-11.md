# Mobil bildirim uygulaması — 11 Kasım 2026

Durum: Yazılım geliştirmeleri aşamalı olarak canlıya alındı ve canlıda doğrulandı. Fiziksel cihaz kabulü gerektiren taşıyıcı önceliği/toplulaştırma kapalıdır. Commit/push yapılmadı.

[Kaynak plan](mobil-bildirim-plani-2026-11-10.md) ve [önceki masaüstü incelemesi](bildirim-incelemesi-2026-11-10.md).

## Uygulanan akış

- İlk girişte sistem izni istenmez. Başarıyla oluşturulan hatırlatmadan sonra cihaz hazır değilse engelleyici olmayan ayar bağlantısı çıkar. “Şimdi değil” ve ayarlara geçiş aynı tarayıcı oturumunda teklifi susturur. Reddedilmiş izin, kapalı genel/tür tercihi ve hazır cihaz teklif üretmez. Hesap/oturum değişiminde önceki oluşturma niyeti taşınmaz.
- iPhone/iPad normal tarayıcıda mevcut cihaz kartında ana ekrana ekleme adımları gösterilir. iPad masaüstü kullanıcı aracısı ve kurulu uygulama durumu da hesaba katılır. Android/masaüstünde kurulum zorunluluğu eklenmez. İzin verilmiş eksik/eski abonelik açık kullanıcı eylemiyle “Bağlantıyı yenile” üzerinden onarılır.
- Özel gün tür tercihi görünürdür. Önceden uyarı süresinin plan başlangıcı/bitişi ve son teslim kapsamı açıklanır; kayıtlı değerler korunur.
- Zil gerçek sunucu toplamını okur; son 10 bildirimden tahmin yapılmaz. Liste, sayaç ve toplu okundu aynı gelen kutusu filtresini kullanır. Görünmeyen ScheduleStart/ScheduleEnd plan sinyalleri, yalnız zil açıldı diye okundu sayılmaz. Toplu komutun özeti aynı owner kilidi/transaction içinde döner. Eski GET iptal edilir; daha eski komut makbuzu daha yeni sayacı ezmez. Komut sonrasında gelen yeni olaylar yeniden okunmamış görünür.
- Mobilde ilk dış dokunuş yalnız paneli kapatır. Arkadaki eylem sonraki yeni dokunuşta çalışır. Geri/ileri, kapatma ve zile odak dönüşü URL/geçmiş ile tutarlıdır; diğer sorgu parametreleri/ankor korunur. Panel bağlantıları doğru sayfaya gider. Dokunmatik cihazda yatay dönüş paneli kapatmaz. Mevcut zil/panel/alt pencere tasarımı korunur; güvenli ekran alanı, kaydırma ve sayfalama dokunma hedefleri iyileştirilir.

## Gönderim ve gözlem

P2 okundu gönderim kuralı `Push__SuppressReadDeliveries` ile P1'den bağımsız etkinleştirilir; varsayılanı `false` olduğundan önceki gönderim politikası yayında ayrı korunabilir. Etkinleştirildiğinde gönderim kararı verilmeden okunan olayın bekleyen teslimi Obsolete olur. Açık erteleme ReadAt'ı sıfırlar ve yeni tur açar. Doğrulama kararı verilmiş/başlamış dış isteğin geri alınması vaat edilmez; kullanıcı kilidi dış ağ isteği boyunca tutulmaz.

`notification_client_receipts` tablosu ve owner/CSRF korumalı endpoint'ler ayrı kanıtları tutar: sunucuda hazırlık, dış sağlayıcı kabulü, tarayıcının Displayed/Opened iddiası ve uygulamada okunma. Erteleme turları karışmaz; yinelenen makbuz ilk sunucu zamanını değiştirmez. Makbuz, bildirimin veya kaynağın sürümünü/okundu durumunu değiştirmez. Bildirim ayrıntısındaki isteğe bağlı “Teslim durumu” bölümü bu ayrımı gösterir; açık yenileme eylemi vardır.

Makbuzda başlık, gövde, endpoint, anahtar veya token tutulmaz. Worker, görünür bildirim başarılı olduktan sonra makbuz kuyruğuna yazar; kullanıcı bildirime dokunduğunda önce gezinme/odak gerçekleşir. Ayrı IndexedDB kuyruğu 256 kayıt/24 saat ile sınırlıdır. Her tetikte en çok 20 istek, 5 saniye ağ bütçesi ve hesap kontrolü uygulanır. Ağ/oturum/depolama sorunu bildirimi bozmaz; çevrimiçi/görünür olma/worker eşitleme olaylarında yeniden denenir. Çıkış temizliği başka hesabın kayıtlarını silmez.

## Doğrulama ve sınırlar

- Gerçek PostgreSQL entegrasyonları: 100 kayıttan eski okunmamışlar, tür/owner filtresi, toplu okundu-yeni Ready yarışı, hazırlanmış teslim olmadan makbuz reddi, owner/CSRF, tur ve ilk zaman idempotansı, okundu sonrası teslim iptali, ayrı politika etkinleştirmesi, açık erteleme ve dış istekteki okundu yarışı.
- Tarayıcı testleri: mobil dış dokunuş, geri/ileri/odak, doğrudan URL, filtre/ankor, bağlantılar, yatay dönüş, platform ve kurulum tablosu, eski GET, hatırlatma sonrası teklif ve oturumda susturma, içeriksiz kuyruk/yeniden deneme/hesap ayrımı/256 ve 20 sınırları; masaüstü abonelik onarımı ve native worker regresyonu.
- MCP Chrome incelemesi: 360/390/430 pikselde yatay taşma görülmedi; kapatma hedefi 44×44. 844×390 dokunmatik yatay ekranda panel açık kalıyor ve ekran içine sığıyor. Koyu görünümde açılma/kapanma akışı kontrol edildi.
- OpenAPI, endpoint kataloğu, DTO ve işlem politikaları/tipler güncellendi: 226 OpenAPI işlemi, 231 somut işlem, 316 şema. Önceki 175 HTTP örneği korundu.

Fiziksel iPhone/iPad ve Android cihaz mevcut değildi. Gerçek sağlayıcıdan kilit ekranına teslim, arka plan/kapalı uygulama, pil tasarrufu/odak modu, VoiceOver/TalkBack ve büyük sistem yazısı kabulü doğrulanmış sayılmaz. CDP ile native worker gösterimi bu testlerin yerine geçmez. Taşıyıcı önceliği/toplulaştırma mevcut planın fiziksel ölçüm koşulu nedeniyle etkinleştirilmedi. Ses, sessiz saat, kaynak geçerliliği, 120 saniye tazelik ve birden çok cihaz politikaları korunur.

## Son kabul ve canlı yayın

| Kontrol | Sonuç |
| --- | --- |
| Birim testleri | 74 dosyada 848 test geçti |
| Sunucu | 8 mobil/owner/CSRF/yarış testi son kodda geçti; 5 push gönderim regresyonu da geçti |
| Üretim imajlarıyla tarayıcı | 24 senaryo geçti; mobil, masaüstü ve native worker kontrolü dahil |
| Sözleşme ve statik kontroller | TypeScript, ilgili ESLint/Prettier, api:check ve git diff --check başarılı |
| Veritabanı | Yedek ayrı veritabanına geri yüklendi, doğrulandı ve doğrulama veritabanı kaldırıldı; yalnız yeni makbuz migration'ı uygulandı |
| Canlı HTTPS | Gerçek giriş, mobil dış dokunuş/geri/yatay dönüş, platform yönlendirmesi, tercihler, gerçek sayaç ve masaüstü paneli doğrulandı; yakalanmamış tarayıcı hatası yok |
| Canlı P2 | Ayrı owner hesabında okunan olayın teslimi hazırlanıp dış sağlayıcıya gönderilmeden Obsolete oldu; sağlayıcı kabulü veya istemci gösterimi icat edilmedi |

P1 yayını: **11.11.2026 06:17:06 TSİ**. P2 gönderim kuralı P1 canlı kabulünden sonra **11.11.2026 06:18:23 TSİ** etkinleştirildi. VAPID anahtarları korundu. Önceki uygulama imajları, veritabanı yedeği ve P2 öncesi özel env kopyası geri dönüş için saklandı.

Bu sürümün iki canlı test hesabı yalnız kendi kimlik/e-posta eşleşmeleriyle bağımlı kayıtlarıyla kaldırıldı. Geçici önizleme konteynerleri, ağı, veritabanı ve geçici kimlik bilgisi dosyaları temizlendi. Mevcut test altyapısı, kullanıcının sakladığı probe hesapları ve diğer projeler korundu.

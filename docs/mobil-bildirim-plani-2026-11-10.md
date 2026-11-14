# Mobil bildirim planı — 10 Kasım 2026

Durum: P1 akışları ve P2 okundu/makbuz geliştirmeleri uygulandı, aşamalı olarak canlıya alındı ve canlıda doğrulandı. Fiziksel cihaz ölçümü gerektiren taşıyıcı önceliği/toplulaştırma kapalıdır. Ayrıntılar [11 Kasım uygulama raporunda](mobil-bildirim-uygulama-raporu-2026-11-11.md).

## Hedef

Kullanıcı, seçtiği hatırlatmayı doğru zamanda, anlaşılır bir içerikle almalı; izin, cihaz veya bağlantı nedeniyle alamıyorsa nedenini görebilmelidir. Görev ekleme, gün planlama, sayaç ve mevcut pencere tasarımları korunur. Bildirim sistemi kullanıcının görevlerini tamamlamaz, planını değiştirmez veya kendiliğinden hatırlatma üretmez.

İncelemenin bulguları ve yayımlanan düzeltmeler [bildirim raporundadır](bildirim-incelemesi-2026-11-10.md).

## 1. İzin isteme ve cihazı hazırlama

İlk açılışta izin penceresi gösterilmez. Bildirim tercihlerindeki mevcut cihaz kartı kalıcı giriş noktasıdır. İlk hatırlatma başarıyla kaydedildikten sonra, cihaz hazır değilse kaydetmeyi engellemeyen bir satır gösterilebilir: “Bu hatırlatmayı telefonunda da görmek ister misin?” Eylemler: “Bu cihazda aç” ve “Şimdi değil”.

“Şimdi değil” seçimi aynı tarayıcı oturumunda tekrar önerilmez. Sonraki teklif yalnız yeni bir açık hatırlatma niyetinden sonra yapılır; reddedilmiş sistem izni için yeniden istem gösterilmez. Kullanıcı tercihlere her zaman kendisi ulaşabilir. Bu yaklaşım, izin isteğini faydanın görüldüğü ana bağlar. [Google: Permission UX](https://web.dev/articles/push-notifications-permissions-ux).

| Cihazın doğrulanmış durumu | Gösterilecek durum ve eylem |
| --- | --- |
| Kontrol sürüyor | “Kontrol ediliyor”; tekrar kayıt başlatma |
| HTTPS, Push API ve Service Worker uygun; izin sorulmamış | “Bu cihazda bildirimleri aç”; sistem istemini doğrudan bu dokunuş başlatır |
| İzin verilmiş, yerel/sunucu abonelikleri uyumlu | “Açık”; kapatma eylemi yalnız bu cihazı etkiler |
| İzin verilmiş fakat abonelik eksik/eski | “Bağlantıyı yenile”; açık kullanıcı eylemiyle onar |
| İzin reddedilmiş | Tek, kısa site/uygulama ayarı yönlendirmesi; gelen kutusu kullanılabilir |
| iPhone/iPad’de ana ekrana ekleme gerekli | “Ana ekrana ekleyerek kullan”; mevcut kart içinde adımları göster, geri dönünce desteği yeniden ölç |
| Tarayıcı desteklemiyor | “Bu tarayıcıda cihaz bildirimi kullanılamıyor”; gelen kutusuna yönlendir |
| Bağlantı veya depolama engeli | Sebebe uygun açıklama ve “Yeniden dene”; hazırlığı süresiz bekletme |
| Genel/tür tercihi kapalı | Cihaz kaydı ile gönderim tercihini ayrı anlat; kapalı tercihi kendiliğinden açma |

Karar önce özellik desteği, izin ve kurulu uygulama durumundan çıkarılır. Ekran genişliği cihaz desteği sayılmaz. iPad’in masaüstü kullanıcı aracısı gibi durumlar hesaba katılır. Android’de ana ekrana ekleme, destekleyen tarayıcıda bildirim açmanın zorunlu adımı yapılmaz.

iOS/iPadOS için standart Web Push yolu, desteklenen sürümlerde ana ekrana eklenmiş web uygulamasıdır. İzin doğrudan kullanıcı etkileşimiyle alınır. [Apple’ın güncel Web Push belgesi](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit açıklaması](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## 2. Bildirim karar algoritması

Zamanlama sunucuda kalır. Mobil sayfanın `setTimeout`, açık sekme veya arka planda sürekli çalışma varsayımı kullanılmaz. Web Push, tarayıcı sağlayıcısı üzerinden Service Worker’a ulaşır; sayfanın açık olması gerekmez. [Web Push akışı](https://web.dev/articles/push-notifications-overview).

Her olay için karar sırası:

```text
1. Kullanıcıyı, olay kimliğini ve güncel kaynak sürümünü doğrula.
2. Kaynak iptal edilmiş/silinmiş/tamamlanmış veya olay geçersizleşmişse gönderme.
3. Genel ve ilgili tür tercihi kapalıysa gönderme.
4. Kaynak saatinden gerçek gönderim zamanını hesapla:
   - Açık erteleme turu: notBefore.
   - Plan başlangıcı/bitişi ve son teslim: occurredAt - leadSeconds.
   - Diğer türler: mevcut kaynak/hatırlatma saati.
5. Henüz zamanı gelmediyse aynı kalıcı işi o zamana bırak.
6. Sessiz saat içindeyse mevcut politikaya göre beklet; yeniden deneme hakkını tüketme.
7. Mevcut 120 saniyelik tazelik sınırını aşmışsa eski alarmı yeniden çalma.
8. Cihaz için push açık, abonelik aktif/geçerli ve bu tur gönderilmemişse teslimi hazırla.
9. Kaynak ve tercihleri dış gönderimin hemen öncesinde tekrar doğrula.
10. Worker, kalıcı alıcı hesabını doğrulasın; olay/tur makbuzuyla tekilleştirsin.
11. Bildirimi göster; uygulama içi listeyi ve gerekiyorsa rozeti sunucudan yenile.
```

Saat dilimi ve yaz/kış saati hesabı mevcut sunucu kurallarını kullanır. Telefonun saatinin yanlış olması farklı bir planlama üretmez. Eski uyarıları sabah topluca çalmak yerine mevcut güncellik kuralı korunur. Kaçırılmış hatırlatmalar için ayrı, sessiz bir özet ileride ancak açık kullanıcı tercihiyle değerlendirilir.

Önerilen kanal öncelikleri:

| Tür | Yaklaşım |
| --- | --- |
| Pomodoro hedefi / mola sonu | Zaman hassas; geciktirerek toplulaştırma yapılmaz. Taşıyıcı önceliği bu olaylar için değerlendirilebilir; genel ses ve sessiz saat tercihi üstün kalır |
| Kullanıcının kurduğu hatırlatma | Seçilen saatte tek olay; aynı kaydın düzenlenmiş eski sürümü gösterilmez |
| Plan başlangıcı / bitişi / son teslim | Kaynak zamanı ve ön süre doğru açıklanır; bitiş bildirimi görevin tamamlandığını söylemez |
| İşe dönüş | Yalnız uygun duraklatılmış çalışma sürümü için; planlı Pomodoro molası ikinci alarm üretmez |
| Özel gün | İlgili özel gün ve tarih için; ayrı tür tercihi kullanıcıya sunulur |

Öncelik, sessiz saatleri veya kullanıcının kapattığı bir türü aşmaz. İşletim sisteminin odak modu ve pil politikası nedeniyle tam saniyesinde fiziksel gösterim vaat edilmez.

## 3. Tekrar, ses ve birden çok cihaz

- Tekilleştirme anahtarı mevcut `kullanıcı + bildirim + erteleme turu` olarak kalır. Native etiket aynı bildirim kimliğini kullanır. Ağ tekrarı ikinci kart üretmez; açık erteleme yeni turdur.
- Gösterim başarısızsa o gösterimin makbuzu kalıcı olarak tüketilmez. Tekrar geldiğinde görsel sunum yeniden denenebilir; ses makbuzu ayrıca yönetilir.
- Uygulama açıkken zil/liste güncellenir. Aynı olay için sekme ve native kanalın iki ses çalması ortak atomik makbuzla engellenir. Birlikte gelen ön plan olayları mevcut tek ses davranışını korur.
- Worker’a ulaşmış geçerli push görünür bildirim olarak sunulur. “Uygulama zaten açık” diye görünmez push’a çevrilmez; Safari bu durumda izni geri alabilir. [Apple’ın görünür bildirim gereksinimi](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- Birden çok cihazın açık olması kullanıcının seçimi olarak kalır. Aktif cihaz tahmini yaparak başka cihazdaki bildirimi sessizce iptal eden yeni bir davranış eklenmez. “Bu cihaz” ve “Tüm cihazlar” kontrolleri açıkça ayrılır.
- Özel uygulama sesinin kilit ekranında çalacağı söylenmez. Uygulama kapalıyken platformun desteklediği native ses kullanılır; genel ses tercihi uygulanır.
- Uygulama içindeki “Ertele” mevcut süre tercihini kullanır. Native eylem düğmeleri platform desteği varsa ek iyileştirmedir; iOS/Android’de aynı sistem düğmelerinin bulunacağı varsayılmaz.

## 4. Mobil panel ve etkileşim

Mevcut zil, kartlar ve alt pencere görünümü korunur. Öncelik, yeni bir modal tasarlamak yerine mevcut içeriği daha anlaşılır ve erişilebilir kılmaktır.

- Bildirim başlığı, ne olduğu ve ilgili görev tek bakışta anlaşılır. Kaynak adları için her liste satırında ayrı ağ isteği başlatmak yerine gerektiğinde sunucu projeksiyonu tasarlanır.
- Dokunma hedefleri en az 44 CSS piksel olur. Uzun başlıklar, büyük yazı, klavye ve güvenli ekran alanlarıyla taşma kontrol edilir. Liste kaydırma konumu küçük yenilemelerde korunur.
- Mobil panel dışına ilk dokunuş paneli kapatır; arkadaki eylemi aynı dokunuş çalıştırmaz. Kapatma, geri tuşu ve odak dönüşü mevcut pencere davranışıyla tutarlı olur.
- Gelen kutusunu açma, görevi tamamlanmış saymaz. Okundu, ertelendi ve kaynak artık geçerli değil durumları birbirinden ayrılır.
- Mevcut “açınca tümünü okundu yap” davranışını ilk aşamada koru. Görülen satırları okuma modeline geçmek ayrı, tutarlı bir ürün kararı olmalıdır; iki cihaz arasında sessizce farklı okundu kuralları uygulanmaz.
- Bildirime dokunmak ilgili kayıt/kaynağı açar. Kaynak kaldırılmışsa kullanıcı anlaşılır bir açıklama ve güvenli geri dönüş görür. Oturum kapalıysa giriş sonrası güvenli bildirim bağlantısına dönülür; başka hesaba ait içerik gösterilmez.

## 5. İncelemede bulunan eksikler için öncelik

| Öncelik | İş | Kabul koşulu |
| --- | --- | --- |
| P1 | Platforma uygun hazırlık ve izin açıklaması | iPhone ana ekrana ekleme gereksinimi “masaüstü desteklenmiyor” diye gösterilmez; Android’de gereksiz kurulum zorunluluğu yok |
| P1 | Gerçek okunmamış sayısı | Son 10 kayda bağlı tahmin yerine owner kapsamında sunucu sayacı; aynı tutarlı okuma kesiminde sayı/okundu makbuzu; yeni endpoint/DTO için OpenAPI ve tip güncellemesi |
| P1 | Tercihlerin açık anlatımı | `leadSeconds` kapsamı başlangıç/bitiş/son teslim olarak belirtilir; özel gün tür tercihi görünür; kayıtlı mevcut değerler korunur |
| P1 | Mobil panel dokunma ve odak davranışı | Dış dokunuş arkadaki eylemi tetiklemez; geri/kapatma ve odak dönüşü tutarlı; görünüm korunur |
| P2 | Okunmuş olayın henüz gönderilmemiş push’ını ele alma | Açık erteleme hariç, okundu olay için bekleyen teslimi iptal etme kararı sunucu/yarış testleriyle uygulanır; başlamış dış isteğin geri alınamayacağı kabul edilir |
| P2 | İçeriksiz teslim gözlemi | “Sunucu hazırladı”, “sağlayıcı kabul etti”, “worker gösterdi”, “kullanıcı okudu” ayrı kanıtlar olarak tutulur; sağlayıcı 201 fiziksel gösterim sayılmaz |
| P2 | Taşıyıcı önceliği ve kontrollü toplulaştırma | Yalnız ölçüm ve fiziksel cihaz kabulü sonrasında; zaman hassas veya açık kullanıcı hatırlatmaları geciktirilmez |

Yeni okunmamış sayacı, gelen kutusuyla aynı tür filtresini kullanmalıdır. Sayfa başına bütün geçmişi indirmek veya arka planda sınırsız tarama yapmak uygun çözüm değildir. Sayaç ve toplu okundu işlemi aynı yarış koşulu testleriyle ele alınır.

## 6. Test ve yayın sırası

1. Mevcut masaüstü kabul paketini koru; mobil durum tablosu ve karar kurallarına odaklı testler ekle.
2. Gerçek iPhone/iPad’de ana ekrana eklenmiş uygulama ve normal tarayıcıyı ayrı dene. Android Chrome’da normal sekme ve kurulu uygulamayı ayrı dene. Sürüm/donanım bilgilerini kanıta kaydet.
3. Her cihazda izin verilmemiş/verilmiş/reddedilmiş; ön plan/arka plan/kapalı uygulama; çevrimdışı/yeniden bağlı; pil tasarrufu ve odak modu durumlarını incele. İşletim sisteminin uygulamayı zorla durdurduğu durum teslim garantisi sayılmaz.
4. Hatırlatma oluşturma/düzenleme/iptal, plan taşıma/kaldırma, Pomodoro hedefi/mola, açık erteleme, sessiz saat, saat dilimi değişimi, iki sekme/iki cihaz ve hesap değişimini çalıştır.
5. Ayrı olarak worker’ın bildirimi göstermesi, dış sağlayıcı kabulü ve gerçek kilit ekranı görüntüsü kanıtlanır. CDP enjeksiyonu gerçek sağlayıcı veya fiziksel cihaz testi yerine geçmez.
6. 360/390/430 pikselde, yatay ekranda, büyük yazıyla ve VoiceOver/TalkBack ile kontrol et. İzin reddinde ana görev akışının çalıştığını ve gereksiz tekrar istem olmadığını doğrula.
7. Önce P1 akışlarını yayımla; P2 kanal/politika değişikliklerini ayrı sürümlerde değerlendir. Her sürümde mevcut tercihler ve geri dönüş imajı korunur.

Başarı ölçütleri: testlerde yinelenen kart/çift ses olmaması; kaynak iptalinden sonra yeni teslim hazırlanmaması; eski alarm yığını oynatılmaması; hesaplar arasında içerik sızmaması; hazırlığın sınırsız beklememesi; destek/izin/abonelik durumu ile “Açık” göstergesinin tutarlı olması. Sunucu hazır olma–ilk gönderim denemesi gecikmesi ayrıca ölçülür; işletim sistemi gecikmesi bu süreyle karıştırılmaz.

# Arayüz, görev ağacı ve analiz iyileştirme planı

Tarih: 10 Kasım 2026. Bu belge kullanıcının taleplerini mevcut kodla karşılaştırır. Bu aşamada uygulama kodu veya canlı hizmetler değiştirilmedi. Hata nedenlerine ilişkin kod bulguları ile henüz yeniden üretilmemiş belirtiler ayrı değerlendirilir.

## Tasarım sınırı ve inceleme maketleri

Kullanıcının açık kısıtı: mevcut tasarım korunacak, gereksiz görsel değişiklik yapılmayacak. Yeni davranışlar mevcut renkler, tipografi, görev item'ları, sol menü ve ayarlar yerleşimine uyacak. Projeye basıldığında aynı sayfa bölünecek: solda proje kartları, sağda seçilen projenin ayrıntısı kalacak. Bu ayrıntıdaki bir göreve basıldığında mevcut 380 px görev paneli açılacak; daralan proje içerik alanı mevcut container kurallarına göre yerleşecek. Ana/alt görev seçimi aynı görev panelinin içeriğini değiştirecek. Özellikle tekil alt görevlerin mevcut görünümü yeniden tasarlanmayacak.

Uygulama öncesi inceleme için yalnız HTML ve gömülü CSS içeren [maket dizini](maketler/iyilestirmeler/index.html) hazırlandı: görev ekle menüsü, gün planı, proje detayı, login ve hesap ayarları ayrı dosyalardır. [Karşılaştırma](maketler/iyilestirmeler/karsilastirma.html) sayfasında mevcut ekran, önceki maket ve düzeltilmiş maket yan yanadır. Bunlar örnek verilerle çalışan görsel maketlerdir; canlı uygulamaya entegre edilmemiştir.

## Mevcut durumdan çıkan sonuçlar

- `UI/src/components/layout/task-panel.tsx`: görev ayrıntısı ancak 1200 px ve üzerinde modal olmayan sağ panel oluyor. Sol gezinme ise 768 px ve üzerinde görünüyor. Dolayısıyla 768–1199 px aralığında görünür sol menü yerel modal yüzünden kullanılamayabiliyor. Daha geniş ekranlarda bildirilen durum ayrıca yeniden üretilecek.
- `UI/src/components/ui/surface.tsx`: mobil alttan açılan paneller dış tıklamanın click olayını tüketiyor; merkez ve tam ekran modal yolları aynı korumayı paylaşmıyor. İç içe pencereler, kapanma animasyonu ve kaydedilmemiş değişiklikler birlikte sınanmalı.
- `API/src/Adhd.Domain/Tasks/TaskRelations.cs`: `HasDirectWork=false` olan kapsayıcı görev için sayaç `direct_work_required` ile reddediliyor. `TaskTreeStore` ilk alt görev eklenince bazı ana görevleri kapsayıcıya dönüştürüyor. Kullanıcı, hatanın alt görevi olan ana görevin sayacı başlatıldığında oluştuğunu netleştirdi. Bu senaryo kapsayıcı kontrolüyle örtüşüyor; tam hata kodu ve olayın yeniden üretimi uygulama aşamasında doğrulanacak.
- `PlanningStore.DayItems.cs`: aynı kapsayıcı görevler plana da alınmıyor. Gün öğesini tamamlamak yalnız o gün öğesini değiştiriyor; asıl görev ve alt görevleri tamamlamıyor. Yeni istek bu ürün davranışını değiştiriyor.
- `TaskReadStore.Picker.cs` ve `UI/src/features/planning/add-to-plan.tsx`: mevcut görev seçici düz bir liste ve tek görev ekleme komutu kullanıyor; API seçicisi kapsayıcı ana görevleri de filtreliyor. Yeni hiyerarşik seçici ve ana görev ekleme kapsamı okuma/yazma sözleşmesine birlikte eklenmeli.
- `UI/src/features/planning/page.tsx`: sıradaki öğe `timed + untimed` listesinden seçiliyor; saatli görev kalmadığında ilk saatsiz görev vurgulanıyor.
- `UI/src/features/collections/detail.tsx`: proje/havuz/kategori görevleri düz ve başlığa göre sıralanıyor; tamamlananlar aynı listeye dahil. Kalıcı görev ağacı ve `ApplyToSubtree` sınıflandırma desteği API'de zaten mevcut.
- `ActualAnalyticsStore`: çalışma analizi gerçek çalışma segmentlerinden hesaplanıyor. Sayaçsız tamamlanan görevin tahmini bu veri kümesine dahil değil.
- Not kategorisi boşken `CategoryBadge` açıkça “Kategorisiz” yazıyor. Not görünümü ayarları şu anda cihazlar arasında ortak API tercihlerinden okunuyor.
- Rutinlerin boş ekranı kendi içinde iki sütunlu; masaüstü ana liste yerleşimi de bunu dar bir ilk sütuna sokabiliyor.

## Ortak davranış sözleşmesi

1. Ana görev ve alt görevler mevcut kimlikleriyle kullanılır. Projeye veya güne ekleme yeni görev kopyaları üretmez.
2. Gün planına tekil alt görev ekleme ve ana görevi alt ağacıyla ekleme birlikte desteklenir; mevcut item görünümü korunur. Ana görev bir yerde görünüyorsa aynı yerdeki alt görevleri onun altında açılıp kapanır. Aynı alt görev ikinci kez bağımsız satırda gösterilmez. Ana görevi o yerde bulunmayan bir alt görevde üst görev adı/yolu gösterilir.
3. Tekilleştirme öncelikle görünüm ve üyelik kuralıdır; görev kaydı, çalışma geçmişi veya tarihli plan bilgisi silinmez. Var olan saatler ve sıralar korunur.
4. Ana görevi tamamlamak ilgili açık alt ağacı da tamamlar. İşlem sürüm kontrolüyle sunucuda bir bütün olarak yürür; açık sayaçlar tutarlı biçimde kapatılır. Mevcut `CompleteSubtree` davranışı yeniden kullanılır.
5. Ana görevde çalışma başlatılabilir. Kendi çalışma süresi ile alt görevlerin toplamı ayrı izlenir. Ana görev süresi çocuklara otomatik dağıtılmaz; aynı anda tek aktif sayaç kuralı korunur.
6. Ana görev, yalnız kapsayıcı olduğu için sayaç veya güne ekleme sırasında genel hatayla reddedilmez. Bağımlılık, arşiv ve tamamlanma engelleri kullanıcıya anlaşılır gösterilir.
7. Tamamlanmış işler listenin altında “Bitmiş görevler” bölümünde üstü çizili görünür. Alt görevlerin üst bağı burada da anlaşılır kalır. Önceden yalnız üstü tamamlanmış, altında açık işi olan kayıtlar gerçeğe uygun gösterilir; geçmiş kayıtlar kendiliğinden topluca kapatılmaz.

## Aşama 1 — Panel ve modal etkileşimleri

### Masaüstü sol menü

- Sol menü görünürken sağdaki görev ayrıntısını modal olmayan panel olarak çalıştır; dar masaüstünde içerik ve panel genişliklerini buna göre düzenle.
- Sağ panel açıkken sol menüye tek tıklamayla gidilebilsin. Kaydedilmemiş değişiklik ve bekleyen yazı korumaları çalışmaya devam etsin.
- 768, 1024, 1199, 1200 ve 1440 px genişliklerde gezinme, klavye odağı ve geri tuşu kontrol edilsin.

### Mobil dış tıklama

- Kapatma hareketinin pointer/touch/click dizisi ortak modal davranışında tüketilsin. İlk dokunuş yalnız en üstteki pencereyi kapatsın.
- Alttaki bağlantı, görev, ana menü veya silme/başlatma düğmesi aynı dokunuşla çalışmasın. İkinci bilinçli dokunuş normal işlesin.
- Ortadaki modal, alttan açılan panel, tam ekran panel, iç içe modal ve sürükleyerek kapatma ayrı sınansın.

## Aşama 2 — Google, Hesap, notlar ve boş rutin ekranı

### Google ve Hesap tasarımı

- Login/kayıtta Google alanının boşluk, genişlik, tipografi, odak ve yüklenme/hata durumları son görünüm üzerinden yeniden düzenlensin. Resmî GIS butonu ve mevcut doğrulama akışı korunsun.
- Ayarlar > Hesap üç anlaşılır gruba ayrılsın: hesap kimliği/giriş yöntemleri, parola ve güvenlik, oturumlar. Google bağlantısı kimlik alanında gösterilsin; profil düzenleme ile yinelenen kontroller sadeleştirilsin.
- API'den gerçek Google bağlantısı ve parola kullanılabilirliği okunabilsin. Fotoğrafın bulunması Google hesabının bağlı olduğuna kanıt sayılmasın.
- Google ile oluşturulup parolası bulunmayan hesapta mevcut parola isteyen form gösterilmesin. Yeni parola oluşturma/Google bağlantısını kaldırma gibi ek yetenekler bu tasarım işine kendiliğinden dahil edilmesin.
- Tüm cihazlardan çıkış, normal bilgi/form alanlarından görsel olarak ayrışsın; onay davranışı korunsun.

### Notlar

- Kategori yoksa kart, liste ve detayda kategori rozeti çizilmesin. Kategori filtresinde kategorisiz notlara erişim korunabilir.
- Modalın dış genişliği/yüksekliği değiştirilmeden başlık, tarih ve işlem satırları sıkılaştırılsın; gereksiz üst boşluklar azaltılsın. Uzun metne kalan kaydırılabilir alan büyüsün. Uzun başlık ve bağlı görev satırı da sınansın.
- Masaüstünde açık bir görünüm tercihi bulunmadığında varsayılan Kartlar olsun. Mobilin mevcut varsayılanı değişmesin; kullanıcının yaptığı seçim korunsun.
- Cihazlar arasında ortak olan mevcut görünüm tercihleri için açık seçim ile varsayılanın ayrımı tanımlansın. Ekran boyutu değişti diye otomatik API yazısı veya tercihler arasında gidip gelme olmasın.

### Rutin boş ekranı

- Boş ekran masaüstünde kullanılabilir alanın tamamını kullansın; dolu listeye ait dar sol sütuna sıkışmasın.
- Masaüstü, sağ panel açık masaüstü ve mobilde metin, örnekler ve rutin oluşturma eylemi dengeli yerleşsin.

## Aşama 3 — Ortak hiyerarşik görev listesi

- Görevler ve takvimdeki mevcut ağaç davranışlarından yararlanılarak ortak satır/gruplama kuralları oluşturulsun.
- Projeler, havuzlar ve kategorilerde ana görev açıldığında alt görevleri gösterilsin; ilerleme, tamamlama, sayaç ve detay eylemleri aynı anlamı taşısın.
- Yalnız alt görev eklendiğinde üst adı/yolu görünsün. Ardından ana görev eklenince alt görev ana grubun altına taşınsın; bağımsız yinelenen satır kalksın.
- Ana görevin alt görevlerinin görünmesi ile bunların proje/havuz/kategori bağlarının kalıcı değiştirilmesi ayrı ele alınsın. Başka yere bağlı alt görevlerin mevcut sınıflandırması sessizce ezilmesin.
- Düz liste sayfalaması bir ağacı parçalayabileceğinden kök gruplar üzerinden sayfalama ve alt görevleri yükleme sözleşmesi tasarlansın. N+1 istekler ve farklı sayfalarda yinelenen alt görevler önlensin.
- Açık işler üstte, “Bitmiş görevler” altta olsun; iki bölümün toplamları ve iş yükleri aynı görevi iki defa saymasın.

## Aşama 4 — Ana görev sayacı ve gün planında görev ağacı

### Kesinleşen görünüm ve seçim kuralları

Kullanıcının son açıklaması bu bölümün temel kabul şartıdır: **tekil alt görev eklemenin bugünkü formatı ve item görünümü korunacak; buna ana görevi komple ekleme seçeneği eklenecek.**

- “Görev ekle” alanı ana görev → alt görev hiyerarşisini gösterecek. Girinti, aç/kapa oku ve üst adı/yolu hangi alt görevin hangi ana göreve ait olduğunu anlaşılır kılacak.
- Ok düğmesi yalnız ağacı açıp kapatacak; görev eklemeyecek. Görev satırını seçmek ekleme eylemi olacak. Klavye odağı ve ekran okuyucu etiketleri bu iki eylemi ayıracak.
- Ana görev seçilirse kendisi ve seçilen güne uygun bütün açık alt ağacı tek işlemde eklenecek. Kapalı görünümde veya henüz yüklenmeyen bir sayfada bulunan alt görevler atlanmayacak.
- Alt görev seçilirse yalnız o alt görev eklenecek. Ana görevi, kardeşleri veya varsa kendi alt görevleri otomatik eklenmeyecek.
- Yalnız alt görev eklenen planda bugünkü bağımsız item, saat alanı, tahmin, tamamlama, sayaç, menü ve üst görev bilgisi korunacak.
- Ana görev komple eklendiğinde açılıp kapanabilen bir grup başlığı oluşacak; altındaki satırlar mevcut item bileşeniyle gösterilecek. İkinci bir alt görev kartı tasarımı yapılmayacak.
- Daha önce planlanan alt görevler seçicide “Planda” olarak belirtilecek. Ana görevin bazı çocukları planlı olsa da ana görev seçilebilir kalacak; örneğin “1/3 alt görev planda” bilgisi gösterilebilecek.
- Arama alt görevde eşleşirse üst bağlamı görünür kalacak. Aynı başlığa sahip farklı görevler kimlikleriyle ayırt edilecek; tekilleştirme başlığa göre yapılmayacak.
- Tamamlanan/arşivlenen işler açık plan işi olarak yeniden eklenmeyecek. Grubun tamamlanmış alt görevleri bitmiş görünümüyle erişilebilir kalacak; ekleme başarı mesajında mevcut ve yeni eklenen işler ayırt edilecek.

### Tekil alt görevden ana gruba geçiş

Örnek: “Web sitesini hazırla” ana görevi altında “Tasarım” ve “Yayın” var. Önce “Tasarım” tek başına güne eklendi; sonra ana görev komple seçildi. Sonuç:

```text
▾ Web sitesini hazırla
    Tasarım  — önceki saat/tahmin ve kayıt bilgileriyle
    Yayın    — yeni eklenen alt görev
```

Listede ayrıca bağımsız bir “Tasarım” satırı bulunmayacak.

- Önceden eklenmiş alt görev yeniden oluşturulmayacak. Mevcut plan kaydı ana grubun üyeliğine alınacak ve bağımsız listeden çıkarılacak. Kullanıcının istediği “önceki alt görevi kaldırma” bu şekilde veri kaybetmeden gerçekleşecek.
- Mevcut item/schedule kimliği, başlangıç-bitiş saatleri, aciliyet, tahmin, tamamlanma durumu, bağlı sayaç ve çalışma geçmişi korunacak. Görev kaydı veya çalışma oturumu silinmeyecek.
- Bu işlem yalnız seçilen günü etkileyecek; başka güne tekil eklenmiş aynı görev o günde kalacak.
- Ana görev zaten gruptaysa tekrar seçmek yeni grup veya satır üretmeyecek. Alt görev zaten grup içindeyse tekil ekleme de ikinci satır üretmeyecek.
- İç içe alt gruplarda da her görev aynı günün grup üyeliğinde bir kez yer alacak. Daha üst ana görev sonradan seçilirse mevcut alt grup bilgileri daha büyük ağacın içinde korunacak.
- Aynı görevin bilinçli olarak oluşturulmuş birden fazla saatli çalışma bloğu, yinelenen görev üyeliğiyle karıştırılıp silinmeyecek. Bu blokların kimlikleri ve saat aralıkları korunacak; grup ekleme fazladan bir saatsiz kopya yaratmayacak.

### API ve kalıcılık

- Ekleme komutunda kapsam açık taşınacak: `Single` yalnız seçilen görev; `Subtree` ana görev ve uygun alt ağacı. Eski tekil istemcilerin mevcut davranışı korunacak.
- Seçicinin hiyerarşik okuması parent/child bilgisi, seçilebilirlik ve aynı gündeki plan durumunu taşıyacak. Kök sayfalama ve alt görev yükleme birlikte tasarlanarak ağaçlar sayfalar arasında kaybolmayacak.
- Gün planı grup üyeliği kalıcı olacak. Gruplama yalnız tarayıcı belleğine veya o anki görev ağacına bağlı olmayacak; yenileme ve başka cihazda aynı sonuç okunacak. Gerekli model/indeks/migration bu sözleşmeye göre hazırlanacak.
- Alt ağacı okuma, mevcut item/schedule kayıtlarını uzlaştırma, gruba alma ve eksikleri ekleme tek transaction içinde yürütülecek. Bir alt görev eklenemezse yarım grup bırakılmayacak; kayıtlar eski halinde kalıp anlaşılır sonuç dönecek.
- İstek anahtarı/idempotency, plan sürümü ve sahiplik kontrolleri kullanılacak. Çift tıklama, ağ hatasından sonra tekrar ve iki sekmede aynı anda ekleme tekrar üretmeyecek. Yanıtta yeni eklenen, zaten var olup gruba alınan ve işlem dışında kalan kayıtlar anlaşılır olacak.
- Başka kullanıcıya ait görevler, döngülü/bozulmuş ağaç ve aşırı büyük alt ağaç sınırları ele alınacak. Gösterilen ilk sayfanın çocuklarını ekleyip işlemi “tamamlandı” saymak kabul edilmeyecek.
- Plan revizyonu yapılan dönüşümü birlikte kaydedecek. Desteklenen “Geri al” işlemi, örnekteki Tasarım öğesini önceki tekil haline ve aynı saatlerine döndürebilecek; geçmiş kaydı yeniden yaratılmayacak. Sonradan başka işlem varsa sürüm çatışması güvenle bildirilecek.

### Gün içi kullanım ve yaşam döngüsü

- Kullanıcının netleştirdiği sayaç senaryosu: ana göreve alt görevler ekle, ardından ana görevin sayacını başlat. Hata kodu, kapsayıcı/kendi işi olan görev tipi ve tahmin durumu ile yeniden üretim yapılacak.
- Kapsayıcı ana görevde çalışma için domain, çalışma toplamı ve planlama kuralları birlikte güncellenecek. Ana ve alt görevlerin sayacı çalışabilecek; aynı anda tek aktif sayaç kuralı korunacak. Ana süresi çocuklara dağıtılmayacak.
- Ana görev kutusu mevcut `CompleteSubtree` davranışıyla bütün ilgili açık alt ağacı ve plan durumlarını sunucuda tutarlı tamamlayacak; açık sayaçlar uygun biçimde kapatılacak. Alt görev kutusu yalnız o alt görevi tamamlayacak; kardeşlerini bitirmeyecek. Mevcut üst görevin otomatik tamamlanma kuralları ayrıca işletilecek.
- Ana görevi yeniden açmanın tamamlanmış alt görevleri otomatik açmaması önerilir. “Yalnız bugünkü adım bitti” ayrı bir eylem olarak tutulacaksa görev tamamlama kutusundan anlamca ayrıştırılacak.
- “Plandan kaldır” görevi silmeyecek/tamamlamayacak. Tek alt görevi plandan çıkarma diğer kardeşleri etkilemeyecek. Grup kaldırma ve geri alma davranışı, önceden tekil olup gruba katılan kayıtların geçmişini koruyacak şekilde açık tanımlanacak.
- Yeni alt görevlerin sonradan eklenmesi geçmiş günleri değiştirmeyecek. Aktif gruba sonradan eklenecek işler için grup tekrar seçildiğinde mevcutlar korunarak yalnız eksikler uzlaştırılabilecek.
- Grup içindeki mevcut saatler ve satır tasarımı korunacak; zamanlı alt görevler saatlerine göre okunabilecek. Grup sırası için ilk planlı saat veya saatsiz grup sırası kullanılacak. Gruplama saatleri değiştirmeyecek; sürükleme yalnız açıkça seçilen öğe/grup kapsamına uygulanacak.
- “Sıradaki” vurgusu gerçek saat/sıra bilgisine göre uygun açık işlerden hesaplanacak; ağacın ilk çocuğu olduğu için bir görev vurgulanmayacak. Saatsiz görevlerde sıradaki vurgusu olmayacak; aktif çalışma göstergesi ayrı anlam taşıyacak.

### Gün planı kabul matrisi

| Başlangıç | Seçim | Beklenen sonuç |
| --- | --- | --- |
| Plan boş | Alt görev A | Yalnız A, mevcut bağımsız item görünümünde |
| Plan boş | Ana görev P | P başlığı ve uygun alt görevleri A/B; aç/kapa çalışır |
| A tekil planda | P komple | A bağımsız listeden kalkar; aynı kaydıyla P altında, B bir kez eklenir |
| A ve B ayrı ayrı planda | P komple | P altında A/B; saat ve durum kaybı yok, bağımsız tekrar yok |
| A saatli planda | P komple | A aynı saatli blokla P altında; fazladan saatsiz A yaratılmaz |
| P/A/B grubu planda | A veya P tekrar | İkinci kayıt/grup oluşmaz |
| P grubu, sonradan yeni C | P komple tekrar | Mevcutlar korunur; yalnız uygun eksik C eklenir |
| A başka günde planda | Bugüne P komple | Başka gün değişmez; bugünkü grup normal eklenir |
| Aynı adlı iki ayrı alt görev | P komple | Kimlikleri farklı iki görev de doğru görünür |
| Çok seviyeli ağaç | Kök ana görev | Uygun alt ağaç eksiksiz gelir; her görev bir kez yer alır |
| Çok seviyeli ağaç | Tekil ara/alt görev | Yalnız seçilen görev gelir; alt ağacı kendiliğinden gelmez |
| Aynı anda iki sekmede P ekleme | P komple | Tek tutarlı grup; yarım kayıt veya tekrar yok |
| A tekilken P eklendi | Değişikliği geri al | A önceki tekil kaydı ve saatleriyle geri gelir |

## Aşama 5 — Sayaçsız tamamlanan işlerin analizi

- Sayaç çalıştırılmadan tamamlanan ve tahmini olan görev analizde görünür hale gelsin.
- Ölçülen çalışma ile tahmini tamamlanan iş süresi kaynakları ayrı tutulup arayüzde anlaşılır etiketlensin. Tahmini süre için sahte çalışma oturumu oluşturulmasın.
- Önerilen temel kural: görev için ölçülmüş çalışma varsa o süre; hiç çalışma yoksa tamamlanan iş tahmini. Örneğin sayaçsız tamamlanan 30 dk tahminli görev 30 dk tahmini tamamlanan iş olarak görünür.
- Bu değer gün/hafta/ay, proje/kategori dağılımı ve detay toplamlarında aynı kuralla hesaplansın; aynı görev birden fazla planda bulunduğunda tekrar sayılmasın.
- Ana görevin hedef toplam bütçesi alt görev tahminlerinin üzerine tekrar eklenmesin. Ana görevin ayrı kendi işi varsa bu bağımsız iş olarak değerlendirilir.
- Kaynak tamamlanma zamanı ve o andaki tahmin/sınıflandırma olsun. Sonradan tahmin veya proje değişmesi geçmiş raporu oynatmasın. Mevcut geçmiş kaydı yetersizse tamamlanma anı kaydı ve migration gereksinimi çıkarılsın.
- Yeniden açma/yeniden tamamlama, kısmi çalışma, tahminsiz/sıfır tahminli iş, gece yarısı ve kullanıcı saat dilimi için hesaplama kuralları sabitlensin.

## Doğrulama ve uygulama sırası

Uygulama sırası: panel/modal düzeltmeleri → bağımsız tasarım ve not/rutin işleri → ortak görev ağacı okuma sözleşmesi → ana görev sayacı ve gün planı yazıları → tamamlanma temelli analiz → toplu kabul kontrolü.

Her aşama gerekli API/domain ve UI kontrolleriyle doğrulanır. Sözleşme değişen aşamalarda OpenAPI, UI tipleri ve ilgili dokümantasyon birlikte güncellenir. Veritabanı değişikliği gerektiren işler ayrı migration olarak hazırlanır.

Playwright kabul senaryoları:

- Sağ panel açıkken masaüstü sol menüye tek tıklamayla gitmek; kaydedilmemiş taslağın korunması.
- Mobilde pencere dışındaki bir bağlantıya dokununca yalnız pencerenin kapanması; ikinci dokunuşta bağlantının çalışması.
- Login ve Ayarlar > Hesap'ta Google bağlı/bağlı değil/kapalı/yüklenemiyor durumları; parola bulunan ve bulunmayan hesaplar.
- Hiyerarşik “Görev ekle” alanında okla aç/kapa ekleme yapmamalı; ana görev seçimi alt ağacı, alt görev seçimi yalnız tek görevi eklemeli. Yukarıdaki gün planı kabul matrisinin tamamı API entegrasyonu ve uygun Playwright senaryolarıyla doğrulanmalı.
- Önce alt görev, sonra ana görev ekleme; mevcut item görünümü, saat, tamamlanma, sayaç ve üst bağlamının korunması; sayfalama sınırındaki çocuklar, idempotency ve geri alma.
- Ana görevi güne ekleme, mevcut saatli alt görevin korunması, ana sayacı başlat/duraklat/devam/bitir ve başka aktif sayacın engellenmesi. Alt görevsiz ana görev, alt görev eklendikten sonra kapsayıcı olan ana görev ve kendi işi korunmuş ana görev ayrı sınansın. Ana görevden alt göreve ve ters yönde sayaç geçişinde süreler doğru görevde kalsın.
- Ana görevi tamamlama; bütün alt görevlerin bitmesi ve sayfa yenileme sonrası diğer ekranlarda da doğru görünmesi.
- Yalnız saatsiz görevli günde vurgunun olmaması; saatli görevler arasından doğru adayın seçilmesi.
- Sayaçsız 30 dk tahminli işi tamamlama; doğru gün ve dağılımda tek kez görünme; ana/alt görev toplamında çift sayım olmaması.
- Notlarda kategorisiz rozetin kaybolması; dış modal ölçüleri sabitken uzun metnin daha çok alan kullanması; masaüstü Kartlar ve mobil mevcut varsayılan.
- Rutin boş ekranında dar/normal/geniş masaüstü ve mobil ekran görüntüleri.

## Uygulamadan önce netleştirilecek noktalar

1. Hatanın alt görevli ana görevin sayacı başlatıldığında oluştuğu kullanıcı tarafından netleştirildi. Tam hata kodu, ekran ve yeniden üretim uygulama aşamasındaki hata incelemesinde doğrulanacak.
2. Analiz için ölçülen süre varsa ölçülmüş değerin, yoksa tahminin esas alınması önerisi.
3. Ana görevi yeniden açma ve grubu plandan kaldırma kapsamı için yukarıdaki davranış varsayımları. Tekil alt görev seçimi, ana görevle komple ekleme, mevcut item tasarımının korunması ve sonradan ana görev eklendiğinde tekilleştirme kullanıcı tarafından kesinleştirildi.

Bu noktalar planı hazırlamaya engel değildir; ilgili hesaplama/yazma davranışı uygulanmadan önce kesinleştirilir.

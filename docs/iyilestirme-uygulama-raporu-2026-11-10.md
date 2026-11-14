# İyileştirme uygulama raporu

Tarih: 10 Kasım 2026.

## Sonuç ve tasarım sınırı

İstenen iyileştirmeler çalışma kopyasına uygulandı. Mevcut sol menü, üst çubuk, proje listesi + sağdaki detay bölünmesi, görev paneli ve tekil gün planı satırı korundu. Proje seçmek ayrı sayfaya yönlendirmiyor. Tamamlanmış proje başlıkları takvim gün detayına uygun hafif soluk metin ve belirgin 2 px üst çizgiyle gösteriliyor; işaretli kutu ve “Tamamlandı” metni durumu ayrıca anlatıyor.

Değişiklikler 10 Kasım 2026 saat 12:49 UTC'de canlıya alındı. Migration uygulandı; API ve UI yeniden oluşturuldu. Yayın öncesi veritabanı yedeği ayrı bir veritabanına geri yüklenerek doğrulandı. Özellik testleri izole ortamda, yayın sonrası kontroller canlıda salt okuma ile yapıldı.

## Uygulanan davranışlar

- **Google ve Hesap:** mevcut resmi Google Identity Services butonu korunur. Hesapta giriş yöntemleri, parola ve oturum alanları düzenlenir. API gerçek `googleLinked` ve `hasPassword` bilgisini döndürür. Google ile oluşturulmuş, parolasız hesapta mevcut parola isteyen form gösterilmez. Profil ve hesap alanlarında yinelenen Google kontrolü kaldırılır. Login butonunun hizası ve dar ekran davranışı korunur ve kontrol edilir.
- **Paneller:** sol menünün göründüğü masaüstü genişliklerinde görev detayı modal olmayan yan paneldir. Mobil dış dokunuş üstteki pencereyi kapatır; aynı hareketin uyumluluk click olayı alttaki kontrolü çalıştırmaz. Sonraki bağımsız dokunuş kullanılabilir.
- **Ana görev sayacı:** alt görev eklenince kapsayıcı hale gelen ana görev de çalışma başlatabilir. Bağımlılık, arşiv, durum ve tek aktif sayaç kuralları sürer. Süreler başladıkları görevde tutulur.
- **Gün planı:** seçici hiyerarşiktir. Kök ana görev seçimi alt ağacıyla, alt/ara görev seçimi yalnız seçili görevle ekler. Ok yalnız açıp kapatır. Tekil ve saatli alt kayıtlar ana gruba katılırken kimlikleri, saatleri ve geçmişleri korunur. Bağımsız tekrar gösterilmez; aynı görevin ayrı saatli çalışma blokları kaybolmaz.
- **Kalıcı gruplar:** grup üyeliği o günün planına kaydedilir; yenilemede korunur. Ana görevi tekrar seçmek eksik yeni çocukları bir kez ekler. Tekrar gönderim, sürüm kontrolü ve gruplama değişikliğini geri alma desteklenir. Sayfalama sınırını aşan gruplar sırayla tamamen yüklenir.
- **Tamamlama:** yeni UI `completeTask=true` gönderir. Ana görevi tamamlamak uygun alt ağacı da tamamlar, sayaçları kapatır ve seçili günün biten saatli bloklarını görünür tutar. Yeniden açmak yalnız seçili görevi açar. Görev durumu değişikliği genel plan geri alma yerine tamamlanma kutusuyla geri açılır.
- **Sıradaki görev:** yalnız saatli, sırası belli açık görevler adaydır. Saatsiz ilk görev veya mola bu nedenle vurgulanmaz.
- **Projeler/havuzlar/kategoriler:** kökler üzerinden sayfalanan görev ağacı, alt görev bağlamı, aç/kapa, sayaç ve tamamlama eklenir. Tamamlanmış kökler alttaki “Bitmiş görevler” bölümündedir. Ana görevin altındaki bitmiş çocuk da çizili görünür. Görünüm için çocuğun mevcut proje/kategori/havuz bağı değiştirilmez.
- **Analiz:** pozitif ölçülen çalışma yoksa tamamlanma anındaki pozitif kendi iş tahmini ayrı alanlarda rapora katılır. Ölçülen süre varsa tahmin eklenmez. Sahte çalışma oturumu yaratılmaz; ana görevin hedef bütçesi çocukların üzerine tekrar eklenmez. Yeni tamamlamalarda sınıflandırma adları da geçmişe kaydedilir. Sonraki tahmin veya proje adı değişiklikleri bu tamamlanma kaydını değiştirmez.
- **Notlar:** kategori yoksa rozet çizilmez; filtrede kategorisiz notlara erişim sürer. Dış pencere ölçülerini büyütmeden içerik alanı genişletilir. Mevcut masaüstü Kartlar varsayılanı ve açık kullanıcı tercihi korunur; mobil Liste davranışı değişmez.
- **Rutin:** boş masaüstü görünümü mevcut panonun tamamını kullanır.

## API sözleşmesi ve migration

- Yeni `GET /api/{kind}/{id}/task-tree`: `projects`, `pools`, `categories`, `tags`. `roots`, `nodes`, `parents`; `total` kök gruplarının sayısıdır.
- `GET /api/tasks/picker?hierarchy=true`: iç içe `children`; kök üzerinden sayfalama. Varsayılan düz seçici uyumludur.
- Plan eklemede `scope=Single|Subtree`; varsayılan `Single`. Mevcut idempotency ve planning sürüm kontrolü kullanılır.
- Gün öğesinde `groupTaskId`, `groupParentTaskId`; gün yanıtında sayfadan bağımsız `groups` üyeliği.
- Gün öğesi/saatli blok `complete` ve `reopen` isteklerinde `completeTask`; varsayılan `false` eski istemcilerin plan-öğesi davranışını korur.
- Analizde `estimatedCompletedSeconds`, `estimatedCompletedCount` ve kırılımda `totalEstimatedCompletedSeconds`; `workSeconds` ölçülen çalışma olarak kalır.
- OpenAPI, endpoint kataloğu, UI tipleri, işlem politikaları, alan açıklamaları ve plan güncellendi. Önceden kaydedilmiş HTTP örnekleri korundu.
- Migration: `20261110120247_AddDayPlanTaskGroups`. `day_items` tablosuna iki nullable UUID alanı, indeksler ve kullanıcı kapsamlı kök FK ekler. Mevcut kayıtlar bağımsız kalır; yeni gruplar yazılmadan migration uygulanmalıdır.

API ve UI üretim imajları birlikte güncellendi; migration servis geçişi sırasında başarıyla çalıştırıldı. Mevcut Google kimlik bilgileri ve oturum imzalama anahtarı korundu. Yeni `.env` anahtarı gerekmedi.

## Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| UI birim paketi | 71 dosya, 819 test başarılı |
| Son analitik/planlama birim kontrolü | 6 dosya, 73 test başarılı |
| API birim paketi | 230 test başarılı |
| Son API entegrasyon regresyonu | 54/54 başarılı: gruplama, tekil kayıt/saat koruma, geri alma, idempotency, owner sınırı, ana sayaç, saatli ana görev tamamlama, ölçülen/tahmini süre ve geçmiş sınıflandırma |
| Google API entegrasyonu | 20 test başarılı; gerçek bağlantı/parola metadata kontrolü dahil |
| Geniş API entegrasyon koşumu | 564 başarılı; yeni kapsayıcı davranışından dolayı eski bir ret beklentisi güncellendi ve son regresyonda geçti. Cloudinary sağlayıcı testi gerekli dış yapılandırma bulunmadığı için atlandı |
| Playwright masaüstü + mobil | İlk kabul: 18 başarılı, cihaz kapsamından 2 atlama. Son derleme/yeniden başlatma kontrolü: 5 başarılı, cihaz kapsamından 1 atlama; iki cihazda 103 satırlık grubun sayfalama ve yenileme kontrolü dahil |
| UI üretim derlemesi / TypeScript | Başarılı |
| UI lint / biçim | 0 hata; mevcut recurrence testinde 2 kullanılmayan değişken uyarısı |
| OpenAPI / üretilmiş UI tipleri | `api:check` başarılı: 223 operation, 228 concrete operation, 312 schema |
| Chrome DevTools | Gerçek yerel uygulamada proje bölünmesi, tamamlanmış satır stili ve taşma kontrolü; 1440 px'te yatay taşma yok |
| Dokümantasyon doğrulama scripti | Depoda bulunmayan `API-AGENTS.md` ve `AGENTS.md` dosyalarını zorunlu arayan mevcut script tamamlanamıyor; sözleşme/tip kontrolü ayrıca başarılı |

Google tarayıcı testleri GIS callback'ini kontrollü taklit eder; bu doğrulama gerçek bir Google hesabıyla canlı giriş yapıldığı anlamına gelmez.

## Davranış sınırları

- Bir gün grubu en çok 2000 görev; hiyerarşik seçici en çok 128 seviye, okunabilir aktif görev kümesi en çok 50.000 görev.
- Ana satırı plandan kaldırmak, kaydedilmiş aynı gün grubunda altındaki saatli ve saatsiz öğeleri birlikte kaldırır. Görevler, başka günler ve gerçek çalışma değişmez; geri alma grubu aynı kimliklerle geri getirir. Bir alt dalı kaldırmak kardeşlerini kaldırmaz; yaprak öğeler tekil kaldırılır.
- Eski tamamlanma geçmişinde sınıflandırma adı snapshotı yoksa geçmiş ad açıkça bilinmiyor olarak gösterilir; güncel ad geçmişe uydurulmaz.
- Hesap bağlama ve mevcut güvenlik doğrulamaları korunur; yeni parola oluşturma veya Google bağlantısı kaldırma bu kapsamda eklenmedi.

## Görseller

Üretim derlemesinden örnekler:

- [Masaüstü proje detayı](../UI-docs/verification/improvements-2026-11-10/project-tree-chromium.png)
- [Mobil proje detayı](../UI-docs/verification/improvements-2026-11-10/project-tree-mobile-chromium.png)
- [Masaüstü gün grubu](../UI-docs/verification/improvements-2026-11-10/plan-hierarchy-chromium.png)
- [Mobil gün grubu](../UI-docs/verification/improvements-2026-11-10/plan-hierarchy-mobile-chromium.png)
- [Hesap ayarları](../UI-docs/verification/improvements-2026-11-10/account-methods-chromium.png)
- [Not içerik alanı](../UI-docs/verification/improvements-2026-11-10/note-content-chromium.png)

## Canlı yayın ve Docker temizliği

- Canlı giriş/kayıt/gizlilik/koşullar sayfaları HTTP 200; yeni stil dosyası HTTP 200. Google yapılandırması etkin ve resmi Google butonu yükleniyor.
- API veritabanı readiness kontrolü HTTP 200. Oturumsuz API istekleri beklendiği gibi HTTP 401; korumalı veriler açılmıyor.
- `20261110120247_AddDayPlanTaskGroups` canlı migration geçmişinde doğrulandı; iki grup alanı mevcut.
- Veritabanı yedeği ve önceki API/UI imajları geri dönüş için korundu.
- Yayın doğrulandıktan sonra `docker builder prune --all --force` tamamlandı; 6.945GB derleme önbelleği temizlendi. Kalıcı volume'lar silinmedi.

## Görev ekleme taslağında geri alma ve satır kaldırma

- Mevcut Tab ile girintileme ve Shift+Tab ile bir seviye geri alma korunur. Satırdaki ⋯ menüsü masaüstünde de görünür; “Bir seviye yukarı al” ve “Kaldır” fare/dokunma ile kullanılabilir.
- Son kalan boş alt görev satırı da Backspace ile kaldırılır; odak ana görev adına döner, ana görev adı korunur. Birden çok satır varsa odak yakın kalan satıra döner.
- Yazılmış bir satırı kaldırmak altındaki yazılmış görevleri silmez; bir seviye yukarı taşır. Dolu satırda Backspace normal metin düzenlemesidir. Son dolu satır düzenlenince otomatik sonraki boş satır açma davranışı korunur.
- Kaydetme sürerken hiyerarşi/satır işlemleri ve Escape ile taslağı kapatma engellenir.
- 7 taslak birim testi ve masaüstü/mobil toplam 6 tarayıcı senaryosu doğrulandı. Üretim derlemesi/TypeScript, ESLint ve biçim kontrolü başarılı. Genel tasarım ve API değişmedi.
- UI canlıya alındı; yeni satır menüsü stili, yardım metni ve API readiness 200 doğrulandı.

## Notu göreve dönüştürmede isteğe bağlı planlama bilgileri

- Son teslim alanı yerine başlangıç/bitiş tarih aralığı, efor ve aciliyet eklenir. Alanların hepsi boş bırakılabilir; tek tarih aynı gün başlayan/biten aralık olur. Seçilmeyen efor null, aciliyet görevin varsayılan Normal değeridir.
- Notun içeriği ve tarihi korunur, oluşturulan göreve bağlantı eklenir. Yeni arayüz notun tarihini görev son teslimine aktarmaz. Mevcut pencere boyutu ve tasarım korunur.
- API yeni alanları görevle aynı transaction içinde kaydeder. Ters/eksik/aşırı uzun aralık ve geçersiz enumlar reddedilir. Eski istemcilerin son teslim davranışı ve önceki idempotency makbuzları uyumludur; yeni dönüşümde kayıp yanıtı aynı anahtar/içerikle yeniden istemek ikinci görev oluşturmaz.
- 17 API entegrasyon testi, 46 ilgili birim testi ve masaüstü/mobil toplam 6 Playwright senaryosu başarılıdır. Not listesi ve ayrıntı penceresinden dönüşüm, boş seçenekler, tek gün, tarih aralığı/efor/aciliyet kaydı ve kayıp yanıt yeniden denemesi doğrulanmıştır. Üretim derlemeleri, TypeScript, ESLint, biçim ve üretilen API sözleşmesi kontrolü başarılıdır.
- OpenAPI/DTO rehberi ve frontend tipleri güncellenmiştir; mevcut 175 HTTP örneği korunmuştur. Veritabanı migrationı gerekmez.
- API ve UI canlıya alınmıştır; çalışan imajlar doğrulanmış sürümle eşleşir. API readiness, canlı giriş ekranı, Google yapılandırması ve yeni dönüşüm dosyaları HTTP 200 verir. Önceki imajlar geri dönüş için korunmuştur.
- Yayın sonrasında 1.47GB kullanılmayan Docker derleme önbelleği temizlenmiştir; kalıcı volume'lar korunmuştur.

## N kısayolundaki Kafamı boşalt tasarımı

- Hızlı görev panelindeki giriş, mevcut tema renkleriyle simge, kısa açıklama ve yön oku içeren tam genişlikte bir düğme olarak düzenlendi.
- Toplu giriş formunda etiket ve 50 görev sınırı metin alanının üzerine alındı; alan panel genişliğini kullanır, örnek satırlar ve okunaklı satır aralığı sunar. Görev/tekrar sayacı, başarı mesajı ve tam genişlikte ekleme düğmesi ayrıştırıldı. Mevcut panel ölçüleri korundu.
- 24 ilgili birim testi ile mevcut masaüstü/mobil toplu ekleme senaryoları başarılı. Playwright ile açık/koyu tema ve masaüstü/mobil toplam dört görünüm incelendi; sekiz dar/yatay ekran kontrolünde taşma görülmedi. Dört erişilebilirlik taramasında ihlal bulunmadı.
- Üretim derlemesi/TypeScript, ESLint ve biçim kontrolleri başarılı. UI canlıya alındı; yeni stiller, giriş ekranı ve API readiness HTTP 200 olarak doğrulandı. Önceki UI imajı geri dönüş için korundu.

## Gün planından görev grubunu birlikte kaldırma

- Ana görev plandan kaldırıldığında, o gün kaydedilmiş grubundaki alt görevler saatli ve saatsiz öğeleriyle tek işlemde kaldırılır. İç dalı kaldırmak üst görevi ve kardeş dalları etkilemez; yaprak öğelerin tekil kaldırma davranışı korunur.
- Görev kayıtları, başka günlerin planları ve gerçek çalışma kayıtları korunur. Sabit/kilitli saatlerin koruması geçerlidir. Geri alma grubu aynı kimlikler, sıralama ve saatlerle geri getirir.
- Dokuzu yeni olmak üzere 42 API entegrasyon testi ve 26 ilgili UI birim testi başarılıdır. Son kodda dokuz yeni API testi ayrıca tekrar geçmiştir. TypeScript, ilgili dosyalarda ESLint/biçim ve diff kontrolleri başarılıdır.
- Gerçek yerel API ve veritabanıyla masaüstü/mobil, saatli/saatsiz toplam dört tarayıcı senaryosunda kaldırma, geri alma ve sayfa yenileme doğrulanmıştır. Chrome DevTools MCP üzerinden mobil kapalı grubu kaldırma/geri alma da kontrol edilmiştir.
- Bu düzeltme 10 Kasım 2026 masaüstü bildirim yayınıyla birlikte canlıya alınmıştır. Commit ve push yapılmamıştır.

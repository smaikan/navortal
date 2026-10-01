# İş yükü, durumlar ve bağımlılıklar

## Sürelerin anlamı

`DirectEstimate` kendi fiziksel işinin tahminidir. `CalculatedTotal` alt ağacın tekilleştirilmiş tahminidir. `TargetBudget` kullanıcının elle verdiği toplam hedeftir. `Actual` aktif çalışma segmentlerinden gelir. `Remaining` doğrudan iş düzeyinde hesaplanıp toplanır; toplam süreleri tekrar çıkartıp çift sayma.

İsimler semantiktir; kesin property/wire adları MVP-00 ve uygulama sözleşmesinde belirlenir.

| Örnek | Beklenen |
| --- | --- |
| 20 + 40 + 30 dk çocuk | 90 dk |
| (15 + 20) dk alt ağaç + 25 dk | 60 dk |
| 30 + (15 + 20 + 25) + 25 dk | 115 dk |
| Hedef bütçe 240, çocuk toplamı 180 | 180 dk hesap + 240 dk hedef; 60 dk fark |
| Bilinen 90 dk ve iki tahminsiz iş | 90 dk bilinen, iki tahminsiz; tam toplam iddiası yok |

Bütçe farkı kendiliğinden doğrudan iş değildir. Kullanıcı doğrudan iş ekleyebilir veya farkı kabul edebilir. Alt görevlere ayırma, eski tahmini ve önceki gerçek çalışmayı sessizce yeniden sınıflandırmamalıdır.

## Tamamlanma

- Durumlar: Pending, InProgress, Paused, Completed, Deferred, Skipped, Canceled.
- Tamamlanma ile oturum bitirme ayrıdır. Görevi tamamlama aktif oturumu kapatır; yalnız oturumu bitirme görevi bitirmez.
- Otomatik üst tamamlama: bütün zorunlu çocuklar ve varsa doğrudan iş tamamlanmış olmalı. Çocukların zorunluluk ve iptal davranışı MVP-00'da açıkça modellenir; atlanan işi completed olarak dönüştürme.
- Manuel seçenekler: bütün altları da tamamla; yalnız üstü tamamla ve açık altları bırak; iptal.
- Açık altlar bırakılan üst görev arayüz/API ayrıntısında anlaşılabilir olmalıdır.
- Çocuk yeniden açılırsa otomatik tamamlanmış ataları değerlendir. Manuel üst kararını gizlice geri çevirme.
- Arşivleme, geçmiş oturum/revizyon bağlantılarını silmez.

## Bağımlılık

A → B gerçek ön koşulsa motor B'yi A'nın öngörülen bitişi sonrasına yerleştirebilir; gerçek B başlatma komutu A'nın gerçekten tamamlandığını yeniden doğrular. Sıralama tercihi aynı yürütme kilidini doğurmaz.

A → B → C → A; kendi kendine bağlantı; parent/descendant yoluyla kendini bekleme; parent taşıma ile sonradan oluşan döngü senaryolarını test et. Ön koşulun iptali, ardılı otomatik serbest bırakmaz; açık bir çözüm gerekir.

## İş bileşenleri

Yaprak görevler ve parent'ın açıkça tanımlanmış kendi işi bağımsız iş bileşenidir. Salt konteynerde sayaç başlatmak için alt adım veya açık doğrudan iş seçilir. İstatistik sayacı ve motor aynı bileşen tanımını kullanmalıdır.

# Motor senaryoları ve invariant'lar

## Sıra ve varsayılanlar

Önce geçmiş/aktif gerçeklik, sabit/kilitli bloklar, çalışma aralıkları ve gerçek bağımlılıkları koru. Uygun işler içinde son teslim baskısı, kritik görev, kullanıcı önceliği ve açık sıralama tercihini değerlendir; eşitlikleri kararlı sıra/ID ile çöz. Uygun eski yerleşimi korumaya çalış. Enerji uyumu yumuşak tercihtir.

Varsayılan en küçük otomatik parça 15 dakika, son kalan daha kısa olabilir; geçiş tamponu 0'dır. Kullanıcı ayarları değişebilir. Çalışma saatleri belirtilmeden herkese 09:00–17:00 atama.

## Zorunlu acil iş örneği

09:00–10:00 React, 10:00–11:00 Backend, 11:00–11:30 sabit toplantı. React'te 09:20'ye kadar 20 dk gerçekten çalışılmış. 30 dk acil iş ve 12:00'ye kadar kapasite var; Backend bölünebilir; tampon 0.

Beklenen:

| Aralık | İçerik |
| --- | --- |
| 09:00–09:20 | React gerçek geçmişi |
| 09:20–09:50 | Acil iş |
| 09:50–10:30 | React kalan 40 dk |
| 10:30–11:00 | Backend 30 dk |
| 11:00–11:30 | Sabit toplantı |
| 11:30–12:00 | Backend kalan 30 dk |

Gerçek geçmiş ayrı katmanda gösterilir; plan revizyonu gerçek segmenti yeniden yaratmaz. Backend bölünemezse iki 30 dk boşluğa konmaz; yeterli başka slot aranır veya yerleştirilemedi sonucu verilir.

## Diğer örnekler

- 90 dk iş, 60 dk kapasite: eksik 30 dk görünür; tamamı planlandı sayılmaz.
- Üç günlük altı saatlik iş: aynı TaskId ve tekilleştirilmiş kalan tahsis.
- Gerçek ön koşulun tahmini bitişi sonraya kayarsa ardıl yerleşim yeniden değerlendirilir; gerçek başlatmada completed kontrolü sürer.
- Aktif sayaç tahmini aşarsa gerçek süre korunur, görev otomatik bitmez ve ek kalan tahmini gerekebilir.
- Kilitli ve sabit bloklar çakışıyorsa motor bunları sessizce taşımaz; çatışmayı döndürür.
- Manuel kabul edilmiş çakışma, otomatik önerinin çakışmasız olduğunu iddia etmek için kullanılamaz. Dolu kapasiteyi union aralıklarıyla hesapla.

## Invariant testleri

Aynı snapshot/niyet aynı sonuç; sabit/kilit korunumu; gerçek geçmiş değişmezliği; otomatik bloklarda yasak çakışma olmaması; iş miktarı korunumu; deadline ihlallerinin açıklanması; bilinmeyen tahminin 0'a dönüşmemesi; bağımlılık sırası; günlük taşmanın kendiliğinden başka güne gitmemesi; parent işinin iki kez tahsis edilmemesi.

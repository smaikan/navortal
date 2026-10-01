# Zaman, segmentler ve düzeltmeler

## Segment hesabı

09:00–09:20 çalışma; 09:20–09:50 duraklama; 09:50–10:30 çalışma = 60 dk aktif, 90 dk kapsanan zaman. Duration'ı her tick'te artırılan DB sayacı olarak tutma. Açık aralığı güvenilir sunucu zamanı ile hesapla; DTO'da server time veya eşdeğer senkronizasyon verisi sun.

Pause açık segmenti kapatır; resume yeni segment açar. Aynı anda başka çalışma varsa resume/start mevcut oturum sürümünü ve açık değiştirme niyetini doğrular. Eski iki sekme birbirinin yeni oturumunu yanlışlıkla durdurmamalıdır.

## Yerel gün

Timestamp'ler UTC; kullanıcının IANA zone bilgisi ayrı. Aralıklar [start,end); süre gerçek instant farkıdır. 23:30–00:30 aynı yerel gün sınırında 30+30 dk dağıtılır. DST olan yerde görünen saat etiketlerini çıkararak süre hesaplama. Geçmişin gün/zone bağlamını tercih değişikliğiyle sessizce yeniden yazma.

## Pomodoro

Preset çalışma/kısa mola/uzun mola ve uzun mola sıklığını saklar. 35/7 geçerli bir örnektir. Duraklama hedef aktif süresini tüketmez. Hedefe ulaşma bir defa belirlenir; ContinueTracking varsayılanında kullanıcı mola/bitir seçeneğine kadar segment devam eder. Taşmayı görünür tut; yeni Pomodoro döngülerini kendiliğinden çoğaltma.

AutoBreak/AwaitChoice gibi alternatifler açık, birbirini dışlayan davranışlar olarak modellenebilir; kesin alanlar ilgili MVP sözleşmesinde belirlenir. Açık tercih olmadan saatlerce görünmeyen otomatik çalışma/mola döngüsü üretme.

## Manuel çalışma

Unutulan çalışma yeni manuel kaynaklı kayıtla eklenebilir. Unutulan açık sayaç düzeltilirken özgün zamanlar kaybolmaz. Etkili kayıt ve audit kaydı aynı transaction'dadır. Düzeltme nedenini ve kaynağını göster; ikinci düzeltmede önceki düzeltmeyi de koru.

Plan geri alma oturum correction değildir. Oturum iptali de gerçekleşmiş işi otomatik silmez. Kullanıcıya ait başka etkili çalışma ile çakışma, planlanan blok çakışmasından farklıdır ve reddedilir.

## Kontroller

Çift start/resume; uzun kapanma; cihaz saati değişmesi; görev complete ile segment finish yarışı; 35 dakika hedefin 48 dakikada bırakılması; molanın aktif toplama girmemesi; geçmiş düzeltmenin toplam/kalan işe yansıması; yanlış task/schedule/revision sahipliği; gece yarısı ve DST.

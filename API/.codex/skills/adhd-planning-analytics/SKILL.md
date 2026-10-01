---
name: adhd-planning-analytics
description: ADHD backendinde günlük/haftalık/aylık çalışma, odak, plan uyumu, tahmin doğruluğu ve revizyon metriklerini geliştir veya denetle. Referans plan, pay/payda, eksik tahmin, düzeltme ve çift sayım sorunlarında kullan; grafik tasarımı için kullanma.
---

# ADHD planlama analitiği

Metrik ekleme/değiştirmeden önce [metrik tanımları](references/metric-definitions.md) referansını ve varsa proje statistics sözleşmesini oku. Test fixture'ını ve rapor timezone/aralığını açık tut.

- Her metrik için kaynak, referans sürüm, pay, payda ve eksik veri davranışını tanımla.
- Başlangıç planı, güncel plan ve gerçek çalışmayı ayrı karşılaştır.
- Yapraklar ve açık parent doğrudan işi bağımsız iş birimidir; parent toplamlarını yeniden sayma.
- WorkSession aktif süre kaynağıdır. FocusSession ile tekrar toplayıp çalışma toplamını büyütme.
- Zaman kotasına ulaşmayı görev tamamlanması sayma.
- Eksik tahminleri görünür tut; süre ağırlıklı metriklerin kapsama oranını göster.
- Boş paydayı açıklamasız %0 üretmek için kullanma.
- Etkili manuel düzeltmeleri uygula; özgün/audit kaydı ayrıca toplanmaz.
- UTC aralıklarını raporun yerel günlerine doğru kesiştir. Sabit/esnek başlangıç gecikmelerini ayrı tut.
- Basit istatistiksel öneri mevcut süreyi/plani kendiliğinden değiştirmez.

## Teslim

Beklenen sonuçları elle hesaplanabilen fixture ile doğrula: parent-child, çok günlük iş, gece yarısı, eksik tahmin, acil iş, taşınan iş ve correction. Formülü ve kapsamını API/belgeye yaz; olumlu görünen yüzdeler üretmek için paydayı sessizce değiştirme.

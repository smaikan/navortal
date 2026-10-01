---
name: adhd-task-tree-workload
description: ADHD planlayıcısında görev ağacı, recursive iş yükü, manuel hedef bütçe, ilerleme, görev durumları ve bağımlılıkları geliştir veya düzelt. Takvim yerleşimi ve gerçek oturum zamanlaması için ayrı becerileri kullan.
---

# ADHD görev ağacı ve iş yükü

## Kaynağı belirle

Varsa `AGENTS.md`, aktif MVP ve ilgili domain sözleşmesini oku. Modelin bugünkü uygulamasını incele; tasarlanan alanı uygulanmış sanma. Hesaplama veya durum geçişi değişirken [iş yükü ve bağımlılıklar](references/workload-and-dependencies.md) referansını oku.

## Korunacak kurallar

- Her seviyede aynı görev modeli; parent ilişkisi ve taşıma döngüsüz olmalı. Sabit derinlikli kolonlar oluşturma.
- Doğrudan işi olan görevle yalnız konteyner olan görevi ayır. Bilinmeyen doğrudan tahmin ile sıfır doğrudan iş farklıdır.
- Hesaplanan toplam = doğrudan tahmin + çocukların hesaplanan toplamı. Hedef toplam bütçe bu toplamın bir bileşeni değildir.
- Parent, child ve gerçek oturumları fiziksel iş başına bir defa say. Parent'ı planlamaya açarken çocuk toplamına ek üst iş üretme.
- Tahmini iş kalmadığı için görevi otomatik tamamlanmış sayma; açık iş için ek tahmin veya tamamlama kararı gereklidir.
- Otomatik üst tamamlama zorunlu çocukları ve varsa kendi doğrudan işini dikkate alır. Manuel üst tamamlama ayrı karardır.
- Gerçek ön koşul ile sıralama tercihini ayrı tut. Parent ve dependency grafiğinin birleşimindeki dolaylı çelişkileri de incele.
- Tamamlama, yeniden açma, erteleme, atlama ve iptal olaylarını koru. Atlanan/iptal edilen iş tamamlanmış iş değildir.
- Havuz/proje bağlantısı görev kimliğini değiştirmez. Günlere dağıtım görev kopyaları üretmez.

## Kontrol ve teslim

Değişen davranışı süre örnekleri, derin ağaç, döngü ve durum geçişi testleriyle doğrula. Büyük ağaçlarda düğüm başına DB sorgusu yapma. Kapsam dışı planlama veya sayaç özelliklerini aynı MVP'ye ekleme.

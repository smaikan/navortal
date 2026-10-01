# Metrik sözleşmesi

Başlangıç referansı kullanıcı tarafından ilk kabul edilen günlük planın sabit snapshot'ıdır; güncel plan onun yerine geçmez. Referansın kesin dondurma anı MVP-00'da belgelenir. Sonradan gelen acil iş başlangıç paydasına gizlice eklenmez.

| Metrik | Tanım |
| --- | --- |
| Görev tamamlama | Rapor kesiminde completed bağımsız iş birimleri / referans plandaki bağımsız iş birimleri |
| Süre ağırlıklı tamamlama | Completed birimlerin referans tahmin toplamı / bilinen referans tahmin toplamı |
| Planlanan aktif süre | Referans planın work blokları; break/buffer hariç |
| Gerçek aktif süre | Etkili work segmentlerinin rapor aralığıyla kesişimi |
| Günlük zaman kotası karşılığı | Her işte planlanan kotayla sınırlandırılmış gerçekleşen süre toplamı / planlanan kota toplamı |
| Tahmin sapması | Tamamlanan işin gerçek aktif süresi - referans tahmini |
| Başlangıç gecikmesi | İlişkili blok ve gerçek ilk başlangıç farkı; sabit/esnek ayrı |
| Revizyon | Kabul edilmiş plan değişiklikleri ve nedenleri; preview sayılmaz |
| Odak | Aktif focus süreleri, hedefe ulaşan oturumlar, ortalama ve overtime; work toplamına tekrar eklenmez |

## Ayrımlar

12 saatlik projede bugün bir saat çalışılması projeyi completed yapmaz. Günlük kota karşılığı ilerleyebilirken görev tamamlama 0 olabilir. Eksik tahmin süre ağırlıklı paydadan çıkarılır; dışarıda kalan birim sayısı ve kapsama oranı gösterilir. Boş payda null/hesaplanamaz sonucudur; yüzde uydurma.

Completed/Skipped/Canceled durumlarını ayır. Geçmiş günün kesim durumunu bugünkü task status'undan türetme; task events/snapshot bağlamını kullan. Sonradan yapılan izli correction etkili gerçek zamanı değiştirir; tarihsel plan baseline'ını değiştirmez.

Tahmin doğruluğunda tamamlanmamış işleri tamamlanmış işlerle aynı örnekleme koyma. Kullanılan tahmin snapshot'ı ve örnek sayısını belirt. Kategori değişikliğinin geçmişe etkisi revision/task snapshot sözleşmesiyle uyumlu olsun.

## Fixture önerisi

Başlangıçta 10 dk A ve 180 dk B; A completed, B açık; 35 dk acil C sonradan geliyor. Hem başlangıç hem güncel plan raporunu doğrula. Bir parent/container'ı ekleyince sonuç değişmemeli. Gece yarısı segmentini ve manuel correction ekleyince yalnız ilgili gerçek süre/kapsam değişmeli. Öneri üretmek, görev tahminini veya planı mutation olarak değiştirmemeli.

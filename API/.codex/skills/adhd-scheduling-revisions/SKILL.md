---
name: adhd-scheduling-revisions
description: ADHD planlayıcısının SchedulingEngine, TaskSchedules ve PlanRevisions yapılarını WorkSessions ile birlikte tasarla veya geliştir; önizleme, atomik uygulama, acil görev, bölme, çok günlük dağıtım ve güvenli geri alma için kullan.
---

# ADHD planlama ve revizyonlar

## Ortak modeli incele

Varsa kök sözleşmeyi, aktif MVP'yi, blok/oturum/revizyon modellerini ve ilgili testleri oku. Dört yapıyı ayrı gerçeklikler olarak koru: motor önerir; blok niyettir; oturum gerçekleşendir; revizyon kabul edilmiş geçmiş plandır.

- Veri veya işlem sınırı değişiyorsa [revizyonlar ve transaction'lar](references/revisions-and-transactions.md) referansını oku.
- Motor, acil görev veya geri alma davranışı değişiyorsa [motor senaryolarını](references/engine-scenarios.md) oku.

## Motor

- Sunucuda oluşturulan immutable snapshot ve açık planlama niyeti al; deterministik öneri üret. DB yazımı, bildirim ve sayaç başlatmayı motora koyma.
- Gerçek doğrudan kalan işleri kullan. Parent toplamını ayrıca planlama.
- Çalışma saatlerini, istisnaları, bağımlılıkları, sabitleri, kilitleri ve molaları uygula.
- Normal yeniden planlama aktif çalışmayı kesmez; acil başlatma açık kullanıcı niyetidir.
- Bölünmez işi parçalama. Bölünebilir işte minimum parça, son kalan parça ve tamponları dikkate al.
- Uygun mevcut yerleşimleri koru; enerji tercihi sert kısıtları geçersiz kılmaz.
- Yerleştirilemeyen işi ve nedenini döndür. Sezgisel başarısızlığı matematiksel imkânsızlık olarak sunma.
- Günlük taşmayı görünür tut; çok güne dağıtım seçilmiş tarih aralığında ayrı işlemdir.

## Uygulama

- Önizleme gerçek planı veya kabul edilmiş revizyon sayısını değiştirmez.
- Öneriyi sunucu snapshot sürümlerine bağla; apply sırasında sürüm ve zamana bağlı geçerliliği yeniden kontrol et.
- Idempotency ve kullanıcı başına kısa koordinasyon kilidiyle tekrar/eşzamanlılık risklerini yönet.
- Güncel bloklar, değişmez snapshot ve değişiklikler aynı transaction'da yazılır.
- Çok günlük işlem ortak ChangeSetId altında atomiktir.
- Geri alma telafi revizyonudur; oturumları, tamamlanmaları ve eski revizyonları geri silmez.

## Kanıt

Saf motor unit testleri ile gerçek DB transaction/concurrency testlerini ayır. İlgili invariant'ları doğrula; yalnız snapshot metni eşleştiren testle doğruluk iddia etme. Gerçekte uygulanan plan ile öneri farkını teslimde belirt.

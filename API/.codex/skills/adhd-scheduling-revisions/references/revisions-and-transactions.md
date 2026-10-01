# Revizyonlar ve işlem sınırları

## Kaynaklar

TaskSchedules güncel plan bloklarını tutar. PlanRevisionItems kabul edilmiş revizyondaki blokların değişmez kopyalarıdır. DailyPlan güncel revizyonu ve başlangıç referansını bilir. PlanRevisionChanges önceki/sonraki farkı ve nedeni tutar. WorkSessions gerçek çalışma kaynağıdır.

- Bir görevin birden fazla gün/blok/oturumu vardır.
- Sabitlik otomatik taşınamama; kullanıcı kilidi belirli yerleşimi korumadır. Manuel kullanıcı değişikliği ayrı niyettir.
- Deadline görev kısıtıdır; block end ayrı alandır.
- Çalışma, mola ve tampon blokları farklı türlerdir. Mola/tamponda TaskId boş olabilir.
- Blok kaldırıldığında geçmiş referanslarını koparan hard delete yapma.
- Oturumun başlangıç blok ve revision-item bağlamını güncel bloğa bakarak yeniden yazma.
- Snapshot tarihsel görev adı, parent yolu, kategori ve referans tahminini koruyacak yeterlilikte olmalıdır.
- Alan/property adları bu semantiği değiştirmeden MVP-00'da kesinleştirilir.

## Apply

Sunucu öneri kimliği, etkilenen planlar ve kullanıcı koordinasyon sürümünü doğrular. Görev, oturum, ayar veya zaman nedeniyle geçersizleşmiş öneri için anlamlı conflict döndür; yeni öneri gerektiren durumda aynı mutation'ı körlemesine retry etme.

Transaction güncel blokları, revizyonu, snapshot öğelerini, değişiklikleri ve varsa outbox'ı birlikte yazar. Birden fazla gün etkileniyorsa tamamı tek değişiklik grubudur. Aynı idempotency anahtarının farklı niyet/payload ile kullanımını denetle; aynı komut tekrarında ikinci revizyon yaratma.

## Acil başlatma

Tek sunucu zamanında eski açık segmenti kapat, eski oturumu duraklat ve yeni çalışmayı başlat. Kalan gün önerisini güncel gerçek çalışmadan üret. Preview modunda gerçek başlatma hemen gerçekleşir; öneriyi reddetmek bu gerçeği geri almaz. Otomatik modda feasible plan uygulanır, sığmayan işler görünür kalır.

## Geri alma

Eski DB snapshot'ını doğrudan geri basma. Son değişiklik grubunun geleceğe dönük ters etkisini hesapla; arada oluşmuş tamamlanma, çalışma, sabit blok ve bağımlılıkları doğrula. Uygulanabilen telafiyi yeni revizyon olarak yaz. Tam telafi mümkün değilse açık fark/uyarı önizlemesi sun.

## Integration senaryoları

İki apply yarışı; kayıp yanıt sonrası aynı komut; revision-item yazımında hata; iki günlük taşımanın ikinci gününde hata; oturum başlatılırken stale proposal; arada görev tamamlandıktan sonra undo; taşınmış bloktan başlamış eski oturumun referansı; kullanıcının başka kullanıcı planına erişim girişimi.

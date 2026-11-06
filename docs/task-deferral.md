# Görev Ertele — 27 Ekim 2026

`POST /api/calendar/days/{date}/defer-tasks` kullanıcının açıkça seçtiği görevleri tek işlemde farklı günlere erteler. İstek `tasks: [{ taskId, targetDate }]` ve güncel `expectedPlanningVersion` içerir; `Idempotency-Key` zorunludur. 1–50 farklı görev seçilebilir. Her hedef kaynak günden sonra olmalıdır.

Sunucu, seçilen görevin kaynak gündeki bütün açık/saatli ve saatsiz plan parçalarını kendisi bulur. UI sayfalarının tamamının yüklenmesi gerekmez. Kaynak toplamı 500 öğeyi aşarsa işlem reddedilir. Saat tahsisleri kaldırılır; hedefte saatsiz bir öğe oluşur. Hedefte aynı görevin açık öğesi zaten varsa kimliği, saati ve sürümü korunur; kopya üretilmez. Rutin oluşumundan üretilmiş görev, tamamlanmış hedef öğesi, çalışan görev, sabit/kilitli kaynak, stale sürüm veya yabancı/missing görev bütün seçimi reddeder. Tamamlanmış kaynak parçaları taşınmaz.

27 Ekim ek kullanıcı kararı: Rutin görevleri ertelenemez. `defer_recurring_task`409 kodu hem görev başına tarihli uçta hem eski tek hedefli `defer`/`defer-preview` akışında uygulanır; `allowProtectedChange` bunu aşmaz. Karışık seçimde normal görev de taşınmaz. Gün overview yanıtındaki `recurringTaskIds`, yalnız dönen saatli/saatsiz sayfalardaki rutin görevleri belirtir; owner snapshot içinde tek toplu sorguyla okunur. UI bunları gerekçesiyle devre dışı gösterir; satır başına ek HTTP isteği yoktur.

Tüm hedefler önce doğrulanır; uygulama tek transaction, tek ChangeSet ve tek planning version artışıdır. Bir hedefte DB hatası diğer hedeflerdeki değişiklikleri de geri alır. Başarılı `DayDeferralResult.items` farklı `localDate` değerleri içerebilir; istemci her öğeyi kendi seçili görev/tarih çiftiyle doğrular. Revision listesi yalnız gerçekten değişen günleri içerir. Görev tanımları ve gerçek çalışma kayıtları değişmez; sayaç başlamaz.

Aynı normalize edilmiş seçim ve aynı key özgün sonucu döndürür; HTTP yanıtında `Idempotent-Replay` işareti vardır. Sonucu belirsiz işlem otomatik tekrar edilmez. UI yalnız açık kullanıcı eylemiyle aynı dondurulmuş komutun sonucunu alır. Mevcut `/api/day-items/undo` değişiklik grubunu birlikte geri alabilir; bu panelde ek önizleme veya onay adımı yoktur.

Arayüzde her görevin kendi tarih alanı vardır. Seçim işaretlenene kadar tarih devre dışıdır; seçildiğinde yarın gelir. Kaynak ileri bir günse hedef kaynak günün ertesi olur. Geçmiş bir kaynakta varsayılan gerçek yarındır. Başka geçerli sonraki tarih seçilebilir.

Wire alanları `energyDemand`/`availableEnergy`, enumlar `Low/Medium/High` ve mevcut `/energy` adresi korunur. Türkçe kullanıcı dili **Efor** olarak güncellenmiştir. Tarihsel kanıtlar yeniden adlandırılmaz.

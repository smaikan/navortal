# Takvim ve geçmiş gün — MVP-21

Takvim üç ayrı gerçeği döndürür: kabul edilmiş plan, effective gerçek çalışma ve görev tamamlanma olayları. Biri diğerinin yerine geçmez. Bütün uçlar uygulama JWT'siyle kullanıcıya özeldir.

## Okuma sözleşmesi

- `GET /api/calendar?fromDate=2026-10-01&toDate=2026-11-11`: iki sınır dahil 1–42 gün. Gün/hafta/ay ve altı haftalık ay ızgarası aynı sorguyu kullanır. Boş günler sıfırlarla döner; okuma DailyPlan oluşturmaz.
- `GET /api/calendar/days/2026-10-15`: summary, plan, actual, completions ve serverNow. Üç listenin bağımsız `planOffset/planLimit`, `actualOffset/actualLimit`, `completionOffset/completionLimit` parametreleri vardır. Varsayılan limit50;1..100, offset0..100000. Summary sayfalanmış parçanın değil bütün günün toplamıdır.
- `revisionId` verilirse aynı güne ve kullanıcıya ait immutable revision item'ları okunur; aksi halde current revision kullanılır. Summary daima current/baseline/actual durumunu gösterir; seçilen revision yalnız `plan` bölümünü değiştirir. Revision numarası/kimlikleri summary'dedir. Revizyon listesi ve farklar mevcut `/api/daily-plans/{date}/revisions` ve `/api/plan-revisions/{id}/changes` uçlarından sayfalı okunur.

Plan summary; çalışma/mola/tampon saniyelerini, bütün plan bloklarının sayısını ve ilk iş planının baseline çalışma süresini ayrı verir. Baseline güncel kısaltma/kaldırma ile yeniden yazılmaz. Actual yalnız nonvoid WorkSessionSegments kesişimidir; parent roll-up veya correction journal ikinci kez eklenmez. Açık segmentte tek serverNow kesimi kullanılır. `hasOpenWork` bugün içinde hâlâ süre üreten açık kaydı belirtir. Bir geçmiş actual item'ın `sessionStillRunning` değeri oturumun bugün de açık olduğunu gösterebilir.

`completedTaskCount` o yerel günde Pending/Paused/... durumundan Completed durumuna geçen **benzersiz TaskId** sayısıdır; otomatik tamamlanan container/parent da bir görev olayıdır. Analitik bağımsız iş completion paydası değildir. `completions.total` olay sayısıdır: aynı görev yeniden açılıp tamamlanmışsa birden çok olay, summary'de bir görev olabilir. Geçmiş completion bugünkü status'tan türetilmez.

## Tarihsel bağlam ve zaman

Plan adı, ancestor yolu ve sınıflandırması revision snapshot'tan; actual adı/yolu çalışma başlangıç snapshot'ından gelir. Bugünkü task adı/yolu ile boş alanlar doldurulmaz. Manuel geçmiş kayıt eklemesindeki TaskAtStart, tarihsel anda görülmüş bilgi iddiası taşımaz: mevcut CapturedAt/RecordedAt kayıt anını açıklar.

Plan ve actual item'larında `taskAtDayEnd`, kaynak günün bitişinden önceki son görev olayından hesaplanır. Bugünkü gün için serverNow dahildir; geçmiş gece yarısı bitişi hariçtir. Event sequence sıralama otoritesidir. O tarihte olay yoksa veya legacy payload state taşımıyorsa `available=false`, state=null; bugünkü task durumu kullanılmaz. Revision içindeki TaskSnapshot.State kabul anının durumudur, gün sonu durumundan farklı olabilir.

Her DailyPlan kendi frozen zone'unu korur. WorkSession kendi frozen zone'unda yerel günlere kesişir. Yeni TaskEvent'lerin TimeZoneId'si insert transaction'ında o anki tercihten alınır (tercih yoksa Europe/Istanbul). Tercih değişimi eski plan/work/event kayıtlarını yeniden tarihlendirmez. Aynı tarih özeti kaynakların kendi tarih bağlamlarını birleştirir; summary zone plan varsa planın, yoksa mevcut tercihin gösterim zone'udur. Actual ve completion item'ları kaynak zone'u ayrıca taşır.

UTC instant aralıkları `[start,end)`; 23:30–00:30 çalışma30+30 dakikadır, aynı SessionId ve kaynak segment kimliği korunur. Aktif saniye decimal, mikro-saniye hassasiyetindedir. Gün sınırları .NET IANA kurallarıyla oluşturulur; Berlin DST günleri23/25 gerçek saat verir. Midnight ambiguity için PlanTime'ın ilk geçerli/erken instant politikası kullanılır; kaybolan gün sıfır kesişimdir. Aynı SQL'de PostgreSQL'in farklı ambiguous-time varsayımıyla sınır yeniden üretilmez.

Migration önceki TaskEvent zone'unu tahmin ederek doldurmaz. `legacyZoneCompletionCount`, aralığa UTC±1 gün içinde aday olabilen ama özgün zone'u bilinmeyen completion olaylarını bildirir. Bunlar günlere veya completedTaskCount'a uydurma şekilde dağıtılmaz; bu sayı kesin yerel gün toplamı değildir. Başka kullanıcı veya sınırsız geçmiş bu sayıya dahil edilmez.

## Gün sonu seçenekleri

- Kalan açık işi başka güne/haftaya ayır: `POST /api/calendar/days/{sourceDate}/carry` + Idempotency-Key (1..100 karakter), body `{fromDate,toDate,taskIds,expectedPlanningVersion?}`. Hedef kaynak tarihten sonra başlamalı; açık1..31 günlük aralık. Mevcut DistributionService ve aynı motor kullanılır. Preview varsayılanında plan değişmez; onay mevcut `/api/scheduling/distribute-apply` üzerinden. Auto tercihi otomatik uygular. Aynı TaskId, actual ve diğer gün rezervasyonları korunur; key replay yeni etki üretmez.
- Carry **kalan tahsis edilmemiş miktarı** yerleştirir; başka gündeki gelecek rezervasyonu sessizce silmez. Önceden ayrılmış gelecekteki bloğun yerini değiştirmek için MVP-20 `POST /api/schedules/{id}/move` kullanılır. Bitmiş geçmiş bloğu taşımak yerine kalan iş carry ile planlanır. Kaynak gün tarihsel bağlamdır, silinecek plan listesi değildir.
- Havuzda beklet: `POST /api/calendar/days/{date}/tasks/{taskId}/pool` + key, body `{version,expectedPlanningVersion,poolId,allowProtectedChange?,reason?}`. Yalnız seçilen task'ın pool bağlantısı değişir; proje/kategori/tag/alt görevler korunur. O task'ın gelecekteki Work tahsisleri soft kaldırılır; şimdiye taşan bloğun geçmiş prefix'i korunur. Sabit/kilitli tahsis açık niyet ister. Aktif task önce duraklatılmalıdır; çağrı actual'ı kendiliğinden kesmez. Task tamamlanmaz/iptal edilmez.
- Pool değişimi, TaskEvent, bütün etkilenen günlerin full revision'ları (DayEnd/ortak ChangeSet), planningVersion ve idempotency receipt tek user-lock transaction'ındadır. Hata hepsini geri alır. Eski revision ve actual değişmez. Sonradan plan undo, görev sınıflandırmasını geri almaz; planın güvenli gelecekteki ters etkisini ayrı değerlendirir.
- İptal mevcut task lifecycle; belirli saatle gelecek aya koyma mevcut manual schedule/move; günlere dağıtma mevcut distribution komutudur. Yeni bir motor veya task kopyası oluşturulmaz.

## Sorgu sınırları

Range yalnız en çok42 günün aggregate'lerini ve day/version referanslarını taşır. Actual SQL aralık kesişimi, nonvoid filtre ve frozen zone ile toplar; task tree/tüm segment entity'leri yüklenmez. Day snapshot ve actual/completion listeleri DB'de sayfalanır; historical state sadece sayfadaki task/zone anahtarları için lateral son olay sorgusudur. Bütün okuma bir RepeatableRead snapshot'ıdır. Yıllık performans p95 bütçesinin ölçümü MVP-29'dadır; burada ölçülmüş hız iddiası yoktur.

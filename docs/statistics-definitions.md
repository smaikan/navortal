# İstatistik tanımları

Uygulanan kısım: MVP-27 gerçek çalışma/odak ve MVP-28 plan uyumu/tahmin raporları. Actual ile plan karşılaştırma endpoint'leri ayrı veri sözleşmeleridir.

## Ortak rapor sözleşmesi

GET `/api/analytics/actual?fromDate=2026-10-01&toDate=2026-10-31&bucket=Day|Week|Month` ve GET `/api/analytics/actual/breakdown?fromDate&toDate&dimension=Task|Project|Category&offset=0&limit=50`. Aynı uygulama JWT'si gerekir; userId request parametresi otorite değildir. Rapor salt okunurdur; focus hedefini gözlemlemek için sayaç state'ini değiştirmez, yeni DailyPlan/revision/task üretmez.

Tarih aralığı yerel etiketlerle iki uç dahil1..366gün; yıl2..9998. Half-open UTC aralıklar gün sınırlarıyla türetilir. `bucket=Week`, kullanıcının güncel WeekStartsOn (0Pazar..6Cumartesi) sunum tercihini kullanır; Month takvim ayıdır. BucketStart doğal hafta/ay başlangıcı, FromDate/ToDate talep aralığıyla kesilmiş kapsamdır. Günlük boş bucket'lar da döner. Sayfa offset0..100000/limit1..100; yoğunluk sınırı bir sorguda50000segment/focus; aşılırsa409 `analytics_range_too_dense`, kısmi toplam dönmez.

`TimeZonePolicy=SourceSessionZone`: her gerçek çalışma ve ona bağlı focus kendi WorkSession.TimeZoneId'siyle tarihli günlere ayrılır. Kullanıcının bugünkü zone değişimi geçmiş actual'ı yeniden tarihlendirmez. Bir yerel etiket farklı kaynak zone'larından veri toplayabilir; SourceTimeZones bunu açıklar. Query bugünün zone'unda sessiz yeniden projeksiyon yapmaz. DST günü23/25saat olabilir; görünen saatler çıkarılarak süre bulunmaz. Şu anki açık segmentin sonu response.ServerNow; geçmiş rapor gününün bitişinde kesilir. RepeatableRead aynı raporun veri ve planningVersion görünümünü tutarlı okur.

Süreler decimal saniye, PostgreSQL'in mikro saniye hassasiyeti korunur. API metriklerini dakikaya veya tam sayıya yuvarlamaz; UI gösterimde yuvarlayabilir. Her metrik toplamı tüm rapor üzerindedir; distinct count/ortalama bucket değerlerini toplayarak tekrar hesaplanmamalıdır.

## Gerçek çalışma metrikleri

| Alan | Kaynak / pay / kapsam |
| --- | --- |
| WorkSeconds | IsVoided=false effective WorkSessionSegment ile rapor günlerinin kesişimi; pause/break/buffer ve correction journal eklenmez |
| TaskWorkSeconds | WorkSeconds'in gerçek TaskId'si bulunan bölümü; doğrudan task düzeyinde |
| GeneralWorkSeconds | TaskId=null çalışma; uydurma görev/proje atanmaz |
| ManualWorkSeconds | WorkSeconds'in WorkSession.Source=Manual bölümü; WorkSeconds'e ayrıca eklenmez |
| SessionCount | Rapor aralığında pozitif effective çalışma veren distinct session kimlikleri |
| SegmentCount | Pozitif kesişimi bulunan distinct effective segment kimlikleri; gece yarısında iki bucket'a bölünse toplamda1 |
| MissingSnapshotSeconds | TaskId var fakat eski session.TaskSnapshot yok: geçmiş bağlamı bilinmeyen actual kapsamı |

Parent roll-up rapora eklenmez. Parent kendi600sn doğrudan işi, child1200sn işi varsa task actual1800sn'dir. Parent toplamı1800 diye bir kez daha eklenmez. Genel focus900sn çalıştıysa toplam2700sn; focus metriği aynı900sn'nin alt kümesidir, toplamı3600 yapmaz.

## Odak metrikleri

FocusSession'ın kendi StartedAt..WorkEndedAt/server cutoff aralığı effective segmentlerle kesiştirilir. Preset'teki çalışma hedefi her cycle için ayrı, snapshot'tan okunur. Mola ve pause aralıkları actual/focus süresini tüketmez. Hedefe ulaşmak task completed değildir.

| Focus alanı | Tanım |
| --- | --- |
| ActiveSeconds | Cycle sınırları ve rapor günleriyle kesişen effective çalışma; WorkSeconds'in alt kümesi |
| OvertimeSeconds | Cycle'ın başlangıcından itibaren aktif hedef saniyesini tüketen sırada, hedef sonrası gerçek aralıkların rapor kesişimi; pause boşluğu aşım olmaz |
| ActiveCycleCount | Rapor aralığında pozitif Focus ActiveSeconds veren distinct cycle kimlikleri |
| StartedCount | StartedAt instant'ı rapor yerel günlerinde olan cycle'lar;0actual olabilir |
| FinishedCount | State=Finished, EndedAt instant'ı raporda; Interrupted finish sayılmaz; çalışma önceki dönemde olabilir |
| EffectiveTargetsReached | Corrected effective segmentlerle bulunan hedef instant'ı raporda olan distinct cycle'lar; rapor kesiminden sonraki çalışma geçmiş hedefi tamamlamaz |
| RecordedTargetsReached | Kalıcı TargetReachedAt instant'ı raporda olan distinct cycle'lar; correction geçmiş gözlemi silmez |
| AverageActiveSeconds | Rapor Focus ActiveSeconds / ActiveCycleCount; payda0 ise null |

Ortalama cycle'ın bütün ömrünün ortalaması değildir: raporda kalan bölümün ortalamasıdır. 23:50–00:10,15dk hedef: her gün600sn focus; ikinci gün300sn overtime ve bir effective target. İki günün distinct ActiveCycleCount toplamı1; iki günlük bucket count'ları toplanırsa2 olacağı için bu işlem yapılmaz. Hedefin altına correction sonrası effective target0 olabilirken recorded target1 kalabilir; bu veri çelişkisi gizlenmez.

## Dağılım ve tarihsel metadata

Breakdown satırları taskId + o çalışmanın snapshot başlığı; project/category için snapshot ID + ad + SnapshotAvailable ile gruplanır. Aynı kategori ID'sinin yeniden adlandırılmasından önce/sonra farklı isimli iki satır çıkabilir; toplam actual değişmez. Bugünkü task/project/category tablosu geçmiş etiketi doldurmak için kullanılmaz. Legacy snapshot yoksa `Geçmiş bağlam bilinmiyor`, SnapshotAvailable=false; snapshot var ama sınıflandırma boşsa `Sınıflandırılmamış`, true. Genel çalışma `Bağımsız odak`, nullID/true. Foreign kullanıcının ID'si bu gruplara join edilmez.

Dağılımın TotalWorkSeconds tüm rapordur; sayfalı Items toplamı bütün rapor toplamı diye sunulmaz. Boş rapor WorkSeconds0, counts0, FocusAverage null ve boş dağılım üretir. Manuel düzeltme effective actual ve focus hesabını günceller; baseline veya tarihsel adları değiştirmez.

Kabul fixture'ları `ActualAnalyticsTests` ve `AnalyticsTimeTests` içindedir.

## Başlangıç / güncel plan karşılaştırması — MVP-28

GET `/api/analytics/plans?fromDate&toDate&startToleranceSeconds=60` iki referansı aynı RepeatableRead görünümünde döndürür. GET `/api/analytics/days/{date}/review` aynı hesabın tek günlük özetidir. Aralık1..366gün, tolerans0..3600sn. Plan revision seçimi serverNow'daki DailyPlan.BaselineRevisionId/CurrentRevisionId'dir; geçmiş gün raporunda bile Current en son kabul edilmiş sürümü ifade eder. Task completion ise ilgili yerel günün/report aralığının bitişi ile serverNow'dan erken olan kesimdeki immutable TaskEvent'ten gelir. Böylece bugünkü reopen geçmiş tamamlanmayı bozmaz. Kaynak zaman dilimi DailyPlan.TimeZoneId; total'da her task'ın ilk seçilmiş reference snapshot'ının zone'u kullanılır.

Baseline ilk kabul edilmiş Work içeren tam revision'da donar. Sonraki accepted revision yerine geçmez. Örneğin A600+B10800 ilk snapshot; C2100 sonra eklenir ve A/C tamamlanırsa başlangıç count1/2, süre600/11400; güncel count2/3, süre2700/13500 olur. Snapshot'ın fiilen kabul edildiği anda bulunan iş kümesi paydadır; sonradan düzenlenmiş ilk plan taslağı uydurulmaz.

| PlanMetrics | Hesap |
| --- | --- |
| PlannedWorkSeconds | Referans Work bloklarının ham süre toplamı; Break/Buffer hariç |
| ConflictingPlannedSeconds | Gün başına ham Work−Work aralıklarının birleşim süresi; manuel kabul edilmiş overlap görünür kalır |
| ComponentCount | Referans snapshot'ında HasDirectWork=true olan distinct TaskId; container/ancestor roll-up eklenmez |
| CompletedComponentCount | Kesimdeki task HasDirectWork ve DirectWorkCompleted=true; skipped/canceled/deferred hariç; parent'ın kendi işi açık çocuklarından ayrı olabilir |
| UnknownCompletionCount | Task history/bağımsız iş tanımı kesimde bilinmiyor veya doğrudan iş artık container'a dönüştürülmüş |
| CountCompletion | CompletedComponentCount/ComponentCount; boş payda, unknown completion veya eksik block snapshot'ı varsa null |
| KnownEstimatedSeconds | Her distinct component'in referans DirectEstimatedSeconds toplamı; TargetBudget eklenmez |
| KnownCompletedEstimatedSeconds | Completed component'lerin bilinen referans tahminleri |
| UnknownEstimateCount | Referansta tahmini null component sayısı; null sıfırmış gibi eklenmez |
| EstimateCoverage | Bilinen tahminli component sayısı / component sayısı; boş payda null |
| DurationCompletion | KnownCompletedEstimatedSeconds / KnownEstimatedSeconds; bilinmeyen tahmin paydadan dışarıda ve kapsam görünür;0payda/unknown state/missing snapshot varsa null |
| ConflictingEstimateCount | Aynı task'ın aynı seçilmiş referans kümesinde farklı tahmin snapshot'ları bulunması; sessiz toplanmaz |
| MissingSnapshotBlockCount | Metadata'sı olmayan Work snapshot sayısı; completion oranını tam bilgi varmış gibi üretmez |
| QuotaSeconds | Her task/yerel gün için Work bloklarının birleşimi; sonra task/gün kotalarının toplamı |
| QuotaFulfilledSeconds | Her task/gün için min(kota, o source-session yerel gün etiketinde kaydedilmiş actual) toplamı |
| QuotaRatio | Fulfilled/quota; boş payda null; görev completion'ı değildir |
| UnplannedActualSeconds | Referansta bulunmayan task'lar ve bağımsız genel actual; report actual'a zaten dahildir |

Bir task farklı günlerde yer alsa total component/tahmin sayısı bir kezdir. İlk tarih, sonra startsAt/scheduleId ile seçilen ilk referans tahmini otoritedir; farklı snapshot varsa ConflictingEstimateCount bunu açıklar. Day metrikleri kendi günlük referansını kullanır. Dolayısıyla day count/tahmin toplamları period total diye toplanmamalıdır. Quota günlüktür ve toplamda gün başına toplanır. Aynı task için overlapping iki blok iki kez actual kazanamaz; farklı task'ların çakışmalı kotaları ham planın kabul edilmiş kapasite sorununu temsil eder.

ActualSeconds ve günlük quota actual'ı `SourceSessionZone` gün kesişimini kullanır; zone değişikliği geçmiş kaydı başka tarihe taşımaz. Plan snapshot kendi frozen plan zone'unda kalır. Gerçek çalışma plan bloğunun saatleriyle birebir örtüşmek zorunda değildir: quota gün içinde o işe yapılan gerçek çalışmayı ölçer; dakikası dakikasına adherence iddiası değildir.12saatlik task'a bugün1saat planlanıp1saat çalışılması quota1 verirken completion0 kalır.

## Başlangıç gecikmesi, revizyon, erteleme ve sapma

FixedStarts/FlexibleStarts yalnız WorkSession.StartedScheduleId ile gerçekten bağlanmış bloklardan örnek alır. Aynı task diye plansız oturum bir bloğa yakıştırılmaz. İlk pozitif effective segment başlangıcı−seçili referans block.StartsAt, signed saniyedir. Tolerans dahil aralık on-time; toleranstan daha geç Late, daha erken Early. AverageSignedDelaySeconds bütün örneklerin işaretli ortalaması; AverageLateSeconds yalnız Late ham gecikmelerinin ortalaması (tolerans çıkarılmaz); örnek var/late yoksa0, örnek hiç yoksa null. Baseline ve current aynı gerçek başlangıcı kendi snapshot saatleriyle ayrı karşılaştırır.

RevisionCount seçilmiş DailyPlan'ların serverNow'a kadar kabul edilmiş revision sayısıdır; preview hariç, ilk accepted dahil. RevisionReasons trigger+gerçek reason gruplarıdır; çok revision başarısızlık olarak yorumlanmaz. DeferCount TaskEvent'te State Deferred'a gerçek geçişlerdir; aynı task iki ayrı deferral yaşarsa iki olaydır. İsteğe bağlı `POST /api/tasks/{id}/state` `reason` alanı en çok2000 karakter, boşsa null. Neden ancestors dahil aynı mutation'ın event data'sında initiatingTaskId ile kalır. Eski nedenler icat edilmez: DeferReasons.ReasonAvailable=false. Zone'u bilinmeyen legacy defer adayları günlere sessiz atanmaz, LegacyZoneDeferCount ayrı görünür.

Accuracy yalnız kesimde completed bağımsız component + bilinen referans tahmin + pozitif kaydedilmiş actual örneklerini kullanır. Gerçek lifetime task segmentleri raporun task/zone kesimine kadar toplanır; raporun ilk gününden önceki work de aynı tamamlanmış işin gerçek süresine dahildir. Hata=actual−referans tahmin; MAE=abs(hata) ortalaması. Referans tahmini güncel Task tahminiyle değiştirilmez. Completed ama hiç recorded work yoksa ExcludedWithoutRecordedWorkCount artar; unutulmuş sayacı sıfır gerçek emek varsayıp yanıltıcı sapma üretmez. Örnek yoksa ortalamalar null.

## Geçmiş süre önerisi

GET `/api/analytics/estimate-suggestion?taskId&fromDate&toDate`, owner task için salt okunur öneridir. Karşılaştırma sırası: aynı recurrence template; yoksa hedefin güncel category ID'si; yoksa project ID'si; bunlar yoksa no_comparable_context. Örneklerin sınıflandırması tamamlanma anındaki TaskEvent snapshot'ından gelir; sonradan kategori değişimi geçmiş örneği yeniden sınıflandırmaz. Target task örneklemin dışındadır. Seçili aralıkta en son direct completion geçişi alınır; aralık kesiminde reopened/skip/cancel olan iş kullanılmaz. Aynı task iki kez örnek sayılmaz.

Örnek actual'ı completion instant'ına kadar positive effective lifetime work'tür. En az3 karşılaştırılabilir, recorded actual'lı completed task varsa median ActualSeconds önerilir; çift örnekte ortadaki ikisinin ortalaması. Az örnekte SuggestedSeconds=null/insufficient_samples; hiç karşılaştırma bağlamı yoksa no_comparable_context. Unknown estimate bulunan completed iş pozitif actual'ı varsa median için kullanılabilir; bu bir sapma oranı değildir. ExcludedWithoutWorkCount ve ExcludedUnknownZoneCount kapsamı açıklar. SampleCount bütün uygun örnekler; Samples en yeni20 ile sınırlı preview, SampleLimit20. Applied daima false; task estimate/plan/version değişmez. Öneriyi kabul etmek kullanıcının ayrı normal work-definition komutudur.

Plan/work/focus alanları tekrar yazılmaz. Kaynak satırlar50000 sınırında; yoğun veri409 ile açık daha dar pencere ister. Şema değişmedi; optional reason mevcut immutable event JSON payload'ında saklanır. Formül fixture'ları `PlanAnalyticsTests` ve `PlanMetricMathTests` içindedir.

## Rutin tamamlama

GET `/api/analytics/recurrences?fromDate&toDate&compareFromDate&compareToDate&offset&limit` rutin listesini, GET `/api/analytics/recurrences/{id}` tek rutini okur. Salt okunurdur, görev veya oluşum üretmez. Aralık1..366gün; karşılaştırma aralığı birlikte verilir.

Her rutin günü tek sınıfa girer. Tarih sınırı oluşumun saat dilimidir, bugün rutinin güncel saat diliminden gelir.

| Sınıf | Tanım | Oranda |
| --- | --- | --- |
| OnTime | Görev, oluşum gününün sonunda tamamlanmış durumdaydı; önceden bitirmek dahil. Sonraki reopen değiştirmez | Pay ve payda |
| Late | Gün sonunda açıktı, serverNow anında tamamlanmış | Pay ve payda |
| NotDone | Günü geçti, görev açık, duraklatılmış veya ertelenmiş | Payda |
| TodayPending | Bugünkü açık görev | Dışarıda |
| Skipped | Kullanıcı atladı/iptal etti, görev Skipped/Canceled veya silinmiş | Dışarıda |
| NotGenerated | O günün tanımına göre rutin günü ama görev oluşmadı; sistem kapanışı (SeriesPaused, SeriesChanged, DstGap) dahil. Şablon oluşmadan önceki günler sayılmaz | Dışarıda |

Consistency=(OnTime+Late)/(OnTime+Late+NotDone); payda0 ise null. Pasif/etkin geçmişi tutulmadığından pasif dönem NotGenerated olarak görünür ve oranı etkilemez. Geçerli gün her tarih için o gün yürürlükteki tanımdan seçilir; tanım değişikliği geçmişi yeniden yazmaz. Sıralama: en az3 görevi olanlar Consistency azalan, kalanlar görev sayısı azalan. Pasif rutin yalnız dönemde görevi varsa listelenir.

Detay penceresi: Days son6 takvim ayı, Weekdays son26 hafta, Recent/Prior bugünle biten28 gün ve önceki28 gün, LongestRun son365 gün. Work yalnız tamamlanmış görevlerin effective segmentlerini toplar; süresi olmayan görev ortalamaya girmez, ExcludedWithoutWorkCount sayar. Yoğunluk sınırı50000 kayıttır.

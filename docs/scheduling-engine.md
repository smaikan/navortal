# SchedulingEngine ve kabul yürütmesi — MVP-00

Durum: temel saf motor15 uygulanmıştır. Split/tampon/eski slot koruma16 uygulanmıştır; HTTP koordinasyonu17 ve sonrasındadır. Aşağıdaki acil/multi-day/undo yürütmeleri ilgili paketler uygulanana kadar tasarımdır.

MVP-10 graf sözleşmesi: TaskGraphRules her görev için start/completion marker kullanır. Parent start→child start; required child completion→parent completion; gerçek predecessor completion→successor start. Optional child'ın parent tamamlandıktan sonra koşması mümkündür; bununla gerçek self-wait ayrılır. Motor dependency normalizasyonu bu semantiği korumalıdır; tüm altları kartezyen bağlayarak optional işleri yanlış bloklamamalı. Actual start mevcutCompleted state'lerini tekrar kontrol eder; projected completion actual izin değildir. Soft-order döngüsü hard execution cycle sayılmaz; motor uygulanamayan tercihi açıklar.

## Girdi/çıktı

Snapshot server now, user zone, horizon, PlanningVersion, doğrudan iş bileşenleri, actual totals, diğer gün tahsisleri, fixed/locked/current blocks, çalışma aralıkları ve istisnalar, dependency/order, break/buffer/energy/critical. Intent DayReplan/InsertNow/InsertAfter/Distribute/Undo; seçili task/gün/anchor ve açık kullanıcı kısıtlarını içerir.

Proposal output blocks, changes, unplaced(task,seconds,reason), warnings ve explanation codes taşır. AlgorithmVersion=`heuristic-v1`; schemaVersion=1. Aynı snapshot/intent aynı sıralanmış çıktı. NoEstimate, InsufficientCapacity, NoContiguousSlot, DependencyBlocked, FixedConflict, DeadlineRisk ayrı kodlardır.

## Öncelik

Önce geçmiş ve korunan aktif/fixed/locked, sonra gerçek prerequisite DAG. Hazır adaylar deadline slack (negatif/en az önce), critical, priority (High>Normal>Low), açık soft order, mevcut uygun slotu koruma, SortOrder/Id ile sıralanır. Enerji yalnız eşdeğer feasible adayda tie-break'tir. Soft cycle preference dışlanır ve warning olur; hard cycle mutation'da reddedilir.

Container açık doğrudan iş bileşenlerine genişler. Remaining=max(0,estimate-actual) yalnız açık bilinen işte; estimate tükenmiş açık iş NeedsEstimateExtension uyarısıdır. Başka günlerde kalan tahsis horizon dışında rezerv miktar olarak düşülür; current horizon yeniden oluşturulurken kendi eski tahsisi çift düşülmez.

Çalışma slots - union(fixed/lock/break) kullanılır. Fixed dışarıda çalışma saatinde de kendi yeriyle korunur; uygun saatlerin capacity'si negatif olmaz. Auto yeni overlap üretmez. Non-split tek slot; split min900s, son remainder daha küçük olabilir. Transition work değildir. Hard deadline öncesinde arama; yerleşmezse risk/unplaced açık, geç kalmış işi başarı etiketiyle doldurma.

## Preview/apply

Preview server snapshot'ını alır, saf engine'i çağırır, proposal saklar ama current plan/revision'a dokunmaz. Apply user row lock altında proposal owner, PlanningVersion, TTL, input hash ve güncel feasibility kontrol eder. Stale 409; aynı idempotent komut aynı yanıt. Revision+current+items+changes bütün günlerde bir commit. Aktif work'ün canlı saniyeleri yüzünden gereksiz her saniye stale üretme; süre/protected anchor feasibility değiştiyse yeni öneri iste.

## Kabul yürütmesi 1: 09:20 acil

Girdi 09–10 React(60), 10–11 Backend(60), 11–11:30 fixed; capacity 12'ye kadar; tampon0. WorkSession React segmenti [09,09:20) kapatılır ve actual1200s saklanır. Acil session [09:20,open) başlar; hedef1800s. React remaining2400s. Eski plan revision1 değişmez.

Öneri: acil09:20–09:50; React09:50–10:30; Backend10:30–11 ve11:30–12. Fixed11–11:30 korunur. Yeni current plan/revision2 bunu yazar; revision1 09–10 React'i göstermeyi sürdürür. Gerçek segment ayrıca korunur; plan satırı ikinci actual oluşturmaz. Non-split Backend için slot yok sonucu veya sonraki açık tam slot; gizli split yok. Preview reddi acil session'ı silmez.

## Kabul yürütmesi 2: günler arası move

Pazartesi schedule S, Task T için3600s. Salı slot uygunsa aynı S kimliği Salı planına alınır; Pazartesi revisionN+1'de kaldırma, Salı revisionM+1'de ekleme aynı ChangeSet C. S'ye daha önce bağlı actual ve revision item FK değişmez. Salı snapshot insert fail → transaction rollback → iki gün de eski halde; idempotency kaydı da yazılmaz.

## Kabul yürütmesi 3: arada tamamlandıktan sonra undo

C sonrası T'de1200s çalışılmış ve task completed. Undo C'nin gelecekteki ters etkisini hesaplar; completed T için yeni work reservation restore edilmez, warning üretir. Actual ve task event değişmez. Uygulanabilir diğer bloklar telafi ChangeSet U/revision ile geri alınır. Eski C/revisions kalır. Artık fixed'le çakışan bir slot zorla yazılmaz; partial preview kullanılır.

## Kabul yürütmesi 4: correction

09–10 kaydı yanlışsa kullanıcının 09–09:40 düzeltmesi effective segmenti2400s yapar; previous3600s/new2400s immutable audit. Overlap başka session'a girerse DB reddi ve audit dahil rollback. Plan baseline değişmez; actual raporu son effective değeri alır. Undo plan bu correction'ı tersine çevirmez.

## Invariant ve test eşleştirme

T01/T02/T11 task resolver; T03 lifecycle; T04 urgent; T05/T06/T07/T14 engine; T08/T09 graph/start; T10/T18 revision/undo; T12 time slicing; T13 multi-day; T15/T17 session; T16 recurrence; T19 ownership; T20 coordinator. Determinism, quantity conservation ve hard-constraint korunumu unit/property test; rollback/race HTTP+gerçek PostgreSQL ile.

# MVP-15 uygulama sözleşmesi — tamamlandı

Saf engine uygulandı; kabul kanıtı verification/mvp-15.md. ImmutableArray tabanlı DTO kayıtları input/output sınırıdır; engine instance durum tutmaz. MVP-16 aşağıdaki genişletmeleri ayrı paket olarak uygular.

- Domain saf immutable SchedulingSnapshot/SchedulingIntent/SchedulingProposal kullanacak; DB, HTTP, clock çağrısı, Guid.NewGuid veya timer side effect yok. Now ve bütün girdiler sunucudan gelecek. Proposal kimliği HTTP coordinator17 tarafından verilecek; aynı motor input'u aynı sıralanmış çıktıyı üretir.
- İlk paket tek gün ve non-split. Snapshot physical own work, actual, dış gün tahsisi, current/protected blocks, UTC working windows, hard/soft graph ve öncelik taşıyacak. TargetBudget iş üretmeyecek; unknown, estimate exhausted ve inactive prerequisite ayrı açıklanacak.
- Graf iki marker/task olmalı: parent start→child start, required child completion→parent completion, hard predecessor completion→successor start. Optional child parent bitişini bloke etmez; inherited prerequisite korunur. Parent manuel Completed gerçeği forecast'tan ayrıdır. Actual start hâlâ mevcutCompleted ister.
- Working slots union - occupied union; geçmiş ve protected fixed/locked/active aynen korunur. Manuel korunmuş overlap warning olarak kalır, çakışmasız auto başarı diye etiketlenmez. Hiç çalışma saati yoksa örtülü09–17 yok.
- Ready candidate sırası hard readiness, deadline/slack, critical,priority,soft preference,sortOrder/Id; eşitlikler kararlı. Deadline öncesi yeterli tek slot aranır; iki30dk boşluk60dk non-split'i parçalamaz.
- Planlanamayanlar taskId/remainingSeconds/reason ve açıklama taşır; failure matematiksel imkânsızlık iddiası değildir. Öngörülen bitiş gerçekCompleted değildir.
- Testler: input permütasyonu/determinism/no mutation; fixed/lock/active koruma; parent own+children çift saymama; unknown/overtime/dış gün tahsisi; inherited/multiple/optional graph; dependency-blocked ve deadline; iki30dk non-split; empty calendar; UTC/DST.
- Split/minimum parça, otomatik tampon ve uygun eski slotu koruma16'da; preview/apply DB17'de. Aynı pakete alınmayacak.

## Uygulanan davranış

TaskGraphRules.BuildMarkers hem actual cycle doğrulamasının hem SchedulingProjection'ın tek graf kaynağıdır. Own work bitişi ve required child marker'ları birleşir; actual Completed end marker'ı bağımsız gerçek olarak serbesttir. Protected successor başlangıcı ve parent deadline ters yönde completion sınırı üretir; actual-completed marker üzerinden açık çocuklara sahte sınır taşınmaz.

UnplacedReason: NoEstimate,NeedsEstimateExtension,TaskInactive,DependencyBlocked,NoWorkingHours,InsufficientCapacity,NoContiguousSlot,DeadlineRisk. RemainingSeconds unknown için null; açık estimate exhausted için0'dır. Forecast actual task state'ini değiştirmez. Dış rezervasyon varsa completion forecast bilinmeden dependent serbest kalmaz.

IsPreserved korunan geçmiş/protected/unselected parçadır. Seçilen eski flexible blok now'ı kapsıyorsa geçmiş prefix aynı kimlikle kalır; geleceği yeniden hesaplanır. Protected overlap/quantity/dependency ve belirsiz aktif bitiş HasConstraintConflicts üretir; gizli timer kapanışı yok. Mevcut active rezervasyon bilinen kalan işe yetmiyorsa muhafazakâr ActiveEndUnknown uyarısı, günün geleceğini occupied tutar; gerçek geçiş/urgent/replan koordinasyonu18'de netleştirilecek.

AlgorithmVersion heuristic-v1, proposal ID yok; HTTP coordinator17 atayacak. API endpoint/DB proposal yok; public HTTP schema motor varmış gibi genişletilmedi. Snapshot zone ve UTC working windows sunucu sorumluluğudur.

## MVP-16 — heuristic-v2

Policy verildiğinde gelişmiş yerleştirme kullanılır: MinimumSplitSeconds(default900),TransitionSeconds(default0),EnableSplitting(defaulttrue),PreserveExisting(defaulttrue). Policy null eski v1 non-split davranışını korur; gerçek HTTP builder17 kullanıcı ayarlarından v2 policy üretir.

CanSplit=false tek slot ister. Split uygun boşluklara yayılır; son kalan parça min'den küçük olabilir, erken küçük boşluk atlanır. Yalnız yerleşen miktar output Work'tür; unplaced RemainingSeconds eksik kısımdır. Kısmi iş parent/dependent completion marker'ını açmaz. MinimumSplitConstraint ayrı nedendir.

Soft mevcut slotlar kimlikle tekrar kullanılır; diğer adayın uygun eski rezervasyonu mümkünse tutulur, daha iyi feasibility/deadline için gevşetilebilir. Crop yalnız gereken remaining kadar; actual+outside+protected ikinci kez ayrılmaz. IsPreserved protected/past/unselected kaynakları belirtir; soft reused placement ExistingScheduleId taşır ve açıklamada ExistingPlacementKept olur.

Geçiş farklı task Work aralıkları arasında kapasiteyi tüketir. Buffer ayrı Kind,TaskIdnull,IsAutomatictrue; actual olmaz. Mevcut Break/Buffer aynı gap'i kapatıyorsa tekrar üretilmez; kısmen kapatıyorsa yalnız uncovered parça üretilir. Son work sonrası/off-hours buffer eklenmez. SameTask bitişik parçaları geçiş istemez. Manual nonwork korunur, future automatic buffer yeniden hesaplanır. IsAutomatic kalıcılığa17'de taşınacak.

Bilinen active remaining ile mevcut rezervasyonun kısa kalması ActiveReservationTooShort'dur; bunu eksik tahmin gibi etiketleme. Unknown/exhausted active ActiveEndUnknown'dur. İki durumda da timer değişmez ve otomatik apply güvenilir gelecek varsaymaz.

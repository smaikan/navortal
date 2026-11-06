# MVP-20 — çok gün uygulama notları

Durum: MVP-20 tamamlandı. Taşıma, dağıtım ve çok günlük undo ayrı test adımlarında doğrulandı.

Uygulanan taşıma: `POST /api/schedules/{id}/move {version,expectedPlanningVersion,targetDate,startsAt,endsAt,allowProtectedChange?,allowConflicts?,reason?}` + Idempotency-Key. Yalnız gelecekteki tek blok başka bir yerel güne taşınır; aynı gün için PUT kullanılır. TaskId ve ScheduleId korunur. Aktif original-start bloğu veya geçmiş parça taşınmaz. Kaynak/target kendi frozen zone'unu korur; hedef tarih saat aralığı kendi zone'unda tek güne sığmalıdır. Fixed/locked ve manuel overlap açık niyet ister.

RevisionWriter PlanDelta artık etkilenen planı ve snapshot After override'ını taşıyabilir. Fiziksel satır hedef günün current bloğu olur; kaynak Changes MovedOut/Removed görünümünü, hedef Changes MovedIn yeni görünümünü kaydeder. Her iki gün aynı ChangeSet, current/full revision/items/changes ve idempotency tek transaction'dadır. Eski item/work FK/baseline değişmez.

Kanıt:197 gerçek PostgreSQL/HTTP +121 domain testi geçti. Son Preview/Auto uygulaması, explicit-version paralel komutları, clean/önceki schema upgrade ve bütün önceki testler dahildir. Nihai kabul `verification/mvp-20.md` içinde.

Dağıtım saf domain tasarımı: açık tarih aralığı max31 gün; aynı server instant ve PlanningVersion. Seçili parent'lar aynı ortak selection helper'ıyla doğrudan işlere açılır. Daha önce üretilmiş günlerin çıktısı eski flexible rezervasyonların yerini alır; sonraki günlerin fixed/locked/active/unselected rezervasyonları önceden ayrılır. Her adım actual + gerçek range dışı rezervasyon + önceki gün yeni tahsis + sonraki korunan tahsisi yalnız bir defa düşer. Son günün unplaced sonucu bütün aralığın eksik miktarıdır. Günlük replan kendiliğinden bu aralığı genişletmez.

Frozen local day zone'ları değişirse farklı gün etiketleri UTC'de çakışabilir. Snapshot ExternalBusyWindows başka plan günlerindeki doluluğu da çıkarır; protected overlap açık conflict olur. ExternalWorkBlocks farklı görevler arasındaki gece yarısı tamponunu korur; aynı task parçalarına gereksiz tampon eklenmez. Bu alanlar mevcut tek gün preview ve undo'yu da korur.121 domain testi içinde6saat/3gün, actual/dış tahsis, gelecekteki sabit, unknown/partial/non-split/forecast dependency, external busy ve çapraz gece transition senaryoları vardır.

HTTP:

- `POST /api/scheduling/distribute-preview {fromDate,toDate,taskIds,expectedPlanningVersion?}` daima önizleme üretir; aralık iki uç dahil1..31 gün, görev seçimi1..1000 benzersiz kimliktir.
- `POST /api/scheduling/distribute-plan` aynı body ve Idempotency-Key ile Preview/Auto tercihini izler. Conflict varsa Auto da uygulanmamış önizleme döndürür; partial kapasite unplaced listesiyle uygulanabilir. Tek gün `/plan` aralığı kendiliğinden genişletmez.
- `GET /api/scheduling/distribution-proposals/{id}` ve `POST /api/scheduling/distribute-apply {proposalId}` + key. Günlük proposal uçları farklı türü404 ile gizler; Kind=Day/Distribution DB check'i ve owner sorgusu yanlış DTO okunmasını engeller.
- Yanıt: proposalId/inputVersion/createdAt/expiresAt/planningMode/algorithmVersion/status/canApply/hasConstraintConflicts; her günün blocks/changes/unplaced/warnings/explanations bilgisi, tüm aralığın son kalan unplaced listesi, varsa applied. Süre2dk; sürüm, görev/ayar/session/plan ve yeni başlangıç zamanı apply'da kontrol edilir. No-op boş revision üretmez; key farklı içerikte409'dur.

RepeatableRead transaction bütün range snapshot'larını aynı server instant ve sürümde okur. Hesaplama user kilidi dışında; apply user kilidi altında bütün current blokları, ortak ChangeSet/full revisions/items/deltas, proposal status ve idempotency'yi tek transaction'da yazar. Günlerden birindeki snapshot hatası hepsini geri alır. İki ayrı tarih aralığı aynı kalan miktarı paralel tahsis edemez.

Aralık dışındaki aktif iş bilinen kalan tahminiyle bir kere forecast olarak ayrılır; actual devam eder. Orijinal schedule bağlantısı varsa aynı miktar iki kez düşülmez. Bitişi bilinmiyorsa veya forecast aralığı kalan işin tamamını koruyamıyorsa ActiveOutsideEndUnknown/ActiveOutsideReservationTooShort conflict'i döner. Forecast bitişini aşan hâlâ aktif iş apply'ı stale yapar. Bu projeksiyon original session/schedule geçmişini değiştirmez.

`POST /api/scheduling/undo-multi-preview {changeSetId,expectedPlanningVersion?,allowProtectedChange?}` her zaman önizlemedir; aynı distribute-apply ile onaylanır. En çok31 etkilenmiş günün her birinde kaynak son kullanıcı plan kararı olmalıdır; TaskState kapanışları user plan kararı sayılmaz. Kaynak ve hedef move inverse'i eşleştirilir: geri dönüş mümkün değilse hedef blok da korunur, iki yön yarım uygulanmaz. Aktif task affected günlerin dışında olsa bile korumaya alınır. Global miktar/overlap/dependency kontrolü bağımsız gün sonuçlarının çelişkili telafisini konservatif no-op'a çevirir. Uygulanamayan kısım isPartial ve scheduleId içeren warning'lerde görünür.

Undo current satırını gerekiyorsa eski güne aynı ID ile taşır; yeni Undo/undo-multi-v1 revisions ReversesChangeSetId taşır. Actual/task completion/baseline/eski item'lar değişmez. Aynı kaynağa Applied kabulü DB partial unique ve kullanıcı kilidiyle bir defadır; no-op kısmi kabul de bu kurala dahildir.

AddDistributionProposals migration'ı Kind alanını Day default'uyla ekler; eski kayıt/receipt korunur. Yeni input şekline ait olmayan Pending öneri yeni preview gerektirebilir; Applied receipt yeniden hesaplanmaz. Bu feature'ın proposal DTO'larını eski uygulama sürümü okuyamaz; production rollback bu dokümanda doğrulanmış değildir. Şema değişikliği içermeyen saf motor başarısı HTTP/DB başarısı sayılmaz.

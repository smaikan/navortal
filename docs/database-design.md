# Veri sözleşmesi — MVP-00

Bu belge hedef şemadır; her tablo ilgili MVP'de migration ile eklenir. Property/kolon adları aşağıdaki semantiğe sadık kalır. UUID uygulamada Guid.CreateVersion7; UTC timestamp timestamptz; süre bigint saniye; sıra decimal; version bigint optimistic concurrency. UserId bütün sahipli varlıklarda zorunlu. Composite `(UserId, Id)` alternate key/FK sahipli bağlantıları korur. Historical FK delete davranışı Restrict.

## Görev

TaskItem: Id, UserId, Title(1..300), Description(nullable), ParentTaskId?, SortOrder, State, CompletionOrigin?, CompletedAt?, HasDirectWork, DirectEstimatedSeconds?, DirectWorkCompleted, TargetBudgetSeconds?, Priority, DeadlineAt?, CanSplit, RequiredForParent, Energy?, ProjectId?, PoolId?, CategoryId?, CreatedAt, UpdatedAt, ArchivedAt?, Version.

Yeni bağımsız task HasDirectWork=true, estimate=null, Pending; bölünebilirlik true. Container hasDirectWork=false ve estimate null; unknown direct işten ayrıdır. Estimate/target negatif olmaz. Parent döngüsü DB FK ile değil graph doğrulamasıyla önlenir.

TaskState string enum: Pending, InProgress, Paused, Completed, Deferred, Skipped, Canceled. CompletionOrigin Manual/Automatic. Manual complete seçenekleri CompleteSubtree/ParentOnly/Cancel. ParentOnly çocukları ayırmaz. Automatic parent için zorunlu çocuklar yalnız Completed olmalı; Skipped/Canceled zorunlu çocuk auto complete'i sağlamaz (zorunluluğu açık değiştirilebilir). Own direct iş varsa DirectWorkCompleted gerekir. Child reopen yalnız automatic completed ataları açar; manual atada açık çocuk uyarısı görünür.

Alt görev eklerken parent'ın bilinen direct tahmini veya geçmiş work'ü varsa `parentWorkDisposition=PreserveDirect|ConvertToContainer` açık seçilir. Convert ancak geçmiş direct work yokken; direct tahmin mevcutsa target bütçeye taşınır, mevcut target varsa üzerine sessiz yazılmaz ve conflict döner. Geçmiş work varsa PreserveDirect gerekir. Boş/tahminsiz/çalışılmamış parent ilk çocukla container'a çevrilebilir; olay kaydı tutulur.

TaskDependencies: UserId, predecessor/successor TaskId, unique çift, self yasak. FinishToStart gerçek ilişki. TaskOrderingPreferences ayrı soft ilişki. Parent ve dependency'den genişletilmiş work graph döngüsüzdür. TaskEvents: actor, task, type, effectiveAt, payload(jsonb), sequence; historical durum buradan okunur.

MVP-09: Tasks.RequiredForParent=true,DirectWorkCompleted=false,CompletionOrigin?/CompletedAt? uygulanmıştır. Completed state iki metadata alanını gerektirir; diğer state'lerde ikisi de null. DirectWorkCompleted yalnız HasDirectWork=true iken mümkün. TaskEvents.Sequence pozitif ve unique(UserId,TaskId,Sequence); yeni event task.Version kullanır, eski event sırası migration ile backfill edilir. Actor bu kişisel üründe UserId. Application UtcTimeProvider bütün yeni instant'ları DB/ilk yanıt tutarlılığı için UTC1μs'e normalize eder.

## Plan ve tarih

DailyPlan: Id, UserId, LocalDate, TimeZoneId, CurrentRevisionId?, BaselineRevisionId?, Version; unique(UserId,LocalDate). Zone o günün bağlamıdır; kullanıcı yeni zone seçince eski gün rekey edilmez.

TaskSchedule: Id, UserId, DailyPlanId, TaskId?, Kind(Work/Break/Buffer), StartsAt, EndsAt, IsFixed, IsLocked, State(Planned/Removed), SplitGroupId?, OriginScheduleId?, Version. Start<end; Work için task gerekli, Break/Buffer için null. Süre end-start, active work ile aynı kaynak değil. Removed kayıt history FK için korunur. Gün aşan reservation aynı SplitGroupId ile gün sınırında bölünür.

PlanRevision: Id, UserId, DailyPlanId, Number, PreviousRevisionId?, ChangeSetId, Trigger(Initial/Manual/Replan/Urgent/Undo/Carry/TaskState), Reason, CreatedAt, EffectiveAt, AlgorithmVersion, SnapshotSchemaVersion; unique(plan,number).

PlanRevisionItem: immutable Id, UserId, RevisionId, ScheduleId, TaskId?, StartsAt/EndsAt, kind/fixed/lock/state ve TaskSnapshot(jsonb). Snapshot task title, hierarchy path, category, state, direct estimate, budget, required/direct flags ve ilgili subtree metadata'yı içerir. Current task verisine bakarak historical caption yeniden yazılmaz.

PlanRevisionChange: revision, schedule, type, before/after(jsonb). ChangeSetId çok günlük tek komutu bağlar. Baseline ilk non-empty work revision'da dondurulur. Current+revision+items aynı transaction'dadır; undo yeni revision üretir.

SchedulingProposal: Id, UserId, InputPlanningVersion, CreatedAt, AnchorAt, ExpiresAt, Intent, InputHash, ProposalPayload(jsonb), Status(Pending/Applied/Expired), AppliedChangeSetId?. TTL 2 dk; apply anında sürüm ve zamana bağlı feasibility yeniden doğrulanır. Gerçek başlangıç geçmişe yazılmaz; blok now sınırını geçtiyse yeniden preview gerekir. Normal aktif blok geleceği korunur; urgent gerçek start sonrası kalan plan o aktif acilin öngörülen sonundan başlar.

IdempotencyRecord: UserId, Scope, Key, RequestHash, ResponseStatus/Payload, CreatedAt; unique(user,scope,key); farklı payload aynı key conflict. Başarılı domain etkisiyle aynı transaction'da yazılır.

## Gerçek çalışma

WorkSession: Id, UserId, TaskId?, StartedAt, EndedAt?, State(Running/Paused/Finished/Canceled), Source(Timer/Manual), StartedScheduleId?, StartedRevisionItemId?, Version. Task boş yalnız bağımsız focus; plan FK varsa task/user eşleşmesi zorunlu. Running için unique partial index(UserId).

WorkSessionSegment: Id, UserId, SessionId, StartedAt, EndedAt?, IsVoided, Version. Alanlar effective aralıktır; başlangıç/bitişin önceki değerleri correction kaydında korunur. Open segment unique partial UserId; geçerli effective segmentler PostgreSQL btree_gist + tstzrange exclusion ile kullanıcı başına overlap yapamaz. End null sonsuz üst sınırdır. Pause/finish end'i bir kere kapatır. Correction aynı kilit ve constraint'leri kullanır.

WorkSessionCorrection: Id, UserId, SessionId/SegmentId, PreviousValues, NewValues, Reason, CreatedAt, ActorId; immutable journal. Segment effective alanı ve audit atomiktir. Void silme değildir; eski aralık journal'da kalır. Manuel range geleceğe taşamaz; actual overlap reddedilir; geri alma bu journal'ı silmez.

FocusSession: work session bağlantısı, target active seconds, reachedAt?, end behavior ContinueTracking/AutoBreak/AwaitChoice, cycle index, preset snapshot; focus break ayrı state/phase aralığıdır, WorkSegment değildir. Target reached work'ü bitirmez; overtime active-target. Auto geçiş açık tercihe bağlıdır.

## Kullanıcı ve destek

AppUser: Id, Email, NormalizedEmail unique, PasswordHash?, DisplayName, CreatedAt, Version. ExternalLogin: UserId, Provider, Subject unique(provider,subject). PasswordResetRequest: UserId, Hash unique, ExpiresAt, UsedAt?, CreatedAt; 30 dk ve CAS/lock ile tek kullanım. JWT/refresh/auth-session tabloları yok.

UserPlanningState: UserId PK/FK, PlanningVersion, UpdatedAt. SELECT FOR UPDATE bütün planlama girdisi mutation'larını sıraya koyar. UserPreferences: zone, format, week, planningMode Preview/Auto, minimumSplitSeconds=900, transitionSeconds=0. WorkingIntervals hafta günü local start/end; tarih istisnaları explicit replace/closed listesi.

MVP-05 uygulama kararı (ADR-009): Yukarıdaki ayar bütünü tek user_preferences satırında UserId PK/FK,Version ve Payload jsonb nesnesiyle saklanır. Domain typed PlanningPreferences/WeeklyWindow/DateOverride kullanır; ayrı WorkingIntervals/Exceptions tabloları bu aşamada oluşturulmaz. Aralıklar gün başından dakika [start,end),0..1440; gece yarısını aşan aralık iki güne açık bölünür. Version ve kullanıcı PlanningVersion aynı transaction'da artar. Tarih istisnası varsa boş liste kapalı gün, dolu liste haftalığın yerini alır.

Projects/Pools/Categories/Tags kullanıcı kapsamlı; task tags unique. Notes ve distraction conversion sourceNoteId unique ile tekrar güvenli. Recurrence template+local occurrence key unique; ay sonunda olmayan gün o ayın son gününe clamp; DST gap ilk geçerli instant, ambiguous erken offset (politika UI'da gösterilir); geçmiş örnek değişmez. Outbox ve Quartz tabloları ilgili MVP'de eklenir.

## İndeks ve bütünlük

Task user/parent/order; schedules user/plan/start ve range; sessions user/task/start; events user/task/effectiveAt; revisions plan/number; proposals user/status; outbox due/claim. Manuel kabul edilen plan overlap'ına genel exclusion koyma. Work overlap her zaman constraint ile engellenir. Silme/audit/ownership bütün migration incelemelerinde doğrulanır.

## MVP-11/12 kalıcılık kararı

Proje/havuz/kategori/etiket dört ayrı owner/version/soft archive tablosudur. Task scalar sınıflandırması ve tag join aynı kullanıcı compositeFK ile korunur. Türkçe arama ICU adhd_search kolasyonu gerektirir.

MVP-12 WorkSession alanlarına TimeZoneId ve TaskSnapshot(jsonb,schemaVersion1) eklendi; start anındaki ad/yol/grupları değişmez. StartedScheduleId/StartedRevisionItemId gerçek hedef tablolar oluşunca MVP-14'te migration ile eklenecek. TaskId yalnız ilerideki bağımsız focus için nullable; mevcut start task gerektirir. Session state/time/version ve segment time/version/void check'leri vardır. Running kullanıcı başına unique; aynı task için Running/Paused birlikte unique; açık segment ayrıca unique.

IdempotencyRecord şu anda yalnız work-start scope'u için {UserId,Scope,Key,RequestHash,Response,CreatedAt}; başarı durumu bu scope'ta sabit201, Response jsonb immutable ilk DTO'dur. Başka scope/status gerektiğinde alan genişletilir. Session/task/event/PlanningVersion ve idempotency aynı transaction'dadır.

Gerçek segment overlap'ı EX_work_segments_user_time GiST exclusion ile (UserId eşit ve tstzrange [start,end) kesişiyor) reddedilir; IsVoided hariç. Komşu aralıklar ve sıfır uzunlukta kapalı segment geçerlidir. Bu kısıt plan bloklarına uygulanmaz. PostgreSQL btree_gist eklentisi migration'da kurulur; Down önce bağımlı tabloları kaldırır. Dayanak: [PostgreSQL range constraints](https://www.postgresql.org/docs/18/rangetypes.html) ve [btree_gist](https://www.postgresql.org/docs/18/btree-gist.html).

## MVP-13 uygulanan correction journal

WorkSession.RecordedAt başlangıç/effective zamanından ayrı tutulur; eski Timer satırları StartedAt ile backfill edilir, geçici kolon default'u kaldırılır. Başlangıç metadata schema2/CapturedAt ile manuel kayıt anını açıklar; schema1 geçmişi rewrite edilmez.

work_session_corrections: UserId/SessionId/SegmentId compositeFK segmentin kullanıcı ve oturuma aidiyetini korur. Unique(user,session,sequence); sequence kabul edilen session.Version'dır, arada normal pause/resume sürümleri nedeniyle boşluk olabilir. Kind,Reason,CreatedAt,PreviousValues?/NewValues ve PreviousSession?/NewSession jsonb immutable append journal'dır. Aktör bu kişisel üründe UserId'dir. Effective segment ve session envelope güncellenir; journal hesap kaynağı değildir. IsVoided segment silinmez. İlgili task event'i ve PlanningVersion aynı transaction'dadır.

## MVP-14 uygulanan plan ve geçmiş şeması

DailyPlans owner/localDate unique; Current/Baseline FK (UserId,Id,RevisionId)→PlanRevisions(UserId,DailyPlanId,Id) aynı planı zorlar. Revision previous FK da aynı owner/plan'a aittir. TaskSchedules composite owner/task/plan/origin FK ve kind/task/range/state/version check içerir; kaldırma Removed state'tir. PlanRevisionItems Snapshot jsonb tam ScheduleView+creation metadata kopyasıdır; tek tek starts/end kolonlarını tekrar çoğaltmaz. Items unique(user,revision,schedule); Changes before/after jsonb. Her ikisi owner/revision/schedule FK ile Restrict'tir.

WorkSessions StartedScheduleId/StartedRevisionItemId birlikte nullable; context varsa TaskId gerekli. Item compositeFK (user,schedule,item) ile aynı bloğa aittir; ayrıca FK_work_start_task_match (user,schedule,task) çalışma bloğu ile task'ı eşler. Nullable schedule.TaskId'nin EF alternate key ile zorla non-null yapılmaması için bu ek task-match FK migration SQL'inde, nullable unique index'e bağlanır. Break/Buffer TaskId null kalır. Down bu ek FK'yi açık kaldırır. Eski plansız oturum bağlantıları null olarak korunur.

RevisionWriter caller transaction'ında current blocks, revision/items/changes ve current/baseline pointer'larını kontrollü SaveChanges sırasıyla yazar. Bu birden fazla commit değildir; ikinci gün/snapshot hatasında tamamı rollback olur. User PlanningVersion ve idempotency de aynı outer transaction'dadır. Snapshot yalnız o revision'ın etkin Planned bloklarıdır; removals eski item +Changes ile kayıpsızdır. Zone ve creation metadata geçmişte frozen kalır.

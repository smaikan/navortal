# HTTP sözleşmesi — MVP-00

**16 Ekim2026 güncellemesi:** Bu belgenin ilk bölümleri tarihsel MVP-00 tasarımıdır; aşağıdaki uygulanmış MVP ekleri onu aşamalı olarak düzeltir. Frontend entegrasyonunda bütün endpoint/DTO/örnek/yetki/sürüm sözleşmesinin güncel kaynağı [Frontend API Rehberi](Frontend%20API%20Rehberi.md) ve [üretilen OpenAPI](openapi-v1.json) dosyasıdır. Taslak route/alanları çalışan endpoint olarak kullanmayın. Google giriş/link kullanıcı kararıyla kapalıdır.

Tasarım durumu: bu routes ilgili MVP'de uygulanır; var olmayan endpoint başarı dönmez. ASP.NET controller API, JSON camelCase, enum string, UUID string, instant ISO8601 UTC (Z veya +00:00), yerel tarih yyyy-MM-dd. Süre seconds long; dakika yalnız sunum. Tüm özel veriler JWT Bearer ve sub ownership.

## Ortak

offset=0, limit=50 (max100); tarih aralığı from/to yarı açık, en çok366 gün. Validation400 ProblemDetails code/errors/traceId. 401 anonymous/invalid token; bulunmayan veya başka kullanıcıya ait kaynak404; stale/conflict409; duplicate email409. Beklenmeyen500 güvenli metin. Created201 Location; delete/logout204; archive güncel kaydı200 döndürür. Mutating versioned kaynak body version ister; eksik400. Idempotency-Key plan apply/urgent/session start/çok günlük plan move/undo için zorunlu max128; aynı key farklı request409.

## Auth — MVP02–04

- POST /api/auth/register {email,password,displayName?} →201 {accessToken,tokenType:"Bearer",user:{id,email,displayName}}. Parola yalnız min6; üst uzunluk veya karmaşıklık şartı yok, email normalized unique; whitespace title trimming ile password değiştirme. Framework hasher.
- POST /api/auth/login {email,password} →200 aynı token response; yanlış401. HS256 issuer/audience env, sub/i at; exp yok. MapInboundClaims=false, RequireExpirationTime=false, ValidateLifetime=true; onlyHS256.
- GET /api/auth/me →200 user; user DB'de yoksa401.
- POST /api/auth/logout →204 JWT gerekli; stateless onay, revoke yok. Frontend localStorage/cache/SignalR temizler, work kapanmaz.
- POST /api/auth/google {idToken} →200 yerel JWT; ExternalLogin subject; aynı e-posta başka hesap conflict409, otomatik merge yok.
- POST /api/auth/google/link {idToken} JWT gerekli →204; başka hesaba bağlı subject409. Google proof expiry/signature/issuer/client audience doğrulanır.
- POST /api/auth/forgot-password {email} →202 genel yanıt; reset CSPRNG, DB hash, 30dk, tek kullanım.
- POST /api/auth/reset-password {token,newPassword} →204; invalid/expired/used400. Eski JWT geçerli kalır; Google-only hesaba örtülü parola eklenmez.
- Refresh endpoint, expiresIn, auth cookie, revoke/session store yok.

## Görev ve work — ilgili MVP'ler

/api/tasks CRUD/archive; /{id}/children, /move, /complete, /reopen, /defer, /skip, /cancel, /dependencies, /history, /notes. Create {title,parentTaskId?,parentWorkDisposition?}; server Id/UserId/actual/completion yazılamaz. Complete {expectedVersion,mode:CompleteSubtree|ParentOnly}; mode Cancel mutation üretmez.

/api/work-sessions/start {taskId?,scheduleId?,expectedPlanningVersion,replaceSessionId?}, /{id}/pause|resume|finish {expectedVersion}; /manual ve /{id}/corrections. Start farklı aktif session varsa explicit replace eşleşmeden409. Response serverNow, effectiveActiveSeconds, state, segments; client timer otorite değil. Task start alias varsa aynı use-case'i çağırır.

## Plan — ilgili MVP'ler

/api/schedules?from&to; create/update/remove açık fixed/lock intent'iyle revision üretir. Manual conflict kabulü allowConflicts explicit; engine önerisi hard overlap'ı başarı diye geçiremez.

POST /api/scheduling/preview {intent,dates/taskIds,expectedPlanningVersion?} →200 {proposalId,inputVersion,expiresAt,blocks,changes,unplaced,warnings,explanations}. GET /api/scheduling/proposals/{id} owner scoped. POST /api/scheduling/apply {proposalId} + Idempotency-Key →200 {changeSetId,revisionIds,planningVersion}. Stale409 code=proposal_stale. Capacity warning200 içinde.

POST /api/scheduling/insert-now {taskId,expectedPlanningVersion,replaceSessionId?} + key: actual start hemen; Preview modunda proposalId, Auto modda applied ChangeSet; rejected proposal gerçek session'ı geri almaz. Insert-after soft sıra veya hard dependency seçimini açık alır.

POST /api/scheduling/replan-day ve /distribute aynı pipeline; distribute from/to açık kullanıcı horizon'u. /api/plan-revisions/{id}, /compare ve /api/change-sets/{id}/undo-preview|undo-apply telafi revision üretir.

## Diğer modüller

/api/preferences; /api/projects|pools|categories|tags; /api/calendar?from&to ve /day/{date}; /api/focus-presets|focus-sessions; /api/distraction-notes; /api/recurrences; /api/reminders|push-subscriptions; /api/statistics/* — detayları ilgili MVP'de bu belgeye uygulanmış sözleşme olarak ekle. SignalR /hubs/planner aynı JWT, query access_token yalnız hub taşımasında ve redakte.

## MVP-00 tutarlılık sonucu

Ortak Id, UserId, Version, UTC ve second birimleri bütün DTO'larda aynı. Plan actual'ın yerine geçmez; proposal accepted plan değildir; correction undo değildir. Domain state enum'ları database-design.md ile aynı. Auth süresiz uygulama JWT'si ile süreli Google/reset kanıtlarını ayırır. Bu bölüm tasarım incelemesidir, henüz endpoint test sonucu değildir.

## Uygulanan kapsam — MVP-14

Register/login/me/stateless logout gerçek controller ve JWT pipeline ile uygulanmıştır; 19 integration testi docs/verification/mvp-02.md içinde. Reset, tercihler, task/ağaç/süre/lifecycle/bağımlılık ve sınıflandırma uçları aşağıda uygulanmış sözleşmedir. Work aşağıda uygulanmıştır; manuel plan/revizyon aşağıda uygulanmıştır, motor/preview/apply hedef sözleşmedir; Google kullanıcı kararıyla kapalıdır. Login/register DTO validation, unique email409 ve unauthorized problem401 gerçektir. Üretim OpenAPI yalnız Development/Testing ortamında sunulur.

## Geliştirme auth kararı

Register şifresi yalnız en az 6 karakterdir; ek karmaşıklık ve e-posta doğrulaması yok. Kayıt hemen access JWT verir. Google uçları geliştirmede `Google:Enabled=false` ile kapalı: 503/code=google_disabled; link ayrıca JWT ister. Provider smoke ve etkin hesap eşleme kabulü ertelenmiştir. Google tabloları ilerideki etkinleştirme içindir; kullanıcıya Google giriş seçeneği sunulmaz.

## MVP-05 uygulanan tercihler

GET /api/preferences → {version,values}. PUT aynı şekli bekler (tam ayar bütünü), yeni version döndürür; stale409/version_conflict. Values: timeZoneId(IANA),language,timeFormat(12h/24h),weekStartsOn(0=Pazar..6),planningMode(Preview/Auto),minimumSplitSeconds(1..86400),transitionSeconds(0..86400),weekly[{dayOfWeek,startMinute,endMinute}],exceptions[{date,intervals:[{startMinute,endMinute}]}]. Varsayılan takvim boş; version0 ilk PUT'u belirtir. Weekly en fazla70, exceptions366, istisna başına24 aralık; aynı gün çakışma/aynı tarih tekrarı400. End1440 olabilir, start<end; overnight iki güne bölünür. Tarih istisnası haftalığın yerine geçer, boş liste kapalı gün.

GET /api/preferences/working-hours?date=YYYY-MM-DD → {date,timeZoneId,localIntervals,utcIntervals:[{startsAt,endsAt}]}; date gerekli ve yıl2..9998. JWT kullanıcı otoritesi; başka kullanıcı ID route'u yok. Planlama sürümü her başarılı PUT ile artar. Domain DST gap ilk geçerli dakika ve ambiguous erken anı kullanır.

## MVP-04 uygulanan kurtarma

POST forgot-password genel202; POST reset-password {token(64 hex),newPassword(min6)}204, geçersiz/expired/used400. Başarılı reset diğer açık kodları kapatır; JWT revoke yok. SMTP kapalıyken forgot202 ve kod oluşturulmaz. Kod yalnız mail bağlantısında, DB'de hash; kayıt onayı gönderilmez. Gerçek PostgreSQL/SMTP test kanıtı verification/mvp-04.md.

## MVP-06 uygulanan görevler

POST /api/tasks {title,description?,priority=Normal,deadlineAt?,canSplit=true} →201 +Location +TaskView. GET /api/tasks/{id} →TaskView. PUT /api/tasks/{id} aynı düzenlenebilir alanlar+version ister, yeni kaydı döndürür. POST /api/tasks/{id}/archive {version} soft arşivleyip kaydı döndürür. Eski sürüm409/version_conflict, başka kullanıcının/bulunmayan görev404/task_not_found. Arşiv düzenleme409/task_archived; arşiv repeat doğru güncel version ile yeni olay üretmez.

GET /api/tasks?offset=0&limit=50&search=&includeArchived=false&priority=High → {items,offset,limit,total}. Limit1..100,offset0..100000,search<=200; search literal substring, wildcards işlenmez. Sıra CreatedAt desc,Id asc. TaskPriority Low/Normal/High/Urgent; TaskState enum'u string, şu aşamadaPending atanır. Title1..300 trimli,description<=10000; DirectEstimatedSeconds null/unknown; Created/Updated/Archived UTC ve Version sunucuda. Genel update tamamlanma/süre/owner yazmaz. Bütün uçlar JWT ister.

## MVP-07 uygulanan ağaç

POST /api/tasks/{id}/children →201; temel görev alanları+parentVersion+opsiyonel parentWorkDisposition(PreserveDirect/ConvertToContainer). Bilinen doğrudan tahmini ilk alt göreve ayırırken karar yoksa409/parent_work_decision_required; convert tahmini TargetBudget'a taşır, farklı mevcut budget409/parent_budget_conflict. Unknown ilk parent varsayılan container; açık preserve bunu değiştirebilir.

POST /api/tasks/{id}/move {version,parentTaskId?,parentVersion?,beforeSiblingId?,parentWorkDisposition?} →TaskView. Hedef parent varsa parentVersion gerekli; stale409, yabancı404,cycle400/tree_cycle,geçersiz kardeş400/sibling_invalid. Null parent root'a taşır. BeforeSiblingId yoksa sona; aynı parent içinde sıra değişimi de bu komuttur. Parent ile değişen kardeşlerin version'ları da değişebilir; istemci güncel veriyi tekrar alır.

GET /api/tasks/children?parentId=&offset=0&limit=50&includeArchived=false root veya doğrudan çocuklar; GET /api/tasks/{id}/subtree aynı page alanlarıyla kök dahil breadth-first düz alt ağaç. Yanıt {items,offset,limit,hasMore}; limit1..100. TaskView ekleri parentTaskId,sortOrder,hasDirectWork,targetBudgetSeconds. Child ilişkisi arşiv sırasında silinmez; açık child varsa parent archive409/task_has_children. Aktif parent/dependency ve WorkSessions kuralları ilgili sonraki paketlerde bağlanır.

## MVP-08 uygulanan süre sözleşmesi

PUT /api/tasks/{id}/work-definition {version,hasDirectWork(gerekli),directEstimatedSeconds?,targetBudgetSeconds?} →TaskView. Süreler saniye ve negatif olamaz; container own estimate taşıyamaz. Bilinen direct iş kaldırılırken açık budget yoksa409/work_budget_required. Eski sürüm409,foreign404,invalid400,toplam overflow400/workload_overflow ve tam rollback. Genel Task PUT bu alanları değiştirmez.

GET /api/tasks/{id}/workload → {taskId,knownEstimatedSeconds,unknownEstimateCount,calculatedTotalSeconds?,targetBudgetSeconds?,targetDifferenceSeconds?}. Unknown>0 ise tam toplam ve hedef farkı null. Current hesap arşivlenmemiş descendant'lara aittir; historical analitik değildir. GET /api/tasks/{id}/work-components?offset=0&limit=50 → {items:[{taskId,estimatedSeconds?}],offset,limit,total};limit1..100. Yalnız açık direct iş, kapalı/arşiv/container hariç; parent own iş bir kez. Target farkı iş bileşeni yaratmaz. Actual/remaining henüz uygulanmadı.

## MVP-09 uygulanan lifecycle

POST /api/tasks/{id}/state {version,action,parentCompletionChoice?} →TaskView. Action Complete/Reopen/Defer/Skip/Cancel/CompleteDirectWork/ReopenDirectWork. Parent choice CompleteSubtree/ParentOnly/Cancel; çocuk varsa seçim yokken ayar ParentCompletionPolicy Ask ise409/completion_choice_required. Tercih CompleteSubtree/ParentOnly ise o varsayılan kullanılır; explicit choice öncelikli. Cancel choice değişikliksiz200; actionCancel görevCanceled durumudur. State tekrarında değerler değişmiyorsa yeni event/version yok. Eski version409;foreign404;archived409.

PUT /api/tasks/{id}/required {version,requiredForParent} →TaskView; ilgili otomatik ataları yeniden değerlendirir. GET /api/tasks/{id}/progress → TaskProgress: task sayıları,component sayıları,countProgress(0..1),knownEstimatedSeconds/knownCompletedEstimatedSeconds,unknownEstimateCount,durationProgress?(0..1),required child sayıları ve hasOpenChildren/hasOpenDescendants. Unknown varsa durationProgress null. TargetBudget bu yüzdelerin paydası değildir.

TaskView ekleri directWorkCompleted,requiredForParent,completionOrigin?(Manual/Automatic),completedAt?. Tarihler sunucu UTC/microsecond hassasiyetiyle üretilir. ParentOnly manuel karar çocuk reopen ile bozulmaz; auto origin parent gerekirsePending'e açılır. Bitmiş own work yeniden plan component olmaz. Kendi işi olmayan container CompleteDirectWork400/direct_work_required; inactive direct-complete409/task_not_active. Work niteliğini bitmiş task'ta değiştirmek409/work_completed_reopen. WorkSession kapanışı MVP-12 ile bağlandı; schedule revision etkisi MVP-14 kapsamındadır.

## MVP-10 uygulanan ilişkiler

POST /api/tasks/{successorId}/dependencies {version,predecessorTaskId} →201. DELETE aynı yol/{predecessorId}?version= →204. Soft karşılığı /ordering,body {version,beforeTaskId};delete /ordering/{beforeId}. GET dependencies/ordering?offset=0&limit=50 →{items,offset,limit,total};limit1..100. Relation view {id,sourceTaskId,targetTaskId,kind(FinishToStart/PreferredBefore)}. Add/remove target.Version artırır; güncel task tekrar alınır. Kaynak/hedef aynı kullanıcı;foreign404,duplicate/stale409,self400/relation_self,combined cycle400/dependency_cycle.

GET /api/tasks/{id}/start-eligibility →{taskId,canStart,reasons,blockingPredecessorIds}. Reasons task_archived,direct_work_required,direct_work_completed,task_inactive,predecessor_incomplete. Parent hard ön koşulu child'a mirastır; predecessor mevcutCompleted olmalı. Read advisory;actual start12'de kilit altında tekrar doğrulanır. Soft tercih execution guard değildir. Move ve required update grafı commit öncesi denetler.

## MVP-11 uygulanan gruplar ve sınıflandırma

/api/projects|pools|categories|tags: POST {name,description?}201, GET liste/detay, PUT {version,name,description?}200 ve POST /{id}/archive {version}200. Liste offset/limit/search/includeArchived, limit1..100. Arşiv ilişkileri silmez. Her kaynak türü ve task aynı kullanıcıya ait olmalı.

GET /api/tasks/{id}/classification → {taskId,version,planningVersion,values:{projectId?,poolId?,categoryId?,tagIds:[]}}. PUT aynı yola {version,projectId?,poolId?,categoryId?,tagIds:[],applyToSubtree=false,expectedPlanningVersion?}; tam replacement, en çok50 benzersiz tag. Alt ağaca yayma expectedPlanningVersion gerektirir; stale409. Child oluşturulurken sınıflandırma miras alınır; move mevcut sınıflandırmayı korur.

GET /api/{projects|pools|categories|tags}/{id}/workload → {resourceId,values:{taskCount,directComponentCount,openComponentCount,knownEstimatedSeconds,unknownEstimateCount,calculatedTotalSeconds?}}. Yalnız o grubun üyesi olan iş bileşenleri tekilleştirilir; parent ve child iki defa sayılmaz. Etiketler arası toplamlar çakışabilir; global toplam bunların toplamı değildir.

Task list ek filtreleri projectId/poolId/categoryId/tagId/state/includeCompleted=true; orderBy CreatedDesc/Title/Priority/Deadline. Türkçe ICU adhd_search kolasyonu I/ı ve İ/i ile Ü/ü aramasını veritabanında eşler; %/_ literal kalır.

Planlı/plansız iş sorgusu hedefi: aynı TaskId için seçilen tarih ufkunda kaldırılmamış Work türü TaskSchedule tahsislerini esas alır; planlanan miktar kalan miktardan ayrı gösterilir. TaskSchedules henüz yokken sahte planned alanı veya çalışan filtre sunulmaz. Gerçek bağlantı MVP-14 kapsamındadır.

## MVP-12 uygulanan gerçek çalışma

POST /api/work-sessions/start {taskId} + Idempotency-Key (gerekli,max128) →201 WorkView+Location. Bu aşamada tasksız bağımsız focus ve schedule başlangıcı yok; plan bağlantısı MVP-14, bağımsız focus MVP-22. Aynı kullanıcı/anahtar/TaskId tekrarında ilk201 yanıtı aynen döner, Idempotent-Replay:true; farklı TaskId409/idempotency_conflict. Replay bitmiş oturumu yeniden başlatmaz; güncel durum Location'dan alınır.

POST /api/work-sessions/{id}/pause|resume|finish {version} →200 WorkView. Stale409; aynı hedef state ve güncel version yeni mutation üretmez. Başka aktif oturum varsa start/resume409; paused aynı task yeni start yerine resume ister. Gerçek ön koşul actual start/resume anında kullanıcı kilidi altında yeniden doğrulanır. Finish görevi Paused bırakır, Completed yapmaz. Task complete/direct/subtree/defer/skip/cancel ilgili oturumları aynı anda Finished yapar; optional child parent-only/otomatik üst tamamlamayla durmaz.

GET /api/work-sessions/current → {activeSession?,serverNow,planningVersion}; paused oturumlar GET /api/work-sessions?state=Paused&offset=0&limit=50. GET /{id} tek WorkView; GET /{id}/segments bounded segment page. WorkView {id,taskId,state,source,startedAt,endedAt?,timeZoneId,taskAtStart,version,activeSeconds,serverNow}; segmentler ayrı sayfalanır. Başlangıç snapshot'ı schemaVersion/taskId/taskVersion/title/ancestors/project/pool/category/tags/inputPlanningVersion içerir; gruplar ID+name, atalar kökten parent'a sıralıdır. Sonraki rename/reparent/zone değişimi geçmişi değiştirmez.

GET /api/tasks/{id}/time → {taskId,directActualSeconds,subtreeActualSeconds,knownRemainingSeconds,unknownRemainingCount,remainingSeconds?,knownOvertimeSeconds,unknownEstimateCount,serverNow}. Actual yalnız void olmayan segmentlerden, mikro-saniye hassasiyetinde decimal saniyedir; istemci yuvarlaması kaynak değildir. Remaining açık fiziksel bileşenler başına max(estimate-actual,0), sonra toplamdır; unknown varsa tam remaining null. Bütçe bu hesapta iş üretmez. Archived alt görev actual'ı korunur; bu current-tree toplamasıdır, tarihsel ata yolu raporu değildir. Tahmin tükenmesi task'ı bitirmez.

Logout/tarayıcı/host kapanması açık segmenti kapatmaz. Geçmiş work container dönüşümüyle gizlenemez; arşiv unfinished session bitirilene kadar409. Sunucu saatinin kaydın gerisine düşmesi negatif süre veya500 yerine409/server_clock_conflict döndürür.

## MVP-13 uygulanan manuel kayıt ve düzeltme

POST /api/work-sessions/manual {taskId,startedAt,endedAt,reason} + Idempotency-Key →201 WorkView+Location. Source Manual, State Finished; task state değişmez. Kapalı/arşivlenmiş task'a geçmiş çalışma eklenebilir; container olamaz. Aralık geçmiş/şimdi, start<end; reason1..2000 trimli. Offset UTC'ye ve1μs hassasiyete normalize edilir. Aynı key aynı semantik içerikte replay, farklı içerikte409.

POST /api/work-sessions/{id}/segments/{segmentId}/corrections {version,segmentVersion,startedAt,endedAt?,isVoided,reason} →200 güncel WorkView. İki sürüm de gerekli; stale409. Yalnız hâlâ Running olan açık segment açık bırakılabilir; kapalı segment correction ile açılamaz, resume ayrı niyettir. Açık unutulan segment geçmiş bitişle kapatılırsa session Finished ve task halen InProgress ise Paused olur. Görev tamamlanması/durum geçmişi geri alınmaz.

GET /api/work-sessions/{id}/corrections?offset=0&limit=50 →{items,offset,limit,total};items {id,sessionId,segmentId,sequence,kind(ManualAdded/Adjusted),reason,createdAt,previousValues?,newValues,previousSession?,newSession}. Segment/session before/after JSON kopyalarıdır; UserId doğrulanmış aktördür. İlk manuel eklemede previous null; sonraki düzeltmeler tam zinciri korur. Void audit'i silmez; restore aynı overlap kontrolünden geçer. Journal actual'a eklenmez.

WorkView recordedAt kayıt oluşturma anıdır; startedAt correction sonrası effective başlangıç olabilir. TaskAtStart schemaVersion2/capturedAt eklenmiştir. Timer'da başlangıç anı, geçmiş manuel eklemede metadata kayıt anı temsil edilir; geçmişte bilinmeyen görev adı uydurulmaz. Önceki schema1 snapshot'ları korunur; eski Timer RecordedAt migration ile StartedAt'tan doldurulur.

Çakışan effective çalışma409/work_overlap; bitiş=komşu başlangıç geçerli. Void kapalı olmalı. Geleceğe/negatife taşan range400; correction sıfır kapalı süreye izin verir, manuel yeni kayıt vermez. Session/segment/audit/task event/version/PlanningVersion aynı transaction'dadır; başarısızlık hepsini geri alır.

## MVP-14 uygulanan manuel plan/revizyon

GET /api/daily-plans/{date} → {id?,localDate,timeZoneId,currentRevisionId?,baselineRevisionId?,version,planningVersion}. Eksik gün salt okuma, version0/idnull; varsayılan zone tercihten, var olan plan frozen zone'undan gelir.

POST /api/schedules {localDate,taskId?,kind(Work/Break/Buffer),startsAt,endsAt,isFixed=false,isLocked=false,allowConflicts=false,expectedPlanningVersion,reason?} + Idempotency-Key →201 PlanMutation+Location. Range pozitif/en çok7gün; start seçili plan localDate'inde olmalı. Geceyi geçen blok bağlı kimliklere bölünür, aynı task ve ChangeSet korunur. Work açık doğrudan bileşen gerektirir; mola/tampon task taşımaz. Body instant'ları offset kabul eder, sunucuda UTC/1μs'e normalize edilir.

PUT /api/schedules/{id} {version,expectedPlanningVersion,startsAt,endsAt,isFixed,isLocked,allowConflicts,allowProtectedChange,reason?} →200 PlanMutation. Aynı gün içinde update; başka gün move20'nin ayrı komutudur. POST /{id}/remove {version,expectedPlanningVersion,allowProtectedChange,reason?} →200, soft Removed. Her mutation Idempotency-Key(max128) ister; aynı kapsam/key/payload ilk yanıtı döndürür; farklı payload409. Work session'a bağlı aynı blok kimliği yeni task'a çevrilmez.

PlanMutation {changeSetId,planningVersion,schedules:ScheduleView[],revisionIds:Guid[],warnings:[{code,scheduleIds,seconds?}]}. Stale409/planning_version_conflict veya version_conflict; fixed/locked değişimi explicit niyet olmadan409/schedule_protected. Manual overlap default409/schedule_overlap; allowConflicts=true warning+revision farkında saklanır. DeadlineRisk/estimate_unknown/allocation_incomplete/allocation_exceeds_remaining görünür; sayısal uyarı eksik/fazla saniyeyi taşır. Task deadline blok end'den ayrı kalır. Bu uyarı otomatik motorun çakışmasızlık iddiası değildir.

GET /api/schedules/{id} Removed dahil owner scoped; GET /api/schedules?from&to&offset&limit yalnız Planned, interval overlap [start,end), max366gün,limit1..100. Range offset'leri UTC'ye normalize edilir. GET /api/daily-plans/{date}/revisions bounded; GET /api/plan-revisions/{id} metadata; /items ve /changes ayrıca bounded sayfalardır. Items {id,revisionId,schedule:ScheduleView}; changes {id,scheduleId,type,before?,after?,conflictsAccepted}. Snapshot tam etkin planı içerir; removals Changes ve eski immutable item'larda kalır.

ScheduleView {id,dailyPlanId,taskId?,kind,state,startsAt,endsAt,isFixed,isLocked,splitGroupId?,originScheduleId?,version,taskSnapshot?}; taskSnapshot creation metadata: task adı/ata yolu/grup ID+adları ve state/direct/required/estimate/budget. Sonraki task rename bu geçmişi rewrite etmez; canlı task bilgisi task endpointinden okunur. Baseline ilk Work içeren revision'da dondurulur; mola tek başına dondurmaz.

Planlı sayaç start ek body alanları scheduleId+scheduleVersion birlikte gerekli. Aynı user/task Work bloğu, Planned ve version doğrulanır; sunucu güncel revision item'ını seçer. WorkView startedScheduleId/startedRevisionItemId bir kez yazılır; move/remove/correction bağı yeniden yazmaz. Plan saatinden erken/geç actual start ayrı gerçektir; gerçek dependency kontrolü yine geçerlidir.

Task complete/direct/subtree/defer/skip/cancel/archive gelecekteki kendi Work bloklarına aynı transaction'da TaskState revision yazar. Aktif takvim parçası now'a kısalır, gelecektekiler Removed; actual ve eski snapshots korunur. ParentOnly açık child planına dokunmaz. Reopen eski blokları restore etmez. Gelecek rezervasyon varken direct bileşeni container'a çevirme409; önce blokları kaldırma veya PreserveDirect gerekir.

GET /api/tasks?isPlanned=true|false&from&to gerçek aynı TaskId'nin gelecek horizon rezervasyonunu filtreler; from now öncesiyse now'a clamp edilir. Container çocuklarının rezervasyonu parent için ikinci tahsis sayılmaz. GET /api/tasks/{id}/allocation?from&to → {taskId,from,to,cutoff,directActualSeconds,allocatedSeconds,remainingSeconds?,unallocatedSeconds?,excessAllocatedSeconds?}. Allocated bu horizon'daki current future blokların kesişim toplamıdır; remaining actual kaynaklıdır, unknown ise null. Historical actual ve plan kaydı farklıdır.

## MVP-17/18 uygulanan plan koordinasyonu

POST /api/scheduling/preview ve /plan, GET /proposals/{id}, POST /apply; kesin request/response/error/time/idempotency sözleşmesi [scheduling-coordinator.md](scheduling-coordinator.md) içindedir. ScheduleView artık isAutomatic içerir; eski revision JSON'unda eksik alan false okunur. Yeni accepted revision AlgorithmVersion heuristic-v2'dir.

POST /api/work-sessions/start-now aynı anda eski işi pause ve hedefi start/resume eder; ayrı plan aşaması Preview/Auto'yu izler. Kesin body, immutable receipt, plan başarısızlığında actual korunumu ve süre aşımı tetik sözleşmesi [immediate-work.md](immediate-work.md) içindedir.

MVP-19: POST /api/scheduling/undo-preview ve ortak /apply geleceğe dönük telafi üretir; kesin kısmi/protected/latest/idempotency davranışı [plan-undo.md](plan-undo.md) içinde. Preview reversesChangeSetId/isPartial, RevisionView reversesChangeSetId ve SchedulingMessage scheduleId ek alanları taşır. Alanlar eski JSON için nullable/varsayılandır; eski accepted receipt replay'i korunur.

MVP-20: POST /api/schedules/{id}/move; /api/scheduling/distribute-preview, /distribute-plan, /distribute-apply, /undo-multi-preview ve GET /distribution-proposals/{id}. Kesin bounded range, shared snapshot/ChangeSet, Preview/Auto, dış active forecast, partial undo ve rollback davranışı [multi-day-planning.md](multi-day-planning.md) içinde. Yanlış proposal türü404; stale/constraints409; tarih aralığı kendiliğinden genişlemez.

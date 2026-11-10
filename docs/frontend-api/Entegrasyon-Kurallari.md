# Frontend entegrasyonu — kesin koşullar ve durum akışları

16 Ekim 2026; frontend entegrasyon düzeltmeleri17Ekim2026. Bu belge çalışan API'nin OpenAPI'ye tek başına sığmayan koşullarını tamamlar. [Ana rehber](../Frontend%20API%20Rehberi.md), [işlem politikaları](Islem-Politikalari.md), [DTO sözlüğü](DTO-Sozlugu.md), [hata kodları](Hata-Kodlari.md), [plan mesajları](Plan-Mesajlari.md). Kullanıcı arayüzünün önerilen yolları API endpoint'i değildir. Kod/sözleşme farkı görülürse yeni endpoint veya alan varsaymayın.

## 1. Kimlik ve başlangıç sırası

1. Register201 veya login200 yanıtındaki accessToken merkezi browser adaptöründe saklanır. Register sonrası tekrar login gerekmez. `displayName` verilmediyse e-postanın trim edilmiş **tamamı** görünür addır.
2. `/api/auth/me` kimliği doğrular; ardından preferences, sync ve görünür sayfa verileri paralel okunabilir. SSR localStorage token okuyamaz.
3. Login yanlış parola401 `invalid_credentials`; korumalı endpointte401 giriş geçersizliğidir. Network/503/404/409 logout sayılmaz. Ağ kesilince mevcut token silinmez.
4. `/api/sync` workSessionId Running, yoksa en son Paused oturumu gösterebilir. `/api/work-sessions/current` **yalnız Running** döndürür. Bu yüzden current.activeSession=null, duraklatılmış iş yok demek değildir. Sync kimliğini work detail ile okuyun veya `GET /api/work-sessions?state=Paused` kullanın.
5. Focus current, Working/Paused/Break/AwaitingNext kaydını döndürebilir; yoksa session=null. Work/focus kimlikleri eşdeğer değildir.

Profil düzenleme, `change-password`, Google giriş ve açık Google bağlama akışları mevcuttur. Tarayıcı Google girişi `session/google` üzerinden HttpOnly oturum ve nonce challenge kullanır; [Google kurulumu](../google-auth-setup.md) yapılandırmayı ve aynı e-postalı hesap bağlama kurallarını açıklar. Hesap silme ve ekip/rol gibi olmayan uçlar tasarlanmış gibi çağrılmaz. Register/newPassword en az6karakter; login mevcut parolayı aynen alır. Register/reset boşlukları parola içinde anlamlıdır; istemci trim etmez. E-posta normalizasyonu sunucudadır.

Reset linkindeki64karakter token uygulama JWT değildir. Reset 30dk/tek kullanımdır;204sonrası kullanıcı giriş yapar. Eski uygulama JWT kopyaları geçerli kalır. SMTP kapalı veya teslim başarısızken de forgot202 geneldir; gerçek bir upstream503 ayrı hizmet hatasıdır. SMTP durumunu açıklayan public endpoint yoktur. `forgot` yanıtı bir e-posta hesabının varlığını veya teslim edildiğini kanıtlamaz.

## 2. HTTP, JSON, hata ve yeniden deneme

- Header adları HTTP açısından case-insensitive; JSON alanları camelCase, enum wire değerleri sözlükteki stringlerdir. Focus route komutları küçük harftir.
- Başarı Content-Type JSON olabilir;204body yoktur. Health düz metindir.429/401 veya framework/proxy404/405/413/415 body boş ya da farklı formatta gelebilir. Response Content-Type ve ham metin varlığı kontrol edilmeden JSON parse edilmez.
- Model-binding/DataAnnotation400 `validation_failed` ve `errors` sözlüğü taşıyabilir. Application/domain400 genellikle yalnız code/title/traceId taşır; her400de errors zorunlu değildir. Form alanı casing'i normalize edilir. Hata title metni karar anahtarı değildir.
- JSON string alanlarında bilinmeyen propertyler sessizce yok sayılabilir. Modelde olmayan status/actual/server timestamp göndererek değiştirme beklenmez. İlgili request DTO'su oluşturulur; bütün response geri POST edilmez.
- **Key destekli26operation:** aynı niyet, aynı normalize payload, aynı key; key genel1..128karakter, carry ve rescue en çok100. Key sahibi kullanıcı ve iç command scope ile ayrılır; yeni niyete yeni UUID verin. Her endpointi kapsayan global aynı-key garantisi yoktur.
- **Key tanımlanmamış126operation:** GETler dahil toplamdır,126yazım anlamına gelmez. Yazım timeoutunda otomatik retry yapılmaz. Task/collection/note/preset create duplicate üretebilir. Version kontrollü PUT/pause/finish timeoutunda önce GET ile gerçek sonuç okunur; version elle artırılmaz.
- Replay özgün cevabın snapshotını döndürebilir; serverNow/version/state bugünün değeri olmayabilir. Work/focus/plan replay sonrası güncel kaynak okunur. Idempotent-Replay başlığı her akışta bulunmak zorunda değildir.
- Bağlantı kesilmesi/AbortSignal sunucu transactionını geri alma garantisi değildir. UI sonucu bilinmiyor gösterebilir. Offline yazım reconnect'te gizlice gönderilmez; kaydedilmemiş form ile kaydedilmiş kaynak ayrılır.
- GET için sınırlı transient retry mümkündür.400/401/404/409kör retry yok.429Retry-After varsa uygulanır, yoksa sınırlı bekleme sunulur.503provider özelliği kapalıysa sonsuz retry yapılmaz.
- Private fetch `no-store`; proxy/SW/shared cache kişisel veri tutmaz. 17 Ekim UI-01 entegrasyonunda /api yanıtlarına no-store/private middleware eklendi ve gerçek201/200/401/404/409yanıtları proxy üzerinden doğrulandı. Ayrıntı UI-docs/verification/ui-01.md. ETag/If-Match/PATCH protokolü yok; body version kullanılır.

Int64 alanlar JSON number gelir. `Number.MAX_SAFE_INTEGER` üzerindeki long/decimal değerler standart JSON.parse ile tam korunamaz. UI böyle bir değeri yuvarlayıp tekrar göndermemeli; exact-number parser/ham değer koruması veya açık destek sınırı uygulamalıdır. Wire şema kimi sayısal inputlar için string de kabul eder; bu durum response'un string olacağını garanti etmez. Süreler saniyedir; dakika yalnız sunumdur.

## 3. Form varsayılanları ve koşullu zorunluluklar

OpenAPI `required`/nullable/annotation tablosu **tek başına bütün iş doğrulaması değildir**. Nullable bir alan belli komutta zorunlu olabilir; optional alanı atlamak önceki değeri korumayabilir.

Bilinen metadata kısıtı: CreateScheduleRequest.kind,TaskStateRequest.action,FocusPresetRequest.settings,UpdateFocusPresetRequest.settings için OpenAPI required yanında null union gösterebilir. Runtime DataAnnotation Required nullı400ile reddeder. Frontend bu dört alanı null kabul eden form olarak üretmemeli; request DTO açıklamaları bu farkı açıkça belirtir. Bu incelemede public OpenAPI değiştirilmedi.

| DTO/işlem | Kesin davranış |
| --- | --- |
| TaskFieldsRequest / UpdateTaskRequest | title zorunlu1..300; description<=10000; priority=Normal, canSplit=true, description/deadline=null bağlama varsayılanları. PUTta bunları atlamak eski alanı siler/değiştirir. |
| RegisterRequest | email<=320, displayName<=100; displayName boşsa tam e-posta. Password>=6; ek karmaşıklık yok. |
| ResourceFieldsRequest | Name trim sonrası1..200, description<=10000; PUT tam alan seti. |
| WorkDefinitionRequest | hasDirectWork=false iken directEstimatedSeconds verilmez; tahmin/bütçe negatif olamaz. Container'a geçerken mevcut tahmin bütçesi açıkça korunmalı; geçmiş actual varken direct work kaldırılamaz. |
| MoveTaskRequest | parentTaskId varsa parentVersion gerekir. beforeSiblingId seçilen parent altında olmalı; null sona. Kendi altına veya graph döngüsüne taşıma reddedilir. |
| ClassificationRequest | values içindeki proje/havuz/kategori/tag seti değiştirilir; null bağlantıyı temizler, tagIds boş array etiketleri temizler. En çok50tag; applyToSubtree=true ise expectedPlanningVersion gerekir. |
| StartWorkRequest | taskId zorunlu. scheduleId/scheduleVersion birlikte var veya birlikte yok. Burada expectedPlanningVersion/replaceSessionId alanı yoktur; acil geçiş ayrı start-now requestidir. |
| ImmediateWorkRequest | expectedPlanningVersion zorunlu; aktif oturum kesilecekse expectedSessionId ve expectedSessionVersion eşleşmeli. Farklı yeni oturumu eski sekme kesemez. |
| FocusStart | workSessionId/workSessionVersion çift; presetId ile settings birlikte olmaz. İkisi de yoksa varsayılan25/5. TaskId yoksa genel focus; yeni task oluşturulmaz. |
| FocusCommand | version focus sürümü, workSessionVersion gerçek work sürümü. skipBreak defaultfalse; yalnız next ile bitmemiş mola açıkça atlanır. |
| CorrectWorkRequest | session version+segmentVersion; reason trim sonrası1..2000. Kapalı aralığı endedAt=null ile açamazsınız. Void aralık kapalı olmalı. Diğer effective gerçek çalışmayla overlap reddedilir. |
| CustomReminderCommand | Create version istemez. PUT version nullable görünse de güncel reminder sürümü gerekir; eksik/stale409. Title1..200; dueAt>serverNow ve<=serverNow+1yıl. PUT tam alan setidir; taskId=null bağı temizler. |
| EditNoteRequest | Text1..10000, dueAt omission/null önceki dueAt'ı temizler. Kind/task/work/localDate bu endpointle değişmez. |
| ChangeOccurrence | version template sürümü; occurrence taskı oluşmuşsa taskVersion gerekir, oluşmamışsa taskVersion verilmez. |
| SupportDayChange | İlk yazım version0. availableEnergy nullable; criticalTaskIds0..3benzersiz/arşivlenmemiş task. Boş array kritik seçimi temizler. |

PlanningPreferences başlangıcı: TimeZoneId=Europe/Istanbul, Language=tr, TimeFormat=24h, WeekStartsOn=1, PlanningMode=Preview, ParentCompletionPolicy=Ask, MinimumSplitSeconds=900, TransitionSeconds=0, SupportEnabled=true, Weekly=[], Exceptions=[]. Tam values PUT gönderilir; focus/bildirim ayarları bu values içinde değildir.

Haftalık aralık<=70; aynı gün overlap yok, komşu sınır serbest. Tarih istisnası<=366benzersiz gün, her birinde<=24aralık; boş aralık tatildir. StartMinute>=0, EndMinute<=1440, start<end. MinimumSplit1..86400, Transition0..86400. IANA zone geçerli olmalı; dil tanınan CultureInfo, TimeFormat12h/24h, WeekStartsOn0..6, ParentCompletionPolicyAsk/CompleteSubtree/ParentOnly.

FocusSettings varsayılanı Work1500/Short300/Long900/Every4/ContinueTracking/Sound=true/Notifications=true. Work1..86400, Short1..14400, Long1..43200, Every1..20. BuiltIns içindeki15/5,25/5,45/10 ayarlar kayıtlı preset kimliği taşımaz; istenirse preset POST ile kaydedilir.

NotificationSettings başlangıcı enabled=true,pushEnabled=false,soundEnabled=true; yedi tür bayrağı true,lead0,snooze300,returnAfter0,quietStart/End=null. Lead0..86400,Snooze60..86400,ReturnAfter0..86400. Quiet uçları birlikte veya ikisi null; eşit olamaz, geceyi geçebilir. Quiet bitiş DST gapte ilk geçerli dakika, overlapte daha geç instanttır; çalışma takvimi dönüşüm politikasıyla aynı varsayılmamalı.

Çocuk oluşturma başlangıçta parentın project/pool/category/tag bağlarını miras alır; sonradan task taşıma kendiliğinden bu bağları yeniden miras aldırmaz. İlk çocuk öncesi parentın direct tahmini varsa PreserveDirect/ConvertToContainer seçimi gerekir. Actual geçmiş/future schedule varsa direct korunur; tamamlanmış direct için PreserveDirect gerekir. Convert mevcut tahmini hedef bütçeye taşır, farklı mevcut bütçe varsa parent_budget_conflict verir. Yanıt yeni çocuk veya taşınmış tasktır; etkilenen parent/kardeş sürümleri de yenilenmelidir.

Dependency için `/tasks/B/dependencies` POST body predecessorTaskId=A ve version=Bnin sürümü. Kaldırma `/tasks/B/dependencies/A?version={B-version}`; pathte relation.Id kullanılmaz. Ordering aynı şekilde beforeTaskId=A; delete sourceId=A. Add relation yanıtı yeni TaskView/version taşımaz; hedef B tekrar okunur. Archive taskın arşivlenmemiş çocukları veya Running/Paused oturumu varken409verir; açık işleri bitir/taşı/arşivle seçimi gerekir.

## 4. Query sınırları ve filtre anlamları

| Kaynak | Davranış / sınır |
| --- | --- |
| Çoğu liste | offset0..100000,limit1..100; varsayılan0/50. Total filtreli bütün sorgu, Items bu sayfa. |
| GET tasks | search<=200, literal başlık alt dizisi/case-insensitive; yüzde/alt çizgi LIKE jokeri değildir. orderBy yalnız CreatedDesc/Title/Priority/Deadline. |
| Task isPlanned | Bool true/false **verilirse** from/to pozitif ve<=366gün zorunlu. Arama kesimi max(from,serverNow)..to; yalnız Planned Work blokları. Geçmiş plan filtresi değildir. from/to yalnız başına deadline filtresi yapmaz. |
| Tree children/subtree | offset/limit/hasMore; total yok. Children null parent kökleri; subtree kök+descendant bağlamı endpoint yanıtına göre birleştirilir. |
| GET schedules/allocation | Offsetli UTC instant aralığı pozitif<=366gün, kesişim [from,to). Allocation cutoff ve ayrılan/eksik/aşırı miktarı sunucudan gelir. |
| Calendar range | FromDate/ToDate dahil1..42gün; yıl2..9998. Boş günü okumak DailyPlan oluşturmaz. |
| Calendar day | planOffset/planLimit,actualOffset/actualLimit,completionOffset/completionLimit ayrı. revisionId o owner/güne ait olmalı. |
| Scheduling |1..1000benzersiz taskId; tek gün date. Parent seçimi gerçek direct bileşenlere motor tarafından açılır. |
| Distribution/carry | Dahil1..31gün,1..1000benzersiz taskId. Carry hedef başlangıcı kaynak date sonrasında olmalı; mevcut diğer gün tahsisleri korunur. |
| Recurrence materialize/occurrences/refresh | Açık dahil1..93gün; sonsuz gelecek indirilmez. |
| Analytics | Dahil1..366gün; bucketDay/Week/Month,dimensionTask/Project/Category. startToleranceSeconds0..3600(varsayılan60).50000kaynak yoğunluğu409. |
| Notifications | Bütün durumlar listelenir. State/unread query filtresi ve unread-total endpointi yok; total unread sayılmaz. |
| Reminders | offset/limit alan doğrudan array; total yok. Canceled kayıtlar da listede bulunabilir. |
| Subscriptions | Doğrudan array; en çok100kayıt döner; aktif subscription sınırı20. Endpoint/keys dönmez, providerHost/label/id/version döner. |

Listeler snapshot cursor protokolü sağlamaz. Sayfa aralarında mutation olursa offset sonuçları kayabilir; ID bazlı birleştirme/refetch yapın. Response sırasını koruyun; sayısal enum veya başlıkla yeniden sıralama sunucu sırasını bozabilir. Kesin route parametreleri endpoint sayfasında; tarih filtreleri birbirinin yerine kullanılmaz.

## 5. Task, work ve focus durumları

TaskAction: Complete/Reopen/Defer/Skip/Cancel/CompleteDirectWork/ReopenDirectWork. ParentCompletionChoice.Cancel mutationı iptal eder; TaskAction.Cancel görevi Canceled yapar. InProgress/Paused eylemi yoktur, work üzerinden oluşur. Reopen Pending'e döner; gerçek geçmiş silinmez. ParentOnly completed üst altında açık çocuk bulunması geçerlidir. Otomatik completed ata gerektiğinde yeniden açılır, manuel parent kararı sessizce bozulmaz.

Normal work: Running→pause→Paused→resume→Running; Running/Paused→finish→Finished. Finished/Canceled yeniden başlamaz; yeni work gerekir. Finish taskı Completed yapmaz; normal bağlı görev Paused kalabilir. Aynı user tek Running work; farklı taskların birden çok paused workü bulunabilir. Aynı taskta paused work varsa yeni start yerine resume seçilir. StartEligibility son kararı start command tekrar doğrular.

| Focus mevcut durum | Uygun komut | Sonuç |
| --- | --- | --- |
| Working | pause | Focus Paused, gerçek segment kapanır. |
| Paused | resume | Focus Working, yeni gerçek segment açılır. |
| Working/Paused | break | Work Paused; focus çalışma kesimi kapanır, Break başlar. |
| Break | next+skipBreak=true | Eski focus Finished; yeni focusId/cycleNumber+1, aynı WorkSession devam eder. |
| Break | next+skipBreak=false | Mola sürüyorsa409focus_break_pending. |
| AwaitingNext | next | Eski cycle biter; yeni cycle başlar. |
| Açık cycle | finish/cancel | Gerçek work Finished; focus Finished/Interrupted. Gerçek süre silinmez, task tamamlanmaz. |
| Finished/Interrupted | pause/resume/break/next |409focus_finished; yeni cycle/focus başlatılmalı. |

Hedefte ContinueTracking actual/overtime sürer. AutoBreak hedefin ilk server değerlendirmesinde pause yapar; geçmişi hedef instantında kapanmış gibi geriye kesmez. Mola bitince AwaitingNext, gizli otomatik sonraki çalışma yok. Focus current/detail GET `ObserveFocus` çalıştırıp hedef/mola kaydı ve version değiştirebilir; list GET aynı gözlemi yapmaz. GET sonrası komut için o yanıttaki sürümler kullanılmalı.

Normal work resume ile Break/AwaitingNext focus'u sürdürmeye çalışmak Pomodoro next değildir; eski focus Interrupted olabilir. Focus ekranı ilgili focus komutlarını kullanır. Task complete/manuel correction/work finish bağlı focus durumunu da etkileyebilir; her iki kaynak refetch edilir. EffectiveTargetReached düzeltmeden sonra false olsa da önceki TargetReachedAt/TargetEventId tarihsel olay olarak korunabilir.

## 6. Plan, öneri, undo ve acil çalışma

- Preview proposal DB kaydı oluşturur; accepted blocks/revisions/baseline değişmez. `/preview` Auto ayarda da yalnız öneridir. `/plan` Preview/Auto tercihini izler.
- Proposal status Pending/Applied/Expired; normal geçerlilik server snapshotından2dk. CanApply=true apply garantisi değildir; task/preferences/work/day/time değişince409proposal_stale olabilir. Unplaced varken hard conflict yoksa kısmi kapasite sonucu uygulanabilir.
- Apply `SchedulingApplyResult` döndürür. NoChanges=true ise revisionIds boş, changeSetId null olabilir.200alınca her zaman yeni revision oluşturuldu denmez. Replay eski sonucu döndürebilir.
- Manual blok KindWork için TaskId gerekir; Break/Buffer TaskId taşıyamaz. Pozitif aralık en çok7gün; başlangıç LocalDate'e uymalı, gece parçaları sunucuda bağlı günlere bölünür. isFixed/isLocked ayrı; allowProtectedChange ve allowConflicts ayrı niyetlerdir. Geçmiş/actual koruması bu iki flag ile iptal olmaz.
- İlk Work içeren kabul edilmiş revision baseline'dır. RevisionItems immutable tam blok snapshotı; Changes yalnız farktır. History görünümü bugün Task adını durumunu basıp yeniden yazmaz.
- Undo eski snapshotı tüm DB'ye geri koymaz. Tek/çok gün undo-preview → uygun normal apply/distribute-apply. IsPartial telafi kapsamı; Unplaced kapasite kapsamı. Gerçek çalışma, completion ve correction geri silinmez.
- Start-now önce gerçek workü atomik başlatır/duraklatır, kalan plan ayrı aşamadır. PlanningStatus Preview/Applied/NeedsPreview/Unavailable; son ikisinde plan=null ve planningError bulunabilir, HTTP200 gerçek çalışma başlamış demektir. Belirsiz HTTP timeoutunda aynı-key replay + current/sync ile çözün; yeni work başlatmayın.
- Genel taskId=null Running focus varken otomatik planlama409general_work_active verebilir. Focus hedefi genel workün bitiş tahmini olarak kullanılmaz; açıkça pause/finish ardından preview alınır.
- Deadline görevde; EndsAt plan bloğunda. Manuel90dk iş/60dk blokta eksik30dk uyarı olabilir. Deadline/constraint uyarısı ve HTTPvalidation ayrıdır.

## 7. Tekrarlama alan kombinasyonları

| Frequency | Interval | WeekDays | MonthDay / MonthEnd |
| --- | --- | --- | --- |
| Daily |1 |boş/null |ikisi null |
| IntervalDays |1..366 |boş/null |ikisi null |
| Weekly |1..52 |1..7benzersiz gün0..6 |ikisi null |
| Monthly |1..24 |boş/null |MonthDay1..31;29..31için MonthEnd zorunlu Skip/ClampToLastDay |

Rule.StartDate yıl2..9998, UntilDate>=StartDate ve dahil; geçerli IANA zone. DueTime dakika hassasiyetinde, saniye/kesir sıfır olmalı; deadline üretir, plan bloğu yaratmaz. GapReject/Skip/ShiftForward,OverlapReject/Earlier/Later; politikalar otomatik varsayımla gizlenmez. Weekly interval haftaları Pazartesi sınırına göre hizalanır; görünüm WeekStartsOn tercihi recurrence kuralını değiştirmez.

Update yeni definition yaratır. EffectiveFrom bugün/gelecek; RefreshExisting=true ise RefreshThrough gerekli ve bounded93gün; false iken RefreshThrough verilmez. Refresh geçmiş/completed/arşivli/manuel değiştirilmiş/çalışılmış/planlanmış/çocuk edinmiş instance'ı korur; ProtectedTaskIds görünür gösterilir. Occurrence original/applied definition kimlikleri farklı olabilir.

Skip/cancel yeni marker yaratabilir, task henüz yoksa TaskId=null geçerlidir. Task varsa güncel TaskVersion gerekir. Aynı template/localDate tek kimliktir; tekrar materialize duplicate task yaratmaz. Seriyi disabled yapmak eski task/definitionları silmez. Ordinary task reopen occurrence için ikinci task oluşturmaz.

AutoAddToPlan açık seri bugün+30 gün, diğerleri bugün+7 gün gerçek kayıt üretir. Pencerenin ötesi `GET /api/recurrence-templates/projection` ile okuma anında hesaplanır; plan veya kapasite değildir. Pasif yapma, bitiş kısaltma, otomatik eklemeyi kapatma veya saat/süre değişikliği yalnız yarından sonraki, sistemin eklediği ve kullanıcının dokunmadığı öğeleri etkiler; RetractedDayItemCount sayıyı verir. Bu oluşumlar SeriesPaused/SeriesChanged nedeniyle atlanır, seri geri açılır veya uzarsa aynı task ile döner. Kullanıcının plandan çıkardığı öğe ve Reason=User işareti geri gelmez. Skip/cancel oluşumun açık gün öğesini de kaldırır. Task picker rutin oluşumunu yalnız kendi tarihinde döndürür; tarihsiz picker ve matris adayları rutin oluşumu döndürmez.

## 8. Not, bildirim, SignalR ve push

NoteKindDaily ise LocalDate gerekir; diğer türlerde LocalDate verilmez. Task/NextStep gerçek TaskId gerektirir; WorkSession bağından da türeyebilir. Distraction genel worke bağlanabilir. Notes update Kind/Task bağlamını taşımaz. Convert sonucu aynı notun ConvertedTaskId bağını korur; ayrı niyette farklı dönüşüm409olabilir. Delete soft'tur;200NoteView gelir,204beklemeyin.

Notification state Pending/Ready/Obsolete/Suppressed/Expired; readAt ayrı alan, Read diye ayrı state yoktur. ReadyAt ilk hazır olma anı, OS teslimi değildir. Snooze Ready/Pending için60..86400sn, aynı id/snoozeCount+1/statePending; ReadAt okundu işareti ayrı kalabilir. Aynı alarmın sonraki snoozeCount'u yeni bilinçli bildirim turudur.

Push-config enabled=false ise publicKey=null; server ayarı, kullanıcı PushEnabled, browser izin ve subscription ayrı kapılardır. Subscription browserdan gelir; aynı endpoint başka hesaba geçemez, inactive kayıt da sahiplik korur. Eski owner remove+browser unsubscribe/resubscribe gerekir. JWT/public VAPID/browser p256dh/auth farklı kavramlardır.

Payload alanları: notificationId,recipientUserId,snoozeCount,tag,title,body,url,silent. Backend url `/notifications/{id}`; SW bunu `/notifications?notificationId={id}` same-origin yoluna normalize eder. 27 Ekim açık kullanıcı kararıyla hatırlatma/görev/özel gün adı ve türe uygun Türkçe title/body native bildirimde gösterilir (ayrı ayrı1..200karakter); bütün sekiz türün metnini backend üretir. Payload sunum içindir; domain otoritesi değildir. Cold start önce auth/me, sonra owner `GET /api/notifications/{id}`. Worker sekmelere teslim kimlikleri/genel metinleri yollar, kişisel adları yaymaz. Ses kilidi kaldırılmış açık sekmede WebAudio önce denenir; native görünür bildirim korunur, ikinci ses bastırılır. Açık uygun sekme yoksa platform sesi kullanılır. Aktif alıcı hesabı yoksa eski hesap içeriği açılmaz. Offline logout yerel cookie bağlamı/cache/hub/SW alıcı bağlamını temizler; sunucu remove başarısızlığı başarılı sayılmaz. JWT SW'de kalıcı saklanmaz.

| changed.kind | sourceId / sourceVersion | Refetch kapsamı |
| --- | --- | --- |
| TaskChanged | TaskId / TaskEvent.Sequence | Görünür task/list/tree/workload/progress/time; sourceVersion task version yerine komuta yazılmaz. |
| PlanChanged | RevisionId / revision Number | Önce revision ile DailyPlan bağını çöz; ilgili day/schedules/revision/calendar. SourceId DailyPlanId değildir. |
| WorkChanged | WorkSessionId / workVersion | current/detail/segments, task time/progress, görünür calendar/analytics. |
| FocusChanged | FocusSessionId / focusVersion | Focus current/detail + bağlı work/current. |
| PreferencesChanged | UserId / preferencesVersion | Preferences/working-hours ve görünür plan önizlemesi uygunluğu. |
| RecurrenceChanged | TemplateId / templateVersion | Template/definitions/occurrences ve görünür görevler. |
| NotificationReady | NotificationId / snoozeCount | Notification detail/inbox; sourceVersion kaydın Version alanı değildir. |
| NotificationPreferencesChanged | UserId / notificationPreferencesVersion | Bildirim tercihleri ve görünen teslim/izin durumu. |
| DayItemChanged | dayItemId veya scheduleId / ilgili version | UI-R2 saatsiz gün öğeleri ve plan öğesi tamamlama; gün listesi ve takvim okumalarını yenileyin. |

`eventId` taşıma dedup kimliği; global sıra/replay/exactly-once yok. Kaynaklar değiştiğinde event geleceğini varsayarak HTTP mutation invalidationını atlamayın; notes/collections gibi ayrı event türü yoktur. Reconnect sync+görünür kaynak refetch; sync.planningVersion her not/bildirim/preset değişikliğini saymaz. Hub `/api/hubs/planner`; negotiate ve WS/SSE token taşımasını SignalR JS yönetir. İlk start hatası automaticReconnect ile otomatik çözüldü sayılmaz; bounded initial retry ayrıca gerekir.

## 9. Analitik, null ve tarihi koruma

Planlanan, actual ve tahmin farklı otoritelerdir. DurationProgress ile PlanMetrics.DurationCompletion farklı paydalardır; nullı0yapmayın. Baseline/current ayrı referans; quotaRatio task completion değildir. Parent roll-up ve focus sürelerini actuala ikinci kez eklemeyin. Manual süre effective segment olarak bir kez sayılır; audit journal ayrıca eklenmez.

Focus ActiveSeconds sadece o döngünün kesişimi, WorkView.ActiveSeconds bütün session toplamıdır. RecordedTargetsReached tarihsel hedef olayları, EffectiveTargetsReached düzeltme sonrası durumdur. Start delay signed ortalama erken değerleri negatif tutar; AverageLateSeconds geç başlayan örneklerden hesaplanır. Detaylı payda/formüller [istatistik tanımlarındadır](../statistics-definitions.md).

Suggestion karşılaştırma bağlamını hedefin RecurrenceTemplate, yoksa Category, yoksa Project bağına göre seçer; az veri varsa otomatik diğer bağlama düşmez. En az3pozitif recorded completed örnek gerekir. SampleCount medyana giren bütün uygun örnek sayısıdır; response Samples listesi en son20ile sınırlı olabilir, SuggestedSeconds yalnız görünen20den yeniden hesaplanmaz. SuggestedSeconds=null ise no_comparable_context/insufficient_samples gösterilir; Applied=false, ayrı mevcut task work-definition komutuyla açık kabul gerekir. Otomatik estimate-apply endpointi yoktur.

## 10. Ekran yenileme ve bulunmayan yetenekler

| Mutation grubu | Yerel başarı/recovery sonrası yeniden okunacaklar |
| --- | --- |
| Task/tree/state/work-definition/classification | Task detail/list/tree + ilgili workload/progress/time; sync; etkilenen calendar/plan. |
| Work/focus/manual/correction | Work current/detail/segments/audit, focus current/detail, task time/progress; gün/analiz. |
| Schedule/apply/move/carry/pool/undo | İlgili bütün DailyPlan günleri, schedules, revisions/items/changes; allocation/calendar/task bağları. |
| Notes/convert | Note listesi/return-context; convert ise task/list/pool da. |
| Recurrence | Template/definitions/occurrences, effected tasklar/listeler; sync/plan girdileri. |
| Notifications/reminders/subscriptions | İlgili liste/detay/tercih; unread toplamı uydurulmaz. |

Bunlar istemci invalidation önerisidir; server API'nin yeni event/transaction garantisi değildir. Refetch en dar görünür kaynaklarla yapılır, her task satırında ayrı sonsuz sorgu üretilmez. Account değişiminde eski callback/response/event yeni kullanıcıya uygulanmaz.

Mevcut API'de generic hard-delete/unarchive task, tek bir full tree dump zorunluluğu, global unread counter, notification state filtresi, bütün resource türleri için sınırsız sorgu, server offline sync kuyruğu, özel logout-revoke veya reset dışı parola değiştirme yoktur. Endpoint kataloğunda bulunmayan bu davranışlar frontend tarafından varmış gibi sunulmaz. Gerektiğinde yeni ürün/API kapsamı olarak değerlendirilir.


## 11. Parola kurtarma ve frontend reset URL ayarı

Frontend notlarındaki “SMTP kapalı503” varsayımı hatalıydı. `PasswordResetService.ForgotAsync`, `PasswordResetController` ve mevcut `PasswordResetTests` ile backend sözleşmesi (`docs/api-design.md`) aynı davranışı tanımlar: SMTP kapalı, kullanıcı bilinmiyor veya teslim başarısızsa da genel202. Public SMTP-durum endpointi yoktur. UI e-posta teslimini veya hesap varlığını doğrulamaz; gerçek503 upstream yanıtını ayrıca hizmet hatası olarak gösterir. Backend davranışı/OpenAPI bu düzeltmede değiştirilmedi.

Yeni Next reset ekranı `/parola-yenile` için deployment sırasında `Smtp__ResetPageUrl` değerini `https://<uygulama-origin>/parola-yenile#` olarak ayarla. Mevcut sender sonuna `?token=...` eklediğinden kod fragment içinde kalır (`#?token=...`). Tarayıcı fragment'i HTTP isteğine göndermez; client kodu yalnız belleğe alıp URL'den kaldırır. Bu bir uygulama JWT'si değildir. Query ile gelen eski reset kodu RSC render'a alınmadan kod taşımayan303'e yönlendirilir ve yeni bağlantı istenir. Gelen eski query'nin daha önceki harici proxy loglarını frontend geriye dönük temizleyemez; production erişim logu redaksiyonu ayrıca korunmalıdır. Production domain/SMTP hesabı henüz seçilmedi veya değiştirilmedi.

Kaynak: [URI fragment davranışı](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment), [UI-02 kanıtı](../../UI-docs/verification/ui-02.md). Mevcut API testlerinin query örneği backend sender'ın eski URL ayarını doğrular; yeni UI entegrasyonunda fragment ayarı gerçek SMTP ile ayrıca test edilir.

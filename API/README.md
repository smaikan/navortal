# ADHD Planner API

ASP.NET Core 10 / PostgreSQL 18 modüler monolit. Ürün kuralları `../AGENTS.md`, API kapsamı `AGENTS.md`, gerçek durum `Uygulama Adımları.md` içindedir. Yalnız uygulanmış endpointler OpenAPI'de görünür.

Frontend entegrasyonunun güncel kaynağı: **[Frontend API Rehberi](../docs/Frontend%20API%20Rehberi.md)**.152HTTP işlemi/157somut yol,200DTO/enum, her endpoint için request/response/yetki/hata/parametre/sürüm örnekleri, SignalR ve auth bootstrap akışlarını içerir. [OpenAPI](../docs/openapi-v1.json), [endpoint indeksi](../docs/frontend-api/Endpoint-Indeksi.md), [operasyon ve restore](../docs/operations.md), [MVP29 kanıtı](../docs/verification/mvp-29.md). Production OpenAPI route'u kapalıdır; repo JSON'u paylaşılır. Google03 kapalı/ertelendi; frontend uygulaması henüz yok.

## Windows — Docker olmadan gerçek PostgreSQL

API dizininde:

```powershell
.\scripts\install-local-postgres.ps1
.\scripts\start-local-postgres.ps1
dotnet tool restore
dotnet restore --locked-mode
dotnet ef database update --project src/Adhd.Infrastructure --startup-project src/Adhd.Api
.\scripts\run-api.ps1
```

Native runtime EDB'nin resmi binary arşivinden `.local/` içine alınır; sistem servisi kurulmaz, mevcut DB değiştirilmez. Yalnız loopback 55432 üzerinde development/test trust bağlantısıdır; production yapılandırması değildir. `.local/` source/Docker context'e girmez. Kaynak: https://www.enterprisedb.com/download-postgresql-binaries

run-api.ps1 development JWT anahtarını ilk açılışta .local/jwt-signing.key içinde rastgele üretir ve sonraki açılışta korur; anahtarı ekrana yazmaz. Hazır Jwt__SigningKey ortam değeri varsa onu kullanır. Production'da kalıcı anahtarı ortam/secret store'dan ver; kaynakta veya image'da anahtar yok.

Yerel Web Push isteğe bağlıdır; varsayılan kapalıdır. Gerçek iletişim URI'siyle bir kez `./scripts/new-web-push-keys.ps1 -Subject 'mailto:YOUR-CONTACT'` çalıştır; Windows PowerShell 5 ve PowerShell 7 için P-256 üretimi desteklenir. Ignore edilen `.local/web-push.json` içeriğini paylaşma; mevcut dosya korunur. Sonra `./scripts/run-api.ps1 -EnablePush` açık opt-in ile keypair'i yükleyerek başlatır; switch verilmezse mevcut ortam/default davranışı sürer, script çıkışta ortam değerini geri koyar. `Development` ve çalışan jobs gerekir; `Testing` hosted jobs'u kapatır. Edge'de `http://127.0.0.1:3100` loopback güvenli bağlamdır; tarayıcı izni, hesap push tercihi ve gerçek subscription ayrıca açılır. Harici subscription endpointi HTTPS/443 ve public hedef olmalıdır. Enabled push hatalı iletişim/eksik veya eşleşmeyen keypair ile startup'ta reddedilir; anahtarlar hata mesajlarına yazılmaz. [Kanonik işletim ve alarm sözleşmesi](../docs/notifications-realtime.md).

## Test

```powershell
dotnet build -c Release
dotnet test tests/Adhd.IntegrationTests -c Release --logger trx --results-directory artifacts/test-results
```

CI veya başka PG için `ADHD_TEST_POSTGRES` admin bağlantısını ortamdan ver. Fixture yalnız rastgele oluşturduğu `adhd_test_` veritabanlarını temizler; ortak/production DB kullanma. Unit kuralları geldikçe `dotnet test AdhdPlanner.slnx` tüm suite'i çalıştırır. İşletim/test sırlarını log veya rapora koyma.

## Docker Compose

Ortamda `POSTGRES_PASSWORD` ve `JWT_SIGNING_KEY` (en az32 byte) ayarla; kaynakta parola/anahtar yok. `docker compose up --build` DB → kontrollü migration → API sırasını kullanır. Docker olmayan makinede bu yolun container runtime testi yapılmış sayılmaz; native gerçek PostgreSQL yolu kullanılır. CI tanımı `../.github/workflows/api.yml` içindedir.

## Altyapı endpointleri

- GET /health/live: süreç canlılığı; DB'den bağımsız.
- GET /health/ready: DB/schema hazırsa200, erişilemiyorsa503.
- GET /openapi/v1.json: yalnız Development/Testing.

Public API hataları ProblemDetails; validation code/errors/traceId, beklenmeyen hatada güvenli500. Test diagnostic controller yalnız test assembly'sindedir; production'da yoktur.

## JWT auth — MVP-02

POST /api/auth/register (email/password/displayName?), POST /api/auth/login (email/password), GET /api/auth/me ve POST /api/auth/logout. İlk ikisi accessToken/tokenType/user döndürür; özel uçlar Authorization Bearer ister. Token exp içermez; refresh yok. Logout 204 stateless onaydır; browser token/cache'i temizler, eski kopya JWT sunucuda geçerliliğini korur. Şifre yalnız en az 6 karakter ister; e-posta onayı yoktur. Google geliştirmede kapalıdır (`Google:Enabled=false`); client ID tek başına açmaz. Google uçları 503/google_disabled döndürür.

POST /api/auth/forgot-password {email} → genel202. POST /api/auth/reset-password {token,newPassword} →204; geçersiz/süresi dolmuş/kullanılmış400. Kod30dk ve tek kullanımlık; eski JWT revoke olmaz. SMTP varsayılan kapalı; çalıştırmak için Smtp__Enabled=true, Host, Port, Security (StartTls/SslOnConnect), From, ResetPageUrl ve gerekiyorsa Username/Password ortamdan ayarlanır. SMTP açıkken Host/Port/From/ResetPageUrl ve Security startup validation ile denetlenir. Zorunlu TLS modları StartTls/SslOnConnect; Auto/StartTlsWhenAvailable reddedilir. None yalnız Development/Testing loopback için geçerlidir. ResetPageUrl açıkça ayarlanmalıdır; production HTTPS, user info/query içermeyen URL gerekir. Mevcut frontend için https://<uygulama-origin>/parola-yenile#; sondaki # reset kodunu fragment içinde tutar. HTTP reset URL yalnız Development/Testing loopback üzerinde kabul edilir. MailKit ve PKCS10.0.13 sabitlenmiştir. Kayıtta onay e-postası gönderilmez.

## Katmanlar

src/Adhd.Api, Adhd.Application, Adhd.Domain, Adhd.Infrastructure; tests/Adhd.UnitTests, Adhd.IntegrationTests. DB migration'ları Infrastructure/Persistence/Migrations. Tasarım ve kabul kanıtları ../docs/ altında.

Tercihler: GET/PUT /api/preferences {version,values}; GET /api/preferences/working-hours?date=YYYY-MM-DD. Typed alanlar/aralık sınırları ../docs/api-design.md içinde. Saat verilmediyse takvim boştur; varsayılan Preview,900sn minimum parça,0sn tampon. Geceyi aşan aralık iki güne bölünür.

Görevler: POST/GET /api/tasks, GET/PUT /api/tasks/{id}, POST /api/tasks/{id}/archive {version}. Liste limit1..100,offset,search,priority,includeArchived ile bounded; update beklenen version ister. Temel alanlar ve hatalar ../docs/api-design.md içinde. Ağaç/süre hesapları ve ilerleme uygulanmıştır.

Ağaç: POST /api/tasks/{id}/children (parentVersion), POST /api/tasks/{id}/move (version,parentTaskId,parentVersion,beforeSiblingId), GET /api/tasks/children ve /api/tasks/{id}/subtree. Bilinen parent direct tahmininde açık parentWorkDisposition gerekir. Sıra ve API ayrıntıları ../docs/api-design.md içinde.

İş yükü: PUT /api/tasks/{id}/work-definition, GET /api/tasks/{id}/workload ve /work-components. Süreler saniye; hedef toplamın parçası değil; unknown tahmin varsa tam toplam null ve unknown sayısı açık. Actual/remaining /api/tasks/{id}/time üzerinden WorkSessions ile hesaplanır.

Lifecycle: POST /api/tasks/{id}/state {version,action,parentCompletionChoice?}; PUT /required; GET /progress. Manual/automatic parent tamamlanması ayrıdır. ParentCompletionPolicy varsayılanAsk; completeSubtree/parentOnly seçimi ayardan değişebilir. Unknown süreye yüzde üretilmez. UTC zamanlar1μs hassasiyette tutarlıdır.

İlişkiler: /api/tasks/{id}/dependencies ve /ordering add/list/delete; GET /start-eligibility. Gerçek ön koşul Completed ister, soft tercih execution guard değildir. Move/required değişimi combined cycle denetler. Session start/resume bu kuralı kullanıcı kilidi altında tekrar uygular.

Çalışma: POST /api/work-sessions/start {taskId} + Idempotency-Key; /{id}/pause|resume|finish {version}. GET /current, /{id}, /{id}/segments ve bounded liste. Logout/host kapanması sayacı bitirmez; finish görev tamamlaması değildir. /api/tasks/{id}/time actual/remaining/overtime döndürür.

Manuel: POST /api/work-sessions/manual {taskId,startedAt,endedAt,reason} + Idempotency-Key. POST /{id}/segments/{segmentId}/corrections beklenen session/segment version ve yeni effective range/reason ister. GET /{id}/corrections önceki/yeni değerleri ve nedenleri korur. Başka actual ile overlap reddedilir; plan revizyonu actual düzeltmesi değildir.

Manuel plan: GET /api/daily-plans/{date}; POST/PUT /api/schedules ve POST /{id}/remove, Idempotency-Key ve planningVersion ile. Fixed/locked değişimi explicit niyet, manuel overlap explicit kabul ister. Gece blokları aynı ChangeSet ile bölünür. GET /api/plan-revisions/{id}, /items, /changes eski snapshot'ı korur; /api/tasks/{id}/allocation ve isPlanned/from/to gerçek tahsisi gösterir.

Otomatik plan: POST /api/scheduling/preview {date,taskIds,expectedPlanningVersion?,newWorkNotBefore?}; GET /proposals/{id}; POST /apply {proposalId} + Idempotency-Key. Önizleme planı değiştirmez, onay bloklar ve tam revizyonu atomik yazar. POST /plan aynı istek + key ile Preview/Auto tercihini izler. Motor deterministik split/bağımlılık/sabit/mola/tampon ve diğer gün tahsislerini değerlendirir; sığmayan ve tahminsiz işler açık gerekçeyle döner. Süresi/girdisi eski öneri 409 ile yeniden önizleme ister. Ayrıntılar ../docs/scheduling-coordinator.md içinde.

Şimdi başlat: POST /api/work-sessions/start-now {taskId,expectedPlanningVersion,expectedSessionId?,expectedSessionVersion?,remainingTaskIds?} + key. Eski actual kapanışı ve yeni başlangıç tek transaction/instant; kalan gün Preview/Auto tercihiyle ayrıca planlanır. Plan başarısız olsa da başlamış çalışma korunur ve planningStatus açıkça döner. Süre aşımında /api/scheduling/plan güncel actual ile yeniden değerlendirilir, sayaç veya sabit toplantı kesilmez. Ayrıntılar ../docs/immediate-work.md içinde.

Geri alma: POST /api/scheduling/undo-preview {changeSetId,expectedPlanningVersion?,allowProtectedChange?}; aynı /apply ve key ile onay. Tek günün son kullanıcı plan değişikliğinin yalnız gelecekte uygulanabilir ters etkisi hesaplanır; task/session/actual/baseline geri alınmaz. Kısmi veya no-op sonuç açık uyarı verir; etki yeni Undo revision'dır. Ayrıntılar ../docs/plan-undo.md içinde.

Çok gün: POST /api/schedules/{id}/move aynı blok kimliğini başka güne ortak ChangeSet ile taşır. POST /api/scheduling/distribute-preview veya /distribute-plan {fromDate,toDate,taskIds,expectedPlanningVersion?} açık1..31 günlük aralığa aynı task'ı dağıtır; son uç Preview/Auto tercihini izler ve key ister. GET /distribution-proposals/{id}, POST /distribute-apply {proposalId}+key; POST /undo-multi-preview {changeSetId,...} çok gün telafisi üretir. Her etkilenen gün tek transaction'dadır; actual ve geçmiş korunur. Ayrıntılar ../docs/multi-day-planning.md içinde.

Takvim: GET /api/calendar?fromDate&toDate en çok42 günün planned/baseline/actual/completion özetini; GET /api/calendar/days/{date} üç bağımsız sayfalı tarihsel listeyi verir. revisionId ile eski plan okunur. POST /days/{date}/carry aynı task'ın kalan işini açık hedef aralığa Preview/Auto ile ayırır; POST /days/{date}/tasks/{id}/pool gelecekteki tahsisleri revizyonla kaldırıp havuzda bekletir. Her iki POST key ister. Kaynak zone ve historical metadata korunur. Ayrıntılar ../docs/calendar-history.md içinde.

Pomodoro: GET/POST /api/focus-presets, PUT /api/focus-presets/{id}; POST /api/focus-sessions + key; GET /current, /{id}, bounded liste. POST /{id}/pause|resume|break|next|finish|cancel focus/work version ve key ister. 35/7, genel odak, ContinueTracking/aşım, kısa/uzun mola ve açık next desteklenir. Current/get hedefi bir kez kaydeder; AutoBreak bu aşamada sunucu değerlendirmesinde uygulanır. Kalıcı job25 ve push26 sonradan bağlanır. Ayrıntılar ../docs/focus-pomodoro.md içinde.

Destekler: /api/notes CRUD/soft delete ve /{id}/convert; /api/tasks/{id}/return-context ve /energy; /api/support/days/{date} critical/energy ve /end-preparation. POST /api/support/quick-start mevcut focus altyapısında5dk hedef, POST /api/support/rescue mevcut motorda kalan gün planı üretir; key ve normal sürüm kuralları geçerlidir. SupportEnabled tercihi optional araçları kapatabilir; tarihsel notlar silinmez. Ayrıntılar ../docs/support-tools.md içinde.

Tekrarlar: /api/recurrence-templates create/list/get/update, /enabled, /definitions; POST /{id}/materialize {version,fromDate,toDate}+key en çok93 günlük pencere üretir. /{id}/occurrences bounded liste ve tarihli /skip|cancel; /api/tasks/{id}/recurrence kaynak bağıdır. Daily/weekly/monthly/interval, açık ay sonu/DST politikası, immutable tanımlar ve kontrollü future refresh desteklenir. Aynı occurrence aynı TaskId'dir; worker25'te bağlanır. Ayrıntılar ../docs/recurrence.md içinde.

Kalıcı işler: Quartz4.5/PostgreSQL qrtz_ store, transactional outbox, lease/retry/receipt ve reminder/recurrence/focus job'ları. GET /api/jobs/outbox, /reminders; POST /outbox/{id}/retry {version}, owner scoped. Önce controlled EF migration; API startup şema oluşturmaz/silmez. Jobs__Enabled=false hosted işleri kapatabilir. NotificationIntent henüz dış push teslimi değildir. Ayrıntılar ../docs/jobs-outbox.md içinde.

Bildirimler: /api/notifications preferences/subscriptions/reminders/inbox/read/snooze; lead/DND/tür/ses ve stable notification kimliği. VAPID Web Push varsayılan kapalı; ayrı kalıcı P-256 keypair ile açılır. SignalR /api/hubs/planner aynı JWT ile owner grubuna changed işareti yollar; reconnect GET /api/sync ve kaynak HTTP sorgularıyla toparlanır. Ayrıntılar ../docs/notifications-realtime.md içinde. Service Worker ve gerçek tarayıcı/OS teslim kabulü frontend aşamasındadır.

Gerçek süre analitiği: GET /api/analytics/actual?fromDate&toDate&bucket=Day|Week|Month; /actual/breakdown?dimension=Task|Project|Category&offset&limit.1..366gün, effective segment ve frozen source zone; actual/focus çift sayılmaz, corrected target ile tarihsel target ayrıdır. Formüller ../docs/statistics-definitions.md içinde.

Plan analitiği: GET /api/analytics/plans?fromDate&toDate&startToleranceSeconds; /days/{date}/review; /estimate-suggestion?taskId&fromDate&toDate. Baseline/current completion, süre kapsamı, günlük quota, fixed/flexible gecikme, accepted revision/defer nedenleri ve karşılaştırılabilir completed actual median'ı. Task state komutunda optional reason en çok2000 karakter; öneri salt okunur. Formüller ../docs/statistics-definitions.md içinde.

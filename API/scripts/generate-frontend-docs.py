"""Dış OpenAPI ve maskelenmiş yapay HTTP kanıtından frontend rehberi üretir."""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.parse
import uuid
import datetime
import argparse
from frontend_doc_rules import EXTRA_FIELD_NOTES, SCHEMA_FIELD_NOTES, operation_notes

API = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', nargs='?', help='Output docs directory; defaults to an isolated draft.')
parser.add_argument('--source', type=Path, default=API / '.local/api-contract', help='Fresh exporter output directory.')
parser.add_argument('--transcripts', type=Path, default=API / '.local/api-exchanges.ndjson')
args = parser.parse_args()
SOURCE = args.source.resolve()
DEST = Path(args.destination).resolve() if args.destination else API / '.local/frontend-doc-draft'
MODULES = DEST / 'frontend-api'
MODULES.mkdir(parents=True, exist_ok=True)
SPEC = json.loads((SOURCE / 'openapi-v1.json').read_text(encoding='utf-8'))
CATALOG = json.loads((SOURCE / 'endpoint-catalog.json').read_text(encoding='utf-8'))
SCHEMAS = SPEC['components']['schemas']
EXCHANGES = []
for line in (args.transcripts.read_text(encoding='utf-8-sig').splitlines() if args.transcripts.exists() else []):
    try:
        EXCHANGES.append(json.loads(line))
    except json.JSONDecodeError:
        pass

GROUPS = {
    'matrix': ('Eisenhower Matrisi', {'Matrix'}, 'matrix'),
    'auth': ('Kimlik doğrulama ve profil', {'Auth', 'PasswordReset', 'Profile'}, 'auth'),
    'preferences': ('Tercihler ve çalışma saatleri', {'Preferences'}, 'preferences'),
    'tasks': ('Görev, ağaç, yaşam döngüsü ve ilişkiler', {'Tasks', 'TaskTree', 'TaskLifecycle', 'TaskRelations', 'TaskWorkload', 'TaskClassification', 'TaskBatch', 'TaskTreeCreate', 'TaskRead'}, 'tasks'),
    'collections': ('Proje, havuz, kategori ve etiket', {'Projects', 'Pools', 'Categories', 'Tags'}, 'collections'),
    'planning': ('Manuel plan, motor, acil iş, revizyon ve undo', {'Planning', 'PlanEntries', 'DayItems', 'Scheduling', 'Distribution', 'ImmediateWork'}, 'planning'),
    'calendar': ('Takvim ve gün sonu taşıma', {'Calendar'}, 'calendar'),
    'work-focus': ('Gerçek çalışma, düzeltme ve Pomodoro', {'Work', 'WorkCorrections', 'Focus'}, 'work-focus'),
    'support': ('Notlar ve DEHB destekleri', {'Support', 'ClientErrors'}, 'support'),
    'special-days': ('Özel günler', {'SpecialDays'}, 'special-days'),
    'recurrence': ('Tekrarlayan görevler', {'Recurrence'}, 'recurrence'),
    'notifications': ('Bildirimler, kalıcı işler ve senkronizasyon', {'Notifications', 'Jobs', 'Sync', 'Workspace'}, 'notifications'),
    'analytics': ('Gerçek süre, odak ve plan analitiği', {'Analytics', 'PlanAnalytics', 'RecurrenceAnalytics'}, 'analytics'),
}
DESCRIPTIONS = {
    'matrix': 'Görev kopyası değil, mevcut göreve bağlı owner üyeliği. Inbox ayrılmamış; Do önemli/acil; Schedule önemli/acil değil; Delegate önemli değil/acil; Eliminate önemli değil/acil değil. GET beş alanın bağımsız sınırlı sayfasını tek snapshot sürümüyle okur; candidates matriste olmayan açık görevleri ana görev bağlamıyla arar (kapsayıcılar dahil). POST üyelik ekler; PUT alan/sıra değiştirir, beforeTaskId hedefin önüne/null gerçek sona koyar; DELETE yalnız üyeliği kaldırır. Görev state/priority/ağaç sırası, plan ve actual değişmez. Bütün yazılar beklenen matris version ister,409 güncel okuma gerektirir; key yok, belirsiz yazı otomatik tekrarlanmaz. MatrixChanged canlı olayı yayınlanır. Alanlar25 varsayılan/100azami, offset0..100000; aday araması200karakter. Archived/deleted/terminal görev üyelikleri saklanır ancak görünmez. Ayrıntı [matris sözleşmesi](../matrix.md).',
    'special-days': 'UI-R3 özel günler: doğum günü, yıldönümü, tatil ve diğer. Yearly (isteğe bağlı başlangıç yılı) veya Once (yıl zorunlu); 29 Şubat artık olmayan yılda 28 Şubat gösterilir. Oluşumlar sunucuda hesaplanır (`occurrences`, ≤366 gün). Create Idempotency-Key ister; update/delete/restore version ile 409 verir; silme yumuşaktır ve geri alınabilir. Hatırlatma kullanıcının zaman diliminde 09:00 için bildirim niyetidir (SameDay/OneDayBefore/OneWeekBefore), sessiz saat ve `specialDay` tercihi uygulanır; değişiklik/silme bekleyen niyetleri Obsolete yapar. NonWorking o günün çalışma saatlerini boşaltır, açık tarih istisnası kazanır; plan kendiliğinden değişmez. Değişiklik `SpecialDayChanged` canlı olayı yayınlar.',
    'auth': "UI-R3: Register201 ve login200 HttpOnly oturum cookie'si yazar (production'da `__Host-adhd_session`, Secure, SameSite=Strict, Path=/, ≈400 gün; Development/Testing loopback'te `adhd_session`). Tarayıcı `/api/auth/session/register` (201) ve `/api/auth/session/login` (200) uçlarını kullanır; bu yanıtlar yalnız UserSummary taşır, token içermez. `/api/auth/register` ve `/api/auth/login` Bearer istemci sözleşmesini korur; tarayıcı bu uçları kullanmaz. Açık Authorization: Bearer başlığı (tarayıcı dışı istemci) varsa o, yoksa cookie kullanılır; URL query token hiçbir yerde kabul edilmez. Her token bir `sid` oturumuna bağlıdır ve her istekte iptal kontrolü yapılır. Cookie ile kimliği doğrulanan POST/PUT/PATCH/DELETE aynı-host Origin (yoksa Referer) ve `X-ADHD-CSRF: 1` ister; Bearer muaftır. `GET /api/auth/me` bir günden eski cookie'yi aynı oturumla yeniler. Logout geçerli oturumu, logout-all bütün oturumları kapatır; parola sıfırlama da bütün oturumları kapatır; push abonelikleri değişmez. `session/adopt`, sid'siz eski tarayıcı token'ını bir kez cookie oturumuna çevirir. E-posta/parola etkin, parola yalnız en az6 karakter. Google kimlik doğrulaması backend yapılandırmasına (`Google:Enabled`, `Google:ClientId`) bağlıdır; varsayılan olarak kapalıdır (503). `GET /api/auth/google/config` no-store önbellekleme ve etkin durumda kısa ömürlü HttpOnly SameSite=Strict tarayıcı challenge cookie ile enabled/clientId/nonce döndürür. Tarayıcı girişi `POST /api/auth/session/google {idToken}` yalnız UserSummary döndürür ve HttpOnly oturum cookie'si yazar; `POST /api/auth/google` Bearer uyumluluğunu korur. `POST /api/auth/google/link {idToken, expectedUserId}` oturum açmış kullanıcıya Google bağlar (tarayıcıda challenge cookie doğrulanır, Bearer uyumludur). Doğrulanmış Google token'ından ad/soyad/görünen ad/fotoğraf ilk aktarımda doldurulur, kullanıcının düzenlediği alanlar korunur; `sub` sabit harici kimliktir. Aynı e-postada otomatik bağlama yalnız doğrulanmış Gmail veya `hd` içeren kurumsal Google Workspace adreslerinde yapılır, mevcut kullanıcı ID/verileri ve parola korunur; diğer alan adları önce parolayla giriş ve ayarlardan bağlama gerektirir. `UserSummary.googlePictureUrl` özel yüklenen fotoğraftan ayrı isteğe bağlı HTTPS Googleusercontent fallback URL'sidir; kullanıcının yüklediği özel fotoğraf önceliklidir, fotoğraf kaldırma her ikisini temizler ve tarayıcı görseli doğrudan Google'dan no-referrer ile çeker (sunucuya indirilmez). Forgot202 hesap uygunluğunu açıklamaz; reset ayrı30dk/tek kullanımlık koddur.",
    'preferences': 'Tercihler version0 varsayılan belgeyle başlar; PUT beklenen version ile bütün values belgesini yazar. Europe/Istanbul başlangıç zone’u, haftanın başlangıcı0Pazar..6Cumartesi. Weekly ve Exceptions dakika0..1440 aralıklarıdır; aynı gün overlap reddedilir, istisna haftalık pencerenin yerini alır. Gizli09–17 yoktur. Preview/Auto, minimum parça, tampon ve SupportEnabled burada; focus/bildirim tercihleri kendi modüllerindedir. Working-hours çıktısındaki UTC aralıklarını otorite alın. Çalışma takvimi dönüşümü DST gap’te ilk geçerli dakikayı, tekrarlanan sınırda erken instant’ı kullanır; manuel blokta açık UTC/offset instant gönderilir.',
    'tasks': 'Yalnız title ile task oluşturulur; tahmin null kalabilir. PUT task alan belgesini değiştirir: gönderilmeyen description/deadline null, priority Normal, canSplit true varsayılanına dönebilir; partial PATCH gibi kullanmayın. Server süre/status/timestamps genel PUT ile yazılmaz. DirectEstimate kendi işidir, TargetBudget toplam hedeftir ve çocuk toplamına eklenmez. Container toplamını çocuklarla tekrar saymayın. State komutunda action=Complete ile state=Completed farklı kavramlardır; CompleteDirectWork yalnız parent’ın kendi işini kapatabilir. Parent completion choice, tree move ve child oluşturma parentWorkDisposition koşullarını ilgili DTO ve [iş yükü sözleşmesinden](../database-design.md) izleyin. Gerçek dependency çalışma başlangıcını engeller; ordering yumuşak sıradır. Döngü/self/ancestor beklemeleri reddedilir. Archive soft’tur; tarihsel FK koparılmaz. Arşivi geri açma endpointi yoktur; her task create key destekler varsaymayın.',
    'collections': 'Dört kaynak aynı create/get/list/update/archive/workload biçimini kullanır; kimlikler kullanıcıya aittir. Proje/havuz görev kopyası oluşturmaz; classification task üzerindeki bağları günceller. ApplyToSubtree gibi toplu niyetlerde planningVersion kontrol edilir. Workload roll-up bağımsız gerçek işlerden gelir; aynı parent/child iki kez eklenmez. Arşivlenmiş kaynakla geçmiş snapshot’lar silinmez.',
    'planning': 'İlk Work içeren kabul edilmiş tam revision baseline olur; preview bunu değiştirmez. Her önemli accepted blok değişimi yeni tam snapshot/delta/ChangeSet üretir. TaskSchedule plan, WorkSession gerçekleşendir. Motor deterministik sezgiseldir; Unplaced ve warnings normal sonuç olabilir. CanApply/HasConstraintConflicts/Unplaced birlikte okunur. IsPartial alanı undo’nun kısmi telafisini belirtir; kapasiteye sığmama Unplaced içindedir. Apply key ile görev/ayar/plan/session ve zamana bağlı sürümleri yeniden doğrular;409’da yeni preview alın. Default HTTP preview başlangıcı serverNow+30sn’nin sonraki dakikaya yuvarlanmasıdır; yanıtın gerçek saatini kullanın. Normal replan aktif işi kesmez; start-now açık kesme niyetidir. Preview modunda acil gerçek çalışma hemen başlar, kalan plan ayrıca onaylanır; reddetmek work’ü silmez. Multi-day en çok31 gün, aynı TaskId ve atomik ChangeSet; undo kör DB restore değil yeni telafi revision’ıdır. [Manuel plan](../manual-planning.md), [motor/apply](../scheduling-coordinator.md), [acil iş](../immediate-work.md), [undo](../plan-undo.md), [çok gün](../multi-day-planning.md).',
    'calendar': 'Range iki uç dahil1..42yerel gün; olmayan güne boş görünüm okumak DailyPlan yaratmaz. Day plan/actual/completion listelerinin bağımsız offset/limit’leri vardır. revisionId yalnız o owner/güne ait eski planı seçer. Task adı/yolu ve geçmiş completion bugünkü task satırından yeniden yazılmaz. Actual source session zone’uyla kesişir; legacy bilinmeyen zone açık kapsam sayacıdır. Carry açık hedef aralığında kalan tahsisi önerir; sessiz yarına taşıma yoktur. Pool işlemi task bağını ve gelecekteki tahsisi revision’la değiştirir, actual geçmişini korur. [Ayrıntı](../calendar-history.md).',
    'work-focus': 'Normal start/pause/resume/finish gerçek segmentleri yönetir; bir kullanıcıda tek açık segment DB’de de korunur. Finish task complete değildir; task complete açık segmenti kapatır. ServerNow/ActiveSeconds otoritedir; browser kapanması veya bağlantı kaybı sayacı bitirmez. Manual/correction önceki-yeni değer/neden audit’iyle atomiktir, gerçek work overlap reddedilir; audit ayrıca actual sayılmaz. Focus preset35/7 dahil özeldir; task90dk ile cycle35dk ayrı kavramlardır. ContinueTracking hedefi bir kez kaydeder ve actual/overtime sürer. AutoBreak ilk server değerlendirmesinde kapatır, geçmişi hedef anında kesilmiş gibi değiştirmez. Break work segmentini kapatır; next açık kullanıcı niyetidir, gizli döngü yoktur. Aynı WorkSession birkaç focus cycle’a bağlanabilir; süreleri tekrar toplamayın. [Work/focus](../focus-pomodoro.md), [düzeltme](../testing-strategy.md).',
    'support': 'Notlar kütüphanesi: kullanıcı kategorileri (renk, sıra, çubuk/sabit, kaldır/geri getir), Short/Detailed/Toggle gösterimi ve başlık. Notlar ekranı General, gün notu alanı Daily oluşturur. Task/NextStep gerçek görev gerektirir. NextStep not listelerine girmez. Work bağlamı owner ve task ile uyuşmalıdır; genel focus’a uydurma task atanmaz. Convert key + version ile aynı notu ikinci task’a çoğaltmaz. Return-context gerçek son segment/not/completion ve uygun küçük adımdan gelir, veri yoksa null’dır. Critical1..3/energy isteğe bağlı yumuşak desteklerdir; SupportEnabled false quick-start/rescue’yu kapatabilir. Quick-start gerçek focus altyapısında5dk hedeftir. Rescue Preview/Auto tercihini izler. End-preparation salt okur; carry/pool seçimini ayrı komut yapın. [Ayrıntı](../support-tools.md).',
    'recurrence': 'Şablon, immutable definition ve tarihli occurrence ayrıdır. Aynı template/localDate daima aynı TaskId; disabled template geçmişi silmez. Materialize1..93gün, key ve template version ister. Daily/IntervalDays/Weekly/Monthly; ay29..31 için Skip/Clamp, DST gap/overlap için açık policy alanları vardır. localDueTime bir deadline’dır; otomatik plan bloğu yaratmaz. UpdateFuture geçmişi/çalışılmış/planlanmış/manuel değiştirilmiş örneği korur; refresh açık bounded pencere ister. Skip/cancel marker’ı üretilmemiş tarihi de engelleyebilir; ordinary reopen aynı task kimliğinde kalır. [Kesin seri/DST sözleşmesi](../recurrence.md).',
    'notifications': 'In-app kaynak NotificationIntent Ready kayıtlarıdır; SignalR değişiklik işaretidir. Push varsayılan kapalı, ayrı VAPID keypair gerekir; public-config private key vermez. Endpoint/key’ler request’te browser subscription’dan gelir, listede geri dönmez. Snooze aynı notificationId ve yeni snoozeCount; DND deneme bütçesi tüketmez, eski alarm seli önlenir. Lead kaynak zamanından çıkarılır; source/revision/version gönderim öncesi tekrar doğrulanır.404/410 subscription deactivate; transient push bounded retry; exactly-once yoktur. Normal pause geri dönüş alarmı alabilir, planlı Pomodoro molası ikinci dönüş alarmı üretmez. GET sync owner planningVersion/aktif veya son paused work/focus kimliğidir; sonra gerçek endpoint’leri refetch edin. Jobs/outbox görünürlüğü yalnız owner ve payload/secretsizdir. [Bildirim/SignalR](../notifications-realtime.md), [jobs](../jobs-outbox.md).',
    'analytics': 'Raporlar salt okunur,1..366yerel gün ve50000kaynak yoğunluk sınırı kullanır. Actual/focus source-session frozen zone; plan reference kendi frozen zone’unda kalır. Day/week/month; weekly güncel WeekStartsOn sunum tercihidir. Parent roll-up ve focus actual’a ikinci kez eklenmez; düzeltme effective segmenti değiştirir, journal süre eklemez. Baseline/current paydalar ayrı, quota tamamlanma değildir; boş oranlar null, unknown tahmin kapsamı görünür. Task progress DurationProgress eksik tahminde null olabilirken plan DurationCompletion bilinen referans kapsamını ayrı gösterir. Estimate suggestion en az3 karşılaştırılabilir recorded completed actual’ın median’ıdır; Applied=false, plan/tahmin değişmez. Formül, kesim, DST, tarihsel kategori ve örneklem için [istatistik tanımları](../statistics-definitions.md).',
}

FIELD_NOTES = {
    'version': 'Kaydın son yanıttaki sürümü; stale409. Tercihler ilk yazımda0 olabilir.',
    'expectedPlanningVersion': 'Owner koordinasyon sürümü; entity version yerine geçmez.',
    'planningVersion': 'Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü.',
    'workSessionVersion': 'Focus komutunda bağlı gerçek çalışma sürümü de güncel olmalı.',
    'segmentVersion': 'Correction hedef segmentinin son sürümü.',
    'parentVersion': 'Parent değişiklik yarışı için beklenen parent sürümü.',
    'serverNow': 'UTC server instant; sayaç ekranı bu referansla hesaplanır.',
    'directEstimatedSeconds': 'Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil.',
    'targetBudgetSeconds': 'Toplam hedef bütçe; direct/child formülüne eklenmez.',
    'activeSeconds': 'Effective aktif segment süresi; pause/mola hariç.',
    'remainingSeconds': 'Null eksik tahmin demektir; negatif süre gösterilmez.',
    'hasDirectWork': 'False container; roll-up ayrı planlanacak iş yaratmaz.',
    'directWorkCompleted': 'Parent’ın kendi iş bileşeni completion’ı; açık çocuklardan ayrı olabilir.',
    'canSplit': 'Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez.',
    'allowConflicts': 'Manuel overlap’ı açık kabul; actual work overlap’ına izin vermez.',
    'allowProtectedChange': 'Sabit/kilitli blok değiştirmek için açık niyet.',
    'baselineRevisionId': 'İlk kabul edilmiş Work içeren immutable tam plan.',
    'currentRevisionId': 'En son kabul edilmiş plan; baseline yerine geçmez.',
    'startedRevisionItemId': 'Çalışma başlangıcındaki frozen plan bağlamı; replan bunu değiştirmez.',
    'idempotencyKey': 'Aynı niyette aynı key/payload; farklı payload409.',
    'isPartial': 'Undo kısmi telafisi; kapasite açığı Unplaced içindedir.',
    'unplaced': 'Yerleşmeyen iş ve açık neden/kalan miktar; sessiz taşıma yapılmaz.',
    'warnings': 'Kullanıcıya gösterilecek domain/kapasite uyarıları; HTTP hata olmak zorunda değil.',
    'timeZoneId': 'IANA zone; yerel tarih etiketiyle UTC instant farklıdır.',
    'sourceTimeZones': 'Raporun frozen gerçek kayıt zone kapsamı.',
    'applied': 'Proposal’da kabul sonucu veya suggestion’da false; ilgili DTO anlamını izleyin.',
    'code': 'Makineye yönelik domain/validation hata kodu.',
    'traceId': 'Destek/log ilişkilendirme; hata mesajı parse etmek yerine code kullanın.',
    'errors': 'Alan doğrulama hatalarında field→mesaj dizisi; diğer hatada bulunmayabilir.',
    'reason': 'Kullanıcının açıklaması; eski eksik nedenler icat edilmez.',
    'id': 'Bu DTO kaydının kalıcı GUID kimliği; başka owner için kaynak404.',
    'taskId': 'Aynı işin günler/planlar/oturumlar boyunca korunan Task kimliği; nullable genel odak olabilir.',
    'taskIds': 'Seçilen işler; motor container seçimini doğrudan iş bileşenlerine açar.',
    'parentTaskId': 'Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular.',
    'scheduleId': 'Plan bloğu kimliği; work start bağlamı için scheduleVersion da gerekebilir.',
    'scheduleVersion': 'Başlangıçta seçilen plan bloğunun beklenen sürümü.',
    'workSessionId': 'Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır.',
    'focusSessionId': 'Hedef/mola döngüsü bağlamı; ayrı actual süre kaynağı değildir.',
    'projectId': 'Uzun vadeli proje bağı; task kopyası üretmez.',
    'poolId': 'Görev havuzu bağı; plan bloklarından bağımsızdır.',
    'categoryId': 'Tek kategori bağı; historical snapshot bugünkü ada göre yeniden yazılmaz.',
    'tagIds': 'Görevin etiket kimlikleri; sınıflandırma komutunun gönderdiği seti temsil eder.',
    'proposalId': 'Henüz kabul edilmemiş öneri kimliği; apply aynı snapshot dayanağını tekrar doğrular.',
    'changeSetId': 'Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı.',
    'revisionId': 'Kabul edilmiş immutable tam plan sürümü; proposal kimliği değildir.',
    'localDate': 'Kaydın zone bağlamında yerel gün; UTC instant değildir.',
    'date': 'İlgili plan/destek/occurrence günü; YYYY-MM-DD.',
    'fromDate': 'Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır.',
    'toDate': 'Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz.',
    'startsAt': 'Plan bloğunun offset içeren başlangıç instantı; [start,end).',
    'endsAt': 'Plan bloğunun hariç bitiş instantı; deadline değildir.',
    'startedAt': 'Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler.',
    'endedAt': 'Gerçek aralık bitişi; açık segmentte null olabilir.',
    'deadlineAt': 'Görevin son teslim instantı; plan bloğu bitişinden ayrıdır.',
    'isFixed': 'Motorun yerini koruyacağı sabit blok.',
    'isLocked': 'Kullanıcının koruduğu blok; değiştirme için açık niyet gerekir.',
    'sortOrder': 'Kararlı manuel kardeş sırası; move komutunda beforeSiblingId kullanılır.',
    'offset': 'Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin.',
    'limit': 'Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir.',
    'total': 'Filtrelenmiş tüm sorgu sayısı; items.Length değildir.',
    'hasMore': 'Tree/subtree devam sayfası var; bu DTO total taşımaz.',
    'items': 'Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar.',
    'newWorkNotBefore': 'Yeni otomatik blokların alt sınırı; varsayılan now+30sn yukarı dakikaya yuvarlanır.',
    'canApply': 'Hard kısıtlar açısından apply imkânı; stale/time doğrulaması apply’da yeniden yapılır.',
    'workSeconds': 'Focus hedefi veya rapor actual değeri; DTO bağlamını izleyin, ikisini toplamayın.',
    'shortBreakSeconds': 'Preset kısa mola hedefi; gerçek çalışma süresine eklenmez.',
    'longBreakSeconds': 'Preset uzun mola hedefi; döngü sıklığı ayrı alandır.',
    'targetBehavior': 'ContinueTracking veya AutoBreak; bağımsız çelişen bool seti değildir.',
    'targetReachedAt': 'Bir kez gözlemlenmiş hedef olayı; task completion veya work finish değildir.',
    'overtimeSeconds': 'Aktif hedef üzerindeki gerçek süre; pause/mola tüketmez.',
    'isVoided': 'Effective actual hesabından çıkarılmış segment; audit kaydı silinmez.',
    'snoozeCount': 'Aynı notificationId için açık erteleme sayacı; client/push dedup bağlamı.',
    'readyAt': 'İlk in-app hazırlama zamanı; browser teslim/okundu kanıtı değildir.',
    'readAt': 'Kullanıcının okundu işareti; null henüz işaretlenmedi.',
    'notBefore': 'Teslimin en erken değerlendirileceği instant; DND daha ileri taşıyabilir.',
    'providerHost': 'Abonelik sağlayıcı host’u; özel endpoint/key değerleri yanıtta verilmez.',
    'enabled': 'İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir.',
    'displayName': 'Kullanıcının isteğe bağlı görünen adı; auth kimliği e-posta/sub’tır.',
    'knownEstimatedSeconds': 'Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez.',
    'unknownEstimateCount': 'Tahmini eksik bağımsız iş bileşeni sayısı.',
    'calculatedTotalSeconds': 'Direct+recursive çocuk toplamı; unknown kapsamı tam değilse null olabilir.',
    'targetDifferenceSeconds': 'Hedef bütçe ile hesaplanan iş farkı; kendiliğinden direct work yaratmaz.',
    'durationProgress': 'Süre ağırlıklı ilerleme; coverage eksikse null olabilir.',
    'sourceVersion': 'Event/reminder kaynak sürümü; NotificationReady’de snoozeCount bağlamı.',
}
FIELD_NOTES.update(EXTRA_FIELD_NOTES)

def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2)

def slug(value):
    return re.sub(r'[^a-z0-9_-]', '-', value.lower()).strip('-')

def cell(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')

def resolve(schema):
    if '$ref' in schema:
        return SCHEMAS[schema['$ref'].split('/')[-1]]
    return schema

def describe(schema):
    if '$ref' in schema:
        name = schema['$ref'].split('/')[-1]
        return f'[{name}](DTO-Sozlugu.md#{slug(name)})'
    if 'oneOf' in schema or 'anyOf' in schema:
        return ' / '.join(describe(s) for s in schema.get('oneOf', schema.get('anyOf', [])))
    kind = schema.get('type', 'object')
    if kind == 'array':
        return describe(schema.get('items', {})) + '[]'
    label = '|'.join(kind) if isinstance(kind, list) else kind
    if schema.get('format'):
        label += ' (' + schema['format'] + ')'
    if 'enum' in schema:
        label += ': ' + ', '.join('null' if x is None else str(x) for x in schema['enum'])
    return label

def rules(schema):
    parts = []
    for key in ('minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'default'):
        if key in schema:
            parts.append(f'{key}={json.dumps(schema[key], ensure_ascii=False)}')
    return '; '.join(parts) or '—'

def primitive(name, schema):
    if '$ref' in schema:
        return primitive(name, resolve(schema))
    alternatives = schema.get('oneOf', schema.get('anyOf'))
    if alternatives:
        return primitive(name, next((s for s in alternatives if s.get('type') != 'null'), alternatives[0]))
    if 'enum' in schema:
        return schema['enum'][0]
    kind = schema.get('type', 'object')
    if isinstance(kind, list):
        kind = next((x for x in kind if x not in ('null', 'string')), next((x for x in kind if x != 'null'), 'null'))
    if kind == 'null':
        return None
    if kind == 'boolean':
        return schema.get('default', False)
    if kind in ('integer', 'number'):
        if 'default' in schema:
            return schema['default']
        if name in ('offset', 'planningVersion', 'expectedPlanningVersion'):
            return 0
        return max(schema.get('minimum', 1), 1)
    if schema.get('format') == 'uuid':
        return '11111111-1111-4111-8111-111111111111'
    if schema.get('format') == 'date':
        return '2026-10-16'
    if schema.get('format') == 'date-time':
        return '2026-10-16T06:00:00Z' if name not in ('endsAt', 'endedAt', 'to', 'toUtc') else '2026-10-16T06:25:00Z'
    if kind == 'string':
        values = {'email': 'developer@example.test', 'password': '123456', 'newPassword': '123456', 'accessToken': '<APPLICATION_JWT>', 'tokenType': 'Bearer', 'token': '<RESET_CODE_FROM_EMAIL>', 'title': 'Raporu yaz', 'name': 'Çalışma', 'text': 'Bir sonraki küçük adım', 'reason': 'Takvim düzenlendi', 'timeZoneId': 'Europe/Istanbul', 'language': 'tr', 'timeFormat': '24h', 'planningMode': 'Preview', 'weekStartsOn': '1'}
        values.update({'googlePictureUrl': 'https://lh3.googleusercontent.com/a/example', 'idToken': '<GOOGLE_ID_TOKEN_FROM_GIS>', 'clientId': '<GOOGLE_WEB_CLIENT_ID>', 'nonce': 'n' * 43})
        return values.get(name, 'örnek')
    return None

def example(schema, depth=0, name=''):
    if depth > 9:
        return None
    if '$ref' in schema:
        if schema['$ref'] == '#/components/schemas/DaySignalsView':
            return {'localDate': '2026-10-16', 'serverNow': '2026-10-16T06:00:00Z', 'returnThresholdSeconds': 1800,
                    'notifications': [], 'complete': True, 'lastWork': None, 'focusIncluded': False,
                    'focus': None, 'runningWorkSessionId': None, 'runningTask': None}
        if schema['$ref'] == '#/components/schemas/CalendarOverviewView':
            return {'fromDate': '2026-10-16', 'toDate': '2026-10-16', 'serverNow': '2026-10-16T06:00:00Z', 'planningVersion': 0,
                    'days': [{'localDate': '2026-10-16', 'timeZoneId': 'Europe/Istanbul', 'itemCount': 0, 'completedItemCount': 0, 'rootGroupCount': 0, 'roots': []}]}
        if schema['$ref'] == '#/components/schemas/DayOverviewView':
            return {'day': {'id': None, 'localDate': '2026-10-16', 'timeZoneId': 'Europe/Istanbul', 'currentRevisionId': None, 'baselineRevisionId': None, 'version': 0, 'planningVersion': 0},
                    'windowStartsAt': '2026-10-15T21:00:00Z', 'windowEndsAt': '2026-10-16T21:00:00Z',
                    'timed': {'items': [], 'offset': 0, 'limit': 100, 'total': 0}, 'untimed': {'items': [], 'offset': 0, 'limit': 100, 'total': 0},
                    'glance': {'localDate': '2026-10-16', 'workingRemainingSeconds': 0, 'plannedRemainingSeconds': 0, 'unknownEstimateCount': 0, 'completedItemCount': 0, 'openItemCount': 0, 'actualSeconds': 0, 'overCapacity': False, 'hints': [], 'planningVersion': 0, 'serverNow': '2026-10-16T06:00:00Z'},
                    'support': {'localDate': '2026-10-16', 'timeZoneId': 'Europe/Istanbul', 'availableEnergy': None, 'criticalTaskIds': [], 'version': 0, 'planningVersion': 0, 'enabled': True},
                    'versions': {'planning': 0, 'notes': 0, 'specialDays': 0}, 'recurringTaskIds': []}
        if schema['$ref'] == '#/components/schemas/WorkspaceSnapshotView':
            value = example(resolve(schema), depth + 1, name)
            value.update(activeWork=None, focusSessionId=None, focusIncluded=False, activeFocus=None)
            return value
        return example(resolve(schema), depth + 1, name)
    alternatives = schema.get('oneOf', schema.get('anyOf'))
    if alternatives:
        return example(next((s for s in alternatives if s.get('type') != 'null'), alternatives[0]), depth + 1, name)
    if schema.get('type') == 'array':
        return [example(schema.get('items', {}), depth + 1, name)] if schema.get('minItems', 0) else []
    if schema.get('type') == 'object' or 'properties' in schema:
        return {key: example(value, depth + 1, key) for key, value in schema.get('properties', {}).items()}
    return primitive(name, schema)

def body_schema(operation):
    return operation.get('requestBody', {}).get('content', {}).get('application/json', {}).get('schema')

def response_schema(operation, status):
    response = operation['responses'].get(str(status), {})
    return response.get('content', {}).get('application/json', {}).get('schema')

def match(path, concrete):
    pattern = re.sub(r'\\\{[^}]+\\\}', '[^/]+', re.escape(path))
    return re.fullmatch(pattern, concrete or '') is not None

def candidates(endpoint, path):
    parameters = {p['name']: p.get('schema', {}) for p in SPEC['paths'][endpoint['path']][endpoint['method'].lower()].get('parameters', []) if p.get('in') == 'path'}
    def valid_concrete(concrete):
        if not match(path, concrete):
            return False
        for segment, value in zip(path.strip('/').split('/'), concrete.strip('/').split('/')):
            if not segment.startswith('{'):
                continue
            schema = parameters.get(segment[1:-1], {})
            try:
                if schema.get('format') == 'uuid':
                    uuid.UUID(value)
                elif schema.get('format') == 'date':
                    datetime.date.fromisoformat(value)
            except ValueError:
                return False
        return True
    return [e for e in EXCHANGES if e['method'] == endpoint['method'] and valid_concrete(e['path'])]

def best_success(endpoint, path, operation):
    records = [e for e in candidates(endpoint, path) if 200 <= e['status'] < 300]
    reasonable = [e for e in records if len(dump(e.get('responseBody'))) <= 20000]
    records = reasonable or records
    schema = body_schema(operation)
    allowed = set(resolve(schema or {}).get('properties', {}))
    def score(e):
        body = e.get('requestBody')
        unknown = len(set(body) - allowed) if isinstance(body, dict) and allowed else 0
        known = len(set(body) & allowed) if isinstance(body, dict) else 0
        response_size = min(len(dump(e.get('responseBody'))), 15000)
        return (-unknown, known, response_size)
    return max(records, key=score) if records else None

def note(endpoint, path):
    method = endpoint['method']
    if path.endswith('/state'):
        return 'Action enum’u kullanın. Complete parent’ta choice gerekebilir; optional reason yalnız gerçek geçiş olayına kaydedilir. Tamamlama açık work’ü aynı işlemde kapatır.'
    if '/focus-sessions/' in path and method == 'POST':
        return 'Focus version + workSessionVersion + key birlikte gereklidir. break/next/finish/cancel anlamları farklıdır; next devam eden molayı yalnız skipBreak=true açık niyetiyle atlayabilir.'
    if path.endswith('/apply') or path.endswith('distribute-apply'):
        return 'Önce ilgili proposal’ı alın; proposalId ve aynı niyete ait key gönderin. Stale409’da kör tekrar yerine güncel HTTP state ve yeni preview gerekir.'
    if path.endswith('/plan') or path.endswith('distribute-plan') or path.endswith('/rescue') or path.endswith('/carry'):
        return 'Kullanıcının Preview/Auto tercihini izler; yanıtın status/applied alanını okuyun, her200 sonucu accepted revision sanmayın.'
    if path.endswith('/start-now'):
        return 'Acil gerçek çalışma hemen başlar; eski açık segment aynı server instant’ında kapanır. Preview planını reddetmek gerçek çalışma kaydını geri almaz.'
    if '/corrections' in path and method == 'POST':
        return 'version/segmentVersion/startedAt/isVoided/reason zorunludur; endedAt açık segmentte null olabilir. Kapalı segment correction ile resume edilmez. Overlap reddedilir.'
    if path.endswith('/materialize'):
        return '1..93gün; aynı template/localDate duplicate task üretmez. Eski template version409; key farklı payload’la tekrar kullanılamaz.'
    if path.endswith('/snooze'):
        return 'Aynı notificationId, artan snoozeCount ve yeni NotBefore; kaynak hâlâ geçerli olmalıdır. DND ve tür tercihleri teslimde yeniden kontrol edilir.'
    if path.endswith('/estimate-suggestion'):
        return 'Owner task gerekli. Template→category→project karşılaştırması;3pozitif recorded completed örnek yoksa null neden. Applied=false, kullanıcı ayrı komutla kabul eder.'
    if method == 'PUT' and endpoint['controller'] == 'Tasks':
        return 'Tam alan güncellemesidir: title gerekli; optional alanın gönderilmemesi null/default’a dönüşebilir. Mevcut alanları korumak için son TaskView’den uygun request alanlarını gönderin.'
    if path == '/api/auth/google/config':
        return 'No-store önbellekleme; sunucu yapılandırmasına (Google:Enabled, Google:ClientId) göre enabled, clientId ve tarayıcı replay koruması için kısa ömürlü HttpOnly SameSite=Strict challenge cookie ile eşleşen nonce döner.'
    if path == '/api/auth/session/google':
        return 'Tarayıcı Google girişi: doğrulanmış idToken ve challenge cookie ile HttpOnly oturum açar, yanıt yalnız UserSummary taşır. Sunucuda Google kapalıysa 503; yetkisiz e-postada google_link_required döner.'
    if path.endswith('/google/link'):
        return 'Oturum açmış kullanıcıya Google bağlar (expectedUserId doğrulaması). Tarayıcıda challenge cookie ile idToken eşleşir, Bearer çağrısı da desteklenir. sub benzersizdir; Google kapalıysa 503.'
    if path.endswith('/google'):
        return 'Bearer istemci uyumluluğu: doğrulanmış idToken ile JWT AccessToken ve UserSummary döner; tarayıcı /api/auth/session/google kullanır. Google kapalıysa 503.'
    if method == 'DELETE' or path.endswith('/remove'):
        return 'Beklenen sürümü alın. Başka owner ID404;204 yanıtı JSON olarak parse etmeyin.'
    if method == 'GET':
        return 'Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.'
    return 'Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.'

def schema_tables():
    text = ['# DTO ve enum sözlüğü', '', '152işlemin eriştiği bütün public OpenAPI şemaları aşağıdadır. Request/response ayrımı endpoint sayfasındadır. Required alan varlığını, null union’u nullable olmayı gösterir; command’a özgü iş kuralları modül notlarıyla birlikte uygulanır. Sayılar JSON number olarak döner; bazı .NET input sayı şemaları string okumaya da izin verir. Int64 sürümleri hesaplamak yerine yanıttan taşıyın. Oranlar0..1, süreler aksi belirtilmedikçe saniyedir.', '']
    for name, schema in sorted(SCHEMAS.items()):
        text += [f'## {name}', '']
        if 'enum' in schema:
            text += ['Değerler: ' + ', '.join('`' + ('null' if v is None else str(v)) + '`' for v in schema['enum']) + '.', '']
        props = schema.get('properties', {})
        if props:
            text += ['| Alan | Tip / null | Required | Şema sınırı / default | Anlam |', '| --- | --- | --- | --- | --- |']
            for key, value in props.items():
                meaning = SCHEMA_FIELD_NOTES.get(name, {}).get(key, FIELD_NOTES.get(key, value.get('description', 'İlgili endpoint/modül kapsamındaki değer.')))
                text.append('| ' + ' | '.join([f'`{key}`', cell(describe(value)), 'evet' if key in schema.get('required', []) else 'hayır', cell(rules(value)), cell(meaning)]) + ' |')
            text += ['']
        elif 'enum' not in schema:
            text += ['Şekil: ' + cell(describe(schema)), '']
    text += ['## Inline HTTP hata şeması', '',
        'Bu şema operation response içinde inline bulunur;200named schema sayısına ek bir component değildir. Framework/proxy/auth challenge yanıtı her zaman bu şekli taşımaz.', '',
        '| Alan | Tip | Anlam |', '| --- | --- | --- |',
        '| `type` | string/null | HTTP problem türü URI; karar anahtarı olarak parse edilmez. |',
        '| `title` | string/null | Güvenli insan açıklaması; sabit lokalizasyon/iş kuralı anahtarı değildir. |',
        '| `status` | number/null | HTTP status tekrarı; gerçek HTTP response status esastır. |',
        '| `detail` | string/null | Framework tarafından sağlanabilen ek açıklama; mevcut domain handler zorunlu kılmaz. |',
        '| `instance` | string/null | Problem occurrence URI bağlamı; bulunmak zorunda değil. |',
        '| `code` | string | Application/model-validation hata kodu; transport yanıtında olmayabilir. |',
        '| `traceId` | string | Destek/korelasyon kimliği; kullanıcıya güvenli hata referansı olarak gösterilebilir. |',
        '| `errors` | Record<string,string[]>/null | Model-binding/alan doğrulama hataları; her domain400de yok. Alan key casing normalize edilir. |', '',
        'Bilinen şema kısıtı: CreateScheduleRequest.kind,TaskStateRequest.action,FocusPresetRequest.settings,UpdateFocusPresetRequest.settings required olmasına rağmen nullable union gösterebilir. Runtime Required doğrulaması nullı400reddeder; ilgili alan açıklaması/entegrasyon kuralları uygulanır.', '']
    (MODULES / 'DTO-Sozlugu.md').write_text('\n'.join(text), encoding='utf-8')

def error_dictionary():
    rows = collections.defaultdict(set)
    locations = collections.defaultdict(set)
    messages = collections.defaultdict(set)
    pattern = re.compile(r'\bnew(?:\s+UseCaseException)?\s*\(\s*ErrorKind\.(\w+)\s*,\s*"([a-z][a-z0-9_]+)"|\b(Conflict|Invalid|Missing)\s*\(\s*"([a-z][a-z0-9_]+)"')
    status = {'Validation': '400', 'NotFound': '404', 'Conflict': '409', 'Unauthenticated': '401', 'Unavailable': '503', 'Invalid': '400', 'Missing': '404'}
    for source in (API / 'src').rglob('*.cs'):
        if any(p in ('obj', 'bin', 'Migrations') for p in source.parts):
            continue
        content = source.read_text(encoding='utf-8-sig')
        for m in pattern.finditer(content):
            kind, code, helper, code2 = m.groups()
            code = code or code2
            rows[code].add(status.get(kind or helper, 'işleme göre'))
            line = content.count('\n', 0, m.start()) + 1
            locations[code].add((source.relative_to(API).as_posix(), line))
            message = re.match(r'\s*,\s*"([^"\n]+)"', content[m.end():])
            if message:
                messages[code].add(message[1])
    for code, value in {'validation_failed': '400', 'unauthorized': '401', 'internal_error': '500'}.items():
        rows[code].add(value)
    # LinkGoogle geçerli uygulama oturumunu korumak için provider'ın 401 hatasını 400'e çevirir.
    for code in ('google_invalid', 'google_challenge_invalid'):
        rows[code].add('400')
    domain = set()
    for source in (API / 'src/Adhd.Domain').rglob('*.cs'):
        if not any(p in ('obj', 'bin') for p in source.parts):
            domain.update(re.findall(r'"([a-z]+_[a-z0-9_]+)"', source.read_text(encoding='utf-8-sig')))
    # Eligible, 409 kodunu grafikteki nedenden çıkarıyor. Sabit metin araması bunu bulamaz.
    for code in ('direct_work_completed', 'direct_work_required', 'predecessor_incomplete', 'task_archived', 'task_inactive'):
        rows[code].add('409')
        locations[code].add(('src/Adhd.Infrastructure/Work/WorkStore.cs', 0))
    text = ['# Hata kodları ve domain nedenleri', '', 'İstemci status+code ile karar verir; title metnini parse etmez. Model-binding400 errors sözlüğü taşıyabilir; domain400 yalnız code/title dönebilir.409güncel state/yeni preview ister;404yokluk/başka owner ayrımı yapmaz.429boş olabilir. Transport401/404/405/413/415 veya proxy hatasında code/traceId bulunmayabilir. Aşağıda kaynakta literal veya bilinen dinamik yoldan üretilen kodlar var; aynı kod birden fazla HTTP ailesinde kullanılabilir, her endpoint hepsini üretmez. Kaynak mesajları açıklamadır; exact UI metni veya sabit lokalizasyon anahtarı değildir.', '', '| Kod | HTTP ailesi | Kaynak mesajı / anlam | Kaynak |', '| --- | --- | --- | --- |']
    for code, values in sorted(rows.items()):
        refs = ', '.join(f'[{Path(path).name}:{line or "Eligible"}](../../API/{path})' for path, line in sorted(locations[code])) or 'Ortak HTTP handler'
        text.append(f'| `{code}` | {", ".join(sorted(values))} | {cell(" / ".join(sorted(messages[code])) or "İlgili modül koşulunu ve kaynak çağrısını izleyin.")} | {refs} |')
    text += ['', '## Grafik/state domain nedenleri', '', 'Çağıran işlem400/409veya açıklama listesi olarak taşıyabilir; HTTP hatası ile proposal warning/UnplacedReason ayrıdır.', '', ', '.join('`' + x + '`' for x in sorted(domain)), '']
    (MODULES / 'Hata-Kodlari.md').write_text('\n'.join(text), encoding='utf-8')

def build_modules():
    coverage = []
    for key, (title, controllers, _) in GROUPS.items():
        text = [f'# {title}', '', DESCRIPTIONS[key], '', '[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)', '']
        endpoints = [e for e in CATALOG if e['controller'] in controllers]
        for ep in endpoints:
            operation = SPEC['paths'][ep['path']][ep['method'].lower()]
            variants = [ep['path']]
            if '{operation}' in ep['path']:
                variants = [ep['path'].replace('{operation}', x) for x in ('pause', 'resume', 'break', 'next', 'finish', 'cancel')]
            for path in variants:
                record = best_success(ep, path, operation)
                request_schema = body_schema(operation)
                status = record['status'] if record else int(next((s for s in operation['responses'] if s.startswith('2')), '200'))
                response = record.get('responseBody') if record else example(response_schema(operation, status) or {})
                request = record.get('requestBody') if record else example(request_schema) if request_schema else None
                auth = 'JWT Bearer zorunlu; owner doğrulanmış sub.' if ep['authRequired'] else 'Anonim erişim; aşağıdaki auth/provider koşulları geçerli.'
                text += [f'## {ep["method"]} {path}', '', f'**Yetki:** {auth}', '', f'**Amaç/koşul:** {note(ep, path)}', '']
                parameters = operation.get('parameters', [])
                has_key = any(p.get('in') == 'header' and p['name'].lower() == 'idempotency-key' for p in parameters)
                repeat = 'Sözleşmede key zorunlu; aynı normalize edilmiş payload + aynı key. Replay özgün yanıtı döndürebilir; ardından güncel kaydı okuyun.' if has_key else ('Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.' if ep['method'] == 'GET' else 'Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.')
                text += ['**Tekrar gönderim:** ' + repeat, '']
                for detail in operation_notes(ep['method'], path):
                    text += ['**Ek entegrasyon kuralı:** ' + detail, '']
                if parameters:
                    text += ['| Parametre | Yer | Zorunlu | Tip / sınır |', '| --- | --- | --- | --- |']
                    for p in parameters:
                        s = p.get('schema', {})
                        detail = describe(s) + '; ' + rules(s)
                        if p['name'] == 'Idempotency-Key':
                            detail += '; aynı niyet için değişmeyen benzersiz key; genel üst sınır128 (carry/rescue prefix bağlamında100 olabilir)'
                        text.append(f'| `{p["name"]}` | {p.get("in")} | {"evet" if p.get("required") else "hayır"} | {cell(detail)} |')
                    text += ['']
                fields = ep.get('fields') or []
                if fields:
                    text += ['| Request alanı | C# tip karşılığı | Ek annotation |', '| --- | --- | --- |']
                    text += [f'| `{f["name"]}` | {cell(f["type"])} | {cell("; ".join(f["rules"]) or "DTO/modül iş kuralı")} |' for f in fields]
                    text += ['']
                if request_schema:
                    text += ['**Request şeması:** ' + describe(request_schema) + '.', '', '**Örnek request body:**', '', '```json', dump(request), '```', '']
                else:
                    text += ['**Request body:** yok.', '']
                actual_path = record['path'] if record else re.sub(r'\{[^}]+\}', '11111111-1111-4111-8111-111111111111', path)
                query = record.get('query', {}) if record else {p['name']: primitive(p['name'], p.get('schema', {})) for p in parameters if p.get('in') == 'query' and p.get('required')}
                query = {k: v for k, v in query.items() if k not in ('access_token', 'token')}
                target = actual_path + ('?' + urllib.parse.urlencode(query) if query else '')
                headers = ['Accept: application/json']
                if ep['authRequired']:
                    headers.append('Authorization: Bearer <APPLICATION_JWT>')
                if any(p['name'] == 'Idempotency-Key' for p in parameters):
                    headers.append('Idempotency-Key: <SAME_INTENT_KEY>')
                if request_schema:
                    headers.append('Content-Type: application/json')
                text += ['**Örnek HTTP:**', '', '```http', f'{ep["method"]} {target}', *headers, '```', '', f'**Başarılı response:** HTTP {status}.']
                if status == 204 or response is None:
                    text += ['', 'Response body yok; JSON parse etmeyin.', '']
                else:
                    schema = response_schema(operation, status)
                    if schema:
                        text += ['Şema: ' + describe(schema) + '.']
                    text += ['', '```json', dump(response), '```', '']
                provenance = 'Sentetik gerçek HTTP/PG test yanıtından; credentials değiştirme işaretiyle redakte.' if record else 'Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.'
                text += ['Örnek kaynağı: ' + provenance, '', '**Hata yanıtları:** ' + ', '.join(f'{s} ({r.get("description", "hata")})' for s, r in operation['responses'].items() if not s.startswith('2')) + '.', '']
                errors = [e for e in candidates(ep, path) if e['status'] >= 400 and isinstance(e.get('responseBody'), dict) and e['responseBody'].get('code') and all(isinstance(v, list) for v in e['responseBody'].get('errors', {}).values())]
                if errors:
                    error = next((e for e in errors if e['status'] == 409), errors[0])
                    text += [f'Gerçek test hata örneği — HTTP {error["status"]}:', '', '```json', dump(error['responseBody']), '```', '']
                coverage.append({'method': ep['method'], 'openApiPath': ep['path'], 'documentedPath': path, 'file': f'frontend-api/{key}.md', 'successStatus': status, 'exampleSource': 'synthetic-http' if record else 'schema', 'requestBodyDocumented': True, 'responseBodyDocumented': True, 'authDocumented': True})
        (MODULES / f'{key}.md').write_text('\n'.join(text), encoding='utf-8')
    return coverage


def operation_policies(coverage):
    rows = []
    lines = ['# İşlem bazında tekrar, sürüm ve key politikası', '',
        '{summary} GET sayıları yazım sayısı değildir. Sınırlar, koşullu sürümler ve no-store için [entegrasyon kuralları](Entegrasyon-Kurallari.md). Replay özgün snapshotı döndürebilir; güncel state ayrıca okunur.', '',
        '| HTTP işlemi | Key / üst sınır | Body sürüm alanları | Tekrar / toparlanma |', '| --- | --- | --- | --- |']
    for item in coverage:
        operation = SPEC['paths'][item['openApiPath']][item['method'].lower()]
        key = any(p.get('in') == 'header' and p['name'].lower() == 'idempotency-key' for p in operation.get('parameters', []))
        maximum = (100 if item['documentedPath'].endswith(('/carry', '/rescue')) else 128) if key else None
        body = resolve(body_schema(operation) or {})
        versions = [p for p in body.get('properties', {}) if 'version' in p.lower()]
        policy = 'bounded-read' if item['method'] == 'GET' else 'same-key-same-payload' if key else 'no-automatic-write-retry'
        if item['documentedPath'].startswith('/api/focus-sessions/') and item['method'] == 'GET':
            policy = 'read-current-state-no-store'
        row = {'method': item['method'], 'openApiPath': item['openApiPath'], 'path': item['documentedPath'],
               'authRequired': bool(operation.get('security')), 'idempotencyKeyRequired': key,
               'maxKeyLength': maximum, 'bodyVersionFields': versions, 'retryPolicy': policy, 'contract': item['file']}
        rows.append(row)
        key_label = f'Zorunlu / {maximum}' if key else 'Tanımlı değil'
        retry_label = 'Aynı payload/key; sonra güncel GET' if key else 'Sınırlı okuma; focus gözlemi ayrı' if item['method'] == 'GET' else 'Otomatik yazım retry yok; güncel GET'
        lines.append(f'| `{item["method"]} {item["documentedPath"]}` | {key_label} | {", ".join("`" + x + "`" for x in versions) or "—"} | {retry_label} |')
    keyed = [r for r in rows if r['idempotencyKeyRequired']]
    operations = len({(r['method'], r['openApiPath']) for r in keyed})
    lines[2] = lines[2].replace('{summary}', f'Bu tablo {len(coverage)} somut işlemi kapsar; kaynak OpenAPI{len(CATALOG)}operationdır. {operations} OpenAPI operation key ister (focus altı komut açıldığında{len(keyed)} somut key işlemi). Diğer{len(CATALOG) - operations}operationda header tanımlı değildir.')
    (MODULES / 'Islem-Politikalari.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (DEST / 'operation-policies.json').write_text(dump({'openApiOperations': len(CATALOG), 'concreteOperations': len(rows), 'schemas': len(SCHEMAS),
        'sourceSha256': hashlib.sha256((DEST / 'openapi-v1.json').read_bytes()).hexdigest(), 'operations': rows}), encoding='utf-8')

schema_tables()
error_dictionary()
COVERAGE = build_modules()
index = ['# Bütün HTTP yolları', '', f'{len(CATALOG)} OpenAPI controller işlemi, focus komutunun altı yolu ayrı gösterildiğinde{len(COVERAGE)} somut işlem. Her satırın modülünde aynı method/path başlığını bulun. Auth evet ise uygulama JWT Bearer gerekir; başka owner kaynakları404. Health/OpenAPI/SignalR taşıma uçları [ana rehberde](../Frontend%20API%20Rehberi.md) ayrıca açıklanır.', '', '| Method | Yol | JWT | Referans |', '| --- | --- | --- | --- |']
for row in COVERAGE:
    ep = next(x for x in CATALOG if x['method'] == row['method'] and x['path'] == row['openApiPath'])
    index.append(f'| {row["method"]} | `{row["documentedPath"]}` | {"evet" if ep["authRequired"] else "hayır"} | [{ep["controller"]}]({Path(row["file"]).name}) |')
(MODULES / 'Endpoint-Indeksi.md').write_text('\n'.join(index) + '\n', encoding='utf-8')
(DEST / 'openapi-v1.json').write_text(json.dumps(SPEC, ensure_ascii=False, indent=2), encoding='utf-8')
(DEST / 'endpoint-catalog.json').write_text(json.dumps(CATALOG, ensure_ascii=False, indent=2), encoding='utf-8')
operation_policies(COVERAGE)
summary = {'openApiOperations': len(CATALOG), 'documentedConcreteOperations': len(COVERAGE), 'schemas': len(SCHEMAS), 'httpExampleOperations': sum(x['exampleSource'] == 'synthetic-http' for x in COVERAGE), 'schemaExampleOperations': sum(x['exampleSource'] == 'schema' for x in COVERAGE), 'openApiSha256': hashlib.sha256((DEST / 'openapi-v1.json').read_bytes()).hexdigest(), 'coverage': COVERAGE}
(DEST / 'documentation-coverage.json').write_text(dump(summary), encoding='utf-8')
for file in MODULES.glob('*.md'):
    text = file.read_text(encoding='utf-8')
    for block in re.findall(r'```json\n(.*?)\n```', text, re.DOTALL):
        json.loads(block)
    if re.search(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', text):
        raise RuntimeError('A JWT-shaped value reached public documentation.')
assert len({(x['method'], x['openApiPath']) for x in COVERAGE}) == len(CATALOG)
print(json.dumps({k: v for k, v in summary.items() if k != 'coverage'}, ensure_ascii=False))

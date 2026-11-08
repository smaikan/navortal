# Frontend geliştirici API rehberi

7 Kasım parola değiştirme ekiyle güncel makine sözleşmesi **220 controller işlemi / 225 somut işlem / 307 DTO ve enum şeması** içerir. Hesap ayarları `POST /api/auth/change-password` ile mevcut parolayı doğrular; yeni HttpOnly oturum oluştururken eski oturumları ve reset bağlantılarını tek transaction içinde kapatır. [Auth sözleşmesi](frontend-api/auth.md#post-apiauthchange-password), [tasarım ve test planı](../UI-docs/design/Parola%20Değiştirme%20Planı.md). Aşağıdaki tarihli envanterler kendi teslim dönemlerini gösterir.

Temel sözleşme: **16 Ekim 2026** · Son ek: **29 Ekim 2026**. Backend kökü `API/`, frontend kökü `UI/`. Bu rehber çalışan ASP.NET Core uygulamasının sözleşmesini anlatır. Türkçe, masaüstü öncelikli, çevrimiçi ürün geliştirin. API, görev/plan/gerçek çalışma hesaplarının otoritesidir.

29 Ekim profil ekleriyle **213 controller işlemi /218 somut işlem /292 DTO ve enum şeması** vardır. Ad-soyad ve korumalı Cloudinary fotoğrafı için [profil notları](profile.md) ve [auth modülü](frontend-api/auth.md) güncel kaynaktır. Saat iptaliyle saatsiz erteleme, toplu havuz ve aynı ChangeSet'in geri alınması [takvim](frontend-api/calendar.md) ve [planlama](frontend-api/planning.md) modüllerindedir. Aşağıdaki modül dosyalarında her işlem için yetki, route/query/header parametreleri, request alanları, örnek HTTP, örnek request/response body, durum kodları ve koşullar bulunur. Body taşımayan istekler ve204yanıtları ayrıca belirtilir. Health, OpenAPI ve SignalR taşıma endpoint'leri bu ana rehberde ayrıca açıklanır.

## 27 Ekim: her göreve ayrı tarihle erteleme

`POST /api/calendar/days/{date}/defer-tasks`, seçilen görevlerin kaynak gündeki bütün açık plan parçalarını her görevin ayrı tarihine tek işlemde taşır. Önizleme yoktur; Idempotency-Key ve planning sürümü zorunludur. [Davranış ve sınırlar](task-deferral.md), [wire sözleşmesi](frontend-api/calendar.md). Yeni migration gerekmez. Kullanıcıya görünen terim Efor’dur; `energyDemand`/`availableEnergy` wire adları korunur.

## 27 Ekim: Eisenhower Matrisi

Beş yeni matris ucu: [Eisenhower Matrisi API](frontend-api/matrix.md), [davranış/veri sözleşmesi](matrix.md). Önceki tarihli189/194/262 sayıları25 Ekim durumudur.

## 25 Ekim: ekran okuma API'leri

`GET /api/workspace/snapshot`, `GET /api/daily-plans/{date}/overview`, `GET /api/daily-plans/{date}/signals`, `GET /api/calendar/overview`, `GET /api/tasks/{id}/detail-view`, `GET /api/tasks/{id}/ancestors` küçük, owner kapsamlı ekran okumalarıdır. Backend planlama/süre otoritesi, HttpOnly cookie/Bearer, me ön koşulu ve private/no-store korunur. Küçük projeksiyon tam eski cache belgesi yerine yazılmaz; eski uçlar komut/ayrıntı akışları için kullanılabilir. Query offset/limit ve bağımsız total değerleri eksik sayfayı bütün gün sanmak için kullanılmaz.

Ayrıntılar [onaylı plan](Frontend%20Okuma%20API%20Performans%20Planı.md), modüller ve [tek uygulama/kanıt kaydında](verification/frontend-read-api.md). API kazancı JavaScript/Lighthouse veya fiziksel cihaz kabulü değildir.

## Okuma sırası ve kaynaklar

1. Bu dosyadaki auth, sürüm/idempotency, tarih/süre ve hata sözleşmesini okuyun.
2. Geliştirilecek ekranın modül dosyasını ve bağlantılı davranış belgesini açın.
3. Nested request/response alanı için DTO sözlüğünü kullanın. Tam şekli görmek için JSON örneğini, nullable/default/sınırı görmek için şemayı birlikte inceleyin.
4. Akış sonunda ilgili kaynakları refetch edin; SignalR değişiklik işaretlerini aynı akışa bağlayın.

**Ayrıntılı entegrasyon için zorunlu ekler:** [Koşullu alanlar, filtreler, varsayılanlar ve state akışları](frontend-api/Entegrasyon-Kurallari.md), [İşlem bazında key/sürüm/tekrar politikası](frontend-api/Islem-Politikalari.md), [makineyle okunabilir işlem politikaları](operation-policies.json). Bunlar request/response örneklerini tamamlar; nullable/required şema tek başına bütün iş doğrulaması değildir.

Başarılı yanıttaki uyarı/yerleşememe kodlarının açıklamaları [Plan Mesajları](frontend-api/Plan-Mesajlari.md) belgesindedir. [Son ayrıntılı doküman denetimi](verification/frontend-api-review.md) hangi kontrolün gerçek HTTP/DB testinden, hangisinin statik incelemeden geldiğini ayırır.

| Konu | Endpoint referansı | Ayrıntılı davranış |
| --- | --- | --- |
| Kayıt, giriş, me, logout, parola kurtarma, kapalı Google | [Kimlik](frontend-api/auth.md) | [Auth/HTTP](api-design.md) |
| Kullanıcı tercihleri, çalışma saatleri, tarih istisnaları | [Tercihler](frontend-api/preferences.md) | DTO ve modül notları |
| Görev CRUD, ağaç, süre/ilerleme, durum, dependency/sıra, sınıflandırma | [Görevler](frontend-api/tasks.md) | [Temel sözleşme](api-design.md) |
| Proje, havuz, kategori, etiket | [Koleksiyonlar](frontend-api/collections.md) | DTO ve modül notları |
| Manuel blok, preview/apply, dağıtım, acil iş, revizyon, undo | [Planlama](frontend-api/planning.md) | [Koordinatör](scheduling-coordinator.md), [çok gün](multi-day-planning.md), [undo](plan-undo.md) |
| Takvim, geçmiş gün, carry/pool | [Takvim](frontend-api/calendar.md) | [Geçmiş](calendar-history.md) |
| Gerçek çalışma, segment/düzeltme, preset/Pomodoro | [Work ve focus](frontend-api/work-focus.md) | [Pomodoro](focus-pomodoro.md) |
| Not, geri dönüş, kritik işler/enerji, quick-start/rescue | [Destekler](frontend-api/support.md) | [Destek davranışları](support-tools.md) |
| Tekrar şablonu, immutable definition, occurrence | [Tekrarlar](frontend-api/recurrence.md) | [Seri politikaları](recurrence.md) |
| In-app, push aboneliği, reminder, jobs, sync | [Bildirim ve senkronizasyon](frontend-api/notifications.md) | [SignalR/push](notifications-realtime.md), [jobs](jobs-outbox.md) |
| Actual/focus, plan uyumu, gün özeti, süre önerisi | [Analitik](frontend-api/analytics.md) | [Bütün formüller](statistics-definitions.md) |

- [Güncel DTO/enum sözlüğü](frontend-api/DTO-Sozlugu.md)
- [Hata kodları ve domain nedenleri](frontend-api/Hata-Kodlari.md)
- [OpenAPI JSON](openapi-v1.json): makineyle okunabilir wire sözleşmesi; client type üretiminde kullanılır.
- [Endpoint kataloğu](endpoint-catalog.json): controller/action, auth, body tipi/annotation ve başarılı status bilgisi.
- [Doküman kapsam raporu](documentation-coverage.json): her işlem için örneğin gerçek sentetik HTTP kaydından mı şemadan mı geldiğini gösterir.
- [Tüm yolların indeksi](frontend-api/Endpoint-Indeksi.md)
- [Operasyon/kurulum/yedekleme](operations.md), [MVP-29 kabul kanıtı](verification/mvp-29.md).

Örnekler sentetik test verisidir. Kimlikler/sürümler birbirinden bağımsız senaryolardan gelir; modüller arası JSON'ları aynen arka arkaya çalıştırmayın. Gerçek akışta önceki yanıtın ID ve sürümünü taşıyın. JWT, reset kodu ve push anahtar/endpoint alanları değiştirme işaretleriyle redakte edilmiştir. `<APPLICATION_JWT>` çalışır bir token değildir. Google kapalı olduğundan başarılı provider örneği yalnız yapısaldır; gerçek sağlayıcı doğrulaması ertelenmiştir. Diğer örneklerin kaynağı her endpoint altında yazılıdır.

## Origin, taşıma ve JSON kuralları

Tarayıcı tek origin kullanır: `/api/...` ve `/api/hubs/planner` ASP.NET'e; sayfalar Next.js'e gider. API yollarına ikinci kez `/api` eklemeyin. Yerel API varsayılanı `http://127.0.0.1:5080`; frontend development proxy'si aynı-origin davranışı sağlamalıdır. Production'da HTTPS reverse proxy kullanılır. CORS allow-all kurulmuş değildir; ayrı domain kullanımı bu sözleşmenin başlangıç düzeni değildir.

- Request/response property adları camelCase. JSON body için `Content-Type: application/json` kullanın.
- Normal başarılar `application/json`; hata sözleşmesi `application/problem+json`. 204 ve rate-limit gibi boş yanıtları JSON parse etmeyin.
- Enum değerlerini DTO sözlüğündeki string adlarla gönderin: `Pending`, `InProgress`, `Preview`, `Work`, vb. Focus route komutları küçük harftir: `pause`, `resume`, `break`, `next`, `finish`, `cancel`.
- GUID'ler string; UTC instant ISO8601 offset'li; yerel tarih `YYYY-MM-DD`; yerel saat ilgili şemada TimeOnly biçimindedir. Boş/eksik/null aynı kavram değildir.
- Saniye alanları tamsayı veya ondalık olabilir; gerçek süre saniye altını korur. Oranlar aksi belirtilmedikçe 0..1. `null` bilinmeyen/hesaplanamayan değer olabilir; otomatik 0'a dönüştürmeyin.
- Int64 sürümler JSON number gelir; hesaplamadan sunucudan taşıyın. Bazı .NET sayısal input şemaları numeric string okumaya da izin verir. Yeni istemcide şemadaki sayısal biçimi kullanın.
- `Required` alanın varlığını, nullable tip null kabulünü belirtir. DataAnnotation'a ek use-case kuralları vardır; örneğin geçerli ama geçmiş bir instant komut bağlamında reddedilebilir. Bilinmeyen JSON alanlarının reddedileceğine güvenmeyin; generated request tipi kullanın.
- PUT'ların çoğu alan setini değiştirir; PATCH gibi ele almayın. Özellikle task PUT'ta title gereklidir, gönderilmeyen description/deadline/default alanları değişebilir. Yanıttaki her şeyi körlemesine geri göndermek yerine ilgili request DTO'sunu oluşturun.

## Kimlik doğrulama ve kişisel veri sınırı

Yalnız e-posta/parola etkindir. Parola **en az 6 karakter**; büyük harf/rakam/sembol, ek maksimum uzunluk politikası veya kayıt onay e-postası yoktur. Register doğrudan uygulama JWT'si üretir. Kayıttan sonra ikinci login gerekmez.

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "email": "developer@example.test",
  "password": "123456"
}
```

HTTP 201 biçimi (kimlik/token örnektir):

```json
{
  "accessToken": "<APPLICATION_JWT>",
  "tokenType": "Bearer",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "developer@example.test",
    "displayName": "developer@example.test"
  }
}
```

Kesin AuthResponse alanları için [kimlik modülündeki gerçek yanıta](frontend-api/auth.md) bakın. Login aynı auth biçimini döndürür. Her korumalı çağrı `Authorization: Bearer <APPLICATION_JWT>` gönderir. Kullanıcı kimliği doğrulanmış `sub` claim'inden gelir; request'e başka UserId koyarak kullanıcı seçilmez. Başkasının GUID'ine ve nested kaynağına erişim 404'tür. İlk sürüm ekip/paylaşım/rol yönetimi içermez.

Token HS256 imzalıdır; **exp yok**. UI-R3: tarayıcı oturumu HttpOnly cookie'dir (ayrıntı [kimlik modülü](frontend-api/auth.md)); her token bir `sid` oturumuna bağlıdır ve logout/logout-all/parola sıfırlamada iptal edilir. Refresh token, rotation ve refresh endpoint'i yoktur. Frontend token yenileme zamanlayıcısı kurmaz. İmza/issuer/audience ve kullanıcı varlığı doğrulanır. İmza anahtarı sunucu restart'ında korunmalıdır.

Tarayıcı bootstrap:

1. Tarayıcı token okumaz; HttpOnly cookie aynı-origin isteklerde kendiliğinden gider. Yalnız sır içermeyen "giriş olabilir" işareti localStorage'dadır. Private veri sorgularını `me` doğrulaması tamamlanana kadar başlatmayın. Cookie ile yazmalar `X-ADHD-CSRF: 1` başlığı ve aynı-origin Origin taşır.
2. Token varsa `/api/auth/me` ile doğrulayın; geçerliyse preferences + `/api/sync` + görünür sayfanın verilerini çekin.
3. 401'de yerel auth/query/UI kişisel verisini ve SignalR bağlantısını temizleyip login gösterin. 404/409'u logout sebebi saymayın. Otomatik sonsuz login retry yapmayın.
4. Logout sırasında mevcut owner push subscription'ını API'den kaldırın, tarayıcı subscription'ını uygun şekilde unsubscribe edin, hub'ı kapatın, token ve Query cache'ini temizleyin. Başka sekmelere storage/BroadcastChannel ile hesap değişimini iletin.

`POST /api/auth/logout` 204 döner ve bu oturumu sunucuda kapatır (token kopyaları da geçersizleşir); `POST /api/auth/logout-all` bütün oturumları kapatır. Logout work/focus oturumunu bitirmez. Kullanıcı çalışmayı kapatacaksa önce açık work/focus komutunu kullanır. Reset password isteğe bağlı ayrı e-posta akışıdır: forgot 202, kod 30 dakika/tek kullanım, reset 204; UI-R3 ile bütün mevcut oturumlar kapanır. Google giriş/link UI'da kapalı kalır; doğru provider request'i bile 503 verebilir.

Auth rate limit, `[EnableRateLimiting("auth")]` kullanılan eylemlerde IP başına **5 dakikada 30 istek**, kuyruk yok, 429'dur. Limitin kapsamı ilgili modülün status bilgisindedir. 429 gövdesi boş olabilir; JSON veya Retry-After başlığının her zaman geleceğini varsaymayın.

## Ortak hata davranışı

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Güncel durum değişti.",
  "status": 409,
  "code": "<OPERATION_SPECIFIC_CODE>",
  "traceId": "<SERVER_TRACE_ID>"
}
```

Bu ortak yapısal örnektir; gerçek `code`, title ve traceId için endpoint altındaki test örneklerini kullanın. Alan hatasında ek `errors` sözlüğü bulunabilir:

```json
{
  "title": "İstek doğrulanamadı.",
  "status": 400,
  "code": "validation_failed",
  "traceId": "<SERVER_TRACE_ID>",
  "errors": {
    "Title": ["Başlık gerekli."]
  }
}
```

| Status | İstemci eylemi |
| --- | --- |
| 200/201 | Dönen nesne ve sürümleri cache'e koyun; etkilenen türetilmiş sorguları yenileyin. |
| 202 | İşlem kabul edildi; forgot-password e-posta varlığını açığa çıkarmaz. |
| 204 | Body yok; yerel sonucu tamamlayın. |
| 400 | Alan veya iş kuralını gösterin. `errors` key casing'ini normalize ederek form alanlarına eşleyin. |
| 401 | Auth state temizliği ve login. Refresh akışı yok. |
| 404 | Kaynak yok/erişilemiyor; başkasının verisi olduğunu açıklayan ek ayrım yok. |
| 409 | Güncel kaynakları okuyun. Stale proposal için yeni preview; kullanıcı niyeti değiştiyse yeni key. |
| 429 | İstekleri azaltın, kullanıcıya bekleme durumu gösterin; boş body destekleyin. |
| 503 | Gerekli provider/özellik kullanılamıyor; örneğin kapalı Google/kurulmamış mail teslimi. İlgili modülün kodunu gösterin. |
| 500 | Güvenli mesaj + traceId; body/başlıklarda sır loglamayın. |

OpenAPI ortak hata ailelerini potansiyel response olarak listeler; her endpoint'in bütün kodları her durumda üretmesi anlamına gelmez. Proposal `warnings`, `unplaced` ve `conflicts` alanları HTTP hatası değildir: başarılı 200 içinde kısmi kapasite/gerekçe gelebilir. UI bunları kaybetmemelidir. Endpoint dışı hatalı route/HTTP method, proxy/body boyutu gibi altyapı yanıtlarının daima bu özel `code` alanını taşıyacağını varsaymayın.

## Version, planningVersion ve idempotency

Bu üç kavram farklıdır:

- `version`: task/schedule/work/focus/not/tercih gibi belirli kaydın sürümü. Son API yanıtından taşıyın. Focus komutunda hem focus `version` hem bağlı `workSessionVersion` gerekebilir.
- `expectedPlanningVersion`: kullanıcı düzeyinde görev/plan/oturum görünümünün beklenen sürümü. `/api/sync`, günlük plan ve ilgili yanıtlardan alınır. Entity sürümünün yerine geçmez.
- `Idempotency-Key`: aynı kullanıcı niyetinin tekrar gönderim kimliği. İlgili endpoint tablolarında required header'dır. Genellikle en çok128 karakter; carry/rescue gibi prefix eklenen kullanımda100 sınırı olabilir. UUID uygun başlangıçtır.

İstek zaman aşımına uğradığında işlemin sunucuda gerçekleşip gerçekleşmediği belirsizdir. **Yalnız key destekleyen işlemde aynı payload + aynı key** ile kontrollü tekrar gönderin; her retry'da UUID değiştirirseniz ikinci işlem niyeti yaratabilirsiniz. Aynı key farklı payload ile 409 verir. Key tanımlı olmayan task/collection/note/preset create gibi yazımlarda otomatik tekrar duplicate oluşturabilir; sonucu belirsiz gösterip güncel kaynakları okuyun. Version kontrollü pause/resume/finish komutlarında da önce current/detail GET ile sonuç uzlaştırılır. `Idempotent-Replay: true` bazı başarılı replay yanıtlarında bulunur; her endpoint'in aynı başlığı vereceğine güvenmeyin. Replay özgün serverNow/sürüm snapshotını döndürebilir; kalıcı ID'yi kullanarak güncel kaydı refetch edin. 26OpenAPIoperation key ister; ayrıntılar [işlem tablosundadır](frontend-api/Islem-Politikalari.md).

409 stale durumunda source state yenilenmeden eski version'u artırıp denemeyin. Plan önizlemesi planı değiştirmez; apply task/preferences/session/day snapshot sürümlerini ve zamana bağlı geçerliliği yeniden kontrol eder. Eski öneride yeni preview gerekir. İki sekme aynı task/session/plan üzerinde yarışabilir; bu olağan bir conflict akışıdır. Optimistic UI hata aldığında geri alınmalı ve authoritative state okunmalıdır.

## Tarih, zaman dilimi, süre ve sayfalama

Kullanıcının başlangıç IANA zone'u `Europe/Istanbul`; çalışma saatleri kullanıcıdan gelir. UTC instant ile localDate ayrıdır. JavaScript `new Date('YYYY-MM-DD')` ile yerel günü istemeden UTC gününe çevirmeyin; takvimde date-only string'i koruyun. Plan gününün frozen zone'u, work session'ın source zone'u ve bugünkü tercih farklı olabilir. Geçmişi bugünkü timezone ile yeniden gruplamayın.

Aralıklar **[start,end)**: bitişte başlayan komşu blok overlap değildir. Gerçek süre UTC instant farkıdır. 23:30–00:30, rapor günlerine30+30 dakika ayrılır. DST gap/overlap için backend/recurrence policy sonucunu gösterin; yalnız saat etiketlerini çıkarmayın. Gece planı bağlı parçalara ayrılabilir; ortak task/group bağını koruyun.

Sayaç `serverNow`, `startedAt`, segmentler ve `activeSeconds` ile toparlanır. `setInterval` yalnız ekranı günceller; localStorage'daki sayaç süresi kayıt otoritesi değildir. Server offset'i response alma anıyla güncelleyin; sekme odağa dönünce refetch edin. Pause/mola active work tüketmez. Tarayıcı kapanması, uyku veya bağlantı kaybı normal work'ü durdurmaz. Offline mutation başarılı kaydedilmiş görünmez.

Sayfalama evrensel tek şekil değildir:

- Çoğu liste `{items,offset,limit,total}`. `total` filtreli toplam, items yalnız sayfadır.
- Tree/subtree `{items,offset,limit,hasMore}`; **total alanı yoktur**. ParentTaskId ile sayfaları birleştirin. Gerekmeden bütün ağacı indirmeyin.
- Bazı subscription/reminder gibi uçlar doğrudan array döner; sayfa parametresi olsa bile total yoktur.
- Takvim günü planned/actual/completed listelerinin ayrı offset/limit alanları olabilir. Bir listenin cursor'ını diğerine uygulamayın.
- Offset, limit ve tarih aralığı sınırı endpoint/use-case'e özgüdür. Sık görülen limit1..100; motor dağıtım1..31gün, takvim1..42gün, recurrence materialize1..93gün, analitik1..366gün. DTO ve ilgili modülün kesin sınırını esas alın. Analitikte50.000kaynak yoğunluk sınırı409 ile daha küçük aralık ister.

## Ekranları bağlayan temel akışlar

### Görev ağacı ve hesaplar

Yalnız title ile POST task oluşturun; children endpoint'i parent version ve eski doğrudan işin nasıl korunacağını isteyebilir. Gerçek iş `hasDirectWork/directEstimatedSeconds`, hedef toplam ise `targetBudgetSeconds` alanıdır. Container toplamını çocuk toplamına tekrar eklemeyin. Tahmini olmayan iş0 değildir; `unknownEstimateCount`, remaining coverage ve nullable ilerlemeyi gösterin. Work definition, workload, progress ve time ayrı endpoint'lerdir. Genel task PUT ile actual/completion timestamp yazılmaz.

Complete, task state komutudur. Finish work yalnız oturumu kapatır. Parent tamamlama kararı açık altları tamamlamak veya yalnız parent'ı tamamlamak olabilir; child'ın görünür kalması geçerlidir. Dependency gerçek start'ı bloke eder, ordering yalnız yumuşak tercihtir. Arşivleme geçmiş FK'lerini silmez. Bir root'a proje/havuz bağlamak bütün child'ları kopyalamaz.

### Günlük plan ve kabul edilmiş revizyon

1. Preferences/çalışma saatlerini ve `/api/daily-plans/{date}` verisini alın.
2. Sabit/esnek manuel bloklar `/api/schedules` ile düzenlenebilir. Manuel açık overlap kabulü otomatik motorun çakışmasızlık iddiasından ayrıdır.
3. POST `/api/scheduling/preview` date/taskIds ile öneri üretir. Proposal'ı, warnings/unplaced/conflicts ve canApply durumunu gösterin. Parent seçimleri bağımsız doğrudan işlere açılır.
4. Kullanıcı kabul edince `/api/scheduling/apply` proposalId + key. Accepted revision ve current blocks atomiktir; sonra günlük plan/revision/calendar/task time refetch edin.
5. `/api/scheduling/plan` kullanıcı Preview/Auto tercihini izler; her200 kabul edilmiş plan değildir. İlk kabul edilmiş Work içeren revizyon baseline'dır. Sonraki düzenleme baseline'ı yazmaz.

Varsayılan yeni iş alt sınırı **server now +30 saniyenin sonraki tam dakikasıdır**; HTTP gidiş/dönüş süresinde önerinin geçmişe düşmesini azaltır. Tam09:00 başlangıç varsaymayın; dönen blok instant'ını kullanın. Aktif gerçekleşmiş bölüm ve fixed/locked bloklar korunur. Sığmayan iş ayrı listelenir; sessizce yarına taşınmaz. Çok gün için distribute-preview/distribute-apply ayrı1..31gün niyetidir, aynı TaskId kullanır; diğer gün tahsisleri hesaba katılır.

Undo doğrudan eski snapshot restore değildir. `/undo-preview` veya `/undo-multi-preview` gelecekte uygulanabilir telafiyi hesaplar; apply yeni revision oluşturur. Actual, task completion veya correction silinmez. **isPartial undo'nun kısmi telafi bayrağıdır**; kapasite yetersizliğini bu alandan çıkarmayın, unplaced listesinden okuyun.

### Gerçek çalışma, acil iş ve düzeltme

POST work start taskId ve planlıysa scheduleId/scheduleVersion alır. StartedScheduleId ve StartedRevisionItemId başlangıç bağlamıdır; plan taşınınca yeniden yazılmaz. Pause segmenti kapatır, resume yenisini açar. Kullanıcı başına tek açık segment vardır; başka sekmenin yeni session'ını eski komutla değiştirmeyin.

`start-now` açık kesme niyetidir: eski work aynı server instant'ında pause, yeni work start olur. Preview'da gerçek çalışma hemen başlar, kalan plan ayrıca önerilir. Plan başarısızlığında `planningStatus` ve hata/yeniden deneme bağlamını gösterin; başlayan actual'ı kaybolmuş kabul etmeyin. Süre aşımı görevi tamamlamaz veya fixed toplantıyı taşımaz.

Manuel geçmiş kayıt ve segment correction ayrı komutlardır. Correction önceki/sonraki değer ve neden saklar; overlap reddedilir. Audit satırını actual'a eklemeyin. İptal/void/restore anlamları modülde farklıdır. Plansız/genel focus task toplamına uydurma ID ile bağlanmaz.

### Pomodoro ve destekler

Focus başlatma mevcut WorkSession'a bağlanabilir veya task/genel odak için work oluşturabilir. Preset work/shortBreak/longBreak/longBreakEvery ve target policy taşır.35/7 gibi özel süreler desteklidir. Hedefe ulaşma task complete değildir.

ContinueTracking hedefte bir kez kayıt/bildirim üretir, actual/overtime sürer. AutoBreak ilk sunucu değerlendirmesinde work segmentini kapatır; geçmişi hedef instant'ına çekmez. Break work'ü kapatır, mola actual'a eklenmez; next açık kullanıcı niyetidir. Erken next skipBreak niyeti gerektirebilir. Pause, break, finish ve task complete ayrı eylemlerdir. Work ve focus activeSeconds'ı toplayarak çift actual üretmeyin. Quick-start aynı altyapıda5dakikalık hedeftir.

Return-context son gerçek çalışma/not/küçük adım bilgisidir, veri yoksa null olabilir. Critical1..3 ve enerji tercihi isteğe bağlı yumuşak desteklerdir. Gün sonu preparation salt okur; carry/pool niyeti ayrı komutla uygulanır.

### Tekrarlar ve analitik

Recurrence template + immutable definition + local-date occurrence ayrıdır. AutoAddToPlan açık seri bugün+30, diğerleri bugün+7 gün gerçek kayıt tutar; ötesi `GET /api/recurrence-templates/projection` ile yazmadan önizlenir. Materialize sınırlı pencere ve key kullanır; aynı occurrence aynı TaskId'dir. Şablonu güncellemek geçmiş completed instance'ı değiştirmez. Daily/weekly/monthly/interval, ay sonu Skip/Clamp ve DST politikalarını formda açık taşıyın. Skip/cancel/reopen davranışını generic delete ile taklit etmeyin.

Actual raporu effective work segmentlerinden, plan raporu frozen baseline/current snapshots ve cutoff olaylarından gelir. Task sayısı, süre ağırlığı, günlük quota, actual ve focus farklı metriklerdir. Bilinmeyen payda için null gösterin. Planlı başlangıç gecikmesi immutable schedule bağı olan work'te ölçülür; plansız işe gecikme uydurulmaz. Estimate suggestion en az3 karşılaştırılabilir completed recorded örnekten median döndürür; `applied=false`, kendiliğinden tahmin/plan yazmaz.

## SignalR, reconnect ve Web Push

Hub yolu **`/api/hubs/planner`**, aynı uygulama JWT'sidir. Başka auth oturumu veya client-controlled JoinGroup yoktur; kullanıcı grubu sunucuda `sub` ile seçilir. Standart SignalR JS istemcisini kullanın. UI-R3: hub HttpOnly session cookie ile kimlik doğrular; negotiate POST `X-ADHD-CSRF: 1` taşır. `access_token` query hiçbir yerde kabul edilmez; tarayıcı dışı istemciler Bearer başlığı kullanır.

```ts
import { HubConnectionBuilder } from '@microsoft/signalr';

const hub = new HubConnectionBuilder()
  .withUrl('/api/hubs/planner', {
    accessTokenFactory: () => authToken() ?? '',
  })
  .withAutomaticReconnect()
  .build();

hub.on('changed', event => {
  // eventId için bounded dedup; ilgili TanStack Query sorgularını invalidate edin.
  // Tekrar/sıra kaybında authoritative HTTP sonucunu esas alın.
});
hub.onreconnected(async () => {
  await api('/api/sync');
  // Açık plan/task/current-work/current-focus/inbox sorgularını refetch edin.
});
// İlk start başarısızlığını UI'da bağlantı durumu ve bounded retry ile yönetin.
await hub.start();
```

Sunucudan gelen `changed` örnek biçimi:

```json
{
  "eventId": "11111111-1111-4111-8111-111111111111",
  "kind": "PlanChanged",
  "sourceId": "22222222-2222-4222-8222-222222222222",
  "sourceVersion": 2
}
```

Türler: TaskChanged, PlanChanged, DayItemChanged, WorkChanged, FocusChanged, PreferencesChanged, RecurrenceChanged, NotificationReady, NotificationPreferencesChanged. DayItemChanged (UI-R2) saatsiz gün öğesi veya saatli plan öğesinin tamamlanma değişimidir; sourceId dayItemId ya da scheduleId, sourceVersion ilgili kaydın version değeridir. TaskChanged sourceId TaskId/sourceVersion TaskEvent.Sequence; task version yerine gönderilmez. PlanChanged sourceId revisionId/sourceVersion revision Number, NotificationReady sourceId notificationId/sourceVersion snoozeCount'tur. Tam [tür→kaynak→refetch tablosunu](frontend-api/Entegrasyon-Kurallari.md#8-not-bildirim-signalr-ve-push) kullanın. Bu nesne UI state kopyası değildir. Publish commit sonrasıdır; lost ack duplicate getirebilir. Kesintisiz geçmiş/replay veya global sıra garantisi yoktur. `/api/sync` owner planningVersion, serverNow ve work/focus kimlikleriyle toparlanmaya yardımcı olur; ardından kaynaklar okunur. planningVersion her not/bildirim/preset değişimini saymaz.

SignalR taşıma uçları:

| Yol | Request/response | Yetki |
| --- | --- | --- |
| POST `/api/hubs/planner/negotiate?negotiateVersion=1` | Body yok; SignalR protokol connectionId/connectionToken/availableTransports döner. Şekil transport/framework sürümüne aittir; JS kütüphanesi yönetir. | Session cookie + `X-ADHD-CSRF` (tarayıcı); Bearer (diğer) |
| GET `/api/hubs/planner` WebSocket upgrade | Body yok, başarılı HTTP101 ve JSON SignalR handshake/frames. | Aynı JWT; WS query destekli |
| GET `/api/hubs/planner?id=...` SSE/LongPolling | Transport stream/poll; POST/DELETE taşıma eylemlerini kütüphane yönetir. REST DTO endpoint'i değildir. | JWT; query yalnız SSE/WS, diğer isteklerde header |

In-app inbox Ready NotificationIntent kayıtlarıdır. Push varsayılan kapalıdır; GET push-config ile özellik/public VAPID key alınır. Browser izin isteği kullanıcı niyetiyle, Service Worker ve gerçek browser subscription'ı ile yapılır; subscription POST'a endpoint/p256dh/auth gönderilir. Bunlar listede geri dönmez. VAPID private key frontend'e gelmez. Backend provider şifreli taşıma testleri tamamdır; **gerçek browser/OS push teslimi ve Service Worker UI kabulü frontend aşamasındadır**.

Push payload'ı genel mesaj + notificationId/recipientUserId/tag/url/silent taşır; tıklamada API'den notification kaynağını okuyun. SW aktif hesap recipientUserId kontrolü yapmalı; eventId ve notificationId/snoozeCount/tag ile tekrar ve foreground local/push çift sesini azaltmalıdır. ReadyAt teslim/okundu kanıtı değildir. Read ve snooze version ister. DND/tür/ses/lead/retry kaynak geçerliliğiyle değerlendirilir.404/410 subscription pasifleşir. Logout/hesap değişiminde owner aboneliğini kaldırın. Ağ gönderimi için exactly-once varsaymayın.

## Küçük TypeScript HTTP adaptörü

Bu örnek uygulama kütüphanesi değil, gereken taşıma davranışını gösterir. `authToken` client adaptöründen gelir. İstek key'ini mutasyon niyeti oluştururken üretin; wrapper retry sırasında üretmesin. Abort ve ağ hatası sunucunun commit etmediği anlamına gelmez.

```ts
type ApiProblem = {
  status?: number;
  code?: string;
  title?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
};

async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    anonymous?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<T | undefined> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const token = options.anonymous ? null : authToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.key) headers.set('Idempotency-Key', options.key);

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: 'no-store',
  });
  const raw = response.status === 204 ? '' : await response.text();
  let value: unknown;
  if (raw && (response.headers.get('content-type') ?? '').includes('json')) {
    try { value = JSON.parse(raw); } catch { value = undefined; }
  }
  if (!response.ok) {
    const problem = value && typeof value === 'object' ? value as ApiProblem : {};
    throw Object.assign(new Error(problem.title ?? `HTTP ${response.status}`), {
      status: response.status, problem,
    });
  }
  return value as T | undefined;
}
```

Generated DTO tipi ile200/201 sonucunu daraltın;204 için void kullanın. Auth cleanup,409 conflict UX,429 bekleme ve ağ retry kararları mutasyon/sayfa katmanında görünür olsun. Credentials veya tüm request body'lerini console/telemetry'ye basmayın. Query key'leri kullanıcı bağlamını ve filtre/date/zone'u içermeli; hesap değişiminde tüm private cache temizlenmelidir. Zustand sunucu nesnelerinin ikinci sahibi olmamalıdır.

## Health, OpenAPI ve mevcut kapsam

| Endpoint | Yetki | Request body | Başarı | Hata/ortam |
| --- | --- | --- | --- | --- |
| GET `/health/live` | Anonim | Yok | HTTP200, `text/plain`, `Healthy` | DB yokken de process canlılığı200; business readiness kanıtı değildir. |
| GET `/health/ready` | Anonim | Yok | HTTP200, `text/plain`, `Healthy` | PostgreSQL erişilemiyorsa503, `Unhealthy`; DB ayrıntılarını public body'ye dökmez. |
| GET `/openapi/v1.json` | Anonim, yalnız Development/Testing | Yok | HTTP200, OpenAPI JSON (`paths`, `components.schemas`) | Production'da route yok404. Repo'daki sabit [JSON](openapi-v1.json) frontend için paylaşılır. |

Örnek health isteği `GET /health/ready`, response body düz metin `Healthy`; JSON parse etmeyin. OpenAPI için GET body yok; örnek response üst biçimi:

```json
{
  "openapi": "3.1.1",
  "info": { "title": "Adhd.Api | v1", "version": "1.0.0" },
  "paths": {},
  "components": { "schemas": {}, "securitySchemes": {} }
}
```

Bu yalnız özet yapısal örnektir; gerçek sürüm/info ve bütün içerik bağlantılı JSON'dadır, içi boş paths gerçek API değildir. `/api` URL yapısı henüz `/api/v1` versioning içermez; OpenAPI belge adı v1'dir. Frontend kendi endpoint isimlerini türeterek ek backend varmış gibi davranmamalıdır.

Backend MVP-03 Google gerçek sağlayıcı kabulü kullanıcı kararıyla ertelenmiştir. Frontend arayüzü, browser kapat/aç/localStorage bootstrap, erişilebilirlik, responsive takvim, Service Worker/PWA ve gerçek cihaz bildirimleri ayrı frontend kabulüdür. Backend HTTP/DB/SignalR/proxy kabulünün geçmesi bu görsel/kullanıcı kabulünü tamamlamaz.

## Dokümanı güncelleme ve doğrulama

OpenAPI controller metadata + framework şemalarından; katalog ApiExplorer'dan üretilir. Sentetik HTTP örnekleri yalnız opt-in test recorder'dan gelir, token/parola/push sırları redakte edilir. Ham transcript dosyası yayınlanmaz. Üretim komutları API kökünde:

```powershell
dotnet run --project tools/Adhd.ApiDocs -c Release --no-build -- .local/api-contract
# Önce build ve ilgili gerçek PostgreSQL testleri; recorder opt-in değişkeni:
$env:ADHD_API_TRANSCRIPTS = Join-Path (Get-Location) '.local/api-exchanges.ndjson'
```

Kanonik çıktı repository ana dizinindeki **docs/** klasörüdür; API/docs ikinci kopyası oluşturulmaz. API kökünden Python3 komutları:

```powershell
python scripts/generate-frontend-docs.py ../docs --source .local/api-contract
python scripts/validate-frontend-docs.py --docs-root ../docs
```

WSL kullanılacaksa repository kökünden `wsl python3 API/scripts/generate-frontend-docs.py docs --source API/.local/api-contract` ve `wsl python3 API/scripts/validate-frontend-docs.py` eşdeğerdir. Kaynak exporter buildi güncel olmalı; --no-build yalnız önceden build edilmiş güncel araçla kullanılmalı. Exporter HTTP metadata/OpenAPI için DB veya gerçek JWT kullanmaz; gerçek sentetik başarı örnekleri transcript recorder integration testlerinden gelir. Ana rehber, Entegrasyon-Kurallari ve davranış belgeleri insan tarafından korunur; generator bunları değiştirmez. Generator diğer modül referanslarını/DTO/hata sözlüğünü/işlem politikalarını yeniden yazar; kalıcı alan açıklamaları API/scripts/frontend_doc_rules.py içinde tutulur. Doğrulayıcı yol/auth/body/response/key politikası, DTO alan açıklamaları, JSON örnekleri, yerel linkler ve JWT biçimli sızıntıyı denetler. İş kurallarının doğruluğu ayrıca integration/domain testleriyle kanıtlanır; doküman sayacı runtime kabulü değildir.

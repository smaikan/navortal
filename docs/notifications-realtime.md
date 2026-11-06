# Bildirim ve anlık değişiklik sözleşmesi — MVP-26

Backend uygulama sözleşmesi. Gerçek tarayıcı/OS teslimi, Service Worker ve local/push görünürlük koordinasyonu frontend aşamasında doğrulanacaktır. Backend taşıyıcısı gerçek Web Push şifrelemesi/VAPID üretir; test HTTP alıcısı şifreyi çözer ve imzayı doğrular. Provider kabulü OS'nin bildirimi gösterdiği anlamına gelmez.

## Kanal ve kullanıcı tercihleri

`GET/PUT /api/notifications/preferences`: `{version,settings}`. Başlangıç version0; ilk PUT0 bekler. Varsayılan Enabled/Sound ve tüm türler true, PushEnabled false; LeadSeconds0, SnoozeSeconds300, ReturnAfterSeconds0, QuietStart/QuietEnd null. Türler ScheduleStart, ScheduleEnd, TaskDeadline, FocusTarget, BreakEnd, ReturnToTask, Custom. Settings alanları camelCase'tir. Quiet saatleri `"22:00:00"` biçiminde birlikte gelir; aynı saat kabul edilmez. Lead0..86400, snooze60..86400, return0..86400 saniye. Return0 otomatik dönüş hatırlatmasını kapatır. Saat dilimi kullanıcının planlama tercihindendir.

Enabled veya tür kapalıysa henüz hazırlanmamış niyet Suppressed olur; yeniden açmak eski bildirimleri sel halinde oynatmaz. PushEnabled yalnız harici kanalı seçer. In-app bildirimin kaynağı HTTP'deki Ready kayıtlarıdır; SignalR yalnız yeniden okuma işaretidir. SoundEnabled ses tercihini view/push payload'ına taşır; sunucu ses çalmaz.

Ön süre schedule başlangıç/bitiş ve deadline'a uygulanır. ReminderWork.SourceAt özgün olay saatidir; DueAt=SourceAt−LeadSeconds. Tercih değişikliği pending reminder'ın DueAt'ını SourceAt'tan yeniden hesaplar; süre tekrar tekrar çıkarılmaz. Mantıksal kimlik SourceAt'a bağlıdır. Focus hedefi/mola/geri dönüş/özel reminder için lead kullanılmaz.

Sessiz saatler [başlangıç,bitiş) aralığıdır, geceyi geçebilir. DST gap'teki bitiş ilk geçerli dakikaya; tekrar eden bitiş daha geç UTC instant'ına çözülür. Sessiz saat nedeniyle bekleme hata denemesini tüketmez. İki dakikadan eski gönderim zamanı Expired olur; sabah birikmiş eski alarmlar gösterilmez. Snooze açık kullanıcı niyetidir: yeni NotBefore + iki dakika geçerlilik, aynı notificationId ve artan snoozeCount. Kaynak iptal/taşıma/tamamlama kontrolleri snooze'u da geçersiz kılabilir.

## HTTP yüzeyi

Bütün yollar aynı `Authorization: Bearer <uygulama JWT>` ister; foreign ID404. Validation400, stale version409. Listelerde offset0..100000 ve limit1..100; subscription listesi en çok100, kullanıcı başına en çok20 aktif subscription.

| Method/path | Gövde / sonuç |
| --- | --- |
| GET /api/notifications/preferences | NotificationPreferencesView: settings/version |
| PUT /api/notifications/preferences | `{version,settings}` → yeni settings/version |
| GET /api/notifications/push-config | `{enabled,publicKey}`; private key dönmez |
| GET /api/notifications/subscriptions | kimlik/providerHost/label/active/expiresAt/version; endpoint/keys dönmez |
| POST /api/notifications/subscriptions | `{endpoint,p256dh,auth,label?,expiresAt?}` → SubscriptionView; aynı owner/endpoint upsert |
| POST /api/notifications/subscriptions/{id}/remove | `{version}` →204; soft deactivate |
| GET /api/notifications?offset&limit | NotificationPage; Pending/Ready/Obsolete/Suppressed/Expired durumları açık |
| GET /api/notifications/alerts?limit&cursor | NotificationAlertPage `{serverNow,preferencesVersion,items,nextCursor}`; güncel, okunmamış, uygun ön plan alarmları |
| GET /api/notifications/{id} | NotificationView; kaynak ID'leri, zamanlar, ses, version |
| POST /api/notifications/{id}/read | `{version}` → view; readAt işaretler |
| POST /api/notifications/{id}/snooze | `{version,seconds?}` → aynı kimlikli view |
| GET /api/notifications/reminders?offset&limit | owner özel reminder listesi |
| POST /api/notifications/reminders | `{title,dueAt,taskId?}` + Idempotency-Key →201 CustomReminderView |
| PUT /api/notifications/reminders/{id} | `{title,dueAt,taskId?,version}` + key → view; eski niyet obsolete, yeni version niyeti |
| POST /api/notifications/reminders/{id}/cancel | `{version}` → canceled view; eski niyet obsolete |
| GET /api/sync | serverNow/planningVersion/workSessionId/focusSessionId; reconnect için bounded authoritative işaretler |

Özel reminder başlığı1..200; future dueAt şimdi..bir yıl; optional task owner olmalı. Create/update key1..128, aynı key/farklı normalize edilmiş payload409; replay özgün sonucu verir. Diğer bildirim yazımları beklenen version ile ikinci kez uygulanmayı engeller. Özel reminder başlığı push payload'ına konmaz.

NotificationView: id, kind, sourceId, taskId?, dailyPlanId?, revisionId?, occurredAt, readyAt?, notBefore?, readAt?, state, snoozeCount, soundEnabled, version. `occurredAt` kaynak olay instant'ı; lead ile gönderim daha erken olabilir. `readyAt` ilk hazırlama anıdır, teslim/okundu kanıtı değildir. Tıklamada notificationId ile HTTP'den owner kaynak bağını alıp task/focus panelini aç. Pending kayıt kullanıcıya gösterilecek alarm değildir.

### Ön plan alarm okuması — 27 Ekim 2026

`GET /api/notifications/alerts` salt okunurdur; job/focus değerlendirmesi, readAt veya delivery receipt yazmaz. `limit` varsayılan25,1..50 adaydır. Yanıt `NotificationAlertPage {serverNow,preferencesVersion,items: NotificationView[],nextCursor}` olur. PreferencesVersion o sayfanın güncel owner notification tercih sürümüdür, kayıt yoksa0; cursor sayfaları arasında değişebilir. Frontend sürüm değişince yeni serverNow baseline kurup eski tercih döneminin alarmlarını çalmaz; kapalı sesin tekrar açılması yakın geçmişi oynatmaz. Yalnız owner Ready, okunmamış, gönderim zamanı `serverNow−120sn .. serverNow` dahil aralığındaki ve güncel tür/enabled, kaynak/version/revision ve sessiz saat kontrollerini geçen kayıtlar döner. İptal/silme/arşiv/tamamlanma veya geçersiz focus kaynağı, intent hâlâ Ready kalsa bile alarmı geçersiz kılar. `PushEnabled=false` ön plan kanalını kapatmaz. Ses kapalı uygun öğe listede kalır: bu endpointte `soundEnabled`, genel ses ayarı ile FocusTarget/BreakEnd için ilgili focus snapshot ses ayarının birleşimidir. Push `silent` aynı etkin kararı izler; inbox/detail ses alanı genel tercihi gösterir.

Gönderim zamanı job ile aynıdır: açık snooze turunda NotBefore, schedule/deadline için OccurredAt−LeadSeconds, diğer türlerde NotBefore??OccurredAt. Artan `(dueAt,id)` keyset cursor ilk sayfanın sabit zaman üst sınırını taşır; takip sayfası yeni gelen daha sonraki alarmı aynı tura katmaz. Her sayfada güncel120sn tazelik ve kaynak/policy yine doğrulanır. En fazla limit adayın kaynakları incelenir; bu nedenle `items=[]` ile `nextCursor` gelebilir. Null cursor turu bitirir. Bozuk/yabancı veya ilk kesimi120sn'den eski cursor400 `notification_alert_cursor_invalid`; cursor bir pozisyondur, auth tokenı veya sır değildir. Her yeni poll/sync gözleminde cursorsuz başlanır; bu API kalıcı artımlı olay kuyruğu değildir ve exactly-once sağlamaz.

Frontend mount/ses kilidi açılmasından önceki tarihçeyi çalmaz; ilk sunucu kesimi baseline olur. İlk tur için ReadyAt, yeni açık snooze turu için NotBefore dikkate alınır; ReadyAt ilk hazırlamayı korur. Açık snooze ReadAt'ı temizleyerek yeni turu okunmamış yapar. Owner+notificationId+snoozeCount ortak kanal claim'i ve tarayıcı ses kilidi frontend sorumluluğudur; OS ses ayarı teslim/işitilme garantisi değildir.

## Kalıcılık, kaynak geçerliliği ve tekrar

NotificationIntent ve capture edilen NotificationReady outbox aynı transaction'dadır. Worker güncel tercihleri, kaynak açıklığını ve kaynak version/revision'ını tekrar doğrular. Schedule için current revision ve block version/instant; deadline için güncel deadline; focus için tarihsel target yanında corrected effective hedef; mola için AwaitingNext/end; dönüş için aynı Paused work version; özel reminder için güncel uncanceled version gerekir.

Reminder'ın yeni revision'a bağlanması aynı blok/olay instant'ı için notificationId'yi korur. Aynı snoozeCount/subscription için tek PushDelivery unique kısıtı vardır. Yeni revision veya lost ack başarılı delivery'yi yeniden göndermez. Açık snooze aynı notificationId ile bilinçli yeni delivery denemesidir. Focus target kimliği focus başına tektir; sayaç ve overtime devam eder. Mola gerçek çalışma toplamına eklenmez. ReturnAfterSeconds>0 olduğunda task'a bağlı pause sürümü dönüş niyeti üretir; resume farklı version olduğu için eski niyet geçersizdir.

Planlı Pomodoro molası/AwaitingNext ikinci bir ReturnToTask alarmı üretmez; mola sonu kendi türünü kullanır. Normal pause dönüş hatırlatması alabilir.

Push hazırlanması transaction; external I/O transaction/DB kilidi dışında; sonucun kaydı ayrı transaction. Kaynak/tercih gönderimden hemen önce kontrol edilir. Kontrolden sonra başlamış bir ağ isteği iptal edilemez. Provider kabul edip süreç sonucu kaydetmeden ölürse taşıma tekrarı olabilir. Aynı notification tag/topic ve kalıcı kimlik istemcide duplicate'i azaltır; dağıtık exactly-once garantisi yoktur.

429/5xx en çok5 deneme; Retry-After1..3600sn ile sınırlandırılır, yoksa outbox backoff. 404/410 aboneliği pasifleştirir; diğer kalıcı HTTP hataları Rejected delivery olur. Bağlantı hataları outbox bounded retry kullanır. Failed outbox owner jobs endpoint'inden görülebilir/retry edilebilir. Provider body, endpoint/auth anahtarları, JWT veya task metni loglanmaz.

## Web Push işletimi

Lib.Net.Http.WebPush3.3.1 (MIT), EncryptedContentEncoding2.1.1 kilitli. net6 asset'i net10'da kullanılır; eski Portable.BouncyCastle bağımlılığı eklenmez. Şifreleme/VAPID algoritmasını ürün kodunda yeniden yazmayız. [Paket](https://www.nuget.org/packages/Lib.Net.Http.WebPush/3.3.1), [upstream](https://github.com/tpeczek/Lib.Net.Http.WebPush), [RFC8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC8292](https://www.rfc-editor.org/rfc/rfc8292).

`Push__Enabled`, `Push__Subject` (mailto/https gerçek operasyon iletişimi), `Push__PublicKey`, `Push__PrivateKey`; ayrı P-256 VAPID keypair gerekir, uygulama HS256 JWT key'si kullanılmaz. Varsayılan Enabled=false; public config bunu açıkça döner. Sırlar ortam/secret store veya ignore edilmiş yerel dosyada tutulur. VAPID anahtarı restart'ta korunur; değişirse tarayıcı yeniden subscription oluşturmalıdır. Hiçbir harici hesap veya production ayarı bu geliştirmede değiştirilmedi.

Yerel kurulum: `./scripts/new-web-push-keys.ps1 -Subject 'mailto:YOUR-CONTACT'` ignore edilmiş `.local/web-push.json` üretir; mevcut dosyayı değiştirmez. Windows PowerShell5/PowerShell7 için P-256 üretimi, sign/verify kontrolü ve CreateNew ile overwrite koruması vardır. `./scripts/run-api.ps1 -EnablePush` veya `Push__Enabled=true` açıkça ayarlanınca run-api.ps1 bu dosyadaki keypair'i ortam değişkeni eksikse okur; switch'in değiştirdiği ortam değeri çıkışta geri konur. Key üretmek tek başına push'u açmaz. Enabled-only startup validator mailto/HTTPS iletişimini ve eşleşen P-256 public/private keypair'i doğrular; hata mesajı değerleri içermez. Varsayılan kapalı ayar aynen kalır. Production ortamı ayrı secret store/env kullanır.

Yerel Edge testi için HTTP loopback origin yeterlidir; [Edge localhost geliştirme istisnası](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/) ve [W3C loopback güvenilir bağlam kuralı](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy) geçerlidir. Bu, uzak domain için HTTPS veya dış subscription endpointi için HTTPS/443 zorunluluğunu kaldırmaz. VAPID Subject gerçek iletişim URI'sidir; [RFC8292§2.1](https://www.rfc-editor.org/rfc/rfc8292#section-2.1) mailto/HTTPS önerir. Development ortamında jobs çalışmalı, browser izni ve kullanıcı push tercihi ayrıca açık olmalıdır; provider HTTP kabulü gerçek Windows OS gösterimi/tıklaması veya sesin duyulması kanıtı değildir.

Subscription endpoint HTTPS/443, credentials/fragment olmadan; geçerli P-256 public point ve16byte auth gerekir. Aynı endpoint başka hesaba sessizce devredilmez. Logout/account switch'te eski owner subscription'ını remove edip tarayıcı subscription'ını unsubscribe/resubscribe et; token/cache/SignalR temizle. Public IP bağlantısı gönderim sırasında çözülüp doğrulanır; private/loopback/link-local DNS sonuçları reddedilir, redirects/proxy kapalıdır. HTTP client paylaşılan ve15sn timeout'ludur; request logger bağlanmaz.

Payload yalnız notificationId, recipientUserId, snoozeCount, sabit tag, Türkçe title/body, `/notifications/{id}` ve silent taşır. **27 Ekim kullanıcı kararı:** bütün mevcut bildirim türleri kendi bağlamına uygun başlık/açıklama verir; genel “Bir hatırlatmanız var.” metni sekiz bilinen türün yerine kullanılmaz. Title ve body ayrı ayrı1–200 karakter, boş olmayan düz metindir. Adlar aynı owner kilidi içinde geçerli kaynaktan okunur; Custom/SpecialDay source version, plan/work revision/version ve task deadline instant'ı kontrolleri korunur. Genel görev adı değişikliği aynı deadline veya planı tek başına geçersiz kılmadığından bu kaynaklarda güncel owner task adı okunur. Özel hatırlatma düzenlenince eski intent geçersizleşir, yalnız yeni sürümün adı gönderilir; eski Title snapshot'ı bulunmaması kaynak adını engellemez. Bu açık kullanıcı tercihi hatırlatma, görev ve özel gün adlarının cihaz/işletim sistemi bildiriminde ve şifreli push taşımasında yer almasına izin verir; görev notu, parola veya başka özel alan eklenmez.

| Tür | Başlık | Açıklama |
| --- | --- | --- |
| Custom | Hatırlatmanın geçerli adı | Hatırlatma |
| FocusTarget | Pomodoro süresi doldu | Working/Paused: “Molaya geçebilir veya çalışmaya devam edebilirsin.”; gerçek Break+BreakStartedAt: “Molan başladı.”; AwaitingNext: “Yeni bir pomodoroya başlayabilirsin.” |
| BreakEnd | Mola bitti | Yeni bir pomodoroya başlayabilirsin. |
| ScheduleStart | Olaydan önce “Planlı iş yaklaşıyor”; olay anı/sonrasında “Planlı iş başlıyor” | Güncel owner görev adı |
| ScheduleEnd | Olaydan önce “Planlı işin bitişi yaklaşıyor”; olay anı/sonrasında “Planlı işin bitiş zamanı geldi” | Güncel owner görev adı; görevin tamamlandığı iddia edilmez |
| TaskDeadline | Olaydan önce “Son teslim yaklaşıyor”; olay anı/sonrasında “Son teslim zamanı geldi” | Güncel owner görev adı |
| ReturnToTask | İşe dönüş hatırlatması | Güncel owner görev adı |
| SpecialDay | Özel gün hatırlatması | Geçerli özel gün adı |

Lead/erteleme metni planlanan OccurredAt ile sunucunun gerçek gönderim anının karşılaştırmasından seçilir; frontend süre veya durum hesaplamaz. Otomatik veya manuel mola gerçekten başlamamışsa “Molan başladı.” denmez. Tarihsel boş adlarda türün güvenli açıklaması/“Hatırlatma” kullanılır; savunmacı uzun ad kesimi UTF-16 çiftini bölmez. Bilinmeyen gelecekteki tür için genel fallback korunur; mevcut source validator bilinmeyen türü zaten göndermez.

UI-27 (23 Ekim) snoozeCount'u ekler: ilk tur0, açık snooze'da artar. Worker/foreground ortak teslim anahtarı `recipientUserId:notificationId:snoozeCount` olur; OS tag'i aynı notificationId için sabit kalır. Service Worker recipientUserId ile aktif hesabı eşleştirir. 27 Ekim UI ses bakımı: userVisibleOnly gereği uygun push açık sekmede de native gösterilir, sekme ayrıca push toast oluşturmaz. WebAudio ve native yol ortak atomik ses claim'i ile yalnız bir ses üretir; sekme önce çalmışsa native silent olur. Bu UI koordinasyonu backend testiyle tamamlandı sayılmaz. [Web Push payload şeması](web-push-envelope.schema.json) HTTP dışı şifreli mesaj sözleşmesidir; HTTP yolları/OpenAPI işlem şemaları bu ekle değişmez.

## SignalR ve reconnect

Hub `/api/hubs/planner`, aynı süresiz JWT, ek token/cookie/refresh yok. JavaScript:

```ts
const hub = new HubConnectionBuilder()
  .withUrl('/api/hubs/planner', { accessTokenFactory: () => auth.token() ?? '' })
  .withAutomaticReconnect().build();
hub.on('changed', async event => { /* eventId ile dedup; ilgili Query cache'i invalidate/refetch */ });
hub.onreconnected(async () => { /* GET /api/sync; açık day/task/work/focus/notifications sorgularını refetch */ });
```

`changed` payload: `{eventId,kind,sourceId,sourceVersion}`. TaskChanged/PlanChanged/DayItemChanged/WorkChanged/FocusChanged/PreferencesChanged/RecurrenceChanged/NotificationReady/NotificationPreferencesChanged. DayItemChanged (UI-R2) yalnız istemci yenilemesidir; hatırlatma üretmez. PlanChanged sourceId revisionId'dir; NotificationReady sourceId notificationId'dir ve sourceVersion snoozeCount'tur. Mesaj minimal invalidation işaretidir; task metni/state kopyası yok. Commit sonrası publish, sonra ack; lost ack aynı eventId ile yeniden publish edebilir. Event sırası/global eksiksiz replay garantisi yok; authoritative HTTP zorunludur.

Server doğrulanmış sub'tan `user:{id}` grubuna alır. Client-controlled JoinGroup yoktur. Sadece gerçek hub WebSocket/SSE isteğinde standart `access_token` query kabul edilir; normal API veya negotiate query token'ı kabul etmez, onlar Bearer header kullanır. Hosting.Diagnostics query logları Warning'e filtrelenir; reverse proxy kurulumunda query içeren raw request loglanmamalı (MVP29). [Resmî auth belgesi](https://learn.microsoft.com/aspnet/core/signalr/authn-and-authz?view=aspnetcore-10.0).

`GET /api/sync` RepeatableRead ile owner plan sürümü ve aktif/paused work/focus kimliklerini döner. Ardından kaynak endpoint'lerinden gerçek değerleri al; sayaç ekranını server timestamp'lerinden türet. SignalR kopması veya logout gerçek oturumu kendiliğinden kapatmaz.

## Üç ayrı bildirim sesi — 28 Ekim 2026

Hesaba kaydedilen `pomodoroSound`, `reminderSound`, `taskEndSound` alanları ve olay eşlemeleri [bildirim modülünde](frontend-api/notifications.md#bildirim-ses-seçimi--28-ekim-2026) tanımlıdır. Katalog kimlikleri bell/marimba/digital/glass/pulse/soft. Önizleme kullanıcı düğmesiyle çalışır ve tercih yazmaz; yalnız seçim değişikliği mevcut version kontrollü PUT'u kullanır. Genel/odak ses kapatma ve sessiz saatler önceliklidir. Açık sekme/push ortak atomik kimlik ve snoozeCount kaydını kullanır; yakın eşzamanlı bildirimler mevcut tek ses politikasına tabidir. Hazır sekme yoksa platformun native sesi kullanılır, özel tını garantisi verilmez. Uyumlu worker yaması v3 açık çalışma belgesini yeniden yüklemez ve v2 etkinleştirme mesajını da kabul eder.

# DTO ve enum sözlüğü

152işlemin eriştiği bütün public OpenAPI şemaları aşağıdadır. Request/response ayrımı endpoint sayfasındadır. Required alan varlığını, null union’u nullable olmayı gösterir; command’a özgü iş kuralları modül notlarıyla birlikte uygulanır. Sayılar JSON number olarak döner; bazı .NET input sayı şemaları string okumaya da izin verir. Int64 sürümleri hesaplamak yerine yanıttan taşıyın. Oranlar0..1, süreler aksi belirtilmedikçe saniyedir.

## ActualAnalyticsView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `bucket` | [AnalyticsBucket](DTO-Sozlugu.md#analyticsbucket) | evet | — | Day/Week/Month rapor gruplaması. |
| `weekStartsOn` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | 0Pazar..6Cumartesi; başlangıç1Pazartesi. |
| `timeZonePolicy` | string | evet | — | Raporun gerçek kayıtları gruplama politikası; güncel user zoneu ile history rewrite yok. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `sourceTimeZones` | string[] | evet | — | Raporun frozen gerçek kayıt zone kapsamı. |
| `totals` | [ActualMetrics](DTO-Sozlugu.md#actualmetrics) | evet | — | Bütün raporun server tarafından tekilleştirilmiş metrikleri. |
| `buckets` | [ActualBucketView](DTO-Sozlugu.md#actualbucketview)[] | evet | — | Dönem bucket sonuçları; distinct sayaç ve ortalamalar toplanarak totals yeniden üretilmez. |

## ActualBreakdownItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | null\|string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `label` | string | evet | — | Subscription için en çok100karakter cihaz etiketi; analizde ise grup etiketi. |
| `snapshotAvailable` | boolean | evet | — | Breakdown etiketinin tarihsel snapshot bilgisi var; false güncel adla doldurulmaz. |
| `workSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Focus hedefi veya rapor actual değeri; DTO bağlamını izleyin, ikisini toplamayın. |
| `sessionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Pozitif rapor kesişimi veren distinct work session sayısı; bucketlardan toplanmaz. |

## ActualBreakdownPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `dimension` | [AnalyticsDimension](DTO-Sozlugu.md#analyticsdimension) | evet | — | Actual breakdown Task/Project/Category gruplama boyutu. |
| `timeZonePolicy` | string | evet | — | Raporun gerçek kayıtları gruplama politikası; güncel user zoneu ile history rewrite yok. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `totalWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Breakdown tüm rapor actualı; sayfalı Items toplamı değildir. |
| `items` | [ActualBreakdownItem](DTO-Sozlugu.md#actualbreakdownitem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## ActualBucketView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `bucketStart` | string (date) | evet | — | Doğal hafta/ay/gün başlangıcı; bucket From/To talep aralığında kesilmiş olabilir. |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `sourceTimeZones` | string[] | evet | — | Raporun frozen gerçek kayıt zone kapsamı. |
| `metrics` | [ActualMetrics](DTO-Sozlugu.md#actualmetrics) | evet | — | Bucketın actual/focus metrik nesnesi; global distinct totals yerine toplanmaz. |

## ActualMetrics

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `workSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Focus hedefi veya rapor actual değeri; DTO bağlamını izleyin, ikisini toplamayın. |
| `taskWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | WorkSeconds içindeki gerçek TaskId bulunan alt küme. |
| `generalWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | TaskId=null effective çalışma; uydurma görev/projeye yazılmaz. |
| `manualWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | WorkSeconds içindeki Manual kaynaklı alt küme; toplama ayrıca eklenmez. |
| `sessionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Pozitif rapor kesişimi veren distinct work session sayısı; bucketlardan toplanmaz. |
| `segmentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Pozitif rapor kesişimi veren distinct effective segment sayısı; bucketlardan toplanmaz. |
| `missingSnapshotSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Task bağlı fakat başlangıç snapshotı eksik actual saniyesi. |
| `focus` | [FocusMetrics](DTO-Sozlugu.md#focusmetrics) | evet | — | Aynı gerçek çalışmanın focus alt kümesi; WorkSeconds üzerine tekrar eklenmez. |

## AddDayItemRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `placement` | null / [DayItemPlacement](DTO-Sozlugu.md#dayitemplacement) | hayır | — | First öğeyi günün başına koyar (Yarının ilk işi); varsayılan Last. |

## AddPlanEntryRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `title` | null\|string | hayır | minLength=0; maxLength=300 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `isUrgent` | boolean | hayır | — | Acil plan bağlamı işareti; görev priority değerinden ayrıdır. Sayaç veya görevin tamamlanma durumu değildir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |

## AnalyticsBucket

Değerler: `Day`, `Week`, `Month`.

## AnalyticsDimension

Değerler: `Task`, `Project`, `Category`.

## ApplySchedulingRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `proposalId` | string (uuid) | evet | — | Henüz kabul edilmemiş öneri kimliği; apply aynı snapshot dayanağını tekrar doğrular. |

## AuthResponse

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `accessToken` | string | evet | — | Uygulamanın süresiz Bearer JWT değeri; register/login yanıtında gelir. |
| `tokenType` | string | evet | — | Authorization şeması: Bearer. |
| `user` | [UserSummary](DTO-Sozlugu.md#usersummary) | evet | — | Doğrulanmış hesabın id/email/displayName özeti. |

## CalendarActualItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `sessionId` | string (uuid) | evet | — | Gerçek çalışma oturumu kimliği. |
| `segmentId` | string (uuid) | evet | — | Kesintisiz gerçek çalışma aralığının kimliği. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `sourceStartedAt` | string (date-time) | evet | — | Geceye bölünmeden önceki gerçek segmentin özgün başlangıcı. |
| `sourceEndedAt` | null\|string (date-time) | evet | — | Özgün segment bitişi; hâlâ açıksa null. |
| `activeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Effective aktif segment süresi; pause/mola hariç. |
| `sessionStillRunning` | boolean | evet | — | Calendar kesitinin kaynak work oturumu halen açık/Running. |
| `taskAtStart` | null / [TaskAtStart](DTO-Sozlugu.md#taskatstart) | evet | — | Gerçek çalışma başlangıcındaki isim/yol/sınıflandırma snapshotı; eski kayıtta null olabilir. |
| `taskAtDayEnd` | null / [HistoricalTaskState](DTO-Sozlugu.md#historicaltaskstate) | evet | — | Seçili tarih sonundaki olay tabanlı task durumu; Available false ise bilinmiyor. |

## CalendarActualPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [CalendarActualItem](DTO-Sozlugu.md#calendaractualitem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## CalendarCompletionItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `eventId` | string (uuid) | evet | — | Olayın kalıcı kimliği; SignalRda outbox event dedup kimliği. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `effectiveAt` | string (date-time) | evet | — | Olay/revizyonun etkili olduğu instant; createdAt ile her zaman aynı olmayabilir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `title` | null\|string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `parentTaskId` | null\|string (uuid) | evet | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `sequence` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili görev/oturum kapsamındaki kararlı artan olay/audit sırası. |

## CalendarCompletionPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [CalendarCompletionItem](DTO-Sozlugu.md#calendarcompletionitem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## CalendarDaySummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `dailyPlanId` | null\|string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `currentRevisionId` | null\|string (uuid) | evet | — | Planın güncel kabul edilmiş revisionı; boş günde null. |
| `baselineRevisionId` | null\|string (uuid) | evet | — | İlk Work içeren kabul edilmiş plan referansı; oluşmadıysa null. |
| `revisionNumber` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Güncel/seçili planın kendi gün içi artan revision numarası. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `plannedWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Referans bloklardaki planlı Work süre toplamı; actual değildir. |
| `plannedBreakSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Planlı Break süre toplamı; actual çalışma değildir. |
| `plannedBufferSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Planlı Buffer süre toplamı; actual çalışma değildir. |
| `baselineWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Baseline revisionındaki planlı Work toplamı. |
| `plannedBlockCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Güncel plan bağlamındaki blok sayısı. |
| `actualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi. |
| `actualSegmentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gün aralığına kesişen farklı gerçek segment sayısı. |
| `completedTaskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Seçili günün completion olaylarına dayanan görev sayısı. |
| `hasOpenWork` | boolean | evet | — | Gün bağlamına kesişen açık gerçek çalışma var. |

## CalendarDayView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `summary` | [CalendarDaySummary](DTO-Sozlugu.md#calendardaysummary) | evet | — | Takvim gününün plan/actual/completion özet nesnesi. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `plan` | [CalendarPlanPage](DTO-Sozlugu.md#calendarplanpage) | evet | — | CalendarDayde plan sayfası, ImmediateWorkResultta nullable kalan-gün proposalı; DTO bağlamını ayırın. |
| `actual` | [CalendarActualPage](DTO-Sozlugu.md#calendaractualpage) | evet | — | Takvimde bağımsız sayfalı gerçek segment kesitleri; plan bloklarından farklı kaynak. |
| `completions` | [CalendarCompletionPage](DTO-Sozlugu.md#calendarcompletionpage) | evet | — | Seçili günün bağımsız sayfalı tamamlanma olayları. |
| `legacyZoneCompletionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Frozen zone bilgisi eksik tarihsel completion kayıtlarının ayrı kapsam sayısı. |

## CalendarItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `kind` | [CalendarItemKind](DTO-Sozlugu.md#calendaritemkind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `parentTaskId` | null\|string (uuid) | evet | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `parentTitle` | null\|string | evet | — | Doğrudan üst görevin güncel başlığı; kök görevde null. |
| `rootTaskId` | string (uuid) | evet | — | Kök (en üst) görev; ay/hafta görünümü bu göreve göre gruplar. |
| `rootTitle` | string | evet | — | Kök görevin güncel başlığı. |
| `startsAt` | null\|string (date-time) | evet | — | Saatli öğede başlangıç; saatsiz öğede null. |
| `endsAt` | null\|string (date-time) | evet | — | Saatli öğede bitiş; saatsiz öğede null. |
| `completedAt` | null\|string (date-time) | evet | — | Yalnız bu plan öğesinin bittiği instant; görev tamamlanmasını göstermez. |
| `taskState` | [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | Occurrence/task snapshotındaki TaskState; TaskId olmayınca null olabilir. |

## CalendarItemKind

Değerler: `Timed`, `Untimed`.

## CalendarItemPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `items` | [CalendarItem](DTO-Sozlugu.md#calendaritem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## CalendarOverviewDay

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | Plan varsa frozen gün zone, yoksa kullanıcı tercihi. |
| `itemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Günün bütün güncel saatli Work ve saatsiz öğelerinin sayısı; yalnız önizleme değildir. |
| `completedItemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bütün gün kapsamındaki completedAt dolu öğeler; görev yaşam döngüsü tamamlanması değildir. |
| `rootGroupCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu günün bütün ayrı kök görev grupları; +N bu gerçek toplamdan üretilir. |
| `roots` | [CalendarRootPreview](DTO-Sozlugu.md#calendarrootpreview)[] | evet | — | İlk görünüm sırasındaki en çok3 kök grup önizlemesi; alt ağaç/öğe listesi değildir. |

## CalendarOverviewView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Owner snapshotındaki plan/kaynak sürümü; yazmanın kendi version alanının yerine geçmez. |
| `days` | [CalendarOverviewDay](DTO-Sozlugu.md#calendaroverviewday)[] | evet | — | İstenen1–42 yerel günün tamamı; boş günler de döner. |

## CalendarPlanPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [CalendarPlannedItem](DTO-Sozlugu.md#calendarplanneditem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `revisionId` | null\|string (uuid) | evet | — | Kabul edilmiş immutable tam plan sürümü; proposal kimliği değildir. |

## CalendarPlannedItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `revisionItemId` | string (uuid) | evet | — | Calendar satırının seçilmiş revision içindeki immutable blok kimliği. |
| `schedule` | [ScheduleView](DTO-Sozlugu.md#scheduleview) | evet | — | Kalıcı/günsel revision bağlamındaki blok snapshotı. |
| `taskAtDayEnd` | null / [HistoricalTaskState](DTO-Sozlugu.md#historicaltaskstate) | evet | — | Seçili tarih sonundaki olay tabanlı task durumu; Available false ise bilinmiyor. |

## CalendarRangeView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `days` | [CalendarDaySummary](DTO-Sozlugu.md#calendardaysummary)[] | evet | — | İstenen dahil tarih aralığındaki gün sonuçları; dağıtım ve rapor DTOları farklıdır. |
| `legacyZoneCompletionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Frozen zone bilgisi eksik tarihsel completion kayıtlarının ayrı kapsam sayısı. |

## CalendarRootPreview

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `rootTaskId` | string (uuid) | evet | — | Owner kapsamındaki en üst görev kimliği. |
| `rootTitle` | string | evet | — | Kök görevin güncel başlığı. |
| `itemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gruptaki bütün gün öğelerinin sayısı. |
| `completedItemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gruptaki bütün completedAt dolu öğeler. |
| `done` | boolean | evet | — | Gruptaki bütün öğeler tamamlanmışsa true; ilk3 önizlemeden hesaplanmaz. |

## ChangeOccurrence

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Template sürümü; TaskView.version değildir. |
| `taskVersion` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Occurrence taskı varsa zorunlu güncel task sürümü; henüz task yoksa gönderilmez. |

## ClassificationRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `projectId` | null\|string (uuid) | hayır | — | Uzun vadeli proje bağı; task kopyası üretmez. |
| `poolId` | null\|string (uuid) | hayır | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `categoryId` | null\|string (uuid) | hayır | — | Tek kategori bağı; historical snapshot bugünkü ada göre yeniden yazılmaz. |
| `tagIds` | string (uuid)[] | evet | maxItems=50 | Görevin etiket kimlikleri; sınıflandırma komutunun gönderdiği seti temsil eder. |
| `applyToSubtree` | boolean | hayır | — | Sınıflandırmayı alt ağaca yayma açık niyeti; expectedPlanningVersion gerekir. |
| `expectedPlanningVersion` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |

## ClassificationValues

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `projectId` | null\|string (uuid) | evet | — | Uzun vadeli proje bağı; task kopyası üretmez. |
| `poolId` | null\|string (uuid) | evet | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `categoryId` | null\|string (uuid) | evet | — | Tek kategori bağı; historical snapshot bugünkü ada göre yeniden yazılmaz. |
| `tagIds` | string (uuid)[] | evet | — | Görevin etiket kimlikleri; sınıflandırma komutunun gönderdiği seti temsil eder. |

## ClassificationView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `values` | [ClassificationValues](DTO-Sozlugu.md#classificationvalues) | evet | — | İlgili komutun tam alan belgesi; PUTta yalnız değişen alanları göndermek güvenli değildir. |

## ClientErrorKind

Değerler: `Error`, `UnhandledRejection`, `React`, `null`.

## ClientErrorRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `message` | string | evet | minLength=1; maxLength=500 | Bilgilendirme/hata açıklaması; durum kararı için title/message parse etmeyin. |
| `kind` | null / [ClientErrorKind](DTO-Sozlugu.md#clienterrorkind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `route` | string | evet | minLength=1; maxLength=200 | Hatanın görüldüğü sayfa yolu; yalnız path, query/host yok. |
| `buildId` | string | evet | minLength=1; maxLength=100 | Hatanın görüldüğü UI derleme kimliği; sır içermez, sunucuda maskelenir. |
| `browserFamily` | string | evet | minLength=1; maxLength=20 | Kaba tarayıcı ailesi (Chrome/Firefox/Safari/Edge/Other); ham User-Agent saklanmaz. |
| `occurredAt` | string (date-time) | evet | — | Kaynak olayın instantı; lead/NotBefore/ReadyAt teslim zamanından ayrıdır. |

## CompletionOrigin

Değerler: `Manual`, `Automatic`, `null`.

## ConvertedNote

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `noteId` | string (uuid) | evet | — | Dönüştürülen veya bağlamda kullanılan not kimliği. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `noteVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Dönüşümden sonraki note sürümü. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `replayed` | boolean | evet | — | Özgün işlemin sonucu tekrar dönüyor; güncel ölçüm/sürüm olduğunun garantisi değil. |

## CorrectWorkRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `segmentVersion` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Correction hedef segmentinin son sürümü. |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | null\|string (date-time) | hayır | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `isVoided` | boolean | evet | — | Effective actual hesabından çıkarılmış segment; audit kaydı silinmez. |
| `reason` | string | evet | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## CorrectionPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [CorrectionView](DTO-Sozlugu.md#correctionview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## CorrectionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `sessionId` | string (uuid) | evet | — | Gerçek çalışma oturumu kimliği. |
| `segmentId` | string (uuid) | evet | — | Kesintisiz gerçek çalışma aralığının kimliği. |
| `sequence` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili görev/oturum kapsamındaki kararlı artan olay/audit sırası. |
| `kind` | string | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `reason` | string | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `previousValues` | null / [SegmentView](DTO-Sozlugu.md#segmentview) | evet | — | Correction öncesi segment snapshotı; ilk manuel kayıt için null olabilir. |
| `newValues` | [SegmentView](DTO-Sozlugu.md#segmentview) | evet | — | Correction sonrası effective segment; journal ayrıca actual süre değildir. |
| `previousSession` | null / [SessionAudit](DTO-Sozlugu.md#sessionaudit) | evet | — | Correction öncesi session zaman/durum/sürüm snapshotı. |
| `newSession` | [SessionAudit](DTO-Sozlugu.md#sessionaudit) | evet | — | Correction sonrası session zaman/durum/sürüm snapshotı. |

## CreateChildRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `parentVersion` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Parent değişiklik yarışı için beklenen parent sürümü. |
| `parentWorkDisposition` | null / [ParentWorkDisposition](DTO-Sozlugu.md#parentworkdisposition) | hayır | — | PreserveDirect veya ConvertToContainer; doğrudan işi olan parenta çocuk ekleme/taşıma niyeti. |
| `title` | string | evet | minLength=0; maxLength=300 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `description` | null\|string | hayır | minLength=0; maxLength=10000 | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `deadlineAt` | null\|string (date-time) | hayır | — | Görevin son teslim instantı; plan bloğu bitişinden ayrıdır. |
| `canSplit` | boolean | hayır | — | Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez. |

## CreateScheduleRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `kind` | null / [ScheduleKind](DTO-Sozlugu.md#schedulekind) | evet | — | Work/Break/Buffer zorunlu; null400. OpenAPI nullable unionu bu Required davranışını tek başına yansıtmayabilir. |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isFixed` | boolean | hayır | — | Motorun yerini koruyacağı sabit blok. |
| `isLocked` | boolean | hayır | — | Kullanıcının koruduğu blok; değiştirme için açık niyet gerekir. |
| `allowConflicts` | boolean | hayır | — | Manuel overlap uyarısını açık kabul; motorun çakışmasız sonucuyla aynı iddia değil. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `reason` | null\|string | hayır | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |
| `dayItemId` | null\|string (uuid) | hayır | — | UI-R2: saat verilecek saatsiz gün öğesi; verilirse aynı görev ve gün olmalı, öğe aynı işlemde listeden düşer. |
| `dayItemVersion` | null\|integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | dayItemId ile birlikte zorunlu güncel gün öğesi sürümü; eski sürüm409. |

## CurrentWork

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `activeSession` | null / [WorkView](DTO-Sozlugu.md#workview) | evet | — | CurrentWork yalnız Running oturumu; Paused varsa bile null dönebilir. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |

## CustomReminderCommand

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `dueAt` | string (date-time) | evet | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `version` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Create için gerekmez; PUT için güncel sürüm zorunlu, eksikse409. |
| `repeat` | null / [ReminderRepeat](DTO-Sozlugu.md#reminderrepeat) | hayır | — | İsteğe bağlı haftalık tekrar; null tek seferdir. timeZoneId IANA, localTime dakika hassasiyetinde, weekDays 0=Pazar..6=Cumartesi farklı 1..7 gün. Aynı yerel saat sunucuda sürdürülür; geçmiş tarihlerde alarm seli yaratılmaz. |

## CustomReminderView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `dueAt` | string (date-time) | evet | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `canceled` | boolean | evet | — | Özel hatırlatma iptal işareti; görev canceled veya OS abonelik durumu değil. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `repeat` | null / [ReminderRepeat](DTO-Sozlugu.md#reminderrepeat) | hayır | — | Kalıcı haftalık tekrar veya null. dueAt tekrarlayan etkin kayıtta sonraki zamanı gösterir; taskId eski istemciler içindir, yeni UI görev bağlamaz. |

## DailyPlanView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | null\|string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `currentRevisionId` | null\|string (uuid) | evet | — | Planın güncel kabul edilmiş revisionı; boş günde null. |
| `baselineRevisionId` | null\|string (uuid) | evet | — | İlk Work içeren kabul edilmiş plan referansı; oluşmadıysa null. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |

## DateOverride

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `date` | string (date) | evet | — | İlgili plan/destek/occurrence günü; YYYY-MM-DD. |
| `intervals` | [MinuteRange](DTO-Sozlugu.md#minuterange)[] | evet | — | Yerel günün çalışma aralıkları; aynı günde overlap yok. İstisnada boş array tatil günü. |

## DayDeferralIssue

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `code` | string | evet | — | Ertelemeyi engelleyen koruma/çalışan iş/hedefte tamamlanmış öğe kodu. |
| `message` | string | evet | — | Kullanıcıya gösterilebilen sakin açıklama; açık eylem gerekli. |

## DayDeferralPreview

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `sourceDate` | string (date) | evet | — | Seçilen saatli/saatsiz öğelerin kaynak plan günü. |
| `targetDate` | string (date) | evet | — | Saat verilmeden ertelenecek hedef gün; sourceDate sonrasındadır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `schedules` | [ScheduleView](DTO-Sozlugu.md#scheduleview)[] | evet | — | İptal edilecek kaynak saat tahsisleri; hedef saat üretilmez. |
| `items` | [DayItemView](DTO-Sozlugu.md#dayitemview)[] | evet | — | Kaynak saatsiz öğeler; önizleme bu öğeleri değiştirmez. |
| `tasks` | [DayDeferralTask](DTO-Sozlugu.md#daydeferraltask)[] | evet | — | Hedefte yer alacak farklı görevler; birden fazla saatli parça görev kopyası üretmez. |
| `issues` | [DayDeferralIssue](DTO-Sozlugu.md#daydeferralissue)[] | evet | — | Açık koruma izni, çalışan iş veya tamamlanmış hedef öğe nedeniyle uygulamayı engelleyen sorunlar. |
| `canApply` | boolean | evet | — | Sorun listesi boşsa true; onayda bütün sürüm ve koruma kontrolleri yeniden yapılır. |

## DayDeferralResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `changeSetId` | string (uuid) | evet | — | Saatli ve saatsiz değişikliklerin tek atomik grubu; day-items/undo ile telafi edilir. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `schedules` | [ScheduleView](DTO-Sozlugu.md#scheduleview)[] | evet | — | Saatleri iptal edilmiş özgün tahsisler (Removed); kimlikleri geçmişte korunur. |
| `items` | [DayItemView](DTO-Sozlugu.md#dayitemview)[] | evet | — | Hedef günlerin açık öğeleri; defer-tasks yanıtında her görev kendi localDate değerini taşır. Görev kopyalanmaz, mevcut hedef öğenin saati korunur. |
| `revisionIds` | string (uuid)[] | evet | — | Aynı kabul/ChangeSet ile oluşan revision kimlikleri. |

## DayDeferralTask

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `title` | string | evet | — | Ertelenen mevcut görevin güncel başlığı; yeni görev oluşturulmaz. |
| `alreadyPlanned` | boolean | evet | — | Aynı görevin hedefte açık saatsiz öğesi varsa korunur; yeni öğe eklenmez. |

## DayEndCandidates

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `items` | [TaskView](DTO-Sozlugu.md#taskview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |

## DayEndPreparation

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `day` | [CalendarDayView](DTO-Sozlugu.md#calendardayview) | evet | — | Gün sonu hazırlığında CalendarDayView; ayrıca OpenWork aday sayfası döner. |
| `openWork` | [DayEndCandidates](DTO-Sozlugu.md#dayendcandidates) | evet | — | Gün sonundaki açık iş aday sayfası; aktif Running work nesnesi değildir. |
| `availableActions` | string[] | evet | — | Gün sonu için Carry/Move/Pool/Cancel önerileri; GET işlem uygulamaz. |

## DayGlanceHint

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | evet | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |
| `nextStep` | null / [DayGlanceNextStep](DTO-Sozlugu.md#dayglancenextstep) | evet | — | Görevin en son silinmemiş NextStep notu (id + metin) veya null. |
| `priority` | object: Low, Normal, High, Urgent, null | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |

## DayGlanceNextStep

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `noteId` | string (uuid) | evet | — | Dönüştürülen veya bağlamda kullanılan not kimliği. |
| `text` | string | evet | — | Not metni; trim sonrası1..10000karakter. |

## DayGlanceView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `workingRemainingSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Çalışma saatlerinin şimdiden sonra kalan kısmı; çalışma dışı özel günde 0. |
| `plannedRemainingSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Günün açık plan öğelerindeki görevlerin bilinen kendi tahminlerinin toplamı; her görev bir kez sayılır, saatli blok aralığı süre kaynağı değildir. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `completedItemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Günün biten plan öğesi sayısı; gece yarısını geçen bloğun parçaları tek öğe sayılır. |
| `openItemCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Günün açık plan öğesi sayısı (saatli + saatsiz). |
| `actualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi. |
| `overCapacity` | boolean | evet | — | Planın kalanı günün kalan çalışma süresini aşıyor mu; sunucu hesaplar. |
| `hints` | [DayGlanceHint](DTO-Sozlugu.md#dayglancehint)[] | evet | — | Plandaki açık görev başına efor ihtiyacı ve en son silinmemiş ilk adım notu. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `unboundedItemCount` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 | Uyumluluk alanı; süre artık görev tahmininden geldiği için 0 döner. Tahmini olmayan görevler unknownEstimateCount içindedir. |

## DayItemBatchResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `changeSetId` | string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `items` | [DayItemView](DTO-Sozlugu.md#dayitemview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |

## DayItemMoveEntryRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## DayItemPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [DayItemView](DTO-Sozlugu.md#dayitemview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## DayItemPlacement

Değerler: `Last`, `First`, `null`.

## DayItemSnapshot

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `sortOrder` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kararlı manuel kardeş sırası; move komutunda beforeSiblingId kullanılır. |
| `state` | [DayItemState](DTO-Sozlugu.md#dayitemstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `completedAt` | null\|string (date-time) | evet | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `timedScheduleId` | null\|string (uuid) | hayır | — | Saatsiz öğe saatli bloğa dönüştüyse o bloğun kimliği; kimlik sürekliliği için. |
| `startsAt` | null\|string (date-time) | hayır | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | null\|string (date-time) | hayır | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isUrgent` | boolean | hayır | default=false | Acil plan bağlamı işareti; görev priority değerinden ayrıdır. Sayaç veya görevin tamamlanma durumu değildir. |
| `timingIssue` | null\|string | hayır | — | UI-R4: otomatik saat kurulamama nedeni; ScheduleOverlap, LocalTimeUnavailable, PlanTimeZoneMismatch veya EstimateTooLong. Görev gün planında görünür kalır. |

## DayItemState

Değerler: `Planned`, `Removed`, `Scheduled`.

## DayItemVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## DayItemView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `sortOrder` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gün içindeki ekleme sırası; yalnız gösterim sırasıdır. |
| `completedAt` | null\|string (date-time) | evet | — | Yalnız bu gün öğesinin bittiği instant; görev tamamlanmasını göstermez. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `taskTitle` | string | evet | — | Görevin güncel başlığı (plan anı snapshotı değildir). |
| `parentTaskId` | null\|string (uuid) | evet | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `parentTitle` | null\|string | evet | — | Doğrudan üst görevin güncel başlığı; kök görevde null. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil. |
| `taskState` | [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | Occurrence/task snapshotındaki TaskState; TaskId olmayınca null olabilir. |
| `changeSetId` | null\|string (uuid) | hayır | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `planningVersion` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `startsAt` | null\|string (date-time) | hayır | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | null\|string (date-time) | hayır | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isUrgent` | boolean | hayır | default=false | Acil plan bağlamı işareti; görev priority değerinden ayrıdır. Sayaç veya görevin tamamlanma durumu değildir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |
| `timingIssue` | null\|string | hayır | — | UI-R4: otomatik saat kurulamama nedeni; ScheduleOverlap, LocalTimeUnavailable, PlanTimeZoneMismatch veya EstimateTooLong. Görev gün planında görünür kalır. |

## DayOverviewView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `day` | [DailyPlanView](DTO-Sozlugu.md#dailyplanview) | evet | — | Seçili günün kimliği, frozen zone ve revision sürümleri; gün yoksa id null olur, okuma plan yaratmaz. |
| `windowStartsAt` | string (date-time) | evet | — | Seçili frozen zone yerel gününün UTC başlangıcı; frontend gün sınırı tekrar hesaplamaz. |
| `windowEndsAt` | string (date-time) | evet | — | Sonraki yerel günün UTC başlangıcı; DST günleri 23 veya 25 saat olabilir. |
| `timed` | [SchedulePage](DTO-Sozlugu.md#schedulepage) | evet | — | Bu günün Work/Break/Buffer ilk sayfası; kimlik, version ve tarihsel snapshot korunur. |
| `untimed` | [DayItemPage](DTO-Sozlugu.md#dayitempage) | evet | — | Bu günün saatsiz öğe sayfası; total yalnız sayfa uzunluğu değildir. |
| `glance` | [DayGlanceView](DTO-Sozlugu.md#dayglanceview) | evet | — | Sayfalardan bağımsız bütün günün backend hesaplı toplamları, bilinmeyen tahmin sayacı ve görev ipuçları. |
| `support` | [SupportDayView](DTO-Sozlugu.md#supportdayview) | evet | — | Aynı owner/günün küçük efor/kritik iş desteği ve sürümü. |
| `versions` | [DayReadVersions](DTO-Sozlugu.md#dayreadversions) | evet | — | Bu görünümün okunduğu planning/notes/special-days kaynak sürümleri; diğer kaynaklara güncellik garantisi değildir. |
| `recurringTaskIds` | string (uuid)[] | evet | — | Yalnız dönen saatli/saatsiz sayfalardaki rutin oluşumu görev kimlikleri; owner snapshot içinde toplu okunur. Rutin görevleri ertelenemez. |

## DayReadVersions

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `planning` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Mevcut görev/plan/çalışma/tercih koordinasyon sürümü; bildirim veya not sürümü değildir. |
| `notes` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu owner notlarının oluşturma/düzenleme/silme/dönüşüm sayacı; ilgili yazıyla aynı transaction içinde artar. |
| `specialDays` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu owner özel günlerinin create/update/delete/restore sayacı; idempotent replay veya reddedilen yazıda artmaz. |

## DaySignalsView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | İlgili yerel plan günü; başka günün bildirim işaretleri bu günün yokluğu kanıtı sayılmaz. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `returnThresholdSeconds` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İşe dönüş eşiği; ReturnToTask açık ve pozitif süreli değilse mevcut 1800 saniye varsayılanı. |
| `notifications` | [NotificationReceiptView](DTO-Sozlugu.md#notificationreceiptview)[] | evet | — | Bu günün saatli blokları veya son çalışma için gerçekten Ready ve okunmamış bildirim işaretleri; bütün inbox değildir. |
| `complete` | boolean | evet | — | İlgili işaretler 1000 sınırı içinde tamamen tarandıysa true; false durumda bildirim yok varsayılmaz. |
| `lastWork` | null / [WorkView](DTO-Sozlugu.md#workview) | evet | — | StartedAt/Id sırasındaki son gerçek çalışma; geçmişi ve kendi serverNow referansı korunur. |
| `focusIncluded` | boolean | evet | — | Çalışan iş, açık nudge desteği ve gerçek bugün kapsamı nedeniyle focus gözlemi yapıldıysa true; false null focus yokluğu değildir. |
| `focus` | null / [FocusView](DTO-Sozlugu.md#focusview) | evet | — | Yalnız mevcut Today nudge gözlem koşuluyla değerlendirilen odak; sayaç/görev tamamlanmasıyla karıştırılmaz. |
| `runningWorkSessionId` | null\|string (uuid) | evet | — | Bu okuma kesimindeki gerçekten Running oturum; null ise yoktur. |
| `runningTask` | null / [RunningTaskContext](DTO-Sozlugu.md#runningtaskcontext) | evet | — | Hyperfocus ipucunun ihtiyaç duyduğu çalışan görev kimliği/kendi tahmini; tam görev belgesi değildir. |

## DeferDaySelectionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `targetDate` | string (date) | evet | — | Kaynak günden sonraki hedef plan günü; seçilen saatler iptal edilir ve görevler bu güne saatsiz alınır. |
| `schedules` | [PlanEntryVersionRequest](DTO-Sozlugu.md#planentryversionrequest)[] | evet | maxItems=50 | Kaynak gündeki açık saatli çalışma öğelerinin id/version listesi. |
| `items` | [PlanEntryVersionRequest](DTO-Sozlugu.md#planentryversionrequest)[] | evet | maxItems=50 | Aynı işlemde ertelenecek açık saatsiz öğeler; schedules ile birlikte toplam 1–50 farklı öğe. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | maxLength=500 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## DeferReasonCount

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `reason` | null\|string | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |
| `reasonAvailable` | boolean | evet | — | Tarihsel erteleme gerekçesi mevcut; false nedenin bilinmediğini belirtir. |
| `count` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili trigger/reason grubunun kayıt sayısı; toplam task sayısı değildir. |

## DeferTaskTargetRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | Kaynak günde en az bir açık plan parçası bulunan owner görev. |
| `targetDate` | string (date) | evet | — | Bu görevin kaynak günden sonraki hedef günü; diğer görevlerden farklı olabilir. |

## DeferTasksRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `tasks` | [DeferTaskTargetRequest](DTO-Sozlugu.md#defertasktargetrequest)[] | evet | minItems=1; maxItems=50 | 1–50 benzersiz görev ve her görevin ayrı hedef tarihi; kaynak parçaları sunucu bulur. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Bütün seçimin tek planning sürümü; stale durumda hiçbiri taşınmaz. |

## DelayMetrics

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `sampleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir. |
| `lateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tolerans dışında geç başlayan karşılaştırılabilir örnek sayısı. |
| `earlyCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tolerans dışında erken başlayan karşılaştırılabilir örnek sayısı. |
| `onTimeCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | StartToleranceSeconds içinde başlayan karşılaştırılabilir örnekler. |
| `averageSignedDelaySeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Erken başlangıç negatif olacak şekilde imzalı başlangıç farkı ortalaması. |
| `averageLateSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Yalnız geç başlayan karşılaştırılabilir örneklerin ortalama pozitif gecikmesi. |

## DependencyRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `predecessorTaskId` | string (uuid) | hayır | — | Hedef görev başlamadan tamamlanması gereken source görev. |

## DistributionDayView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `blocks` | [SchedulingBlock](DTO-Sozlugu.md#schedulingblock)[] | evet | — | Önerinin plan blokları; apply edilmeden accepted schedule değildir. |
| `changes` | [ScheduleDifference](DTO-Sozlugu.md#scheduledifference)[] | evet | — | Önceki/sonraki blok farkları; tam revision snapshotının yerine geçmez. |
| `unplaced` | [UnplacedWork](DTO-Sozlugu.md#unplacedwork)[] | evet | — | Yerleşemeyen gerçek iş/miktar ve nedeni; sessiz başka güne taşıma değildir. |
| `warnings` | [SchedulingMessage](DTO-Sozlugu.md#schedulingmessage)[] | evet | — | Başarılı200içindeki uyarılar; boş kapasite/koruma/tahmin farkı kaybolmaz. |
| `explanations` | [SchedulingMessage](DTO-Sozlugu.md#schedulingmessage)[] | evet | — | Motorun yerleşim kararlarına ilişkin açıklamalar. |

## DistributionPreviewView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `proposalId` | string (uuid) | evet | — | Henüz kabul edilmemiş öneri kimliği; apply aynı snapshot dayanağını tekrar doğrular. |
| `inputVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Proposalın dayandığı owner planningVersion; güncel entity version değildir. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `expiresAt` | string (date-time) | evet | — | Proposal için2dkgeçerlilik; subscription için opsiyonel browser bitişi. DTO bağlamını ayırın. |
| `planningMode` | string | evet | — | Preview veya Auto; /preview Auto tercihte de kabul edilmiş plan üretmez. |
| `algorithmVersion` | string | evet | — | Öneri/revision üreten algoritmanın sürüm etiketi. |
| `status` | string | evet | — | Proposal için Pending/Applied/Expired; HTTP problemde sayısal status. DTO bağlamını izleyin. |
| `canApply` | boolean | evet | — | Hard kısıtlar açısından apply imkânı; stale/time doğrulaması apply’da yeniden yapılır. |
| `hasConstraintConflicts` | boolean | evet | — | Öneride hard kısıt çatışması var; apply engeli. |
| `days` | [DistributionDayView](DTO-Sozlugu.md#distributiondayview)[] | evet | — | İstenen dahil tarih aralığındaki gün sonuçları; dağıtım ve rapor DTOları farklıdır. |
| `unplaced` | [UnplacedWork](DTO-Sozlugu.md#unplacedwork)[] | evet | — | Yerleşemeyen gerçek iş/miktar ve nedeni; sessiz başka güne taşıma değildir. |
| `applied` | null / [SchedulingApplyResult](DTO-Sozlugu.md#schedulingapplyresult) | hayır | — | Proposalda nullable kabul sonucu; estimate önerisinde false bool. DTO bağlamı farklı. |
| `reversesChangeSetId` | null\|string (uuid) | hayır | — | Telafi/undo ile ters etkisi hesaplanan eski grup. |
| `isPartial` | boolean | hayır | default=false | Undo telafisinin kısmi olması; normal kapasite açığı Unplaced içinde. |

## DistributionRequestDto

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `taskIds` | string (uuid)[] | evet | minItems=1; maxItems=1000 | Seçilen işler; motor container seçimini doğrudan iş bileşenlerine açar. |
| `expectedPlanningVersion` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |

## EditNoteRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `text` | string | evet | minLength=0; maxLength=10000 | Not metni; trim sonrası1..10000karakter. |
| `dueAt` | null\|string (date-time) | hayır | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `display` | null / [NoteDisplay](DTO-Sozlugu.md#notedisplay) | hayır | — | Null/verilmezse başlık, kategori ve gösterim aynen kalır (yalnız metin/tarih düzenleme). Değer verilirse title ve categoryId birlikte yeniden yazılır. |
| `title` | null\|string | hayır | minLength=0; maxLength=200 | display verildiğinde: Detailed/Toggle için 1–200, Short için null. |
| `categoryId` | null\|string (uuid) | hayır | — | display verildiğinde yeni değerdir; null kategoriyi kaldırır. Değişmeyen kaldırılmış kategori kabul edilir, yeni kategori etkin olmalıdır. |

## EnergyLevel

Değerler: `Low`, `Medium`, `High`, `null`.

## EnergyRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |

## EstimateAccuracy

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `sampleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir. |
| `excludedWithoutRecordedWorkCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmin doğruluğu hesabında recorded actual olmadığı için dışlanan örnekler. |
| `meanErrorSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Karşılaştırılabilir tamamlanmış işlerde actual-estimate imzalı ortalaması. |
| `meanAbsoluteErrorSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Karşılaştırılabilir tamamlanmış işlerde abs(actual-estimate) ortalaması. |

## EstimateAccuracyView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `sampleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir. |
| `excludedWithoutWorkCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Suggestionda pozitif recorded work olmadığı için dışlanan örnekler. |
| `medianRatio` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Gerçek ÷ tahmin oranlarının medyanı; 5 örnekten az ise null. |
| `p25Ratio` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Gerçek ÷ tahmin oranlarının alt çeyreği (doğrusal ara değer); 5 örnekten az ise null. |
| `p75Ratio` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Gerçek ÷ tahmin oranlarının üst çeyreği (doğrusal ara değer); 5 örnekten az ise null. |
| `unavailableReason` | null\|string | evet | — | Suggestion üretilememe kodu no_comparable_context/insufficient_samples; nullsa öneri var. |
| `minimumSamples` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Oranların gösterilmesi için gereken en az örnek (5). |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## EstimateSuggestionSample

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `completedAt` | string (date-time) | evet | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |
| `estimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir. |
| `actualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi. |

## EstimateSuggestionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `comparisonContext` | string | evet | — | Suggestion bağlamı RecurrenceTemplate/Category/Project/None; otomatik az-veri fallbacki yok. |
| `contextId` | null\|string (uuid) | evet | — | Seçilmiş suggestion karşılaştırma grubunun kimliği; None için null. |
| `sampleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir. |
| `excludedWithoutWorkCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Suggestionda pozitif recorded work olmadığı için dışlanan örnekler. |
| `excludedUnknownZoneCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Suggestionda frozen zone bilinmediği için dışlanan örnekler. |
| `suggestedSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | En az3uygun tamamlanmış actualın medianı; bulunamazsa null. |
| `unavailableReason` | null\|string | evet | — | Suggestion üretilememe kodu no_comparable_context/insufficient_samples; nullsa öneri var. |
| `method` | string | evet | — | Suggestion hesap yöntemi etiketi MedianCompletedComparableActual. |
| `applied` | boolean | evet | — | Proposalda nullable kabul sonucu; estimate önerisinde false bool. DTO bağlamı farklı. |
| `sampleLimit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Suggestion response Samples listesi üst sınırı20; medyana giren toplam örnek sınırı değildir. |
| `samples` | [EstimateSuggestionSample](DTO-Sozlugu.md#estimatesuggestionsample)[] | evet | — | Suggestion son20görünür örneği; SuggestedSeconds tüm uygun örneklerden gelir. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## FocusCommand

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `workSessionVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Focus komutunda bağlı gerçek çalışma sürümü de güncel olmalı. |
| `skipBreak` | boolean | hayır | default=false | next komutunda bitmemiş molayı açıkça atlama; varsayılan false. |

## FocusCurrent

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `session` | null / [FocusView](DTO-Sozlugu.md#focusview) | evet | — | Current focus içinde nullable aktif/paused/break döngü; WorkId ayrı alan. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `coverage` | null / [ReadCoverage](DTO-Sozlugu.md#readcoverage) | hayır | — | Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır. |

## FocusMetrics

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `activeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Effective aktif segment süresi; pause/mola hariç. |
| `overtimeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Aktif hedef üzerindeki gerçek süre; pause/mola tüketmez. |
| `activeCycleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Rapor kesiminde pozitif effective focus çalışması veren distinct cycle sayısı. |
| `startedCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | StartedAt rapor günlerine düşen focus cycle sayısı; actual0olabilir. |
| `finishedCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | EndedAt rapor kesiminde olan Finished focus sayısı; Interrupted dahil değil. |
| `effectiveTargetsReached` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Correction sonrası gerçek hedef instantı rapor kesimine düşen distinct focus cycle sayısı. |
| `recordedTargetsReached` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kalıcı tarihsel TargetReachedAt olayı raporda olan cycle sayısı. |
| `averageActiveSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor focus actual / distinct ActiveCycleCount; payda0ise null. |

## FocusPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [FocusView](DTO-Sozlugu.md#focusview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## FocusPresetPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [FocusPresetView](DTO-Sozlugu.md#focuspresetview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `builtIns` | [FocusSettings](DTO-Sozlugu.md#focussettings)[] | evet | — | 15/5,25/5,45/10settings önerileri; bunlar otomatik kayıtlı preset GUIDleri değildir. |

## FocusPresetRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `name` | string | evet | minLength=0; maxLength=100 | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `settings` | null / [FocusSettings](DTO-Sozlugu.md#focussettings) | evet | — | FocusSettings zorunlu; null400. Nullable wire unionuna rağmen Required validation uygulanır. |

## FocusPresetView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `name` | string | evet | — | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `settings` | [FocusSettings](DTO-Sozlugu.md#focussettings) | evet | — | Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## FocusSettings

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `workSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=1500 | Focus hedefi veya rapor actual değeri; DTO bağlamını izleyin, ikisini toplamayın. |
| `shortBreakSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=300 | Preset kısa mola hedefi; gerçek çalışma süresine eklenmez. |
| `longBreakSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=900 | Preset uzun mola hedefi; döngü sıklığı ayrı alandır. |
| `longBreakEvery` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=4 | Uzun mola döngü sıklığı1..20; varsayılan4. |
| `targetBehavior` | [FocusTargetBehavior](DTO-Sozlugu.md#focustargetbehavior) | hayır | — | ContinueTracking veya AutoBreak; bağımsız çelişen bool seti değildir. |
| `soundEnabled` | boolean | hayır | default=true | İlgili focus/bildirim ses tercihi; browser izin/otoplay ve global tercih ayrıca geçerlidir. |
| `notificationsEnabled` | boolean | hayır | default=true | Focus ayarındaki bildirim tercihi; global notification/provider izni ayrıca geçerlidir. |

## FocusStart

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `workSessionId` | null\|string (uuid) | hayır | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `workSessionVersion` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Focus komutunda bağlı gerçek çalışma sürümü de güncel olmalı. |
| `presetId` | null\|string (uuid) | hayır | — | Kayıtlı preset kimliği; özel settings ile birlikte verilmez. |
| `settings` | null / [FocusSettings](DTO-Sozlugu.md#focussettings) | hayır | — | Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir. |

## FocusState

Değerler: `Working`, `Paused`, `Break`, `AwaitingNext`, `Finished`, `Interrupted`.

## FocusTargetBehavior

Değerler: `ContinueTracking`, `AutoBreak`.

## FocusView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `workSessionId` | string (uuid) | evet | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `previousFocusId` | null\|string (uuid) | evet | — | Önceki döngü; next yeni focusId üretir, aynı workSessionId korunabilir. |
| `cycleNumber` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bir focus dizisindeki1tabanlı döngü numarası; uzun mola sıklığında kullanılır. |
| `state` | [FocusState](DTO-Sozlugu.md#focusstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `settings` | [FocusSettings](DTO-Sozlugu.md#focussettings) | evet | — | Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir. |
| `presetId` | null\|string (uuid) | evet | — | Kayıtlı preset kimliği; özel settings ile birlikte verilmez. |
| `presetName` | null\|string | evet | — | Focus başlangıcında yakalanmış preset adı. |
| `presetVersion` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Başlangıç preset sürümü; preset düzenlemesi eski focus ayarlarını değiştirmez. |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `workEndedAt` | null\|string (date-time) | evet | — | Bu focus döngüsünün çalışma kesimi sonu; tüm WorkSession bitişi olmayabilir. |
| `breakStartedAt` | null\|string (date-time) | evet | — | Planlı focus molasının başladığı instant. |
| `breakEndedAt` | null\|string (date-time) | evet | — | Molanın server tarafından bitmiş/atlanmış olarak kapandığı instant. |
| `endedAt` | null\|string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `targetReachedAt` | null\|string (date-time) | evet | — | Bir kez gözlemlenmiş hedef olayı; task completion veya work finish değildir. |
| `targetObservedAt` | null\|string (date-time) | evet | — | Hedefin server tarafından gözlendiği instant; matematiksel targetReachedAt farklı olabilir. |
| `targetEventId` | null\|string (uuid) | evet | — | Hedefe ulaşma olayının kalıcı kimliği; bir defalık bildirim/dedup bağlamı. |
| `activeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Yalnız bu focus döngüsünün effective çalışma kesişimi; WorkView tüm session actualını tekrar eklemeyin. |
| `remainingSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | max(0,workSeconds-activeSeconds); hedefin tükenmesi tamamlanma değildir. |
| `overtimeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Aktif hedef üzerindeki gerçek süre; pause/mola tüketmez. |
| `effectiveTargetReached` | boolean | evet | — | Düzeltilmiş güncel actual hedefe ulaşıyor mu; tarihsel olay korunabilir. |
| `breakTargetSeconds` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu döngüde kısa/uzun mola hedefi. |
| `breakElapsedSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Mola başlangıcından itibaren hesaplanan süre; actual çalışma değildir. |
| `breakRemainingSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Kalan mola hedefi; sıfırda otomatik sonraki çalışma başlamaz. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `workSessionVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Focus komutunda bağlı gerçek çalışma sürümü de güncel olmalı. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## ForgotPasswordRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `email` | string | evet | minLength=0; maxLength=320 | Hesap e-postası; kimlik eşleştirmede trim+uppercase normalizasyonu kullanılır. |

## ForgotPasswordResponse

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `message` | string | evet | — | Bilgilendirme/hata açıklaması; durum kararı için title/message parse etmeyin. |

## GapPolicy

Değerler: `Reject`, `Skip`, `ShiftForward`.

## GoogleRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `idToken` | string | evet | minLength=0; maxLength=20000 | Google sağlayıcı kanıtı; geliştirmede Google kapalıdır. |

## HistoricalTaskState

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `state` | null / [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `eventSequence` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Task olaylarının kendi iç sırası; task version veya global stream sequence değil. |
| `effectiveAt` | null\|string (date-time) | evet | — | Olay/revizyonun etkili olduğu instant; createdAt ile her zaman aynı olmayabilir. |
| `available` | boolean | evet | — | Tarihsel state/bağlam elde edilebildi; false veriyi güncel Task ile doldurma izni değil. |

## ImmediateWorkReceipt

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `session` | [WorkView](DTO-Sozlugu.md#workview) | evet | — | Current focus içinde nullable aktif/paused/break döngü; WorkId ayrı alan. |
| `pausedSession` | null / [WorkView](DTO-Sozlugu.md#workview) | evet | — | Acil geçişte gerçekten duraklatılan önceki oturum; yoksa null. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `taskIds` | string (uuid)[] | evet | — | Seçilen işler; motor container seçimini doğrudan iş bileşenlerine açar. |
| `resumed` | boolean | evet | — | Acil başlangıç yeni session yerine aynı taskın paused sessionına devam etti. |

## ImmediateWorkRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `expectedSessionId` | null\|string (uuid) | hayır | — | Acil kesilecek mevcut Running work kimliği; beklenmedik yeni oturumu kesmemek için. |
| `expectedSessionVersion` | null\|integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | ExpectedSessionId ile birlikte mevcut workün beklenen sürümü. |
| `remainingTaskIds` | null\|array | hayır | maxItems=1000 | Acil iş sonrası gün planında değerlendirilecek isteğe bağlı görev seçimi. |

## ImmediateWorkResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `work` | [ImmediateWorkReceipt](DTO-Sozlugu.md#immediateworkreceipt) | evet | — | ImmediateWorkResult gerçek başlangıç receiptı; plan sonucu başarısız olsa da bu gerçek korunur. |
| `plan` | null / [SchedulingPreviewView](DTO-Sozlugu.md#schedulingpreviewview) | evet | — | CalendarDayde plan sayfası, ImmediateWorkResultta nullable kalan-gün proposalı; DTO bağlamını ayırın. |
| `planningStatus` | string | evet | — | ImmediateWorkResult: Preview/Applied/NeedsPreview/Unavailable; work sonucu bunlardan bağımsız kalıcıdır. |
| `planningError` | null\|string | evet | — | Acil work başladıktan sonraki plan hatasının kodu; HTTP200içinde gelebilir. |
| `replayed` | boolean | evet | — | Özgün işlemin sonucu tekrar dönüyor; güncel ölçüm/sürüm olduğunun garantisi değil. |

## LastCompletionContext

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `completedAt` | string (date-time) | evet | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |
| `eventSequence` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Task olaylarının kendi iç sırası; task version veya global stream sequence değil. |

## LastWorkContext

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `workSessionId` | string (uuid) | evet | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `segmentId` | string (uuid) | evet | — | Kesintisiz gerçek çalışma aralığının kimliği. |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | null\|string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |

## LoginRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `email` | string | evet | minLength=0; maxLength=320 | Hesap e-postası; kimlik eşleştirmede trim+uppercase normalizasyonu kullanılır. |
| `password` | string | evet | — | Register en az6karakter; login mevcut parolayı aynen alır. Trim/karmaşıklık eklemeyin. |

## ManualWorkRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `reason` | string | evet | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## MaterializeRecurrence

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |

## MatrixCard

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `task` | [TaskPickerRow](DTO-Sozlugu.md#taskpickerrow) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |

## MatrixColumn

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `quadrant` | [MatrixQuadrant](DTO-Sozlugu.md#matrixquadrant) | evet | — | Matris alanı: Inbox ayrılmamış, Do önemli/acil, Schedule önemli/acil değil, Delegate önemli değil/acil, Eliminate önemli değil/acil değil. Görev önceliği veya durumu değildir. |
| `items` | [MatrixCard](DTO-Sozlugu.md#matrixcard)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## MatrixQuadrant

Değerler: `Inbox`, `Do`, `Schedule`, `Delegate`, `Eliminate`.

## MatrixRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `quadrant` | [MatrixQuadrant](DTO-Sozlugu.md#matrixquadrant) | evet | — | Matris alanı: Inbox ayrılmamış, Do önemli/acil, Schedule önemli/acil değil, Delegate önemli değil/acil, Eliminate önemli değil/acil değil. Görev önceliği veya durumu değildir. |
| `beforeTaskId` | null\|string (uuid) | hayır | — | Yumuşak ordering içinde önce gelmesi istenen source görev. |

## MatrixView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `columns` | [MatrixColumn](DTO-Sozlugu.md#matrixcolumn)[] | evet | — | Tek owner/snapshot sürümünden beş matris alanının bağımsız sayfaları; her alan kendi offset/limit/total değerini taşır. |

## MatrixWriteResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |

## MinuteRange

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `startMinute` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yerel gece yarısından itibaren dahil dakika,0..1439; endMinute değerinden küçük. |
| `endMinute` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yerel gece yarısından itibaren hariç dakika,1..1440;1440ertesi gün00:00. |

## MonthEndPolicy

Değerler: `Skip`, `ClampToLastDay`, `null`.

## MoveDayItemRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `targetDate` | string (date) | evet | — | Schedule move hedef yerel günü; StartsAt/EndsAt ile aynı gün bağlamına uymalı. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## MoveDayItemsRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [DayItemMoveEntryRequest](DTO-Sozlugu.md#dayitemmoveentryrequest)[] | evet | minItems=1; maxItems=50 | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `targetDate` | string (date) | evet | — | Schedule move hedef yerel günü; StartsAt/EndsAt ile aynı gün bağlamına uymalı. |

## MoveScheduleRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `targetDate` | string (date) | evet | — | Schedule move hedef yerel günü; StartsAt/EndsAt ile aynı gün bağlamına uymalı. |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `allowConflicts` | boolean | hayır | — | Manuel overlap uyarısını açık kabul; motorun çakışmasız sonucuyla aynı iddia değil. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## MoveTaskRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `parentTaskId` | null\|string (uuid) | hayır | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `parentVersion` | null\|integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Parent değişiklik yarışı için beklenen parent sürümü. |
| `beforeSiblingId` | null\|string (uuid) | hayır | — | Aynı hedef parent altındaki kardeşten önce konumlandır; null sona ekleme. |
| `parentWorkDisposition` | null / [ParentWorkDisposition](DTO-Sozlugu.md#parentworkdisposition) | hayır | — | PreserveDirect veya ConvertToContainer; doğrudan işi olan parenta çocuk ekleme/taşıma niyeti. |

## NamedResourcePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [NamedResourceView](DTO-Sozlugu.md#namedresourceview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `summaries` | null\|array | hayır | — | includeSummary=true ise sayfadaki her kayıt için özet; aksi halde null. Etiketlerde boş dizidir. |

## NamedResourceSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `resourceId` | string (uuid) | evet | — | Özetin ait olduğu kayıt. |
| `taskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Arşivlenmemiş bağlı görev sayısı; iş yükü ucuyla aynıdır. |
| `completedCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu görevlerden tamamlananların sayısı. |
| `openComponentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Açık iş bileşeni sayısı; iş yükü ucuyla aynıdır. |
| `knownEstimatedSeconds` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bilinen tahmin toplamı, saniye. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini olmayan iş sayısı; süre sıfır sayılmaz. |

## NamedResourceView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `name` | string | evet | — | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `description` | null\|string | evet | — | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `updatedAt` | string (date-time) | evet | — | Kaydın son güncellenme instantı. |
| `archivedAt` | null\|string (date-time) | evet | — | Soft arşiv instantı; null arşivlenmemiş. Geçmiş work/revision silinmez. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## NamedResourceWorkload

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `resourceId` | string (uuid) | evet | — | Workload sorgulanan proje/havuz/kategori/etiket kimliği. |
| `values` | [WorkloadForestSummary](DTO-Sozlugu.md#workloadforestsummary) | evet | — | İlgili komutun tam alan belgesi; PUTta yalnız değişen alanları göndermek güvenli değildir. |

## NamedSnapshot

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `name` | string | evet | — | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |

## NoteCategoryChange

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `name` | string | evet | — | 1–40 karakter, trim edilir; etkin kategoriler arasında benzersiz. |
| `color` | [NoteCategoryColor](DTO-Sozlugu.md#notecategorycolor) | evet | — | Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor). |
| `showInBar` | boolean | evet | — | Üst çubukta göster. |
| `pinInAll` | boolean | evet | — | Tümü görünümünde üstte sabitle. |
| `viewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Kategori görünümü Kartlar/Liste. |

## NoteCategoryColor

Değerler: `Gray`, `Blue`, `Teal`, `Green`, `Red`, `Pink`, `Purple`.

## NoteCategoryFields

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `name` | string | evet | — | 1–40 karakter, trim edilir; etkin kategoriler arasında benzersiz. |
| `color` | [NoteCategoryColor](DTO-Sozlugu.md#notecategorycolor) | evet | — | Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor). |
| `showInBar` | boolean | hayır | default=true | Varsayılan true. |
| `pinInAll` | boolean | hayır | default=false | Varsayılan false. |

## NoteCategoryList

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [NoteCategoryView](DTO-Sozlugu.md#notecategoryview)[] | evet | — | Önce etkin kategoriler kullanıcı sırasıyla, sonra kaldırılanlar en yeni kaldırılan önce. |
| `allViewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Tümü sistem görünümünün Kartlar/Liste tercihi. |
| `taskViewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Görev notları sistem görünümünün Kartlar/Liste tercihi. |
| `notesVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Notlar kaynak sürümü; kategori ve not yazıları artırır, NotesChanged canlı olayı yayınlanır. |

## NoteCategoryMove

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `beforeCategoryId` | null\|string (uuid) | evet | — | Hedef etkin kategorinin önüne taşır; null sona taşır. |

## NoteCategoryView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `name` | string | evet | — | Owner içinde etkin kategoriler arasında Türkçe büyük/küçük harf duyarsız benzersiz, 1–40 karakter. |
| `color` | [NoteCategoryColor](DTO-Sozlugu.md#notecategorycolor) | evet | — | Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor); gerçek renk istemcinin tema tokenıdır. |
| `showInBar` | boolean | evet | — | Notlar üst çubuğunda düğme olarak gösterilir; false olanlar Diğer menüsündedir. |
| `pinInAll` | boolean | evet | — | Tümü görünümünde bu kategorinin notları en üstte ayrı bölümdedir. |
| `viewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Kategori görünümünün kayıtlı Kartlar/Liste tercihi. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `updatedAt` | string (date-time) | evet | — | Kaydın son güncellenme instantı. |
| `removedAt` | null\|string (date-time) | evet | — | Doluysa kategori kaldırılmıştır: seçicide ve çubukta yoktur, notları bağını korur; restore ile döner. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## NoteConversion

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `poolId` | null\|string (uuid) | hayır | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `deadlineAt` | null\|string (date-time) | hayır | — | Görevin son teslim instantı; plan bloğu bitişinden ayrıdır. |

## NoteDisplay

Değerler: `Short`, `Detailed`, `Toggle`.

## NoteFields

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `kind` | [NoteKind](DTO-Sozlugu.md#notekind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `text` | string | evet | — | Not metni; trim sonrası1..10000karakter. |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `workSessionId` | null\|string (uuid) | hayır | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `localDate` | null\|string (date) | hayır | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `dueAt` | null\|string (date-time) | hayır | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `title` | null\|string | hayır | — | Yalnız Detailed/Toggle notta zorunlu, 1–200 karakter, trim edilir; Short notta null olmalıdır. |
| `categoryId` | null\|string (uuid) | hayır | — | Owner not kategorisi; null kategorisiz. Yazmada etkin kategori gerekir; kaldırılmış kategorideki notlar bağını korur. |
| `display` | [NoteDisplay](DTO-Sozlugu.md#notedisplay) | hayır | — | Short tek metin; Detailed listede başlık + pencere; Toggle listede başlık + yerinde açılan içerik. NextStep yalnız Short. |

## NoteKind

Değerler: `Task`, `Distraction`, `NextStep`, `Daily`, `General`.

## NotePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [NoteView](DTO-Sozlugu.md#noteview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## NoteSystemViews

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `allViewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Tümü görünümü Kartlar/Liste. |
| `taskViewMode` | [NoteViewMode](DTO-Sozlugu.md#noteviewmode) | evet | — | Görev notları görünümü Kartlar/Liste. |

## NoteView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `kind` | [NoteKind](DTO-Sozlugu.md#notekind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `text` | string | evet | — | Not metni; trim sonrası1..10000karakter. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `workSessionId` | null\|string (uuid) | evet | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `localDate` | null\|string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `dueAt` | null\|string (date-time) | evet | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `updatedAt` | string (date-time) | evet | — | Kaydın son güncellenme instantı. |
| `deletedAt` | null\|string (date-time) | evet | — | Soft silinmiş not instantı; silme200View yanıtında dolabilir. |
| `convertedTaskId` | null\|string (uuid) | evet | — | Notun dönüştürüldüğü mevcut görev; aynı notu tekrar çoğaltmayın. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `title` | null\|string | evet | — | Yalnız Detailed/Toggle notta zorunlu, 1–200 karakter, trim edilir; Short notta null olmalıdır. |
| `categoryId` | null\|string (uuid) | evet | — | Owner not kategorisi; null kategorisiz. Yazmada etkin kategori gerekir; kaldırılmış kategorideki notlar bağını korur. |
| `display` | [NoteDisplay](DTO-Sozlugu.md#notedisplay) | evet | — | Short tek metin; Detailed listede başlık + pencere; Toggle listede başlık + yerinde açılan içerik. NextStep yalnız Short. |
| `taskTitle` | null\|string | evet | — | Bağlı görevin güncel başlığı aynı okumada; görev yoksa null. Görev kopyası değildir. |

## NoteViewMode

Değerler: `Cards`, `List`.

## NotificationAlertPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `serverNow` | string (date-time) | evet | — | Bu okumanın UTC sunucu anı; frontend saatinin yerine tazelik referansı. Cursor üst sınırı ilk sayfanın kesimini korur. |
| `preferencesVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu sayfanın güncel owner notification preference sürümü; kayıt yoksa0. İstemci değişiklik gördüğünde yeni serverNow baseline kurar ve önceki tercih döneminin alarmlarını çalmaz; sayfalar arasında değişebilir. |
| `items` | [NotificationView](DTO-Sozlugu.md#notificationview)[] | evet | — | En çok limit adaydan güncel kaynak/tür/sessiz saat kontrollerini geçen Ready, okunmamış, gönderim zamanı son120sn içindeki alarmlar. Ses kapalı öğe soundEnabled=false ile kalır; boş sayfanın devamı olabilir. |
| `nextCursor` | null\|string | evet | — | Devam varsa owner ve ilk sayfanın asOf kesimiyle artan (dueAt,id) keyset pozisyonu; token/sır değildir. Her yeni gözlem turunda cursorsuz başla; stale/bozuk/yabancı imleç400. |

## NotificationIntentState

Değerler: `Pending`, `Obsolete`, `Ready`, `Suppressed`, `Expired`.

## NotificationPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [NotificationView](DTO-Sozlugu.md#notificationview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gelen kutusuna uygun Ready kayıtların toplamı; ScheduleStart/ScheduleEnd ve bekleyen/geçersiz/susturulmuş teknik kayıtlar dahil değildir. ReadAt okunmamış durumunu ayrı belirtir. |

## NotificationPreferencesView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `settings` | [NotificationSettings](DTO-Sozlugu.md#notificationsettings) | evet | — | Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## NotificationReceiptView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `kind` | string | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `sourceId` | string (uuid) | evet | — | Türüne göre task/event/revision/notification kimliği; her türde aynı kaynak varsayılmaz. |
| `readAt` | null\|string (date-time) | evet | — | Kullanıcının okundu işareti; null henüz işaretlenmedi. |
| `state` | [NotificationIntentState](DTO-Sozlugu.md#notificationintentstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `snoozeCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Aynı notificationId için açık erteleme sayacı; client/push dedup bağlamı. |

## NotificationSettings

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | hayır | default=true | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |
| `pushEnabled` | boolean | hayır | default=false | Kullanıcının push tercihi; server push-config ve OS izinleri ayrıca gerekir. |
| `soundEnabled` | boolean | hayır | default=true | İlgili focus/bildirim ses tercihi; browser izin/otoplay ve global tercih ayrıca geçerlidir. |
| `scheduleStart` | boolean | hayır | default=true | Plan bloğu başlangıç bildirim türünü açar. |
| `scheduleEnd` | boolean | hayır | default=true | Plan bloğu bitiş bildirim türünü açar. |
| `taskDeadline` | boolean | hayır | default=true | Görev deadline bildirim türünü açar. |
| `focusTarget` | boolean | hayır | default=true | Odak hedefe ulaşma bildirim türünü açar. |
| `breakEnd` | boolean | hayır | default=true | Odak molası bitiş bildirim türünü açar. |
| `returnToTask` | boolean | hayır | default=true | Normal paused işe dönüş bildirim türünü açar. |
| `custom` | boolean | hayır | default=true | Kullanıcının özel hatırlatma bildirim türünü açar. |
| `leadSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 | Bildirim ön zamanı0..86400sn; kaynak zamanından bir kez çıkarılır. |
| `snoozeSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=300 | Varsayılan erteleme60..86400sn; başlangıç300. |
| `quietStart` | null\|string (time) | hayır | — | Sessiz aralığın dahil yerel başlangıcı; quietEnd ile birlikte veya ikisi null. |
| `quietEnd` | null\|string (time) | hayır | — | Sessiz aralığın hariç sonu; quietStart ile eşit olamaz, geceyi geçebilir. |
| `returnAfterSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 | Pause sonrası dönüş hatırlatması0..86400sn;0kapalı. |
| `specialDay` | boolean | hayır | default=true | Özel gün hatırlatmalarına izin (varsayılan açık). |
| `pomodoroSound` | string | hayır | default="bell" | Pomodoro hedefi (FocusTarget) ve mola bitişi (BreakEnd) uygulama sesi. bell (varsayılan), marimba, digital, glass, pulse veya soft; null/geçersiz kimlik reddedilir. |
| `reminderSound` | string | hayır | default="marimba" | Custom, ReturnToTask, TaskDeadline, SpecialDay ve ScheduleStart uygulama sesi. bell, marimba (varsayılan), digital, glass, pulse veya soft. |
| `taskEndSound` | string | hayır | default="digital" | ScheduleEnd için uygulama sesi. bell, marimba, digital (varsayılan), glass, pulse veya soft. Planlanan sürenin dolması görevi tamamlamaz. |

## NotificationView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `kind` | string | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `sourceId` | string (uuid) | evet | — | Türüne göre task/event/revision/notification kimliği; her türde aynı kaynak varsayılmaz. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `dailyPlanId` | null\|string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `revisionId` | null\|string (uuid) | evet | — | Kabul edilmiş immutable tam plan sürümü; proposal kimliği değildir. |
| `occurredAt` | string (date-time) | evet | — | Kaynak olayın instantı; lead/NotBefore/ReadyAt teslim zamanından ayrıdır. |
| `readyAt` | null\|string (date-time) | evet | — | İlk in-app hazırlama zamanı; browser teslim/okundu kanıtı değildir. |
| `notBefore` | null\|string (date-time) | evet | — | Teslimin en erken değerlendirileceği instant; DND daha ileri taşıyabilir. |
| `readAt` | null\|string (date-time) | evet | — | Kullanıcının okundu işareti; null henüz işaretlenmedi. |
| `state` | [NotificationIntentState](DTO-Sozlugu.md#notificationintentstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `snoozeCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Aynı notificationId için açık erteleme sayacı; client/push dedup bağlamı. |
| `soundEnabled` | boolean | evet | — | İlgili focus/bildirim ses tercihi; browser izin/otoplay ve global tercih ayrıca geçerlidir. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `title` | null\|string | hayır | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `sound` | null\|string | hayır | — | Sunucunun bildirim türü ve güncel owner tercihlerinden seçtiği uygulama sesi kimliği: bell/marimba/digital/glass/pulse/soft. Genel ve odak ses politikası ayrıca soundEnabled/silent ile uygulanır. Eski yanıtta null/eksik alan legacy soft anlamına gelir; native sistem ses dosyası değildir. |

## OccurrencePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [OccurrenceView](DTO-Sozlugu.md#occurrenceview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## OccurrenceState

Değerler: `Materialized`, `Skipped`, `Canceled`.

## OccurrenceView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `templateId` | string (uuid) | evet | — | Occurrenceın bağlı olduğu recurrence template kimliği. |
| `originalDefinitionId` | string (uuid) | evet | — | Occurrence ilk üretildiğinde seçilen definition; korunur. |
| `appliedDefinitionId` | string (uuid) | evet | — | Son güvenli refreshte uygulanmış definition. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `originalTimeZoneId` | string | evet | — | Occurrence ilk üretim zoneu; güncel tercihle yeniden yazılmaz. |
| `originalDueTime` | null\|string (time) | evet | — | Occurrence özgün yerel deadline saati. |
| `originalDueAt` | null\|string (date-time) | evet | — | Occurrence özgün çözülmüş deadline instantı; deadline yoksa null. |
| `timeAdjusted` | boolean | evet | — | DST gap ShiftForward nedeniyle deadline ileri alındı. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `taskState` | null / [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | Occurrence/task snapshotındaki TaskState; TaskId olmayınca null olabilir. |
| `taskVersion` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu DTO bağlamındaki task sürümü; occurrence komutunda bağlı taskın güncel sürümü, snapshotta yakalanmış tarihsel sürüm. |
| `taskChangedSinceSync` | boolean | evet | — | Occurrence taskı son template sync sürümünden farklı; refresh korumasında kullanılır. |
| `state` | [OccurrenceState](DTO-Sozlugu.md#occurrencestate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `reason` | null\|string | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## OrderingRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `beforeTaskId` | string (uuid) | hayır | — | Yumuşak ordering içinde önce gelmesi istenen source görev. |

## OutboxPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [OutboxView](DTO-Sozlugu.md#outboxview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## OutboxState

Değerler: `Pending`, `Processing`, `Completed`, `Obsolete`, `Failed`.

## OutboxView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `kind` | string | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `sourceId` | string (uuid) | evet | — | Türüne göre task/event/revision/notification kimliği; her türde aynı kaynak varsayılmaz. |
| `sourceVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Event/reminder kaynak sürümü; NotificationReady’de snoozeCount bağlamı. |
| `state` | [OutboxState](DTO-Sozlugu.md#outboxstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `attempts` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kalıcı işin başarısız/deneme sayacı; DND ertelenmesi her zaman tüketmez. |
| `occurredAt` | string (date-time) | evet | — | Kaynak olayın instantı; lead/NotBefore/ReadyAt teslim zamanından ayrıdır. |
| `availableAt` | string (date-time) | evet | — | Outbox işinin tekrar denenebileceği en erken instant. |
| `leaseUntil` | null\|string (date-time) | evet | — | Worker tarafından alınmış iş kilidinin süre sınırı; owner UI yönetmez. |
| `lastErrorCode` | null\|string | evet | — | İşin son güvenli hata kodu; ham provider body/secret içermez. |
| `completedAt` | null\|string (date-time) | evet | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## OverlapPolicy

Değerler: `Reject`, `Earlier`, `Later`.

## ParentCompletionChoice

Değerler: `CompleteSubtree`, `ParentOnly`, `Cancel`, `null`.

## ParentWorkDisposition

Değerler: `PreserveDirect`, `ConvertToContainer`, `null`.

## PlanAnalyticsDay

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `date` | string (date) | evet | — | İlgili plan/destek/occurrence günü; YYYY-MM-DD. |
| `planTimeZoneId` | string | evet | — | Seçili historical planın frozen zoneu. |
| `dailyPlanId` | null\|string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `baselineRevisionId` | null\|string (uuid) | evet | — | İlk Work içeren kabul edilmiş plan referansı; oluşmadıysa null. |
| `currentRevisionId` | null\|string (uuid) | evet | — | Planın güncel kabul edilmiş revisionı; boş günde null. |
| `actualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi. |
| `baseline` | [PlanMetrics](DTO-Sozlugu.md#planmetrics) | evet | — | İlk Work içeren kabul edilmiş plan referansının metrikleri. |
| `current` | [PlanMetrics](DTO-Sozlugu.md#planmetrics) | evet | — | En son kabul edilmiş plan referansının metrikleri; baselineın yerine geçmez. |
| `revisionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili gün/rapor kapsamındaki kabul edilmiş revision sayısı. |
| `revisionReasons` | [RevisionReasonCount](DTO-Sozlugu.md#revisionreasoncount)[] | evet | — | Trigger+Reason bazında revision sayımları; tek reason stringi değildir. |
| `deferCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Rapor kesimindeki erteleme olay sayısı; atlanan/iptal iş tamamlanma değildir. |
| `deferReasons` | [DeferReasonCount](DTO-Sozlugu.md#deferreasoncount)[] | evet | — | Erteleme nedenleri ve neden kapsama sayımları. |

## PlanAnalyticsView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `actualTimeZonePolicy` | string | evet | — | Actual gruplama zone politikası; SourceSessionZone geçmişi bugünkü zonea taşımaz. |
| `startToleranceSeconds` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Erken/geç sayım toleransı0..3600sn; başlangıç60. |
| `actualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi. |
| `baseline` | [PlanMetrics](DTO-Sozlugu.md#planmetrics) | evet | — | İlk Work içeren kabul edilmiş plan referansının metrikleri. |
| `current` | [PlanMetrics](DTO-Sozlugu.md#planmetrics) | evet | — | En son kabul edilmiş plan referansının metrikleri; baselineın yerine geçmez. |
| `revisionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili gün/rapor kapsamındaki kabul edilmiş revision sayısı. |
| `deferCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Rapor kesimindeki erteleme olay sayısı; atlanan/iptal iş tamamlanma değildir. |
| `legacyZoneDeferCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Frozen zone bilgisi eksik erteleme olaylarının ayrı kapsam sayısı. |
| `days` | [PlanAnalyticsDay](DTO-Sozlugu.md#plananalyticsday)[] | evet | — | İstenen dahil tarih aralığındaki gün sonuçları; dağıtım ve rapor DTOları farklıdır. |

## PlanEntryResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `item` | [DayItemView](DTO-Sozlugu.md#dayitemview) | evet | — | İşlem sonucu dönen gün planı öğesi; görev tanımı veya gerçek çalışma kaydı değildir. |
| `replayed` | boolean | hayır | default=false | Özgün işlemin sonucu tekrar dönüyor; güncel ölçüm/sürüm olduğunun garantisi değil. |

## PlanEntryVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | Seçilen saatli veya saatsiz plan öğesinin kullanıcıya ait kimliği. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Güncel öğe sürümü; en az 1, eski pozitif sürümde 409. |

## PlanMetrics

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `plannedWorkSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Referans bloklardaki planlı Work süre toplamı; actual değildir. |
| `conflictingPlannedSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Ham Work blok toplamı ile Work aralık birleşimi arasındaki overlap farkı. |
| `componentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Plan referansına giren bağımsız iş bileşenlerinin sayısı. |
| `completedComponentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Referans bileşenlerden gerçekten completed olanların sayısı. |
| `unknownCompletionCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Referans taskın tarihsel completion/direct tanımı bilinmeyen component sayısı. |
| `countCompletion` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | CompletedComponentCount/ComponentCount; unknown history/boş payda/eksik snapshotta null. |
| `knownEstimatedSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez. |
| `knownCompletedEstimatedSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Completed referans componentlerin bilinen snapshot tahmin toplamı. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `estimateCoverage` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Bilinen tahminli referans component sayısı/componentCount; payda0ise null. |
| `durationCompletion` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | KnownCompletedEstimatedSeconds/KnownEstimatedSeconds; boş payda/unknown state/eksik snapshotta null. |
| `conflictingEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Aynı referans kümesinde bir task için farklı tahmin snapshotı sayacı. |
| `missingSnapshotBlockCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tarihsel iş snapshotı eksik referans plan blok sayısı. |
| `quotaSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Referans planda task için ayrılan süre kotası. |
| `quotaFulfilledSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Kotaya sayılan actualın kota ile sınırlandırılmış kısmı; task completion değildir. |
| `quotaRatio` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | QuotaFulfilledSeconds/QuotaSeconds; boş payda null. |
| `unplannedActualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | İlgili plan referansıyla kapsanmayan gerçek çalışma; yanlışlıkla0yapılmaz. |
| `accuracy` | [EstimateAccuracy](DTO-Sozlugu.md#estimateaccuracy) | evet | — | Tamamlanmış karşılaştırılabilir işlerin tahmin hatası örneklem/ortalama özeti. |
| `fixedStarts` | [DelayMetrics](DTO-Sozlugu.md#delaymetrics) | evet | — | Sabit blokların örneklemli başlangıç gecikmesi dağılımı. |
| `flexibleStarts` | [DelayMetrics](DTO-Sozlugu.md#delaymetrics) | evet | — | Esnek blokların örneklemli başlangıç gecikmesi dağılımı. |

## PlanMutation

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `changeSetId` | string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `schedules` | [ScheduleView](DTO-Sozlugu.md#scheduleview)[] | evet | — | Mutasyondan dönen etkilenen bloklar; günün bütün blokları olduğu varsayılmaz. |
| `revisionIds` | string (uuid)[] | evet | — | Aynı kabul/ChangeSet ile oluşan revision kimlikleri. |
| `warnings` | [PlanningWarning](DTO-Sozlugu.md#planningwarning)[] | evet | — | Başarılı200içindeki uyarılar; boş kapasite/koruma/tahmin farkı kaybolmaz. |

## PlanningPreferences

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `timeZoneId` | string | hayır | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `language` | string | hayır | — | CultureInfo tarafından tanınan dil; başlangıç tr. |
| `timeFormat` | string | hayır | — | 12h veya24h sunum tercihi; süre hesaplama kuralını değiştirmez. |
| `weekStartsOn` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | 0Pazar..6Cumartesi; başlangıç1Pazartesi. |
| `planningMode` | string | hayır | — | Preview veya Auto; /preview Auto tercihte de kabul edilmiş plan üretmez. |
| `parentCompletionPolicy` | string | hayır | — | Ask/CompleteSubtree/ParentOnly; parent complete seçiminde varsayılan. |
| `minimumSplitSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Otomatik parça alt sınırı1..86400sn; varsayılan900. Son kalan daha kısa olabilir. |
| `transitionSeconds` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Geçiş tamponu0..86400sn; başlangıç0, actual çalışma değildir. |
| `supportEnabled` | boolean | hayır | — | İsteğe bağlı DEHB destekleri; quick-start/rescue uygunluğunu etkiler. |
| `weekly` | [WeeklyWindow](DTO-Sozlugu.md#weeklywindow)[] | hayır | — | En çok70haftalık pencere; varsayılan boş,09–17varsayımı yok. |
| `exceptions` | [DateOverride](DTO-Sozlugu.md#dateoverride)[] | hayır | — | En çok366benzersiz tarih istisnası; o gün haftalık saatlerin yerine geçer. |
| `uiSupports` | [UiSupports](DTO-Sozlugu.md#uisupports) | hayır | — | UI-R3 hesap genelindeki arayüz destekleri; eski belgeler varsayılanlarla okunur. |

## PlanningTaskSnapshot

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `task` | [TaskAtStart](DTO-Sozlugu.md#taskatstart) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |
| `state` | [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `hasDirectWork` | boolean | evet | — | Görevin kendi fiziksel işi var; false container. Tahmin null olması false anlamına gelmez. |
| `directWorkCompleted` | boolean | evet | — | Bu görevin kendi iş bileşeni tamamlandı; altların veya tüm parentın tamamlanmasıyla aynı değil. |
| `requiredForParent` | boolean | evet | — | Üstün otomatik tamamlanmasında bu çocuk zorunlu mu. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil. |
| `targetBudgetSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Toplam hedef bütçe; direct/child formülüne eklenmez. |
| `priority` | object: Low, Normal, High, Urgent, null | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |

## PlanningWarning

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `code` | string | evet | — | Makineyle okunabilir hata/uyarı kodu; HTTP status ve DTO bağlamıyla değerlendirin. |
| `scheduleIds` | string (uuid)[] | evet | — | Uyarıya konu plan blok kimlikleri. |
| `seconds` | null\|number\|string (double) | hayır | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | İlgili uyarı/komutun saniye miktarı; snooze bağlamında60..86400. |

## PoolTaskVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | Havuzda bekletilecek kullanıcıya ait görev kimliği; tekrarlanamaz. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Görevin güncel sürümü (en az 1); eksik/0 için 400, farklı güncel sürümde 409. |

## PreferencesSnapshot

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `values` | [PlanningPreferences](DTO-Sozlugu.md#planningpreferences) | evet | — | İlgili komutun tam alan belgesi; PUTta yalnız değişen alanları göndermek güvenli değildir. |

## ProblemDetails

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `type` | null\|string | hayır | — | Delta türü veya ProblemDetails URI türü; DTOya göre farklıdır. |
| `title` | null\|string | hayır | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `status` | null\|integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Proposal için Pending/Applied/Expired; HTTP problemde sayısal status. DTO bağlamını izleyin. |
| `detail` | null\|string | hayır | — | Problem ayrıntısı; kullanıcıya gösterilecek sakin metin değildir. |
| `instance` | null\|string | hayır | — | Problem örneğinin yolu; kimlik veya sır içermez. |

## ProfileVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `expectedUserId` | string (uuid) | evet | — | İstemcinin me ile doğruladığı hesap kimliği; JWT sahibiyle eşleşmezse404. Yazı hedefini seçmez, cookie değişimi yarışını engeller. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## ProfileView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `user` | [UserSummary](DTO-Sozlugu.md#usersummary) | evet | — | Doğrulanmış hesabın id/email/displayName özeti. |
| `photoUploadEnabled` | boolean | evet | — | Sunucuda Cloudinary yapılandırması etkin ve doğrulanmışsa true; yalnız fotoğraf yükleme kullanılabilirliğidir. |
| `firstName` | string | evet | — | Profil adı; trim sonrası1..50karakter. Eski kayıtta görünen adın tamamı, e-postaya eşitse boş. |
| `lastName` | string | evet | — | İsteğe bağlı soyad; trim sonrası0..50karakter. Boşsa displayName yalnız addır. |

## PushConfiguration

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |
| `publicKey` | null\|string | evet | — | Push açıkken VAPID public key; sunucu JWT keysi değildir, kapalıysa null. |

## QuickStartRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `workSessionId` | null\|string (uuid) | hayır | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `workSessionVersion` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Focus komutunda bağlı gerçek çalışma sürümü de güncel olmalı. |

## ReadAllNotificationsResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `readCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu owner için o anda Ready ve okunmamış olup okundu yapılan kayıt sayısı. |
| `readAt` | string (date-time) | evet | — | Sunucudaki toplu okuma zamanı; sonraki Ready kayıtlar ve Pending hatırlatmalar etkilenmez. |

## ReadCoverage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `versions` | [DayReadVersions](DTO-Sozlugu.md#dayreadversions) | evet | — | Bu yanıtla aynı PostgreSQL snapshot/owner transaction sınırındaki planning, notes ve specialDays sayaçları. |
| `serverNow` | string (date-time) | evet | — | Bu okumanın backend zaman referansı; sürüm eşitliğinin yanında kısa tazelik bütçesiyle kullanılır, aktif süreyi dondurmak için kullanılamaz. |

## RecurrenceAnalyticsDay

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `class` | [RecurrenceDayClass](DTO-Sozlugu.md#recurrencedayclass) | evet | — | Günün tek analiz sınıfı; tanımı RecurrenceCounts alanlarıyla aynıdır. |

## RecurrenceAnalyticsDetail

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `templateId` | string (uuid) | evet | — | Occurrenceın bağlı olduğu recurrence template kimliği. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `today` | string (date) | evet | — | Rutinin güncel saat dilimindeki bugün. |
| `days` | [RecurrenceAnalyticsDay](DTO-Sozlugu.md#recurrenceanalyticsday)[] | evet | — | Son6 takvim ayı. |
| `weekdays` | [RecurrenceWeekday](DTO-Sozlugu.md#recurrenceweekday)[] | evet | — | Son26 hafta; görevi olan günler, 0=Pazar. |
| `recent` | [RecurrenceCounts](DTO-Sozlugu.md#recurrencecounts) | evet | — | Bugünle biten28 gün. |
| `prior` | [RecurrenceCounts](DTO-Sozlugu.md#recurrencecounts) | evet | — | Ondan önceki28 gün. |
| `longestRun` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Son365 günde üst üste yapılan en uzun görev dizisi; atlanan ve oluşmayan gün kesmez. |
| `work` | [RecurrenceWorkSummary](DTO-Sozlugu.md#recurrenceworksummary) | evet | — | Son365 günde yapılan görevlerin gerçek süre özeti. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## RecurrenceAnalyticsItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `templateId` | string (uuid) | evet | — | Occurrenceın bağlı olduğu recurrence template kimliği. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `counts` | [RecurrenceCounts](DTO-Sozlugu.md#recurrencecounts) | evet | — | Seçili dönemin sınıf sayıları. |
| `weeks` | [RecurrenceWeek](DTO-Sozlugu.md#recurrenceweek)[] | evet | — | Bugünün haftasıyla biten son12 hafta; seçili dönemden bağımsızdır, hafta başlangıcı tercihtir. |

## RecurrenceAnalyticsView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `compareFromDate` | null\|string (date) | evet | — | İstekte verilen karşılaştırma başlangıcı; yoksa null. |
| `compareToDate` | null\|string (date) | evet | — | İstekte verilen karşılaştırma bitişi; yoksa null. |
| `weekStartsOn` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | 0Pazar..6Cumartesi; başlangıç1Pazartesi. |
| `minimumSamples` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu sayının altında yüzde gösterilmez. |
| `activeCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Dönemde sonucu belli veya bugün bekleyen görevi olan rutin sayısı. |
| `totals` | [RecurrenceCounts](DTO-Sozlugu.md#recurrencecounts) | evet | — | Bütün raporun server tarafından tekilleştirilmiş metrikleri. |
| `compare` | null / [RecurrenceCounts](DTO-Sozlugu.md#recurrencecounts) | evet | — | compareFromDate/compareToDate verildiyse aynı hesap; verilmediyse null. |
| `items` | [RecurrenceAnalyticsItem](DTO-Sozlugu.md#recurrenceanalyticsitem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## RecurrenceCounts

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `onTime` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Görev, oluşum gününün sonunda tamamlanmıştı; sonradan yeniden açılması bunu değiştirmez. |
| `late` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gün sonunda açıktı, serverNow anına kadar tamamlandı. |
| `notDone` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Günü geçti, görev açık veya ertelenmiş. |
| `todayPending` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bugünkü açık görev; orana girmez. |
| `skipped` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kullanıcı atladı/iptal etti veya görev silindi; orana girmez. |
| `notGenerated` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kurala göre rutin günü, kullanıcıya görev oluşmadı; orana girmez. |
| `completed` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | onTime + late. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | completed + notDone; yalnız sonucu belli görevler. |
| `consistency` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | completed / total; payda0 ise null. Örnek sınırı minimumSamples ile UI tarafından uygulanır. |

## RecurrenceCreate

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `task` | [RecurringTaskDefaults](DTO-Sozlugu.md#recurringtaskdefaults) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |

## RecurrenceDayClass

Değerler: `OnTime`, `Late`, `NotDone`, `TodayPending`, `Skipped`, `NotGenerated`.

## RecurrenceDefinitionPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [RecurrenceDefinitionView](DTO-Sozlugu.md#recurrencedefinitionview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## RecurrenceDefinitionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `number` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili gün/seri içindeki artan revision/definition numarası. |
| `effectiveFrom` | string (date) | evet | — | Yeni definitionın uygulanmaya başlayacağı yerel gün; seri update geçmişi korur. |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `task` | [RecurringTaskDefaults](DTO-Sozlugu.md#recurringtaskdefaults) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |

## RecurrenceEffect

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `template` | [RecurrenceTemplateView](DTO-Sozlugu.md#recurrencetemplateview) | evet | — | Recurrence mutasyonu sonrası template özeti. |
| `occurrences` | [OccurrenceView](DTO-Sozlugu.md#occurrenceview)[] | evet | — | Bu mutasyonun etkilediği occurrence sonuçları; tüm seri sanmayın. |
| `refreshedTaskIds` | string (uuid)[] | evet | — | Seri update sırasında gerçekten yenilenmiş görevler. |
| `protectedTaskIds` | string (uuid)[] | evet | — | Geçmiş/çalışılmış/planlı/manuel değiştirilmiş olduğu için yenilenmemiş görevler. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `replayed` | boolean | hayır | default=false | Özgün işlemin sonucu tekrar dönüyor; güncel ölçüm/sürüm olduğunun garantisi değil. |
| `retractedDayItemCount` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=0 | Seri değişikliğinin yarından sonraki gün planlarından çektiği, kullanıcının dokunmadığı öğe sayısı. |

## RecurrenceEnableRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |

## RecurrenceFrequency

Değerler: `Daily`, `IntervalDays`, `Weekly`, `Monthly`.

## RecurrenceProjectionItem

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `templateId` | string (uuid) | evet | — | Occurrenceın bağlı olduğu recurrence template kimliği. |
| `templateVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Materialize ve skip için gönderilecek güncel şablon sürümü. |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `startTime` | null\|string (time) | evet | — | UI-R4: son teslimden ayrı yerel başlangıç saati; dakika hassasiyeti. |
| `estimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir. |

## RecurrenceProjectionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `items` | [RecurrenceProjectionItem](DTO-Sozlugu.md#recurrenceprojectionitem)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |

## RecurrenceRule

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `startDate` | string (date) | evet | — | Tekrar dizisinin dahil başlangıç tarihi. |
| `timeZoneId` | string | hayır | default="Europe/Istanbul" | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `frequency` | [RecurrenceFrequency](DTO-Sozlugu.md#recurrencefrequency) | hayır | — | Daily/IntervalDays/Weekly/Monthly; alan kombinasyonları Entegrasyon-Kurallari içinde. |
| `interval` | integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=1 | Frequency bazında tekrar aralığı; Daily1,IntervalDays1..366,Weekly1..52,Monthly1..24. |
| `weekDays` | null\|array | hayır | — | Weekly için1..7benzersiz gün0..6; diğer sıklıklarda boş/null. |
| `monthDay` | null\|integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Monthly günü1..31;29..31için monthEnd açık seçilir. |
| `monthEnd` | null / [MonthEndPolicy](DTO-Sozlugu.md#monthendpolicy) | hayır | — | Skip veya ClampToLastDay; Monthly dışındaki sıklıklarda null. |
| `untilDate` | null\|string (date) | hayır | — | Opsiyonel dahil seri bitişi; startDate öncesi olamaz. |
| `dueTime` | null\|string (time) | hayır | — | Serinin yerel deadline saati; dakika hassasiyeti, plan bloğu değildir. |
| `gap` | [GapPolicy](DTO-Sozlugu.md#gappolicy) | hayır | — | Olmayan yerel DST saati: Reject/Skip/ShiftForward. |
| `overlap` | [OverlapPolicy](DTO-Sozlugu.md#overlappolicy) | hayır | — | İki kez oluşan yerel saat: Reject/Earlier/Later. |
| `startTime` | null\|string (time) | hayır | — | UI-R4: son teslimden ayrı yerel başlangıç saati; dakika hassasiyeti. |
| `autoAddToPlan` | boolean | hayır | default=false | UI-R4: sunucu occurrence üretiminde gün planına ekleme tercihi; eski tanımlarda false. Açıkken gerçek kayıt penceresi bugün+30 gündür, kapalıyken bugün+7. |

## RecurrenceTemplatePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [RecurrenceTemplateView](DTO-Sozlugu.md#recurrencetemplateview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## RecurrenceTemplateView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Template version; occurrence skip/cancel body version da template sürümüdür. |
| `definitionId` | string (uuid) | evet | — | Template yanıtında seçilmiş/güncel immutable definition kimliği. |
| `definitionNumber` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Template definitionının artan numarası. |
| `effectiveFrom` | string (date) | evet | — | Yeni definitionın uygulanmaya başlayacağı yerel gün; seri update geçmişi korur. |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `task` | [RecurringTaskDefaults](DTO-Sozlugu.md#recurringtaskdefaults) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |

## RecurrenceUpdate

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `effectiveFrom` | string (date) | evet | — | Yeni definitionın uygulanmaya başlayacağı yerel gün; seri update geçmişi korur. |
| `rule` | [RecurrenceRule](DTO-Sozlugu.md#recurrencerule) | evet | — | Tam recurrence kuralı; şablon definition içinde immutable snapshot. |
| `task` | [RecurringTaskDefaults](DTO-Sozlugu.md#recurringtaskdefaults) | evet | — | DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler. |
| `refreshExisting` | boolean | hayır | default=false | Mevcut uygun occurrence görevlerini bounded pencerede yenileme açık niyeti. |
| `refreshThrough` | null\|string (date) | hayır | — | RefreshExisting true ise zorunlu dahil son tarih; false ise verilmez. |

## RecurrenceWeek

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `weekStart` | string (date) | evet | — | Haftanın ilk yerel günü; WeekStartsOn tercihine göre. |
| `completed` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Haftada yapılan görev sayısı (onTime + late). |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Haftada sonucu belli görev; 0 ise o hafta görev yoktur. |

## RecurrenceWeekday

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `weekDay` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | 0=Pazar … 6=Cumartesi. |
| `completed` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu gün yapılan görev sayısı. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu gün sonucu belli görev sayısı. |

## RecurrenceWorkSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `totalSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Yapılan görevlerin effective gerçek çalışma toplamı. |
| `sampleCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir. |
| `averageSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | totalSeconds / sampleCount; örnek yoksa null. |
| `excludedWithoutWorkCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Suggestionda pozitif recorded work olmadığı için dışlanan örnekler. |
| `estimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir. |

## RecurringTaskDefaults

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `description` | null\|string | hayır | — | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `estimatedSeconds` | null\|integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `canSplit` | boolean | hayır | default=true | Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez. |
| `poolId` | null\|string (uuid) | hayır | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |

## RegisterRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `email` | string | evet | minLength=0; maxLength=320 | Hesap e-postası; kimlik eşleştirmede trim+uppercase normalizasyonu kullanılır. |
| `password` | string | evet | minLength=6 | Register en az6karakter; login mevcut parolayı aynen alır. Trim/karmaşıklık eklemeyin. |
| `displayName` | null\|string | hayır | minLength=0; maxLength=100 | Register alanı isteğe bağlı; boş/null ise trim edilmiş e-postanın tamamı kullanılır. |

## RegisterSubscription

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `endpoint` | string | evet | — | Browser PushSubscription endpointi; frontend üretmez, listede geri verilmez. |
| `p256dh` | string | evet | — | Browser subscription public key; URL-safe base64, sunucu VAPID publicKey alanından farklı. |
| `auth` | string | evet | — | Browser subscription auth secret; JWT değildir, listede geri verilmez. |
| `label` | string | hayır | default="" | Subscription için en çok100karakter cihaz etiketi; analizde ise grup etiketi. |
| `expiresAt` | null\|string (date-time) | hayır | — | Proposal için2dkgeçerlilik; subscription için opsiyonel browser bitişi. DTO bağlamını ayırın. |

## ReminderKind

Değerler: `ScheduleStart`, `ScheduleEnd`, `TaskDeadline`.

## ReminderPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [ReminderView](DTO-Sozlugu.md#reminderview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## ReminderRepeat

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `timeZoneId` | string | evet | — | Tekrarın kayıt sırasında sabitlenen IANA saat dilimi. |
| `localTime` | string (time) | evet | — | Her seçili günde aynı yerel saat; yalnız dakika hassasiyeti. DST boşluğunda ilk geçerli dakika, tekrarlanan saatte sonraki oluşum. |
| `weekDays` | integer\|string (int32)[] | evet | — | 0=Pazar, 1=Pazartesi..6=Cumartesi; farklı en az bir gün. |

## ReminderState

Değerler: `Pending`, `Ready`, `Obsolete`, `Expired`.

## ReminderView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `kind` | [ReminderKind](DTO-Sozlugu.md#reminderkind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `sourceId` | string (uuid) | evet | — | Türüne göre task/event/revision/notification kimliği; her türde aynı kaynak varsayılmaz. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `dailyPlanId` | null\|string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `revisionId` | null\|string (uuid) | evet | — | Kabul edilmiş immutable tam plan sürümü; proposal kimliği değildir. |
| `dueAt` | string (date-time) | evet | — | Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı. |
| `state` | [ReminderState](DTO-Sozlugu.md#reminderstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `handledAt` | null\|string (date-time) | evet | — | İlgili kalıcı iş/hatırlatma işlendi instantı; browser teslim kanıtı değil. |

## RemoveScheduleRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## ResetPasswordRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `token` | string | evet | minLength=64; maxLength=64 | Yalnız parola sıfırlama kodu; uygulama JWT değildir,64karakter/30dk/tek kullanım. |
| `newPassword` | string | evet | minLength=6 | Reset sonrası parola; en az6karakter. Eski JWT kopyalarını iptal etmez. |

## ResourceFieldsRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `name` | string | evet | minLength=0; maxLength=200 | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `description` | null\|string | hayır | minLength=0; maxLength=10000 | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |

## ResourceVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## ReturnContext

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `lastWork` | null / [LastWorkContext](DTO-Sozlugu.md#lastworkcontext) | evet | — | Gerçekte son çalışılan görev/segment bağlamı; nullsa veri yok. |
| `lastNote` | null / [NoteView](DTO-Sozlugu.md#noteview) | evet | — | Geri dönüş bağlamındaki son not; yoksa null. |
| `nextStepNote` | null / [NoteView](DTO-Sozlugu.md#noteview) | evet | — | İşe dönüş için seçilmiş NextStep notu; yoksa null. |
| `lastCompletion` | null / [LastCompletionContext](DTO-Sozlugu.md#lastcompletioncontext) | evet | — | Gerçek en son tamamlanan alt adım ve olay sırası. |
| `suggestedStep` | null / [TaskView](DTO-Sozlugu.md#taskview) | evet | — | Backendin önerdiği uygun küçük görev; kendiliğinden başlatılmaz. |
| `openDirectTaskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Dönüş bağlamındaki açık bağımsız iş sayısı. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## ReturnManyToPoolRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `tasks` | [PoolTaskVersionRequest](DTO-Sozlugu.md#pooltaskversionrequest)[] | evet | minItems=1; maxItems=50 | 1–50 farklı görevin kimliği ve güncel sürümü; tek transaction, herhangi birinde uyuşmazlık varsa hiçbir görev değişmez. |
| `poolId` | string (uuid) | evet | — | Kullanıcının arşivlenmemiş hedef havuzu; görevlerin kendi havuz bağı değiştirilir, çocukların bağı değiştirilmez. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | maxLength=500 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## ReturnToPoolRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `poolId` | string (uuid) | evet | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## RevisionChangePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [RevisionChangeView](DTO-Sozlugu.md#revisionchangeview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## RevisionChangeView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `scheduleId` | null\|string (uuid) | evet | — | Plan bloğu kimliği; work start bağlamı için scheduleVersion da gerekebilir. |
| `type` | string | evet | — | Delta türü veya ProblemDetails URI türü; DTOya göre farklıdır. |
| `before` | null / [ScheduleView](DTO-Sozlugu.md#scheduleview) | evet | — | Değişiklik öncesi snapshot; yeni kayıtta null olabilir. |
| `after` | null / [ScheduleView](DTO-Sozlugu.md#scheduleview) | evet | — | Değişiklik sonrası snapshot; kaldırmada null olabilir. |
| `conflictsAccepted` | boolean | evet | — | Bu delta manuel çakışma kabulüyle kaydedilmiş. |
| `dayItemId` | null\|string (uuid) | hayır | — | Değişikliğin hedefi olan saatsiz gün öğesi; saatli blok değişikliğinde null (tam olarak biri dolu). |
| `dayItemBefore` | null / [DayItemSnapshot](DTO-Sozlugu.md#dayitemsnapshot) | hayır | — | Saatsiz gün öğesinin değişiklik öncesi anlık görüntüsü; ekleme veya saatli değişiklikte null. |
| `dayItemAfter` | null / [DayItemSnapshot](DTO-Sozlugu.md#dayitemsnapshot) | hayır | — | Saatsiz gün öğesinin değişiklik sonrası anlık görüntüsü; saatli değişiklikte null. |

## RevisionItemPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [RevisionItemView](DTO-Sozlugu.md#revisionitemview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## RevisionItemView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `revisionId` | string (uuid) | evet | — | Kabul edilmiş immutable tam plan sürümü; proposal kimliği değildir. |
| `schedule` | [ScheduleView](DTO-Sozlugu.md#scheduleview) | evet | — | Kalıcı/günsel revision bağlamındaki blok snapshotı. |

## RevisionPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [RevisionView](DTO-Sozlugu.md#revisionview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## RevisionReasonCount

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `trigger` | string | evet | — | Revizyonun/olayın tetikleyici türü; kullanıcı reason metninden ayrıdır. |
| `reason` | string | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |
| `count` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili trigger/reason grubunun kayıt sayısı; toplam task sayısı değildir. |

## RevisionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `dailyPlanId` | string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `number` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili gün/seri içindeki artan revision/definition numarası. |
| `previousRevisionId` | null\|string (uuid) | evet | — | Aynı günün önceki kabul edilmiş sürümü. |
| `changeSetId` | string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `trigger` | string | evet | — | Revizyonun/olayın tetikleyici türü; kullanıcı reason metninden ayrıdır. |
| `reason` | string | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `effectiveAt` | string (date-time) | evet | — | Olay/revizyonun etkili olduğu instant; createdAt ile her zaman aynı olmayabilir. |
| `algorithmVersion` | string | evet | — | Öneri/revision üreten algoritmanın sürüm etiketi. |
| `snapshotSchemaVersion` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Immutable revision içerik şema sürümü. |
| `reversesChangeSetId` | null\|string (uuid) | hayır | — | Telafi/undo ile ters etkisi hesaplanan eski grup. |

## RunningTaskContext

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | Bu owner çalışan oturumunun bağlı görev kimliği. |
| `hasDirectWork` | boolean | evet | — | Kendi işi olan görev bağlamı; konteyner toplamı yerine kullanılamaz. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Çalışan görevin kendi iş tahmini; null bilinmeyendir ve sıfıra dönüştürülmez. |

## ScheduleCompletion

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `schedules` | [ScheduleView](DTO-Sozlugu.md#scheduleview)[] | evet | — | Mutasyondan dönen etkilenen bloklar; günün bütün blokları olduğu varsayılmaz. |

## ScheduleDifference

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `type` | string | evet | — | Delta türü veya ProblemDetails URI türü; DTOya göre farklıdır. |
| `scheduleId` | null\|string (uuid) | evet | — | Plan bloğu kimliği; work start bağlamı için scheduleVersion da gerekebilir. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `before` | null / [ScheduleView](DTO-Sozlugu.md#scheduleview) | evet | — | Değişiklik öncesi snapshot; yeni kayıtta null olabilir. |
| `after` | null / [SchedulingBlock](DTO-Sozlugu.md#schedulingblock) | evet | — | Değişiklik sonrası snapshot; kaldırmada null olabilir. |

## ScheduleKind

Değerler: `Work`, `Break`, `Buffer`.

## SchedulePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [ScheduleView](DTO-Sozlugu.md#scheduleview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## ScheduleState

Değerler: `Planned`, `Removed`.

## ScheduleView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `dailyPlanId` | string (uuid) | evet | — | Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `kind` | [ScheduleKind](DTO-Sozlugu.md#schedulekind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `state` | [ScheduleState](DTO-Sozlugu.md#schedulestate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isFixed` | boolean | evet | — | Motorun yerini koruyacağı sabit blok. |
| `isLocked` | boolean | evet | — | Kullanıcının koruduğu blok; değiştirme için açık niyet gerekir. |
| `splitGroupId` | null\|string (uuid) | evet | — | Bölünmüş plan parçalarının ortak soy/grup kimliği; yeni task kimliği değildir. |
| `originScheduleId` | null\|string (uuid) | evet | — | Parçanın türediği önceki kalıcı blok kimliği. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `taskSnapshot` | null / [PlanningTaskSnapshot](DTO-Sozlugu.md#planningtasksnapshot) | evet | — | Blok oluşturulduğundaki görev/iş tanımı; bugünkü Task ile üzerine yazmayın. |
| `isAutomatic` | boolean | hayır | default=false | Blok motor tarafından üretilmiş; fixed/locked veya actual anlamına gelmez. |
| `completedAt` | null\|string (date-time) | hayır | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |

## SchedulingApplyResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `proposalId` | string (uuid) | evet | — | Henüz kabul edilmemiş öneri kimliği; apply aynı snapshot dayanağını tekrar doğrular. |
| `changeSetId` | null\|string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `revisionIds` | string (uuid)[] | evet | — | Aynı kabul/ChangeSet ile oluşan revision kimlikleri. |
| `noChanges` | boolean | evet | — | Apply kabul edildi fakat yeni plan farkı üretilmedi; changeSetId null/revisionIds boş olabilir. |

## SchedulingBlock

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `existingScheduleId` | null\|string (uuid) | evet | — | Proposal bloğunun mevcut kalıcı schedule ile bağı; yeni blokta null olabilir. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `kind` | [ScheduleKind](DTO-Sozlugu.md#schedulekind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isFixed` | boolean | hayır | default=false | Motorun yerini koruyacağı sabit blok. |
| `isLocked` | boolean | hayır | default=false | Kullanıcının koruduğu blok; değiştirme için açık niyet gerekir. |
| `isActive` | boolean | hayır | default=false | Motor bloğunda aktif gerçek çalışma koruması. |
| `isPreserved` | boolean | hayır | default=false | Öneri oluşturulurken mevcut yerleşimin korunduğunu gösterir. |
| `isAutomatic` | boolean | hayır | default=false | Blok motor tarafından üretilmiş; fixed/locked veya actual anlamına gelmez. |

## SchedulingMessage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `code` | string | evet | — | Makineyle okunabilir hata/uyarı kodu; HTTP status ve DTO bağlamıyla değerlendirin. |
| `taskId` | null\|string (uuid) | hayır | — | İlgili görev kimliği (owner kapsamında). |
| `seconds` | null\|number\|string (double) | hayır | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | İlgili uyarı/komutun saniye miktarı; snooze bağlamında60..86400. |
| `scheduleId` | null\|string (uuid) | hayır | — | Plan bloğu kimliği; work start bağlamı için scheduleVersion da gerekebilir. |

## SchedulingPreviewView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `proposalId` | string (uuid) | evet | — | Henüz kabul edilmemiş öneri kimliği; apply aynı snapshot dayanağını tekrar doğrular. |
| `inputVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Proposalın dayandığı owner planningVersion; güncel entity version değildir. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `expiresAt` | string (date-time) | evet | — | Snapshot serverNow+2dk. Aynı key replay süresini uzatmaz; Expired veya stale ise yeni preview. |
| `anchorAt` | string (date-time) | evet | — | Öneri zaman alt sınırı/koruma bağlamı; istemci şimdi saatinden yeniden üretmeyin. |
| `planningMode` | string | evet | — | Preview veya Auto; /preview Auto tercihte de kabul edilmiş plan üretmez. |
| `algorithmVersion` | string | evet | — | Öneri/revision üreten algoritmanın sürüm etiketi. |
| `hasConstraintConflicts` | boolean | evet | — | Öneride hard kısıt çatışması var; apply engeli. |
| `canApply` | boolean | evet | — | Hard kısıtlar açısından apply imkânı; stale/time doğrulaması apply’da yeniden yapılır. |
| `status` | string | evet | — | Proposal için Pending/Applied/Expired; HTTP problemde sayısal status. DTO bağlamını izleyin. |
| `blocks` | [SchedulingBlock](DTO-Sozlugu.md#schedulingblock)[] | evet | — | Önerinin plan blokları; apply edilmeden accepted schedule değildir. |
| `changes` | [ScheduleDifference](DTO-Sozlugu.md#scheduledifference)[] | evet | — | Önceki/sonraki blok farkları; tam revision snapshotının yerine geçmez. |
| `unplaced` | [UnplacedWork](DTO-Sozlugu.md#unplacedwork)[] | evet | — | Yerleşemeyen gerçek iş/miktar ve nedeni; sessiz başka güne taşıma değildir. |
| `warnings` | [SchedulingMessage](DTO-Sozlugu.md#schedulingmessage)[] | evet | — | Başarılı200içindeki uyarılar; boş kapasite/koruma/tahmin farkı kaybolmaz. |
| `explanations` | [SchedulingMessage](DTO-Sozlugu.md#schedulingmessage)[] | evet | — | Motorun yerleşim kararlarına ilişkin açıklamalar. |
| `applied` | null / [SchedulingApplyResult](DTO-Sozlugu.md#schedulingapplyresult) | hayır | — | Proposalda nullable kabul sonucu; estimate önerisinde false bool. DTO bağlamı farklı. |
| `reversesChangeSetId` | null\|string (uuid) | hayır | — | Telafi/undo ile ters etkisi hesaplanan eski grup. |
| `isPartial` | boolean | hayır | default=false | Undo telafisinin kısmi olması; normal kapasite açığı Unplaced içinde. |

## SchedulingRequestDto

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `date` | string (date) | evet | — | İlgili plan/destek/occurrence günü; YYYY-MM-DD. |
| `taskIds` | string (uuid)[] | evet | minItems=1; maxItems=1000 | Seçilen işler; motor container seçimini doğrudan iş bileşenlerine açar. |
| `expectedPlanningVersion` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `newWorkNotBefore` | null\|string (date-time) | hayır | — | Yeni otomatik blokların alt sınırı; varsayılan now+30sn yukarı dakikaya yuvarlanır. |

## SegmentPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [SegmentView](DTO-Sozlugu.md#segmentview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## SegmentView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | null\|string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `isVoided` | boolean | evet | — | Effective actual hesabından çıkarılmış segment; audit kaydı silinmez. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## SessionAudit

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | null\|string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `state` | [WorkState](DTO-Sozlugu.md#workstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## SnoozeNotification

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `seconds` | null\|integer\|string (int32) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili uyarı/komutun saniye miktarı; snooze bağlamında60..86400. |

## SpecialDayKind

Değerler: `Birthday`, `Anniversary`, `Holiday`, `Other`.

## SpecialDayOccurrence

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `specialDayId` | string (uuid) | evet | — | Oluşumun ait olduğu özel gün. |
| `date` | string (date) | evet | — | İlgili plan/destek/occurrence günü; YYYY-MM-DD. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `kind` | [SpecialDayKind](DTO-Sozlugu.md#specialdaykind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `nonWorking` | boolean | evet | — | Çalışma dışı: o günün çalışma saatleri boşalır, açık tarih istisnası kazanır; plan değişmez. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## SpecialDayOccurrencePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `fromDate` | string (date) | evet | — | Yerel tarih aralığının dahil başlangıcı; use-case gün sayısı sınırı vardır. |
| `toDate` | string (date) | evet | — | Yerel tarih aralığının dahil sonu; UTC from/to anı gibi ele alınmaz. |
| `items` | [SpecialDayOccurrence](DTO-Sozlugu.md#specialdayoccurrence)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `coverage` | null / [ReadCoverage](DTO-Sozlugu.md#readcoverage) | hayır | — | Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır. |

## SpecialDayPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [SpecialDayView](DTO-Sozlugu.md#specialdayview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## SpecialDayRecurrence

Değerler: `Yearly`, `Once`.

## SpecialDayReminder

Değerler: `None`, `SameDay`, `OneDayBefore`, `OneWeekBefore`.

## SpecialDayRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `title` | string | evet | minLength=1; maxLength=120 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `kind` | null / [SpecialDayKind](DTO-Sozlugu.md#specialdaykind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `month` | integer\|string (int32) | hayır | minimum=1; maximum=12; pattern="^-?(?:0\|[1-9]\\d*)$" | Ay 1–12. |
| `day` | integer\|string (int32) | hayır | minimum=1; maximum=31; pattern="^-?(?:0\|[1-9]\\d*)$" | Gün sonu hazırlığında CalendarDayView; ayrıca OpenWork aday sayfası döner. |
| `year` | null\|integer\|string (int32) | hayır | minimum=1; maximum=9998; pattern="^-?(?:0\|[1-9]\\d*)$" | Tek seferlik günde zorunlu yıl; yıllık günde isteğe bağlı başlangıç yılı. |
| `recurrence` | null / [SpecialDayRecurrence](DTO-Sozlugu.md#specialdayrecurrence) | evet | — | Yearly (her yıl) veya Once (yalnız verilen yıl). |
| `nonWorking` | boolean | hayır | — | Çalışma dışı: o günün çalışma saatleri boşalır, açık tarih istisnası kazanır; plan değişmez. |
| `reminder` | [SpecialDayReminder](DTO-Sozlugu.md#specialdayreminder) | hayır | — | Hatırlatma: None, SameDay, OneDayBefore veya OneWeekBefore; yerel 09:00. |

## SpecialDayVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## SpecialDayView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `kind` | [SpecialDayKind](DTO-Sozlugu.md#specialdaykind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `month` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Ay 1–12. |
| `day` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Gün sonu hazırlığında CalendarDayView; ayrıca OpenWork aday sayfası döner. |
| `year` | null\|integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tek seferlik günde zorunlu yıl; yıllık günde isteğe bağlı başlangıç yılı. |
| `recurrence` | [SpecialDayRecurrence](DTO-Sozlugu.md#specialdayrecurrence) | evet | — | Yearly (her yıl) veya Once (yalnız verilen yıl). |
| `nonWorking` | boolean | evet | — | Çalışma dışı: o günün çalışma saatleri boşalır, açık tarih istisnası kazanır; plan değişmez. |
| `reminder` | [SpecialDayReminder](DTO-Sozlugu.md#specialdayreminder) | evet | — | Hatırlatma: None, SameDay, OneDayBefore veya OneWeekBefore; yerel 09:00. |
| `nextOccurrence` | null\|string (date) | evet | — | Bugünden itibaren bir yıl içindeki ilk oluşum; geçmiş tek seferlik günde null. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `updatedAt` | string (date-time) | evet | — | Kaydın son güncellenme instantı. |
| `deletedAt` | null\|string (date-time) | evet | — | Soft silinmiş not instantı; silme200View yanıtında dolabilir. |

## StartWorkRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `scheduleId` | null\|string (uuid) | hayır | — | Plan bloğu kimliği; work start bağlamı için scheduleVersion da gerekebilir. |
| `scheduleVersion` | null\|integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Başlangıçta seçilen plan bloğunun beklenen sürümü. |

## SubscriptionView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `providerHost` | string | evet | — | Abonelik sağlayıcı host’u; özel endpoint/key değerleri yanıtta verilmez. |
| `label` | string | evet | — | Subscription için en çok100karakter cihaz etiketi; analizde ise grup etiketi. |
| `active` | boolean | evet | — | Subscription aktif kayıt durumu; OS izni/teslim kanıtı değildir. |
| `expiresAt` | null\|string (date-time) | evet | — | Proposal için2dkgeçerlilik; subscription için opsiyonel browser bitişi. DTO bağlamını ayırın. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## SupportDayChange

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `availableEnergy` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | evet | — | Günün isteğe bağlı yumuşak efor tercihi; hard constraint değil. |
| `criticalTaskIds` | string (uuid)[] | evet | — | Gün için0..3benzersiz arşivlenmemiş task; boş array desteği temizler. |

## SupportDayView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `localDate` | string (date) | evet | — | Kaydın kendi zaman dilimindeki gün; UTC instant değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `availableEnergy` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | evet | — | Günün isteğe bağlı yumuşak efor tercihi; hard constraint değil. |
| `criticalTaskIds` | string (uuid)[] | evet | — | Gün için0..3benzersiz arşivlenmemiş task; boş array desteği temizler. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `enabled` | boolean | evet | — | İlgili tercih/özelliğin açık olması; Google/Push sunucu config’i ayrıca belirleyicidir. |

## SyncView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `workSessionId` | null\|string (uuid) | evet | — | Gerçek çalışma kaydı; focus ve not bağları bu kimliği tekrar kullanır. |
| `focusSessionId` | null\|string (uuid) | evet | — | Hedef/mola döngüsü bağlamı; ayrı actual süre kaynağı değildir. |

## TaskAction

Değerler: `Complete`, `Reopen`, `Defer`, `Skip`, `Cancel`, `CompleteDirectWork`, `ReopenDirectWork`, `null`.

## TaskAllocation

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `from` | string (date-time) | evet | — | UTC offsetli dahil aralık başlangıcı; date-only FromDate ile aynı tip değil. |
| `to` | string (date-time) | evet | — | UTC offsetli hariç aralık bitişi; date-only ToDate dahil olabilir. |
| `cutoff` | string (date-time) | evet | — | Tahsis kesimi max(from,serverNow); DirectActualSeconds serverNow itibarıyladır. |
| `directActualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Yalnız seçili taskın effective gerçek işi; subtree toplamına ayrıca eklemeyin. |
| `allocatedSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | İstenen aralıkta geleceğe kalan kabul edilmiş Work tahsisi. |
| `remainingSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | ServerNow itibarıyla lifetime actualdan kalan doğrudan iş; unknown ise null. Gelecek cutoffa kadar çalışılacağı varsayılmaz. |
| `unallocatedSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Kalan işten ayrılmamış miktar; unknown ise null. |
| `excessAllocatedSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Kalan işi aşan plan tahsisi; actual overtime değildir. |

## TaskAncestorPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İstenen başlangıç görevi; başka yol ile karıştırılmaz. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Owner planningVersion kapsam sürümü; bu değişirse devam409 ancestor_cursor_stale döner. |
| `items` | [TaskAncestorRow](DTO-Sozlugu.md#taskancestorrow)[] | evet | — | Yakından uzağa en çok limit üst görev; başlangıç görevi dahil değildir. |
| `nextCursor` | null\|string | evet | — | Devam yoksa null. Owner/görev/planningVersion/offset ve amaç ayrımlı HMAC doğrulamasına bağlı opak imleç; auth tokenı değildir. |

## TaskAncestorRow

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | Owner kapsamındaki üst görev kimliği. |
| `title` | string | evet | — | Üst görevin güncel başlığı; tam TaskView değildir. |
| `parentTaskId` | null\|string (uuid) | evet | — | Bir üst bağlantı; kökte null. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Üst görevin kendi sürümü. |

## TaskAtStart

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `schemaVersion` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | TaskAtStart gibi snapshot payload sürümü. |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `taskVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bu DTO bağlamındaki task sürümü; occurrence komutunda bağlı taskın güncel sürümü, snapshotta yakalanmış tarihsel sürüm. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `ancestors` | [NamedSnapshot](DTO-Sozlugu.md#namedsnapshot)[] | evet | — | Snapshot sırasında kökten parenta sıralanmış ata kimlik/adları. |
| `project` | null / [NamedSnapshot](DTO-Sozlugu.md#namedsnapshot) | evet | — | Snapshot proje kimliği/adı; null o anda proje yok. |
| `pool` | null / [NamedSnapshot](DTO-Sozlugu.md#namedsnapshot) | evet | — | Snapshot görev havuzu kimliği/adı; null o anda havuz yok. |
| `category` | null / [NamedSnapshot](DTO-Sozlugu.md#namedsnapshot) | evet | — | Snapshot kategori kimliği/adı; null o anda kategori yok. |
| `tags` | [NamedSnapshot](DTO-Sozlugu.md#namedsnapshot)[] | evet | — | Snapshot anındaki etiket kimlik/adları; bugünkü etiket adları geçmişi değiştirmez. |
| `inputPlanningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tarihsel snapshot yakalandığındaki owner koordinasyon sürümü. |
| `capturedAt` | null\|string (date-time) | hayır | — | Snapshotın yakalandığı UTC instant. |

## TaskAutoCompleteRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `autoCompleteFromChildren` | boolean | evet | — | UI-R2: true ise zorunlu çocuklar bitince görev otomatik tamamlanır; false ise yalnız elle tamamlanır. Varsayılan true. |

## TaskBatchRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `titles` | string[] | evet | minItems=1; maxItems=50 | Kafamı boşalt başlıkları: 1–50 adet, her biri 1–200 karakter; her biri kök görev olur. |
| `poolId` | null\|string (uuid) | hayır | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |

## TaskBatchResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [TaskView](DTO-Sozlugu.md#taskview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |

## TaskDetailView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `task` | [TaskView](DTO-Sozlugu.md#taskview) | evet | — | Güncel tam düzenleme belgesi; task/version yazmalarda korunur. |
| `rowSummary` | [TreeRowSummary](DTO-Sozlugu.md#treerowsummary) | evet | — | Görünür doğrudan çocuk/etkin aralık ve bilinen alt ağaç toplamı; süre bütçesi ayrıca eklenmez. |
| `workload` | [WorkloadSummary](DTO-Sozlugu.md#workloadsummary) | evet | — | Ortak aktif subtree girdisinden mevcut domain iş yükü hesabı. |
| `time` | [TaskTimeView](DTO-Sozlugu.md#tasktimeview) | evet | — | Aynı subtree üstkümesinden gerçek çalışma; arşivli dalların geçmişi korunur. |
| `progress` | [TaskProgress](DTO-Sozlugu.md#taskprogress) | evet | — | Aynı aktif subtree üzerinden mevcut domain ilerlemesi; sayaç görevi bitirmez. |
| `classification` | [ClassificationView](DTO-Sozlugu.md#classificationview) | evet | — | Mevcut tam sınıflandırma değerleri/task sürümü/planning sürümü. |
| `labels` | [TaskResourceLabel](DTO-Sozlugu.md#taskresourcelabel)[] | evet | — | Yalnız seçili project/pool/category/tag id, ad, sürüm ve arşiv işaretleri; tam resource cache belgesi değildir. |
| `parent` | null / [TaskAncestorRow](DTO-Sozlugu.md#taskancestorrow) | evet | — | Doğrudan üst görevin küçük kimlik/başlık satırı; tüm ancestor yolu değildir. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Aynı owner snapshotındaki planning sürümü; task version yerine geçmez. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## TaskFieldsRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `title` | string | evet | minLength=0; maxLength=300 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `description` | null\|string | hayır | minLength=0; maxLength=10000 | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `deadlineAt` | null\|string (date-time) | hayır | — | Görevin son teslim instantı; plan bloğu bitişinden ayrıdır. |
| `canSplit` | boolean | hayır | — | Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez. |

## TaskPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [TaskView](DTO-Sozlugu.md#taskview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `coverage` | null / [ReadCoverage](DTO-Sozlugu.md#readcoverage) | hayır | — | Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır. |

## TaskPickerPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [TaskPickerRow](DTO-Sozlugu.md#taskpickerrow)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## TaskPickerRow

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `parentTaskId` | null\|string (uuid) | evet | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `parentTitle` | null\|string | evet | — | Owner kapsamındaki doğrudan ana görevin başlığı; kök görevde null. Tam ata yolu değildir. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | evet | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | evet | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |

## TaskPickerView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `assigned` | [TaskPickerPage](DTO-Sozlugu.md#taskpickerpage) | evet | — | Seçilen günün atanmış tarih aralığına uyan görev önerilerinin bağımsız sayfası. |
| `other` | [TaskPickerPage](DTO-Sozlugu.md#taskpickerpage) | evet | — | Atanmış gruba girmeyen seçilebilir görev önerilerinin bağımsız sayfası. |
| `hasExactMatch` | boolean | evet | — | Arama teriminin uygun görev başlığıyla Türkçe büyük/küçük harf duyarsız tam eşleşmesi; yeni başlık üretimi için kullanılır. |
| `coverage` | null / [ReadCoverage](DTO-Sozlugu.md#readcoverage) | hayır | — | Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır. |

## TaskPlannedRangeRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `plannedFrom` | null\|string (date) | hayır | — | UI-R2 görevin kendi atanmış gün aralığının ilk günü (yerel tarih); plannedTo ile birlikte null veya dolu. Plan oluşturmaz, yalnız öneridir. |
| `plannedTo` | null\|string (date) | hayır | — | UI-R2 kendi atanmış aralığın son günü (dahil). |

## TaskPriority

Değerler: `Low`, `Normal`, `High`, `Urgent`.

## TaskProgress

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `totalTaskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Alt ağaç/orman kapsamındaki görev sayısı; sayfadaki item sayısı değil. |
| `completedTaskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Seçili günün completion olaylarına dayanan görev sayısı. |
| `componentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Plan referansına giren bağımsız iş bileşenlerinin sayısı. |
| `completedComponentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Referans bileşenlerden gerçekten completed olanların sayısı. |
| `countProgress` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$" | Bağımsız iş bileşenlerinin sayı bazlı ilerleme oranı; süre oranı değildir. |
| `knownEstimatedSeconds` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez. |
| `knownCompletedEstimatedSeconds` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Completed referans componentlerin bilinen snapshot tahmin toplamı. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `durationProgress` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$" | Süre ağırlıklı ilerleme; coverage eksikse null olabilir. |
| `requiredChildCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Zorunlu doğrudan çocuk sayısı. |
| `incompleteRequiredChildCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Henüz completed olmayan zorunlu doğrudan çocuk sayısı. |
| `hasOpenChildren` | boolean | evet | — | Doğrudan çocuklar arasında açık olan var; descendant kapsamıyla karıştırmayın. |
| `hasOpenDescendants` | boolean | evet | — | Alt ağacın herhangi bir derinliğinde açık görev var. |

## TaskRelationPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [TaskRelationView](DTO-Sozlugu.md#taskrelationview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## TaskRelationView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `sourceTaskId` | string (uuid) | evet | — | İlişkinin kaynak görevi. |
| `targetTaskId` | string (uuid) | evet | — | İlişkinin hedef görevi. |
| `kind` | string | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |

## TaskRequiredRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `requiredForParent` | boolean | evet | — | Üstün otomatik tamamlanmasında bu çocuk zorunlu mu. |

## TaskResourceLabel

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `kind` | string | evet | — | projects/pools/categories/tags kaynak türü. |
| `id` | string (uuid) | evet | — | Yalnız seçili owner kaynağı kimliği. |
| `name` | string | evet | — | Kaynağın güncel adı. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kaynağın güncel kendi sürümü. |
| `archivedAt` | null\|string (date-time) | evet | — | Seçili kaynak arşivli ise instant; geçmiş bağ görünür kalır. |

## TaskStartDecision

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `canStart` | boolean | evet | — | Gerçek çalışma başlatma uygunluğu; future plan yerleşimi çalışma izni değildir. |
| `reasons` | string[] | evet | — | TaskGraph CanStart nedenleri; blocked start HTTP409 code olarak ilk nedeni de döndürebilir. |
| `blockingPredecessorIds` | string (uuid)[] | evet | — | Başlamayı engelleyen tamamlanmamış gerçek ön koşullar. |

## TaskState

Değerler: `Pending`, `InProgress`, `Paused`, `Completed`, `Deferred`, `Skipped`, `Canceled`.

## TaskStateRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `action` | null / [TaskAction](DTO-Sozlugu.md#taskaction) | evet | — | TaskAction zorunlu; null400. OpenAPI nullable unionu bu Required davranışını tek başına yansıtmayabilir. |
| `parentCompletionChoice` | null / [ParentCompletionChoice](DTO-Sozlugu.md#parentcompletionchoice) | hayır | — | CompleteSubtree/ParentOnly/Cancel; Cancel durum komutunu değiştirmeden sonuçlandırır. |
| `reason` | null\|string | hayır | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## TaskTimeView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `directActualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Yalnız seçili taskın effective gerçek işi; subtree toplamına ayrıca eklemeyin. |
| `subtreeActualSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Seçili task ve alt ağacındaki gerçek segmentlerin tek sayımlı toplamı. |
| `knownRemainingSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Tahmini bilinen açık bağımsız işlerin max(0,estimate-actual) toplamı. |
| `unknownRemainingCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Açık bağımsız işlerde kalan tahmini bilinmeyen component sayısı. |
| `remainingSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Null eksik tahmin demektir; negatif süre gösterilmez. |
| `knownOvertimeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Bilinen direct tahmin üzerinde kalan effective actual; negatif olamaz. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |

## TaskTreeCreateResult

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `root` | [TaskView](DTO-Sozlugu.md#taskview) | evet | — | Yeni kök görev; alt görevi varsa kapsayıcıdır. |
| `created` | [TaskView](DTO-Sozlugu.md#taskview)[] | evet | — | Kök dahil oluşturulan bütün görevler, derinlik öncelikli gönderim sırasıyla. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |

## TaskTreeRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `title` | string | evet | minLength=0; maxLength=300 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `children` | null\|array | hayır | maxItems=50 | Bu görevin alt görevleri, gönderilen sırayla; null/boş yaprak görevdir. Kök dahil en çok50 görev ve5 seviye. |

## TaskVersionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## TaskView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `title` | string | evet | — | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `description` | null\|string | evet | — | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `state` | [TaskState](DTO-Sozlugu.md#taskstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | evet | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `deadlineAt` | null\|string (date-time) | evet | — | Görevin son teslim instantı; plan bloğu bitişinden ayrıdır. |
| `canSplit` | boolean | evet | — | Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil. |
| `createdAt` | string (date-time) | evet | — | Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil. |
| `updatedAt` | string (date-time) | evet | — | Kaydın son güncellenme instantı. |
| `archivedAt` | null\|string (date-time) | evet | — | Soft arşiv instantı; null arşivlenmemiş. Geçmiş work/revision silinmez. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `parentTaskId` | null\|string (uuid) | evet | — | Tek parent; null root. Alt ağaç move döngü/dependency kurallarını yeniden doğrular. |
| `sortOrder` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Kararlı manuel kardeş sırası; move komutunda beforeSiblingId kullanılır. |
| `hasDirectWork` | boolean | evet | — | Görevin kendi fiziksel işi var; false container. Tahmin null olması false anlamına gelmez. |
| `targetBudgetSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Toplam hedef bütçe; direct/child formülüne eklenmez. |
| `directWorkCompleted` | boolean | evet | — | Bu görevin kendi iş bileşeni tamamlandı; altların veya tüm parentın tamamlanmasıyla aynı değil. |
| `requiredForParent` | boolean | evet | — | Üstün otomatik tamamlanmasında bu çocuk zorunlu mu. |
| `completionOrigin` | null / [CompletionOrigin](DTO-Sozlugu.md#completionorigin) | evet | — | Manual veya Automatic tamamlanma; yeniden açma/ancestor reconciliation davranışını etkiler. |
| `completedAt` | null\|string (date-time) | evet | — | Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın. |
| `projectId` | null\|string (uuid) | evet | — | Uzun vadeli proje bağı; task kopyası üretmez. |
| `poolId` | null\|string (uuid) | evet | — | Görev havuzu bağı; plan bloklarından bağımsızdır. |
| `categoryId` | null\|string (uuid) | evet | — | Tek kategori bağı; historical snapshot bugünkü ada göre yeniden yazılmaz. |
| `energyDemand` | null / [EnergyLevel](DTO-Sozlugu.md#energylevel) | hayır | — | Görevin isteğe bağlı efor ihtiyacı; null tercih yok. |
| `autoCompleteFromChildren` | boolean | hayır | default=true | UI-R2: true ise zorunlu çocuklar bitince görev otomatik tamamlanır; false ise yalnız elle tamamlanır. Varsayılan true. |
| `plannedFrom` | null\|string (date) | hayır | — | UI-R2 görevin kendi atanmış gün aralığının ilk günü (yerel tarih); plannedTo ile birlikte null veya dolu. Plan oluşturmaz, yalnız öneridir. |
| `plannedTo` | null\|string (date) | hayır | — | UI-R2 kendi atanmış aralığın son günü (dahil). |

## TreePage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [TaskView](DTO-Sozlugu.md#taskview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `hasMore` | boolean | evet | — | Tree/subtree devam sayfası var; bu DTO total taşımaz. |
| `summaries` | null\|array | hayır | — | UI-R2: yalnız /api/tasks/children sayfasında satır başına özet; subtree yanıtında null. |

## TreeRowSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `childCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Arşivlenmemiş doğrudan alt görev sayısı. |
| `completedChildCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Completed durumdaki doğrudan alt görev sayısı. |
| `knownEstimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `effectiveFrom` | null\|string (date) | hayır | — | Yeni definitionın uygulanmaya başlayacağı yerel gün; seri update geçmişi korur. |
| `effectiveTo` | null\|string (date) | hayır | — | UI-R2 etkin aralık sonu (dahil). |
| `rangeFromChildren` | boolean | hayır | default=false | true ise etkin aralık çocuklardan türedi; görevin kendi aralığı yok sayılır. |
| `urgentPlanDate` | null\|string (date) | hayır | — | Acil işin ekleneceği yerel gün; çalışma başlangıcı/actual tarihçesi değildir. |

## UiSupports

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `calmView` | boolean | hayır | default=false | UI-R3 sakin görünüm: sayılar, süre farkları ve animasyon gizlenir; işlevler sürer (varsayılan kapalı). |
| `dayBar` | boolean | hayır | default=true | UI-R3 gün çubuğu gösterilsin mi (varsayılan açık). |
| `calibrationHints` | boolean | hayır | default=true | UI-R3: tahmin kalibrasyon ipuçları gösterilsin mi (varsayılan açık). |
| `nudges` | boolean | hayır | default=true | UI-R3 uygulama içi dürtmeler (geçiş ve hiperodak) gösterilsin mi (varsayılan açık). |
| `resumeCard` | boolean | hayır | default=true | UI-R3 'Nerede kalmıştım?' kartı gösterilsin mi (varsayılan açık). |
| `openTodayAsOneThing` | boolean | hayır | default=false | Bugün ekranı 'Şimdi tek şey' görünümünde açılsın mı (varsayılan kapalı). |

## UndoDayItemsRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `changeSetId` | string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |

## UndoSchedulingRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `changeSetId` | string (uuid) | evet | — | Birlikte uygulanan gün/blok değişiklik grubu; undo kaynağı. |
| `expectedPlanningVersion` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |

## UnplacedReason

Değerler: `NoEstimate`, `NeedsEstimateExtension`, `TaskInactive`, `DependencyBlocked`, `NoWorkingHours`, `InsufficientCapacity`, `NoContiguousSlot`, `DeadlineRisk`, `MinimumSplitConstraint`, `ActiveReservationTooShort`.

## UnplacedWork

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `remainingSeconds` | null\|number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Null eksik tahmin demektir; negatif süre gösterilmez. |
| `reason` | [UnplacedReason](DTO-Sozlugu.md#unplacedreason) | evet | — | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## UpdateDayItemTimeRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `startsAt` | null\|string (date-time) | hayır | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | null\|string (date-time) | hayır | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |

## UpdateFocusPresetRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `name` | string | evet | minLength=0; maxLength=100 | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `settings` | null / [FocusSettings](DTO-Sozlugu.md#focussettings) | evet | — | Tam FocusSettings zorunlu; null400. Nullable wire unionuna rağmen Required validation uygulanır. |

## UpdateNotificationPreferences

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `settings` | [NotificationSettings](DTO-Sozlugu.md#notificationsettings) | evet | — | Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir. |

## UpdatePreferencesRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `values` | [PlanningPreferences](DTO-Sozlugu.md#planningpreferences) | evet | — | İlgili komutun tam alan belgesi; PUTta yalnız değişen alanları göndermek güvenli değildir. |

## UpdateProfileRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `expectedUserId` | string (uuid) | evet | — | İstemcinin me ile doğruladığı hesap kimliği; JWT sahibiyle eşleşmezse404. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `firstName` | string | evet | minLength=1; maxLength=50 | Profil adı; trim sonrası1..50karakter. Eski kayıtta görünen adın tamamı, e-postaya eşitse boş. |
| `lastName` | null\|string | hayır | minLength=0; maxLength=50 | İsteğe bağlı soyad; trim sonrası0..50karakter. Boşsa displayName yalnız addır. |

## UpdateResourceRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `name` | string | evet | minLength=0; maxLength=200 | Koleksiyon adı200, focus preset adı100karakter; trim edilir. |
| `description` | null\|string | hayır | minLength=0; maxLength=10000 | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |

## UpdateScheduleRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |
| `isFixed` | boolean | hayır | — | Motorun yerini koruyacağı sabit blok. |
| `isLocked` | boolean | hayır | — | Kullanıcının koruduğu blok; değiştirme için açık niyet gerekir. |
| `allowConflicts` | boolean | hayır | — | Manuel overlap uyarısını açık kabul; motorun çakışmasız sonucuyla aynı iddia değil. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `expectedPlanningVersion` | integer\|string (int64) | evet | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Owner koordinasyon sürümü; entity version yerine geçmez. |
| `allowProtectedChange` | boolean | hayır | — | Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz. |
| `reason` | null\|string | hayır | minLength=0; maxLength=2000 | Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın. |

## UpdateSpecialDayRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `title` | string | evet | minLength=1; maxLength=120 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `kind` | null / [SpecialDayKind](DTO-Sozlugu.md#specialdaykind) | evet | — | Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın. |
| `month` | integer\|string (int32) | hayır | minimum=1; maximum=12; pattern="^-?(?:0\|[1-9]\\d*)$" | Ay 1–12. |
| `day` | integer\|string (int32) | hayır | minimum=1; maximum=31; pattern="^-?(?:0\|[1-9]\\d*)$" | Gün sonu hazırlığında CalendarDayView; ayrıca OpenWork aday sayfası döner. |
| `year` | null\|integer\|string (int32) | hayır | minimum=1; maximum=9998; pattern="^-?(?:0\|[1-9]\\d*)$" | Tek seferlik günde zorunlu yıl; yıllık günde isteğe bağlı başlangıç yılı. |
| `recurrence` | null / [SpecialDayRecurrence](DTO-Sozlugu.md#specialdayrecurrence) | evet | — | Yearly (her yıl) veya Once (yalnız verilen yıl). |
| `nonWorking` | boolean | hayır | — | Çalışma dışı: o günün çalışma saatleri boşalır, açık tarih istisnası kazanır; plan değişmez. |
| `reminder` | [SpecialDayReminder](DTO-Sozlugu.md#specialdayreminder) | hayır | — | Hatırlatma: None, SameDay, OneDayBefore veya OneWeekBefore; yerel 09:00. |

## UpdateTaskRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `title` | string | evet | minLength=0; maxLength=300 | Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin. |
| `description` | null\|string | hayır | minLength=0; maxLength=10000 | İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir. |
| `priority` | [TaskPriority](DTO-Sozlugu.md#taskpriority) | hayır | — | Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın. |
| `deadlineAt` | null\|string (date-time) | hayır | — | Görevin son teslim instantı; plan bloğu bitişinden ayrıdır. |
| `canSplit` | boolean | hayır | — | Otomatik yerleştirme tercihi; fiilen pause yapmayı engellemez. |

## UploadProfilePhotoRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `expectedUserId` | string (uuid) | evet | — | me ile doğrulanan beklenen hesap UUID kimliği; JWT sahibiyle eşleşmesi zorunlu. Başka kullanıcıyı hedeflemek için kullanılamaz; eşleşmezse404. |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `uploadId` | string (uuid) | hayır | — | Her yeni kullanıcı niyeti için rastgele UUID; belirsiz yanıt GET user.photoVersion ile uzlaştırılır. Cloudinary asset kimliği değildir. |
| `mediaType` | string | evet | minLength=0; maxLength=20 | Profil fotoğrafının MIME türü: yalnız image/jpeg, image/png veya image/webp. Byte imzası ayrıca denetlenir. |
| `contentBase64` | string | evet | minLength=0; maxLength=2796204 | En fazla2MiB JPEG/PNG/WebP dosyasının saf base64 içeriği; data URL öneki yok. Azami2796204 karakter; gerçek byte imzası da denetlenir. |

## UserSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `email` | string | evet | — | Hesap e-postası; kimlik eşleştirmede trim+uppercase normalizasyonu kullanılır. |
| `displayName` | string | evet | — | Register alanı isteğe bağlı; boş/null ise trim edilmiş e-postanın tamamı kullanılır. |
| `profileVersion` | integer\|string (int64) | hayır | pattern="^-?(?:0\|[1-9]\\d*)$"; default=1 | Profil yazılarının beklenen users sürümü; ad/fotoğraf değişiminde artar. Geç eski me yanıtı daha yeni sürümü ezmez. |
| `photoVersion` | null\|string (uuid) | hayır | — | Fotoğraf yoksa null; varsa fotoğraf yükleme niyetinin opak UUID sürümü. Yalnız aynı owner /api/account/profile/photo?version= üzerinden okunur; Cloudinary adresi veya asset kimliği değildir. |

## UtcWindow

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `startsAt` | string (date-time) | evet | — | Plan bloğunun offset içeren başlangıç instantı; [start,end). |
| `endsAt` | string (date-time) | evet | — | Plan bloğunun hariç bitiş instantı; deadline değildir. |

## WeeklyWindow

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `dayOfWeek` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Haftanın günü0Pazar..6Cumartesi. |
| `startMinute` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yerel gece yarısından itibaren dahil dakika,0..1439; endMinute değerinden küçük. |
| `endMinute` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Yerel gece yarısından itibaren hariç dakika,1..1440;1440ertesi gün00:00. |

## WorkComponent

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `estimatedSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir. |

## WorkComponentPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [WorkComponent](DTO-Sozlugu.md#workcomponent)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |

## WorkDefinitionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `hasDirectWork` | boolean | evet | — | Görevin kendi fiziksel işi var; false container. Tahmin null olması false anlamına gelmez. |
| `directEstimatedSeconds` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Yalnız bu task’ın kendi işi; null bilinmiyor,0 ile aynı değil. |
| `targetBudgetSeconds` | null\|integer\|string (int64) | hayır | minimum=0; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Toplam hedef bütçe; direct/child formülüne eklenmez. |

## WorkPage

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `items` | [WorkView](DTO-Sozlugu.md#workview)[] | evet | — | Bu sayfanın kayıtları; nested DTO sözlüğü shape’i tanımlar. |
| `offset` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sorgu listesindeki0tabanlı satır başlangıcı; listeye özgü üst sınırı izleyin. |
| `limit` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sayfada en çok dönecek kayıt; genellikle1..100, kesin sınır modüldedir. |
| `total` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Filtrelenmiş tüm sorgu sayısı; items.Length değildir. |
| `coverage` | null / [ReadCoverage](DTO-Sozlugu.md#readcoverage) | hayır | — | Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır. |

## WorkSource

Değerler: `Timer`, `Manual`.

## WorkState

Değerler: `Running`, `Paused`, `Finished`, `Canceled`.

## WorkTransitionRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | hayır | minimum=1; maximum=9223372036854776000; pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |

## WorkView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `id` | string (uuid) | evet | — | DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir. |
| `taskId` | null\|string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `state` | [WorkState](DTO-Sozlugu.md#workstate) | evet | — | İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz. |
| `source` | [WorkSource](DTO-Sozlugu.md#worksource) | evet | — | Gerçek çalışma kayıt kaynağı; ilgili WorkSource enumu. |
| `startedAt` | string (date-time) | evet | — | Gerçek çalışma/segment başlangıcı; timer komutunda sunucu belirler. |
| `endedAt` | null\|string (date-time) | evet | — | Gerçek aralık bitişi; açık segmentte null olabilir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `taskAtStart` | null / [TaskAtStart](DTO-Sozlugu.md#taskatstart) | evet | — | Gerçek çalışma başlangıcındaki isim/yol/sınıflandırma snapshotı; eski kayıtta null olabilir. |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409. |
| `activeSeconds` | number\|string (double) | evet | pattern="^-?(?:0\|[1-9]\\d*)(?:\\.\\d+)?$" | Effective aktif segment süresi; pause/mola hariç. |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `recordedAt` | string (date-time) | evet | — | Gerçek kaydın sisteme girildiği instant; manuel kayıtta startedAt farklı geçmiş instant olabilir. |
| `startedScheduleId` | null\|string (uuid) | hayır | — | Gerçek çalışma başlarken seçilen kalıcı plan bloğu; plansızsa null. |
| `startedRevisionItemId` | null\|string (uuid) | hayır | — | Başlangıç planının immutable revision item bağı; replan ile değiştirilmez. |

## WorkingDay

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `date` | string (date) | evet | — | İlgili plan/destek/occurrence günü; YYYY-MM-DD. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `localIntervals` | [MinuteRange](DTO-Sozlugu.md#minuterange)[] | evet | — | Seçili günün uygulanmış haftalık/istisna dakika aralıkları. |
| `utcIntervals` | [UtcWindow](DTO-Sozlugu.md#utcwindow)[] | evet | — | Çalışma pencerelerinin backend tarafından dönüştürülmüş UTC instantları. |

## WorkloadForestSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili workload/rapor bağlamındaki görev sayısı. |
| `directComponentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Kendi işi bulunan bağımsız bileşen sayısı. |
| `openComponentCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | İlgili hesapta açık kalan bağımsız bileşen sayısı. |
| `knownEstimatedSeconds` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `calculatedTotalSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Direct+recursive çocuk toplamı; unknown kapsamı tam değilse null olabilir. |

## WorkloadSummary

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `taskId` | string (uuid) | evet | — | İlgili görev kimliği (owner kapsamında). |
| `knownEstimatedSeconds` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinen doğrudan bileşenlerin toplamı; unknown varsa tamamı biliniyor denmez. |
| `unknownEstimateCount` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz. |
| `calculatedTotalSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Direct+recursive çocuk toplamı; unknown kapsamı tam değilse null olabilir. |
| `targetBudgetSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Toplam hedef bütçe; direct/child formülüne eklenmez. |
| `targetDifferenceSeconds` | null\|integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Hedef bütçe ile hesaplanan iş farkı; kendiliğinden direct work yaratmaz. |

## WorkspacePreferencesView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `version` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Tam tercih belgesinin sürümü; bu küçük projeksiyon tek başına PUT gövdesi değildir. |
| `timeZoneId` | string | evet | — | İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir. |
| `timeFormat` | string | evet | — | 12h veya24h sunum tercihi; süre hesaplama kuralını değiştirmez. |
| `weekStartsOn` | integer\|string (int32) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | 0Pazar..6Cumartesi; başlangıç1Pazartesi. |
| `supportEnabled` | boolean | evet | — | İsteğe bağlı DEHB destekleri; quick-start/rescue uygunluğunu etkiler. |
| `hasWorkingWindows` | boolean | evet | — | Hesabın haftalık çalışma aralıklarından en az biri tanımlıysa true; tarih istisnaları veya gün kapasitesi hesabı değildir. |
| `uiSupports` | [UiSupports](DTO-Sozlugu.md#uisupports) | evet | — | UI-R3 hesap genelindeki arayüz destekleri; eski belgeler varsayılanlarla okunur. |

## WorkspaceSnapshotView

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `serverNow` | string (date-time) | evet | — | UTC server instant; sayaç ekranı bu referansla hesaplanır. |
| `planningVersion` | integer\|string (int64) | evet | pattern="^-?(?:0\|[1-9]\\d*)$" | Sunucu planlama/oturum/görev görünümünün koordinasyon sürümü. |
| `preferences` | [WorkspacePreferencesView](DTO-Sozlugu.md#workspacepreferencesview) | evet | — | Saat dilimi, görünüm ve destekler için küçük tercih projeksiyonu; weekly/exceptions listesini içermez. |
| `activeWork` | null / [WorkView](DTO-Sozlugu.md#workview) | evet | — | Varsa çalışan oturum; yoksa en son başlatılan duraklatılmış oturum. Null doğrulanmış yokluktur. |
| `focusSessionId` | null\|string (uuid) | evet | — | Hedef/mola döngüsü bağlamı; ayrı actual süre kaynağı değildir. |
| `focusIncluded` | boolean | evet | — | Bu istekte focus/current değerlendirmesi açıkça istendiyse true; false durumunda activeFocus null alanı focus yokluğu kanıtı değildir. |
| `activeFocus` | null / [FocusView](DTO-Sozlugu.md#focusview) | evet | — | Yalnız includeFocus=true kapsamında değerlendirilen focus; istemciye dönen work/süre aynı transaction ve serverNow kesimindedir. |
| `versions` | [DayReadVersions](DTO-Sozlugu.md#dayreadversions) | evet | — | Day overview karşılaştırması için kapsanan üç kaynağın atomik sürümleri; notification ve diğer kaynaklar kapsam dışıdır. |

## Inline HTTP hata şeması

Bu şema operation response içinde inline bulunur;200named schema sayısına ek bir component değildir. Framework/proxy/auth challenge yanıtı her zaman bu şekli taşımaz.

| Alan | Tip | Anlam |
| --- | --- | --- |
| `type` | string/null | HTTP problem türü URI; karar anahtarı olarak parse edilmez. |
| `title` | string/null | Güvenli insan açıklaması; sabit lokalizasyon/iş kuralı anahtarı değildir. |
| `status` | number/null | HTTP status tekrarı; gerçek HTTP response status esastır. |
| `detail` | string/null | Framework tarafından sağlanabilen ek açıklama; mevcut domain handler zorunlu kılmaz. |
| `instance` | string/null | Problem occurrence URI bağlamı; bulunmak zorunda değil. |
| `code` | string | Application/model-validation hata kodu; transport yanıtında olmayabilir. |
| `traceId` | string | Destek/korelasyon kimliği; kullanıcıya güvenli hata referansı olarak gösterilebilir. |
| `errors` | Record<string,string[]>/null | Model-binding/alan doğrulama hataları; her domain400de yok. Alan key casing normalize edilir. |

Bilinen şema kısıtı: CreateScheduleRequest.kind,TaskStateRequest.action,FocusPresetRequest.settings,UpdateFocusPresetRequest.settings required olmasına rağmen nullable union gösterebilir. Runtime Required doğrulaması nullı400reddeder; ilgili alan açıklaması/entegrasyon kuralları uygulanır.

## ChangePasswordRequest

| Alan | Tip / null | Required | Şema sınırı / default | Anlam |
| --- | --- | --- | --- | --- |
| `expectedUserId` | string (uuid) | evet | — | me ile doğrulanmış hesap kimliği; oturum sahibiyle eşleşmezse409 account_changed. Yazı hedefini seçmez. |
| `currentPassword` | string | evet | — | Mevcut parola; sunucudaki hash ile doğrulanır, hatalıysa400 current_password_invalid. Sırdır, log/URL/storage'a yazılmaz. |
| `newPassword` | string | evet | minLength=6 | Yeni parola; trim/ek karmaşıklık yoktur, mevcut paroladan farklıdır. Bütün eski oturumlar ve reset bağlantıları kapanır; yeni HttpOnly oturum cookie'si verilir. |

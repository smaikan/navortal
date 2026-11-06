# Notlar ve isteğe bağlı destekler — MVP-23

Uygulama sözleşmesi aşağıdadır. Gerçek kabul/test sonucu `verification/mvp-23.md` kapanış kanıtında takip edilir; frontend destek kartları ayrı aşamadır.

- Kullanıcı notu General, Task, Distraction, NextStep veya Daily türündedir. Task/NextStep görev gerektirir. Distraction isteğe bağlı görev ve çalışma bağlamı alabilir. Daily, görev ve çalışma bağı olmadan yerel tarih ve kayıt anındaki saat dilimini taşır. Metin 1–10000 karakterdir. Düzenleme ve silme sürüm kontrollüdür. Notun dueAt alanı dönüşümde son teslim tarihi için varsayılan değer olabilir.
- Dikkat kutusundan göreve/havuza dönüşüm owner lock, note version ve idempotency key ile atomiktir. Note.ConvertedTaskId ve conversion fingerprint bir defa atanır; yeni key ile aynı dönüşüm aynı task'a döner, farklı dönüşüm conflict. Note ve görev ayrı kimliklerdir; kaynak not/audit bağlamı kaybolmaz. Task event ve planningVersion aynı transaction'da yazılır. Task title en çok300, description notun tam metni; tahmin uydurulmaz.
- Geri dönüş endpoint'i istenen görev alt ağacındaki son gerçek work/segment, son görünür not/next-step ve son completed olayını getirir. Hiç kaydı yoksa null. Uygun küçük adım önerisi gerçek start-eligibility kurallarıyla açık doğrudan işten seçilir; tamamlanmış ilerleme icat edilmez.
- Task energyDemand Low/Medium/High isteğe bağlıdır. Günlük support kaydı availableEnergy ve0..3 criticalTaskId tutar; frozen zone ve version vardır. Kapama tercihi genel PlanningPreferences.SupportEnabled içindedir; açık not geçmişini gizlemez. Enerji deadline, fixed, dependency veya kapasiteyi geçersiz kılmaz; eşdeğer adaylar arasında yumuşak sıralamadır. Critical seçimi de gerçek start izni değildir.
- Beş dakika başla; FocusService'in300sn ContinueTracking hedefini aynı WorkSession/segment altyapısıyla açar. Görev tamamlamaz; genel odak veya mevcut work bağlamı aynı explicit version guard'larını kullanır.
- Günü kurtar açık taskIds ve bugün tarihi ile SchedulingService.Plan çağrısıdır. Kullanıcının Preview/Auto tercihini izler, yalnız geleceği değiştirir; actual/fixed korunur, unplaced açık kalır. İkinci bir motor yazılmaz. Support kapalıysa yeni quick-start/rescue komutu kabul edilmez.
- Gün sonu hazırlığı CalendarDay özeti, o günün plan/work/critical kaynaklarındaki açık işler ve kullanıcıya gösterilecek carry/move/pool seçeneklerini hazırlar. Hiçbir şeyi kendiliğinden başka güne taşımaz. Okuma sürümleri değişirse yeniden okuma gerekir.

## HTTP sözleşmesi

JWT her uçta gereklidir; kullanıcı başka kullanıcının note/task/work/pool kimliğini bağlayamaz.

| Uç | Girdi / sonuç |
| --- | --- |
| POST /api/notes | `{kind,text,taskId?,workSessionId?,localDate?,dueAt?}` →201 NoteView |
| GET /api/notes | taskId?,kind?,date?,offset0..100000,limit1..100; yalnız soft silinmemiş owner kayıtları |
| PUT /api/notes/{id} | `{version,text,dueAt?}`; bağlam/tür/tarih/zone değişmez |
| POST /api/notes/{id}/delete | `{version}`; metin ve conversion bağı saklanan soft delete |
| POST /api/notes/{id}/convert | `{version,title,poolId?,deadlineAt?}` + key; ConvertedNote/aynı TaskId |
| GET /api/tasks/{id}/return-context | Son nonvoid gerçek segment ve task kimliği, son not, NextStep notu, son completed olay, başlatılabilir küçük adım ve açık doğrudan iş sayısı |
| PUT /api/tasks/{id}/energy | `{version,energyDemand:Low/Medium/High/null}`; TaskView + yeni task/planningVersion |
| GET/PUT /api/support/days/{date} | PUT `{version,availableEnergy?,criticalTaskIds}`; ilk version0, kritikler0..3 benzersiz owner task |
| POST /api/support/quick-start | `{taskId?,workSessionId?,workSessionVersion?}` + key;300sn ContinueTracking FocusView |
| POST /api/support/rescue | `{date,taskIds,expectedPlanningVersion?,newWorkNotBefore?}` + key; mevcut SchedulingPreviewView, Preview/Auto |
| GET /api/support/days/{date}/end-preparation | offset/limit; CalendarDay + o güne ait plan/revision/work/critical köklerinin açık doğrudan iş adayları + Carry/Move/Pool/Cancel seçenekleri |

Enum'lar API'de metindir. Convert/quick-start/rescue kayıp yanıtı aynı key ile toparlar; başka payload ile409. Rescue key en çok100, diğerleri128 karakterdir. Convert title açık kullanıcı girdisidir, notun ilk satırından sessiz başlık üretilmez. Deadline verilmezse not dueAt kullanılır. Note text tam description olur; yeni task doğrudan iş ve tahminsiz başlar. Conversion fingerprint title/pool/effective deadline'a bağlıdır; task sonradan düzenlenmişse replay onu eski değerlere döndürmez.

WorkSessionId ile alınan notta task verilmemişse doğrulanmış work'ün gerçek TaskId'si kullanılır; bağımsız genel work için task uydurulmaz. İkisi ayrı verilirse eşleşmeleri gerekir. Böylece dikkat kutusuna yalnız aktif work bağlamıyla düşülen not geri dönüşte bulunabilir.

Not düzenlemesi plan motorunun girdisi değildir; planningVersion değiştirmez. Conversion, görev enerji değişimi ve günlük kritik/enerji tercihi planningVersion artırır; stale plan önizlemesi409 olur. Günlük kritik sırası Slot ile korunur; DB owner FK ve1..3 slot unique kısıtları vardır. Aynı görev bir günde yalnız bir defa kritik seçilir. Parent kritik seçimi motor içinde doğrudan iş bileşenlerine açılır; parent toplamı ek iş değildir.

Enerji cezası `max(0,demand-available)`; bilinmeyen enerjiye varsayım yapılmaz. Motor sırası deadline slack → critical → priority → soft ordering → energy penalty → manuel kararlı sıra/ID. Enerji ayarlı snapshot algoritma etiketi heuristic-v3, önceki split davranışı heuristic-v2 olarak kalır. Aynı engine/multi-day/undo invariant'ları geçerlidir. SupportEnabled=false kritik/enerji sıralamasını devre dışı bırakır, yeni quick-start/rescue engellenir; not geçmişi ve normal FocusSession kullanılabilir. Daha önce kabul edilmiş komutun receipt replay'i yeni etki üretmeden dönebilir.

Geri dönüş read'i bir RepeatableRead snapshot'ıdır. Son work kaynak segmentten, son completion event payload geçişinden gelir; bugünkü status'tan geçmiş completion icat edilmez. Öneri son çalışılan açık/doğrudan ve başlatılabilir işe öncelik verir; sonra tahmin ve kararlı sıra kullanır. Gerçek dependency sağlanmıyorsa önerilmez. LastWork ve SuggestedStep farklı olabilir. Kayıt yoksa null. Bu öneri kullanıcı yerine sayaç başlatmaz.

Gün sonu CalendarDay ve candidate snapshot sürümleri eşleşmelidir; arada plan/task değişirse409 ile yeniden okuma istenir. Candidate listesi DB'de sayfalanır; tamamlanmış/iptal/arşiv/doğrudan işi olmayanlar açık iş gibi dönmez. Tarihsel revision'da bulunup bugün başka yerde planlanmış iş de aday olabilir; carry diğer gün tahsislerini dikkate alır. UTC/gece kesişiminde work'ün frozen zone'u kullanılır. Hazırlık okuması revision, task, schedule veya actual oluşturmaz/değiştirmez.

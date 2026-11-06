# MVP-19 — geleceğe dönük güvenli geri alma

`POST /api/scheduling/undo-preview {changeSetId,expectedPlanningVersion?,allowProtectedChange?}` bir proposal üretir. Her zaman önizlemedir; Auto tercihi geri almayı kendiliğinden uygulamaz. Onay için mevcut `/api/scheduling/apply {proposalId}` ve Idempotency-Key kullanılır. Aynı TTL, sürüm/zaman, kullanıcı koordinasyonu, atomic snapshot ve replay kuralları geçerlidir.

Bu aşama tek gün içindir. Kaynak, o günün son kullanıcı plan ChangeSet'i olmalıdır. Sonraki `TaskState` revizyonları kullanıcı plan kararı sayılmaz; tamamlanmanın gerçekliği geri alınmaz. Daha sonraki Manual/Replan/Undo varsa eski gruba409/undo_not_latest verilir. Kaynak yabancıysa404; birden fazla güne ait grup MVP-20 kapsamına kadar409/undo_multiple_days döndürür.

PlanUndoEngine saf ve deterministiktir. Kaynak delta'nın Before/After bilgisi ile güncel snapshot'ı birlikte kullanır. Task veya session state'ine yazmaz:

- Eklenmiş gelecek blok kaldırılır; geçmişte başlamışsa yalnız geleceği kesilip geçmiş prefix korunur.
- Taşınmış/süresi değiştirilmiş blok eski gelecekteki konumuna dönebilir. Kaldırılmış blok aynı kimlikle Restored olur; FK ve creation metadata korunur.
- Aktif iş, arada değişmiş blok, tamamlanmış/iptal/ertelenmiş görev veya geçmiş zaman zorla geri yüklenmez. Eski blok saatini taklit ederek actual yaratılmaz.
- Sabit/kilitli mevcut bloğu ters değiştirmek açık allowProtectedChange ister. Yeni çalışma saatleri, tahmin/actual/dış gün tahsisi, deadline, bölünmezlik, tampon ve bağımlılık grafiği yeniden değerlendirilir.
- Yeni çakışma yaratacak inverse geri çekilir; etkilenmeyen ardılın ön koşulunu bozan toplu inverse de güvenli biçimde geri çekilir. Bu konservatif telafidir, mümkün olan en geniş ters etkiyi bulma iddiası yoktur.
- Geçmişe düşmüş restoration başlangıcı ileri uygulama penceresine kırpılır; eksik bölüm uyarıda saniyesiyle görünür. Geçmiş tamamı geri yüklenmez.

Preview, reversesChangeSetId/isPartial ve ScheduleId içeren warning/explanation kodları taşır. IsPartial=true ise yalnız gösterilen Changes uygulanır; uygulanamayanlar Warnings içindedir. Örneğin UndoActiveWorkProtected, UndoScheduleChanged, UndoTaskInactive, UndoHistoryPreserved, UndoElapsedPartNotRestored, UndoQuantityExceeded, UndoOutsideWorkingHours, UndoOverlap, UndoDependencyConflict, UndoDeadlineConflict, UndoTransitionConflict, UndoNonSplitConflict. ChangedSinceTarget koruması daha erken devreye girerse bir kapanmış task için UndoScheduleChanged görülebilir.

Kısmi telafinin de kullanıcı tarafından apply ile onaylanması gerekir. Hiç fark kalmadıysa noChanges=true ve yeni revision yoktur; kabul bu kaynak için bir defa kaydedilir. Aynı öneri/komut replay'i eski makbuzu verir. Aynı kaynağa ikinci ayrı undo kabulü DB partial unique index'i ve kullanıcı kilidiyle önlenir. Kısmi kabul sonradan tamamlanmış gibi genişletilmez; yeni manuel plan kararı gerekir.

Etki varsa yeni PlanRevision Trigger=Undo, AlgorithmVersion=undo-v1 ve ReversesChangeSetId taşır. Eski revision/items değişmez, baseline geriye alınmaz. Current+full snapshots/deltas+proposal status+idempotency tek transaction'dadır. Snapshot hatasında tüm telafi geri alınır; Pending öneri yeniden denenebilir.

AddPlanUndo migration'ı revision/proposal'a nullable ReversesChangeSetId ve indeksler ekler. Eski accepted kayıtlar korunur. Eski algoritma/input schema'sına ait Pending öneri409 ile yeni preview isteyebilir; Applied receipt ise yeniden motor çalıştırmadan ve süreye takılmadan replay edilir.

Kabul kanıtı `verification/mvp-19.md` içinde tutulur. Çok gün dağıtım/move/undo MVP-20'de bu sözleşmeyi atomik ChangeSet sınırına genişletir.

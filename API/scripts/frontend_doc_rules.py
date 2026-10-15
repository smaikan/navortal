"""Reviewed wire-field meanings and endpoint conditions. Keep aligned with src and integration tests."""

EXTRA_FIELD_NOTES = {
    'pomodoroSound': 'Pomodoro hedefi (FocusTarget) ve mola bitişi (BreakEnd) uygulama sesi. bell (varsayılan), marimba, digital, glass, pulse veya soft; null/geçersiz kimlik reddedilir.',
    'reminderSound': 'Custom, ReturnToTask, TaskDeadline, SpecialDay ve ScheduleStart uygulama sesi. bell, marimba (varsayılan), digital, glass, pulse veya soft.',
    'taskEndSound': 'ScheduleEnd için uygulama sesi. bell, marimba, digital (varsayılan), glass, pulse veya soft. Planlanan sürenin dolması görevi tamamlamaz.',
    'sound': 'Sunucunun bildirim türü ve güncel owner tercihlerinden seçtiği uygulama sesi kimliği: bell/marimba/digital/glass/pulse/soft. Genel ve odak ses politikası ayrıca soundEnabled/silent ile uygulanır. Eski yanıtta null/eksik alan legacy soft anlamına gelir; native sistem ses dosyası değildir.',
    'quadrant': 'Matris alanı: Inbox ayrılmamış, Do önemli/acil, Schedule önemli/acil değil, Delegate önemli değil/acil, Eliminate önemli değil/acil değil. Görev önceliği veya durumu değildir.',
    'columns': 'Tek owner/snapshot sürümünden beş matris alanının bağımsız sayfaları; her alan kendi offset/limit/total değerini taşır.',
    'isUrgent': 'Acil plan bağlamı işareti; görev priority değerinden ayrıdır. Sayaç veya görevin tamamlanma durumu değildir.',
    'unboundedItemCount': 'Başlangıcı olan ancak bitişi henüz belirlenmemiş gün planı öğelerinin sayısı; süre sıfır kabul edilmez.',
    'item': 'İşlem sonucu dönen gün planı öğesi; görev tanımı veya gerçek çalışma kaydı değildir.',
    'parentTitle': 'Owner kapsamındaki doğrudan ana görevin başlığı; kök görevde null. Tam ata yolu değildir.',
    'assigned': 'Seçilen günün atanmış tarih aralığına uyan görev önerilerinin bağımsız sayfası.',
    'other': 'Atanmış gruba girmeyen seçilebilir görev önerilerinin bağımsız sayfası.',
    'hasExactMatch': 'Arama teriminin uygun görev başlığıyla Türkçe büyük/küçük harf duyarsız tam eşleşmesi; yeni başlık üretimi için kullanılır.',
    'urgentPlanDate': 'Acil işin ekleneceği yerel gün; çalışma başlangıcı/actual tarihçesi değildir.',
    'coverage': 'Bu yanıtın kendisiyle aynı transaction içinde okunan kaynak sürümleri ve serverNow. Null/eksik ise değişmedi kanıtı sayılamaz; tüketici yalnız endpoint için kapsandığı doğrulanan kaynakları karşılaştırır.',
    'p25Ratio': 'Gerçek ÷ tahmin oranlarının alt çeyreği (doğrusal ara değer); 5 örnekten az ise null.',
    'p75Ratio': 'Gerçek ÷ tahmin oranlarının üst çeyreği (doğrusal ara değer); 5 örnekten az ise null.',
    'browserFamily': 'Kaba tarayıcı ailesi (Chrome/Firefox/Safari/Edge/Other); ham User-Agent saklanmaz.',
    'buildId': 'Hatanın görüldüğü UI derleme kimliği; sır içermez, sunucuda maskelenir.',
    'calibrationHints': 'UI-R3: tahmin kalibrasyon ipuçları gösterilsin mi (varsayılan açık).',
    'calmView': 'UI-R3 sakin görünüm: sayılar, süre farkları ve animasyon gizlenir; işlevler sürer (varsayılan kapalı).',
    'completedItemCount': 'Günün biten plan öğesi sayısı; gece yarısını geçen bloğun parçaları tek öğe sayılır.',
    'dayBar': 'UI-R3 gün çubuğu gösterilsin mi (varsayılan açık).',
    'dayItemAfter': 'Saatsiz gün öğesinin değişiklik sonrası anlık görüntüsü; saatli değişiklikte null.',
    'dayItemBefore': 'Saatsiz gün öğesinin değişiklik öncesi anlık görüntüsü; ekleme veya saatli değişiklikte null.',
    'dayItemId': 'Değişikliğin hedefi olan saatsiz gün öğesi; saatli blok değişikliğinde null (tam olarak biri dolu).',
    'detail': 'Problem ayrıntısı; kullanıcıya gösterilecek sakin metin değildir.',
    'hints': 'Plandaki açık görev başına efor ihtiyacı ve en son silinmemiş ilk adım notu.',
    'instance': 'Problem örneğinin yolu; kimlik veya sır içermez.',
    'medianRatio': 'Gerçek ÷ tahmin oranlarının medyanı; 5 örnekten az ise null.',
    'minimumSamples': 'Oranların gösterilmesi için gereken en az örnek (5).',
    'month': 'Ay 1–12.',
    'nextOccurrence': 'Bugünden itibaren bir yıl içindeki ilk oluşum; geçmiş tek seferlik günde null.',
    'nextStep': 'Görevin en son silinmemiş NextStep notu (id + metin) veya null.',
    'nonWorking': 'Çalışma dışı: o günün çalışma saatleri boşalır, açık tarih istisnası kazanır; plan değişmez.',
    'nudges': 'UI-R3 uygulama içi dürtmeler (geçiş ve hiperodak) gösterilsin mi (varsayılan açık).',
    'openItemCount': 'Günün açık plan öğesi sayısı (saatli + saatsiz).',
    'openTodayAsOneThing': "Bugün ekranı 'Şimdi tek şey' görünümünde açılsın mı (varsayılan kapalı).",
    'overCapacity': 'Planın kalanı günün kalan çalışma süresini aşıyor mu; sunucu hesaplar.',
    'placement': 'First öğeyi günün başına koyar (Yarının ilk işi); varsayılan Last.',
    'plannedRemainingSeconds': 'Şimdiden sonraki açık saatli blok süresi + açık saatsiz öğelerin bilinen kendi tahminleri.',
    'recurrence': 'Yearly (her yıl) veya Once (yalnız verilen yıl).',
    'reminder': 'Hatırlatma: None, SameDay, OneDayBefore veya OneWeekBefore; yerel 09:00.',
    'resumeCard': "UI-R3 'Nerede kalmıştım?' kartı gösterilsin mi (varsayılan açık).",
    'route': 'Hatanın görüldüğü sayfa yolu; yalnız path, query/host yok.',
    'specialDayId': 'Oluşumun ait olduğu özel gün.',
    'specialDay': 'Özel gün hatırlatmalarına izin (varsayılan açık).',
    'taskId': 'İlgili görev kimliği (owner kapsamında).',
    'timedScheduleId': 'Saatsiz öğe saatli bloğa dönüştüyse o bloğun kimliği; kimlik sürekliliği için.',
    'titles': 'Kafamı boşalt başlıkları: 1–50 adet, her biri 1–200 karakter; her biri kök görev olur.',
    'uiSupports': 'UI-R3 hesap genelindeki arayüz destekleri; eski belgeler varsayılanlarla okunur.',
    'unknownEstimateCount': 'Tahmini bilinmeyen açık saatsiz öğe sayısı; sıfır sayılmaz.',
    'version': 'Eşzamanlılık sürümü; yazmada aynen gönderilir, farklıysa 409.',
    'workingRemainingSeconds': 'Çalışma saatlerinin şimdiden sonra kalan kısmı; çalışma dışı özel günde 0.',
    'year': 'Tek seferlik günde zorunlu yıl; yıllık günde isteğe bağlı başlangıç yılı.',
    'id': 'DTO nesnesinin veya gruplama boyutunun kimliği; nullable analiz boyutu atanmadı/bilinmiyor grubunu temsil edebilir.',
    'accessToken': 'Uygulamanın süresiz Bearer JWT değeri; register/login yanıtında gelir.',
    'tokenType': 'Authorization şeması: Bearer.',
    'token': 'Yalnız parola sıfırlama kodu; uygulama JWT değildir,64karakter/30dk/tek kullanım.',
    'idToken': 'Google sağlayıcı kanıtı; geliştirmede Google kapalıdır.',
    'email': 'Hesap e-postası; kimlik eşleştirmede trim+uppercase normalizasyonu kullanılır.',
    'password': 'Register en az6karakter; login mevcut parolayı aynen alır. Trim/karmaşıklık eklemeyin.',
    'newPassword': 'Reset sonrası parola; en az6karakter. Eski JWT kopyalarını iptal etmez.',
    'displayName': 'Register alanı isteğe bağlı; boş/null ise trim edilmiş e-postanın tamamı kullanılır.',
    'taskVersion': 'Bu DTO bağlamındaki task sürümü; occurrence komutunda bağlı taskın güncel sürümü, snapshotta yakalanmış tarihsel sürüm.',
    'user': 'Doğrulanmış hesabın id/email/displayName özeti.',
    'title': 'Görev başlığı300, özel hatırlatma başlığı200karakter sınırındadır; DTO/use-case bağlamını izleyin.',
    'name': 'Koleksiyon adı200, focus preset adı100karakter; trim edilir.',
    'description': 'İsteğe bağlı açıklama; task/koleksiyon10000karakter. PUT omission null yapabilir.',
    'text': 'Not metni; trim sonrası1..10000karakter.',
    'message': 'Bilgilendirme/hata açıklaması; durum kararı için title/message parse etmeyin.',
    'code': 'Makineyle okunabilir hata/uyarı kodu; HTTP status ve DTO bağlamıyla değerlendirin.',
    'state': 'İlgili nesnenin enum durumu; Task/Work/Focus/Occurrence/Notification birbirinin yerine kullanılamaz.',
    'status': 'Proposal için Pending/Applied/Expired; HTTP problemde sayısal status. DTO bağlamını izleyin.',
    'kind': 'Blok/not/ilişki/bildirim/iş türü; o DTO enum veya string kümesini kullanın.',
    'type': 'Delta türü veya ProblemDetails URI türü; DTOya göre farklıdır.',
    'source': 'Gerçek çalışma kayıt kaynağı; ilgili WorkSource enumu.',
    'priority': 'Low/Normal/High/Urgent; sayısal enum sırasıyla sıralama yapmayın.',
    'action': 'TaskAction komutu; Completed durum adı yerine Complete eylemi gönderilir.',
    'parentCompletionChoice': 'CompleteSubtree/ParentOnly/Cancel; Cancel durum komutunu değiştirmeden sonuçlandırır.',
    'parentCompletionPolicy': 'Ask/CompleteSubtree/ParentOnly; parent complete seçiminde varsayılan.',
    'parentWorkDisposition': 'PreserveDirect veya ConvertToContainer; doğrudan işi olan parenta çocuk ekleme/taşıma niyeti.',
    'hasDirectWork': 'Görevin kendi fiziksel işi var; false container. Tahmin null olması false anlamına gelmez.',
    'directWorkCompleted': 'Bu görevin kendi iş bileşeni tamamlandı; altların veya tüm parentın tamamlanmasıyla aynı değil.',
    'requiredForParent': 'Üstün otomatik tamamlanmasında bu çocuk zorunlu mu.',
    'summaries': 'UI-R2: yalnız /api/tasks/children sayfasında satır başına özet; subtree yanıtında null.',
    'childCount': 'Arşivlenmemiş doğrudan alt görev sayısı.',
    'completedChildCount': 'Completed durumdaki doğrudan alt görev sayısı.',
    'plannedFrom': 'UI-R2 görevin kendi atanmış gün aralığının ilk günü (yerel tarih); plannedTo ile birlikte null veya dolu. Plan oluşturmaz, yalnız öneridir.',
    'plannedTo': 'UI-R2 kendi atanmış aralığın son günü (dahil).',
    'effectiveFrom': 'UI-R2 etkin aralık başlangıcı: açık çocuklardan biri aralıklıysa çocukların ilk günü, değilse görevin kendi aralığı.',
    'effectiveTo': 'UI-R2 etkin aralık sonu (dahil).',
    'rangeFromChildren': 'true ise etkin aralık çocuklardan türedi; görevin kendi aralığı yok sayılır.',
    'autoCompleteFromChildren': 'UI-R2: true ise zorunlu çocuklar bitince görev otomatik tamamlanır; false ise yalnız elle tamamlanır. Varsayılan true.',
    'completionOrigin': 'Manual veya Automatic tamamlanma; yeniden açma/ancestor reconciliation davranışını etkiler.',
    'hasOpenChildren': 'Doğrudan çocuklar arasında açık olan var; descendant kapsamıyla karıştırmayın.',
    'hasOpenDescendants': 'Alt ağacın herhangi bir derinliğinde açık görev var.',
    'requiredChildCount': 'Zorunlu doğrudan çocuk sayısı.',
    'incompleteRequiredChildCount': 'Henüz completed olmayan zorunlu doğrudan çocuk sayısı.',
    'countProgress': 'Bağımsız iş bileşenlerinin sayı bazlı ilerleme oranı; süre oranı değildir.',
    'taskCount': 'İlgili workload/rapor bağlamındaki görev sayısı.',
    'totalTaskCount': 'Alt ağaç/orman kapsamındaki görev sayısı; sayfadaki item sayısı değil.',
    'directComponentCount': 'Kendi işi bulunan bağımsız bileşen sayısı.',
    'openComponentCount': 'İlgili hesapta açık kalan bağımsız bileşen sayısı.',
    'componentCount': 'Plan referansına giren bağımsız iş bileşenlerinin sayısı.',
    'completedComponentCount': 'Referans bileşenlerden gerçekten completed olanların sayısı.',
    'canStart': 'Gerçek çalışma başlatma uygunluğu; future plan yerleşimi çalışma izni değildir.',
    'blockingPredecessorIds': 'Başlamayı engelleyen tamamlanmamış gerçek ön koşullar.',
    'reasons': 'Uygunluk/iş kuralı nedenleri; tamamı görünür tutulur, ilk neden tek sorun varsayılmaz.',
    'predecessorTaskId': 'Hedef görev başlamadan tamamlanması gereken source görev.',
    'beforeTaskId': 'Yumuşak ordering içinde önce gelmesi istenen source görev.',
    'sourceTaskId': 'İlişkinin kaynak görevi.',
    'targetTaskId': 'İlişkinin hedef görevi.',
    'beforeSiblingId': 'Aynı hedef parent altındaki kardeşten önce konumlandır; null sona ekleme.',
    'applyToSubtree': 'Sınıflandırmayı alt ağaca yayma açık niyeti; expectedPlanningVersion gerekir.',
    'values': 'İlgili komutun tam alan belgesi; PUTta yalnız değişen alanları göndermek güvenli değildir.',
    'settings': 'Preset veya bildirim ayarlarının tam snapshotı; bunlar farklı tiplerdir.',
    'language': 'CultureInfo tarafından tanınan dil; başlangıç tr.',
    'timeFormat': '12h veya24h sunum tercihi; süre hesaplama kuralını değiştirmez.',
    'weekStartsOn': '0Pazar..6Cumartesi; başlangıç1Pazartesi.',
    'planningMode': 'Preview veya Auto; /preview Auto tercihte de kabul edilmiş plan üretmez.',
    'minimumSplitSeconds': 'Otomatik parça alt sınırı1..86400sn; varsayılan900. Son kalan daha kısa olabilir.',
    'transitionSeconds': 'Geçiş tamponu0..86400sn; başlangıç0, actual çalışma değildir.',
    'supportEnabled': 'İsteğe bağlı DEHB destekleri; quick-start/rescue uygunluğunu etkiler.',
    'weekly': 'En çok70haftalık pencere; varsayılan boş,09–17varsayımı yok.',
    'exceptions': 'En çok366benzersiz tarih istisnası; o gün haftalık saatlerin yerine geçer.',
    'dayOfWeek': 'Haftanın günü0Pazar..6Cumartesi.',
    'startMinute': 'Yerel gece yarısından itibaren dahil dakika,0..1439; endMinute değerinden küçük.',
    'endMinute': 'Yerel gece yarısından itibaren hariç dakika,1..1440;1440ertesi gün00:00.',
    'intervals': 'Yerel günün çalışma aralıkları; aynı günde overlap yok. İstisnada boş array tatil günü.',
    'localIntervals': 'Seçili günün uygulanmış haftalık/istisna dakika aralıkları.',
    'utcIntervals': 'Çalışma pencerelerinin backend tarafından dönüştürülmüş UTC instantları.',
    'isAutomatic': 'Blok motor tarafından üretilmiş; fixed/locked veya actual anlamına gelmez.',
    'isPreserved': 'Öneri oluşturulurken mevcut yerleşimin korunduğunu gösterir.',
    'isActive': 'Motor bloğunda aktif gerçek çalışma koruması.',
    'allowConflicts': 'Manuel overlap uyarısını açık kabul; motorun çakışmasız sonucuyla aynı iddia değil.',
    'allowProtectedChange': 'Fixed/locked korumasını değiştirme açık niyeti; actual/geçmiş korumasını kaldırmaz.',
    'conflictsAccepted': 'Bu delta manuel çakışma kabulüyle kaydedilmiş.',
    'existingScheduleId': 'Proposal bloğunun mevcut kalıcı schedule ile bağı; yeni blokta null olabilir.',
    'splitGroupId': 'Bölünmüş plan parçalarının ortak soy/grup kimliği; yeni task kimliği değildir.',
    'originScheduleId': 'Parçanın türediği önceki kalıcı blok kimliği.',
    'schedules': 'Mutasyondan dönen etkilenen bloklar; günün bütün blokları olduğu varsayılmaz.',
    'blocks': 'Önerinin plan blokları; apply edilmeden accepted schedule değildir.',
    'changes': 'Önceki/sonraki blok farkları; tam revision snapshotının yerine geçmez.',
    'before': 'Değişiklik öncesi snapshot; yeni kayıtta null olabilir.',
    'after': 'Değişiklik sonrası snapshot; kaldırmada null olabilir.',
    'warnings': 'Başarılı200içindeki uyarılar; boş kapasite/koruma/tahmin farkı kaybolmaz.',
    'explanations': 'Motorun yerleşim kararlarına ilişkin açıklamalar.',
    'unplaced': 'Yerleşemeyen gerçek iş/miktar ve nedeni; sessiz başka güne taşıma değildir.',
    'seconds': 'İlgili uyarı/komutun saniye miktarı; snooze bağlamında60..86400.',
    'inputVersion': 'Proposalın dayandığı owner planningVersion; güncel entity version değildir.',
    'inputPlanningVersion': 'Tarihsel snapshot yakalandığındaki owner koordinasyon sürümü.',
    'anchorAt': 'Öneri zaman alt sınırı/koruma bağlamı; istemci şimdi saatinden yeniden üretmeyin.',
    'expiresAt': 'Proposal için2dkgeçerlilik; subscription için opsiyonel browser bitişi. DTO bağlamını ayırın.',
    'hasConstraintConflicts': 'Öneride hard kısıt çatışması var; apply engeli.',
    'isPartial': 'Undo telafisinin kısmi olması; normal kapasite açığı Unplaced içinde.',
    'applied': 'Proposalda nullable kabul sonucu; estimate önerisinde false bool. DTO bağlamı farklı.',
    'noChanges': 'Apply kabul edildi fakat yeni plan farkı üretilmedi; changeSetId null/revisionIds boş olabilir.',
    'replayed': 'Özgün işlemin sonucu tekrar dönüyor; güncel ölçüm/sürüm olduğunun garantisi değil.',
    'revisionIds': 'Aynı kabul/ChangeSet ile oluşan revision kimlikleri.',
    'reversesChangeSetId': 'Telafi/undo ile ters etkisi hesaplanan eski grup.',
    'algorithmVersion': 'Öneri/revision üreten algoritmanın sürüm etiketi.',
    'snapshotSchemaVersion': 'Immutable revision içerik şema sürümü.',
    'schemaVersion': 'TaskAtStart gibi snapshot payload sürümü.',
    'currentRevisionId': 'Planın güncel kabul edilmiş revisionı; boş günde null.',
    'baselineRevisionId': 'İlk Work içeren kabul edilmiş plan referansı; oluşmadıysa null.',
    'previousRevisionId': 'Aynı günün önceki kabul edilmiş sürümü.',
    'number': 'İlgili gün/seri içindeki artan revision/definition numarası.',
    'trigger': 'Revizyonun/olayın tetikleyici türü; kullanıcı reason metninden ayrıdır.',
    'reason': 'Kullanıcı veya domain gerekçesi; null yok/bilinmiyor olabilir, uygunluk koduyla karıştırmayın.',
    'effectiveAt': 'Olay/revizyonun etkili olduğu instant; createdAt ile her zaman aynı olmayabilir.',
    'dailyPlanId': 'Kullanıcının frozen-zone yerel gün planı kimliği; boş günde null olabilir.',
    'taskSnapshot': 'Blok oluşturulduğundaki görev/iş tanımı; bugünkü Task ile üzerine yazmayın.',
    'taskAtStart': 'Gerçek çalışma başlangıcındaki isim/yol/sınıflandırma snapshotı; eski kayıtta null olabilir.',
    'ancestors': 'Snapshot sırasında kökten parenta sıralanmış ata kimlik/adları.',
    'capturedAt': 'Snapshotın yakalandığı UTC instant.',
    'taskAtDayEnd': 'Seçili tarih sonundaki olay tabanlı task durumu; Available false ise bilinmiyor.',
    'available': 'Tarihsel state/bağlam elde edilebildi; false veriyi güncel Task ile doldurma izni değil.',
    'session': 'Current focus içinde nullable aktif/paused/break döngü; WorkId ayrı alan.',
    'activeSession': 'CurrentWork yalnız Running oturumu; Paused varsa bile null dönebilir.',
    'sessionId': 'Gerçek çalışma oturumu kimliği.',
    'segmentId': 'Kesintisiz gerçek çalışma aralığının kimliği.',
    'startedScheduleId': 'Gerçek çalışma başlarken seçilen kalıcı plan bloğu; plansızsa null.',
    'startedRevisionItemId': 'Başlangıç planının immutable revision item bağı; replan ile değiştirilmez.',
    'recordedAt': 'Gerçek kaydın sisteme girildiği instant; manuel kayıtta startedAt farklı geçmiş instant olabilir.',
    'pausedSession': 'Acil geçişte gerçekten duraklatılan önceki oturum; yoksa null.',
    'resumed': 'Acil başlangıç yeni session yerine aynı taskın paused sessionına devam etti.',
    'expectedSessionId': 'Acil kesilecek mevcut Running work kimliği; beklenmedik yeni oturumu kesmemek için.',
    'expectedSessionVersion': 'ExpectedSessionId ile birlikte mevcut workün beklenen sürümü.',
    'remainingTaskIds': 'Acil iş sonrası gün planında değerlendirilecek isteğe bağlı görev seçimi.',
    'planningStatus': 'ImmediateWorkResult: Preview/Applied/NeedsPreview/Unavailable; work sonucu bunlardan bağımsız kalıcıdır.',
    'planningError': 'Acil work başladıktan sonraki plan hatasının kodu; HTTP200içinde gelebilir.',
    'previousValues': 'Correction öncesi segment snapshotı; ilk manuel kayıt için null olabilir.',
    'newValues': 'Correction sonrası effective segment; journal ayrıca actual süre değildir.',
    'previousSession': 'Correction öncesi session zaman/durum/sürüm snapshotı.',
    'newSession': 'Correction sonrası session zaman/durum/sürüm snapshotı.',
    'sequence': 'İlgili görev/oturum kapsamındaki kararlı artan olay/audit sırası.',
    'previousFocusId': 'Önceki döngü; next yeni focusId üretir, aynı workSessionId korunabilir.',
    'cycleNumber': 'Bir focus dizisindeki1tabanlı döngü numarası; uzun mola sıklığında kullanılır.',
    'presetId': 'Kayıtlı preset kimliği; özel settings ile birlikte verilmez.',
    'presetName': 'Focus başlangıcında yakalanmış preset adı.',
    'presetVersion': 'Başlangıç preset sürümü; preset düzenlemesi eski focus ayarlarını değiştirmez.',
    'builtIns': '15/5,25/5,45/10settings önerileri; bunlar otomatik kayıtlı preset GUIDleri değildir.',
    'longBreakEvery': 'Uzun mola döngü sıklığı1..20; varsayılan4.',
    'notificationsEnabled': 'Focus ayarındaki bildirim tercihi; global notification/provider izni ayrıca geçerlidir.',
    'targetObservedAt': 'Hedefin server tarafından gözlendiği instant; matematiksel targetReachedAt farklı olabilir.',
    'targetEventId': 'Hedefe ulaşma olayının kalıcı kimliği; bir defalık bildirim/dedup bağlamı.',
    'effectiveTargetReached': 'Düzeltilmiş güncel actual hedefe ulaşıyor mu; tarihsel olay korunabilir.',
    'workEndedAt': 'Bu focus döngüsünün çalışma kesimi sonu; tüm WorkSession bitişi olmayabilir.',
    'breakStartedAt': 'Planlı focus molasının başladığı instant.',
    'breakEndedAt': 'Molanın server tarafından bitmiş/atlanmış olarak kapandığı instant.',
    'breakTargetSeconds': 'Bu döngüde kısa/uzun mola hedefi.',
    'breakElapsedSeconds': 'Mola başlangıcından itibaren hesaplanan süre; actual çalışma değildir.',
    'breakRemainingSeconds': 'Kalan mola hedefi; sıfırda otomatik sonraki çalışma başlamaz.',
    'skipBreak': 'next komutunda bitmemiş molayı açıkça atlama; varsayılan false.',
    'localDate': 'Kaydın kendi zaman dilimindeki gün; UTC instant değildir.',
    'timeZoneId': 'İlgili kaydın IANA zone bağlamı; geçmiş kayıtta frozen olabilir.',
    'sourceStartedAt': 'Geceye bölünmeden önceki gerçek segmentin özgün başlangıcı.',
    'sourceEndedAt': 'Özgün segment bitişi; hâlâ açıksa null.',
    'sessionStillRunning': 'Calendar kesitinin kaynak work oturumu halen açık/Running.',
    'planTimeZoneId': 'Seçili historical planın frozen zoneu.',
    'plannedWorkSeconds': 'Referans bloklardaki planlı Work süre toplamı; actual değildir.',
    'plannedBreakSeconds': 'Planlı Break süre toplamı; actual çalışma değildir.',
    'plannedBufferSeconds': 'Planlı Buffer süre toplamı; actual çalışma değildir.',
    'baselineWorkSeconds': 'Baseline revisionındaki planlı Work toplamı.',
    'plannedBlockCount': 'Güncel plan bağlamındaki blok sayısı.',
    'actualSeconds': 'Rapor/kesişim bağlamındaki effective gerçek çalışma saniyesi.',
    'actualSegmentCount': 'Gün aralığına kesişen farklı gerçek segment sayısı.',
    'completedTaskCount': 'Seçili günün completion olaylarına dayanan görev sayısı.',
    'hasOpenWork': 'Gün bağlamına kesişen açık gerçek çalışma var.',
    'legacyZoneCompletionCount': 'Frozen zone bilgisi eksik tarihsel completion kayıtlarının ayrı kapsam sayısı.',
    'legacyZoneDeferCount': 'Frozen zone bilgisi eksik erteleme olaylarının ayrı kapsam sayısı.',
    'completions': 'Seçili günün bağımsız sayfalı tamamlanma olayları.',
    'revisionItemId': 'Calendar satırının seçilmiş revision içindeki immutable blok kimliği.',
    'availableEnergy': 'Günün isteğe bağlı yumuşak efor tercihi; hard constraint değil.',
    'energyDemand': 'Görevin isteğe bağlı efor ihtiyacı; null tercih yok.',
    'criticalTaskIds': 'Gün için0..3benzersiz arşivlenmemiş task; boş array desteği temizler.',
    'lastWork': 'Gerçekte son çalışılan görev/segment bağlamı; nullsa veri yok.',
    'lastCompletion': 'Gerçek en son tamamlanan alt adım ve olay sırası.',
    'lastNote': 'Geri dönüş bağlamındaki son not; yoksa null.',
    'nextStepNote': 'İşe dönüş için seçilmiş NextStep notu; yoksa null.',
    'suggestedStep': 'Backendin önerdiği uygun küçük görev; kendiliğinden başlatılmaz.',
    'openDirectTaskCount': 'Dönüş bağlamındaki açık bağımsız iş sayısı.',
    'availableActions': 'Gün sonu için Carry/Move/Pool/Cancel önerileri; GET işlem uygulamaz.',
    'convertedTaskId': 'Notun dönüştürüldüğü mevcut görev; aynı notu tekrar çoğaltmayın.',
    'noteVersion': 'Dönüşümden sonraki note sürümü.',
    'frequency': 'Daily/IntervalDays/Weekly/Monthly; alan kombinasyonları Entegrasyon-Kurallari içinde.',
    'interval': 'Frequency bazında tekrar aralığı; Daily1,IntervalDays1..366,Weekly1..52,Monthly1..24.',
    'startDate': 'Tekrar dizisinin dahil başlangıç tarihi.',
    'untilDate': 'Opsiyonel dahil seri bitişi; startDate öncesi olamaz.',
    'weekDays': 'Weekly için1..7benzersiz gün0..6; diğer sıklıklarda boş/null.',
    'monthDay': 'Monthly günü1..31;29..31için monthEnd açık seçilir.',
    'monthEnd': 'Skip veya ClampToLastDay; Monthly dışındaki sıklıklarda null.',
    'dueTime': 'Serinin yerel deadline saati; dakika hassasiyeti, plan bloğu değildir.',
    'startTime': 'UI-R4: son teslimden ayrı yerel başlangıç saati; dakika hassasiyeti.',
    'autoAddToPlan': 'UI-R4: sunucu occurrence üretiminde gün planına ekleme tercihi; eski tanımlarda false.',
    'timingIssue': 'UI-R4: otomatik saat kurulamama nedeni; ScheduleOverlap, LocalTimeUnavailable, PlanTimeZoneMismatch veya EstimateTooLong. Görev gün planında görünür kalır.',
    'gap': 'Olmayan yerel DST saati: Reject/Skip/ShiftForward.',
    'overlap': 'İki kez oluşan yerel saat: Reject/Earlier/Later.',
    'rule': 'Tam recurrence kuralı; şablon definition içinde immutable snapshot.',
    'effectiveFrom': 'Yeni definitionın uygulanmaya başlayacağı yerel gün; seri update geçmişi korur.',
    'refreshExisting': 'Mevcut uygun occurrence görevlerini bounded pencerede yenileme açık niyeti.',
    'refreshThrough': 'RefreshExisting true ise zorunlu dahil son tarih; false ise verilmez.',
    'definitionId': 'Template yanıtında seçilmiş/güncel immutable definition kimliği.',
    'definitionNumber': 'Template definitionının artan numarası.',
    'originalDefinitionId': 'Occurrence ilk üretildiğinde seçilen definition; korunur.',
    'appliedDefinitionId': 'Son güvenli refreshte uygulanmış definition.',
    'originalTimeZoneId': 'Occurrence ilk üretim zoneu; güncel tercihle yeniden yazılmaz.',
    'originalDueTime': 'Occurrence özgün yerel deadline saati.',
    'originalDueAt': 'Occurrence özgün çözülmüş deadline instantı; deadline yoksa null.',
    'timeAdjusted': 'DST gap ShiftForward nedeniyle deadline ileri alındı.',
    'taskChangedSinceSync': 'Occurrence taskı son template sync sürümünden farklı; refresh korumasında kullanılır.',
    'refreshedTaskIds': 'Seri update sırasında gerçekten yenilenmiş görevler.',
    'protectedTaskIds': 'Geçmiş/çalışılmış/planlı/manuel değiştirilmiş olduğu için yenilenmemiş görevler.',
    'occurrences': 'Bu mutasyonun etkilediği occurrence sonuçları; tüm seri sanmayın.',
    'template': 'Recurrence mutasyonu sonrası template özeti.',
    'active': 'Subscription aktif kayıt durumu; OS izni/teslim kanıtı değildir.',
    'endpoint': 'Browser PushSubscription endpointi; frontend üretmez, listede geri verilmez.',
    'p256dh': 'Browser subscription public key; URL-safe base64, sunucu VAPID publicKey alanından farklı.',
    'auth': 'Browser subscription auth secret; JWT değildir, listede geri verilmez.',
    'label': 'Subscription için en çok100karakter cihaz etiketi; analizde ise grup etiketi.',
    'publicKey': 'Push açıkken VAPID public key; sunucu JWT keysi değildir, kapalıysa null.',
    'pushEnabled': 'Kullanıcının push tercihi; server push-config ve OS izinleri ayrıca gerekir.',
    'leadSeconds': 'Bildirim ön zamanı0..86400sn; kaynak zamanından bir kez çıkarılır.',
    'snoozeSeconds': 'Varsayılan erteleme60..86400sn; başlangıç300.',
    'quietStart': 'Sessiz aralığın dahil yerel başlangıcı; quietEnd ile birlikte veya ikisi null.',
    'quietEnd': 'Sessiz aralığın hariç sonu; quietStart ile eşit olamaz, geceyi geçebilir.',
    'returnAfterSeconds': 'Pause sonrası dönüş hatırlatması0..86400sn;0kapalı.',
    'scheduleStart': 'Plan bloğu başlangıç bildirim türünü açar.',
    'scheduleEnd': 'Plan bloğu bitiş bildirim türünü açar.',
    'taskDeadline': 'Görev deadline bildirim türünü açar.',
    'focusTarget': 'Odak hedefe ulaşma bildirim türünü açar.',
    'breakEnd': 'Odak molası bitiş bildirim türünü açar.',
    'returnToTask': 'Normal paused işe dönüş bildirim türünü açar.',
    'custom': 'Kullanıcının özel hatırlatma bildirim türünü açar.',
    'canceled': 'Özel hatırlatma iptal işareti; görev canceled veya OS abonelik durumu değil.',
    'attempts': 'Kalıcı işin başarısız/deneme sayacı; DND ertelenmesi her zaman tüketmez.',
    'availableAt': 'Outbox işinin tekrar denenebileceği en erken instant.',
    'leaseUntil': 'Worker tarafından alınmış iş kilidinin süre sınırı; owner UI yönetmez.',
    'lastErrorCode': 'İşin son güvenli hata kodu; ham provider body/secret içermez.',
    'handledAt': 'İlgili kalıcı iş/hatırlatma işlendi instantı; browser teslim kanıtı değil.',
    'accuracy': 'Tamamlanmış karşılaştırılabilir işlerin tahmin hatası örneklem/ortalama özeti.',
    'activeCycleCount': 'Rapor kesiminde pozitif effective focus çalışması veren distinct cycle sayısı.',
    'actual': 'Takvimde bağımsız sayfalı gerçek segment kesitleri; plan bloklarından farklı kaynak.',
    'actualTimeZonePolicy': 'Actual gruplama zone politikası; SourceSessionZone geçmişi bugünkü zonea taşımaz.',
    'archivedAt': 'Soft arşiv instantı; null arşivlenmemiş. Geçmiş work/revision silinmez.',
    'averageActiveSeconds': 'Rapor focus actual / distinct ActiveCycleCount; payda0ise null.',
    'averageLateSeconds': 'Yalnız geç başlayan karşılaştırılabilir örneklerin ortalama pozitif gecikmesi.',
    'averageSignedDelaySeconds': 'Erken başlangıç negatif olacak şekilde imzalı başlangıç farkı ortalaması.',
    'baseline': 'İlk Work içeren kabul edilmiş plan referansının metrikleri.',
    'current': 'En son kabul edilmiş plan referansının metrikleri; baselineın yerine geçmez.',
    'bucket': 'Day/Week/Month rapor gruplaması.',
    'bucketStart': 'Doğal hafta/ay/gün başlangıcı; bucket From/To talep aralığında kesilmiş olabilir.',
    'buckets': 'Dönem bucket sonuçları; distinct sayaç ve ortalamalar toplanarak totals yeniden üretilmez.',
    'category': 'Snapshot kategori kimliği/adı; null o anda kategori yok.',
    'project': 'Snapshot proje kimliği/adı; null o anda proje yok.',
    'pool': 'Snapshot görev havuzu kimliği/adı; null o anda havuz yok.',
    'tags': 'Snapshot anındaki etiket kimlik/adları; bugünkü etiket adları geçmişi değiştirmez.',
    'comparisonContext': 'Suggestion bağlamı RecurrenceTemplate/Category/Project/None; otomatik az-veri fallbacki yok.',
    'contextId': 'Seçilmiş suggestion karşılaştırma grubunun kimliği; None için null.',
    'completedAt': 'Gerçek task completion veya outbox tamamlama instantı; DTO bağlamını ayırın.',
    'conflictingEstimateCount': 'Aynı referans kümesinde bir task için farklı tahmin snapshotı sayacı.',
    'conflictingPlannedSeconds': 'Ham Work blok toplamı ile Work aralık birleşimi arasındaki overlap farkı.',
    'count': 'İlgili trigger/reason grubunun kayıt sayısı; toplam task sayısı değildir.',
    'countCompletion': 'CompletedComponentCount/ComponentCount; unknown history/boş payda/eksik snapshotta null.',
    'createdAt': 'Kaydın oluşturulma instantı; effectiveAt/startedAt ile aynı olmak zorunda değil.',
    'updatedAt': 'Kaydın son güncellenme instantı.',
    'day': 'Gün sonu hazırlığında CalendarDayView; ayrıca OpenWork aday sayfası döner.',
    'days': 'İstenen dahil tarih aralığındaki gün sonuçları; dağıtım ve rapor DTOları farklıdır.',
    'deferCount': 'Rapor kesimindeki erteleme olay sayısı; atlanan/iptal iş tamamlanma değildir.',
    'deferReasons': 'Erteleme nedenleri ve neden kapsama sayımları.',
    'deletedAt': 'Soft silinmiş not instantı; silme200View yanıtında dolabilir.',
    'dimension': 'Actual breakdown Task/Project/Category gruplama boyutu.',
    'directActualSeconds': 'Yalnız seçili taskın effective gerçek işi; subtree toplamına ayrıca eklemeyin.',
    'subtreeActualSeconds': 'Seçili task ve alt ağacındaki gerçek segmentlerin tek sayımlı toplamı.',
    'dueAt': 'Reminder/not/occurrence deadline instantı; plan bloğu bitişi değildir. Reminder future kuralı nottan farklı.',
    'durationCompletion': 'KnownCompletedEstimatedSeconds/KnownEstimatedSeconds; boş payda/unknown state/eksik snapshotta null.',
    'earlyCount': 'Tolerans dışında erken başlayan karşılaştırılabilir örnek sayısı.',
    'effectiveTargetsReached': 'Correction sonrası gerçek hedef instantı rapor kesimine düşen distinct focus cycle sayısı.',
    'recordedTargetsReached': 'Kalıcı tarihsel TargetReachedAt olayı raporda olan cycle sayısı.',
    'estimateCoverage': 'Bilinen tahminli referans component sayısı/componentCount; payda0ise null.',
    'estimatedSeconds': 'Bağımsız doğrudan iş tahmini; null bilinmiyor. Parent target budget değildir.',
    'eventId': 'Olayın kalıcı kimliği; SignalRda outbox event dedup kimliği.',
    'eventSequence': 'Task olaylarının kendi iç sırası; task version veya global stream sequence değil.',
    'excludedUnknownZoneCount': 'Suggestionda frozen zone bilinmediği için dışlanan örnekler.',
    'excludedWithoutRecordedWorkCount': 'Tahmin doğruluğu hesabında recorded actual olmadığı için dışlanan örnekler.',
    'excludedWithoutWorkCount': 'Suggestionda pozitif recorded work olmadığı için dışlanan örnekler.',
    'finishedCount': 'EndedAt rapor kesiminde olan Finished focus sayısı; Interrupted dahil değil.',
    'fixedStarts': 'Sabit blokların örneklemli başlangıç gecikmesi dağılımı.',
    'flexibleStarts': 'Esnek blokların örneklemli başlangıç gecikmesi dağılımı.',
    'focus': 'Aynı gerçek çalışmanın focus alt kümesi; WorkSeconds üzerine tekrar eklenmez.',
    'from': 'UTC offsetli dahil aralık başlangıcı; date-only FromDate ile aynı tip değil.',
    'to': 'UTC offsetli hariç aralık bitişi; date-only ToDate dahil olabilir.',
    'generalWorkSeconds': 'TaskId=null effective çalışma; uydurma görev/projeye yazılmaz.',
    'manualWorkSeconds': 'WorkSeconds içindeki Manual kaynaklı alt küme; toplama ayrıca eklenmez.',
    'taskWorkSeconds': 'WorkSeconds içindeki gerçek TaskId bulunan alt küme.',
    'knownCompletedEstimatedSeconds': 'Completed referans componentlerin bilinen snapshot tahmin toplamı.',
    'knownOvertimeSeconds': 'Bilinen direct tahmin üzerinde kalan effective actual; negatif olamaz.',
    'knownRemainingSeconds': 'Tahmini bilinen açık bağımsız işlerin max(0,estimate-actual) toplamı.',
    'lateCount': 'Tolerans dışında geç başlayan karşılaştırılabilir örnek sayısı.',
    'meanAbsoluteErrorSeconds': 'Karşılaştırılabilir tamamlanmış işlerde abs(actual-estimate) ortalaması.',
    'meanErrorSeconds': 'Karşılaştırılabilir tamamlanmış işlerde actual-estimate imzalı ortalaması.',
    'method': 'Suggestion hesap yöntemi etiketi MedianCompletedComparableActual.',
    'metrics': 'Bucketın actual/focus metrik nesnesi; global distinct totals yerine toplanmaz.',
    'missingSnapshotBlockCount': 'Tarihsel iş snapshotı eksik referans plan blok sayısı.',
    'missingSnapshotSeconds': 'Task bağlı fakat başlangıç snapshotı eksik actual saniyesi.',
    'noteId': 'Dönüştürülen veya bağlamda kullanılan not kimliği.',
    'occurredAt': 'Kaynak olayın instantı; lead/NotBefore/ReadyAt teslim zamanından ayrıdır.',
    'onTimeCount': 'StartToleranceSeconds içinde başlayan karşılaştırılabilir örnekler.',
    'openWork': 'Gün sonundaki açık iş aday sayfası; aktif Running work nesnesi değildir.',
    'plan': 'CalendarDayde plan sayfası, ImmediateWorkResultta nullable kalan-gün proposalı; DTO bağlamını ayırın.',
    'quotaSeconds': 'Referans planda task için ayrılan süre kotası.',
    'quotaFulfilledSeconds': 'Kotaya sayılan actualın kota ile sınırlandırılmış kısmı; task completion değildir.',
    'quotaRatio': 'QuotaFulfilledSeconds/QuotaSeconds; boş payda null.',
    'reasonAvailable': 'Tarihsel erteleme gerekçesi mevcut; false nedenin bilinmediğini belirtir.',
    'resourceId': 'Workload sorgulanan proje/havuz/kategori/etiket kimliği.',
    'revisionCount': 'İlgili gün/rapor kapsamındaki kabul edilmiş revision sayısı.',
    'revisionNumber': 'Güncel/seçili planın kendi gün içi artan revision numarası.',
    'revisionReasons': 'Trigger+Reason bazında revision sayımları; tek reason stringi değildir.',
    'sampleCount': 'İlgili metrikte karşılaştırılabilir örnek sayısı; gösterilen Samples uzunluğundan büyük olabilir.',
    'sampleLimit': 'Suggestion response Samples listesi üst sınırı20; medyana giren toplam örnek sınırı değildir.',
    'samples': 'Suggestion son20görünür örneği; SuggestedSeconds tüm uygun örneklerden gelir.',
    'schedule': 'Kalıcı/günsel revision bağlamındaki blok snapshotı.',
    'scheduleIds': 'Uyarıya konu plan blok kimlikleri.',
    'segmentCount': 'Pozitif rapor kesişimi veren distinct effective segment sayısı; bucketlardan toplanmaz.',
    'sessionCount': 'Pozitif rapor kesişimi veren distinct work session sayısı; bucketlardan toplanmaz.',
    'snapshotAvailable': 'Breakdown etiketinin tarihsel snapshot bilgisi var; false güncel adla doldurulmaz.',
    'soundEnabled': 'İlgili focus/bildirim ses tercihi; browser izin/otoplay ve global tercih ayrıca geçerlidir.',
    'sourceId': 'Türüne göre task/event/revision/notification kimliği; her türde aynı kaynak varsayılmaz.',
    'startToleranceSeconds': 'Erken/geç sayım toleransı0..3600sn; başlangıç60.',
    'startedCount': 'StartedAt rapor günlerine düşen focus cycle sayısı; actual0olabilir.',
    'suggestedSeconds': 'En az3uygun tamamlanmış actualın medianı; bulunamazsa null.',
    'summary': 'Takvim gününün plan/actual/completion özet nesnesi.',
    'targetDate': 'Schedule move hedef yerel günü; StartsAt/EndsAt ile aynı gün bağlamına uymalı.',
    'task': 'DTO bağlamında TaskView, planning snapshot veya recurring task defaults; şekli ilgili ref belirler.',
    'taskState': 'Occurrence/task snapshotındaki TaskState; TaskId olmayınca null olabilir.',
    'templateId': 'Occurrenceın bağlı olduğu recurrence template kimliği.',
    'timeZonePolicy': 'Raporun gerçek kayıtları gruplama politikası; güncel user zoneu ile history rewrite yok.',
    'totalWorkSeconds': 'Breakdown tüm rapor actualı; sayfalı Items toplamı değildir.',
    'totals': 'Bütün raporun server tarafından tekilleştirilmiş metrikleri.',
    'unavailableReason': 'Suggestion üretilememe kodu no_comparable_context/insufficient_samples; nullsa öneri var.',
    'unknownCompletionCount': 'Referans taskın tarihsel completion/direct tanımı bilinmeyen component sayısı.',
    'unknownRemainingCount': 'Açık bağımsız işlerde kalan tahmini bilinmeyen component sayısı.',
    'unplannedActualSeconds': 'İlgili plan referansıyla kapsanmayan gerçek çalışma; yanlışlıkla0yapılmaz.',
    'work': 'ImmediateWorkResult gerçek başlangıç receiptı; plan sonucu başarısız olsa da bu gerçek korunur.',
}

SCHEMA_FIELD_NOTES = {
    'NoteView': {'title': 'Yalnız Detailed/Toggle notta zorunlu, 1–200 karakter, trim edilir; Short notta null olmalıdır.', 'categoryId': 'Owner not kategorisi; null kategorisiz. Yazmada etkin kategori gerekir; kaldırılmış kategorideki notlar bağını korur.', 'display': 'Short tek metin; Detailed listede başlık + pencere; Toggle listede başlık + yerinde açılan içerik. NextStep yalnız Short.', 'taskTitle': 'Bağlı görevin güncel başlığı aynı okumada; görev yoksa null. Görev kopyası değildir.'},
    'NoteFields': {'title': 'Yalnız Detailed/Toggle notta zorunlu, 1–200 karakter, trim edilir; Short notta null olmalıdır.', 'categoryId': 'Owner not kategorisi; null kategorisiz. Yazmada etkin kategori gerekir; kaldırılmış kategorideki notlar bağını korur.', 'display': 'Short tek metin; Detailed listede başlık + pencere; Toggle listede başlık + yerinde açılan içerik. NextStep yalnız Short.'},
    'EditNoteRequest': {'display': 'Null/verilmezse başlık, kategori ve gösterim aynen kalır (yalnız metin/tarih düzenleme). Değer verilirse title ve categoryId birlikte yeniden yazılır.', 'title': 'display verildiğinde: Detailed/Toggle için 1–200, Short için null.', 'categoryId': 'display verildiğinde yeni değerdir; null kategoriyi kaldırır. Değişmeyen kaldırılmış kategori kabul edilir, yeni kategori etkin olmalıdır.'},
    'NoteCategoryView': {'name': 'Owner içinde etkin kategoriler arasında Türkçe büyük/küçük harf duyarsız benzersiz, 1–40 karakter.', 'color': 'Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor); gerçek renk istemcinin tema tokenıdır.', 'showInBar': 'Notlar üst çubuğunda düğme olarak gösterilir; false olanlar Diğer menüsündedir.', 'pinInAll': 'Tümü görünümünde bu kategorinin notları en üstte ayrı bölümdedir.', 'viewMode': 'Kategori görünümünün kayıtlı Kartlar/Liste tercihi.', 'removedAt': 'Doluysa kategori kaldırılmıştır: seçicide ve çubukta yoktur, notları bağını korur; restore ile döner.'},
    'NoteCategoryFields': {'name': '1–40 karakter, trim edilir; etkin kategoriler arasında benzersiz.', 'color': 'Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor).', 'showInBar': 'Varsayılan true.', 'pinInAll': 'Varsayılan false.'},
    'NoteCategoryChange': {'name': '1–40 karakter, trim edilir; etkin kategoriler arasında benzersiz.', 'color': 'Yedi renk anahtarından biri (Gri, Mavi, Turkuaz, Yeşil, Kırmızı, Pembe, Mor).', 'showInBar': 'Üst çubukta göster.', 'pinInAll': 'Tümü görünümünde üstte sabitle.', 'viewMode': 'Kategori görünümü Kartlar/Liste.'},
    'NoteCategoryMove': {'beforeCategoryId': 'Hedef etkin kategorinin önüne taşır; null sona taşır.'},
    'NoteCategoryList': {'items': 'Önce etkin kategoriler kullanıcı sırasıyla, sonra kaldırılanlar en yeni kaldırılan önce.', 'allViewMode': 'Tümü sistem görünümünün Kartlar/Liste tercihi.', 'taskViewMode': 'Görev notları sistem görünümünün Kartlar/Liste tercihi.', 'notesVersion': 'Notlar kaynak sürümü; kategori ve not yazıları artırır, NotesChanged canlı olayı yayınlanır.'},
    'NoteSystemViews': {'allViewMode': 'Tümü görünümü Kartlar/Liste.', 'taskViewMode': 'Görev notları görünümü Kartlar/Liste.'},
    'NotificationAlertPage': {'serverNow': 'Bu okumanın UTC sunucu anı; frontend saatinin yerine tazelik referansı. Cursor üst sınırı ilk sayfanın kesimini korur.', 'preferencesVersion': 'Bu sayfanın güncel owner notification preference sürümü; kayıt yoksa0. İstemci değişiklik gördüğünde yeni serverNow baseline kurar ve önceki tercih döneminin alarmlarını çalmaz; sayfalar arasında değişebilir.', 'items': 'En çok limit adaydan güncel kaynak/tür/sessiz saat kontrollerini geçen Ready, okunmamış, gönderim zamanı son120sn içindeki alarmlar. Ses kapalı öğe soundEnabled=false ile kalır; boş sayfanın devamı olabilir.', 'nextCursor': 'Devam varsa owner ve ilk sayfanın asOf kesimiyle artan (dueAt,id) keyset pozisyonu; token/sır değildir. Her yeni gözlem turunda cursorsuz başla; stale/bozuk/yabancı imleç400.'},
    'TaskDetailView': {'task': 'Güncel tam düzenleme belgesi; task/version yazmalarda korunur.', 'rowSummary': 'Görünür doğrudan çocuk/etkin aralık ve bilinen alt ağaç toplamı; süre bütçesi ayrıca eklenmez.', 'workload': 'Ortak aktif subtree girdisinden mevcut domain iş yükü hesabı.', 'time': 'Aynı subtree üstkümesinden gerçek çalışma; arşivli dalların geçmişi korunur.', 'progress': 'Aynı aktif subtree üzerinden mevcut domain ilerlemesi; sayaç görevi bitirmez.', 'classification': 'Mevcut tam sınıflandırma değerleri/task sürümü/planning sürümü.', 'labels': 'Yalnız seçili project/pool/category/tag id, ad, sürüm ve arşiv işaretleri; tam resource cache belgesi değildir.', 'parent': 'Doğrudan üst görevin küçük kimlik/başlık satırı; tüm ancestor yolu değildir.', 'planningVersion': 'Aynı owner snapshotındaki planning sürümü; task version yerine geçmez.'},
    'TaskAncestorRow': {'id': 'Owner kapsamındaki üst görev kimliği.', 'title': 'Üst görevin güncel başlığı; tam TaskView değildir.', 'parentTaskId': 'Bir üst bağlantı; kökte null.', 'version': 'Üst görevin kendi sürümü.'},
    'TaskAncestorPage': {'taskId': 'İstenen başlangıç görevi; başka yol ile karıştırılmaz.', 'planningVersion': 'Owner planningVersion kapsam sürümü; bu değişirse devam409 ancestor_cursor_stale döner.', 'items': 'Yakından uzağa en çok limit üst görev; başlangıç görevi dahil değildir.', 'nextCursor': 'Devam yoksa null. Owner/görev/planningVersion/offset ve amaç ayrımlı HMAC doğrulamasına bağlı opak imleç; auth tokenı değildir.'},
    'TaskResourceLabel': {'kind': 'projects/pools/categories/tags kaynak türü.', 'id': 'Yalnız seçili owner kaynağı kimliği.', 'name': 'Kaynağın güncel adı.', 'version': 'Kaynağın güncel kendi sürümü.', 'archivedAt': 'Seçili kaynak arşivli ise instant; geçmiş bağ görünür kalır.'},
    'CalendarOverviewView': {'days': 'İstenen1–42 yerel günün tamamı; boş günler de döner.', 'planningVersion': 'Owner snapshotındaki plan/kaynak sürümü; yazmanın kendi version alanının yerine geçmez.'},
    'CalendarOverviewDay': {'itemCount': 'Günün bütün güncel saatli Work ve saatsiz öğelerinin sayısı; yalnız önizleme değildir.', 'completedItemCount': 'Bütün gün kapsamındaki completedAt dolu öğeler; görev yaşam döngüsü tamamlanması değildir.', 'rootGroupCount': 'Bu günün bütün ayrı kök görev grupları; +N bu gerçek toplamdan üretilir.', 'roots': 'İlk görünüm sırasındaki en çok3 kök grup önizlemesi; alt ağaç/öğe listesi değildir.', 'timeZoneId': 'Plan varsa frozen gün zone, yoksa kullanıcı tercihi.'},
    'CalendarRootPreview': {'rootTaskId': 'Owner kapsamındaki en üst görev kimliği.', 'rootTitle': 'Kök görevin güncel başlığı.', 'itemCount': 'Gruptaki bütün gün öğelerinin sayısı.', 'completedItemCount': 'Gruptaki bütün completedAt dolu öğeler.', 'done': 'Gruptaki bütün öğeler tamamlanmışsa true; ilk3 önizlemeden hesaplanmaz.'},
    'ReadCoverage': {'versions': 'Bu yanıtla aynı PostgreSQL snapshot/owner transaction sınırındaki planning, notes ve specialDays sayaçları.', 'serverNow': 'Bu okumanın backend zaman referansı; sürüm eşitliğinin yanında kısa tazelik bütçesiyle kullanılır, aktif süreyi dondurmak için kullanılamaz.'},
    'DaySignalsView': {'localDate': 'İlgili yerel plan günü; başka günün bildirim işaretleri bu günün yokluğu kanıtı sayılmaz.', 'returnThresholdSeconds': 'İşe dönüş eşiği; ReturnToTask açık ve pozitif süreli değilse mevcut 1800 saniye varsayılanı.', 'notifications': 'Bu günün saatli blokları veya son çalışma için gerçekten Ready ve okunmamış bildirim işaretleri; bütün inbox değildir.', 'complete': 'İlgili işaretler 1000 sınırı içinde tamamen tarandıysa true; false durumda bildirim yok varsayılmaz.', 'lastWork': 'StartedAt/Id sırasındaki son gerçek çalışma; geçmişi ve kendi serverNow referansı korunur.', 'focusIncluded': 'Çalışan iş, açık nudge desteği ve gerçek bugün kapsamı nedeniyle focus gözlemi yapıldıysa true; false null focus yokluğu değildir.', 'focus': 'Yalnız mevcut Today nudge gözlem koşuluyla değerlendirilen odak; sayaç/görev tamamlanmasıyla karıştırılmaz.', 'runningWorkSessionId': 'Bu okuma kesimindeki gerçekten Running oturum; null ise yoktur.', 'runningTask': 'Hyperfocus ipucunun ihtiyaç duyduğu çalışan görev kimliği/kendi tahmini; tam görev belgesi değildir.'},
    'RunningTaskContext': {'taskId': 'Bu owner çalışan oturumunun bağlı görev kimliği.', 'hasDirectWork': 'Kendi işi olan görev bağlamı; konteyner toplamı yerine kullanılamaz.', 'directEstimatedSeconds': 'Çalışan görevin kendi iş tahmini; null bilinmeyendir ve sıfıra dönüştürülmez.'},
    'DayReadVersions': {'planning': 'Mevcut görev/plan/çalışma/tercih koordinasyon sürümü; bildirim veya not sürümü değildir.', 'notes': 'Bu owner notlarının oluşturma/düzenleme/silme/dönüşüm sayacı; ilgili yazıyla aynı transaction içinde artar.', 'specialDays': 'Bu owner özel günlerinin create/update/delete/restore sayacı; idempotent replay veya reddedilen yazıda artmaz.'},
    'DayOverviewView': {'recurringTaskIds': 'Yalnız dönen saatli/saatsiz sayfalardaki rutin oluşumu görev kimlikleri; owner snapshot içinde toplu okunur. Rutin görevleri ertelenemez.', 'day': 'Seçili günün kimliği, frozen zone ve revision sürümleri; gün yoksa id null olur, okuma plan yaratmaz.', 'windowStartsAt': 'Seçili frozen zone yerel gününün UTC başlangıcı; frontend gün sınırı tekrar hesaplamaz.', 'windowEndsAt': 'Sonraki yerel günün UTC başlangıcı; DST günleri 23 veya 25 saat olabilir.', 'timed': 'Bu günün Work/Break/Buffer ilk sayfası; kimlik, version ve tarihsel snapshot korunur.', 'untimed': 'Bu günün saatsiz öğe sayfası; total yalnız sayfa uzunluğu değildir.', 'glance': 'Sayfalardan bağımsız bütün günün backend hesaplı toplamları, bilinmeyen tahmin sayacı ve görev ipuçları.', 'support': 'Aynı owner/günün küçük efor/kritik iş desteği ve sürümü.', 'versions': 'Bu görünümün okunduğu planning/notes/special-days kaynak sürümleri; diğer kaynaklara güncellik garantisi değildir.'},
    'WorkspacePreferencesView': {'version': 'Tam tercih belgesinin sürümü; bu küçük projeksiyon tek başına PUT gövdesi değildir.', 'hasWorkingWindows': 'Hesabın haftalık çalışma aralıklarından en az biri tanımlıysa true; tarih istisnaları veya gün kapasitesi hesabı değildir.'},
    'WorkspaceSnapshotView': {'preferences': 'Saat dilimi, görünüm ve destekler için küçük tercih projeksiyonu; weekly/exceptions listesini içermez.', 'activeWork': 'Varsa çalışan oturum; yoksa en son başlatılan duraklatılmış oturum. Null doğrulanmış yokluktur.', 'focusIncluded': 'Bu istekte focus/current değerlendirmesi açıkça istendiyse true; false durumunda activeFocus null alanı focus yokluğu kanıtı değildir.', 'activeFocus': 'Yalnız includeFocus=true kapsamında değerlendirilen focus; istemciye dönen work/süre aynı transaction ve serverNow kesimindedir.', 'versions': 'Day overview karşılaştırması için kapsanan üç kaynağın atomik sürümleri; notification ve diğer kaynaklar kapsam dışıdır.'},
    'DeferTasksRequest': {'tasks': '1–50 benzersiz görev ve her görevin ayrı hedef tarihi; kaynak parçaları sunucu bulur.', 'expectedPlanningVersion': 'Bütün seçimin tek planning sürümü; stale durumda hiçbiri taşınmaz.'},
    'DeferTaskTargetRequest': {'taskId': 'Kaynak günde en az bir açık plan parçası bulunan owner görev.', 'targetDate': 'Bu görevin kaynak günden sonraki hedef günü; diğer görevlerden farklı olabilir.'},
    'DeferDaySelectionRequest': {'targetDate': 'Kaynak günden sonraki hedef plan günü; seçilen saatler iptal edilir ve görevler bu güne saatsiz alınır.', 'schedules': 'Kaynak gündeki açık saatli çalışma öğelerinin id/version listesi.', 'items': 'Aynı işlemde ertelenecek açık saatsiz öğeler; schedules ile birlikte toplam 1–50 farklı öğe.'},
    'PlanEntryVersionRequest': {'id': 'Seçilen saatli veya saatsiz plan öğesinin kullanıcıya ait kimliği.', 'version': 'Güncel öğe sürümü; en az 1, eski pozitif sürümde 409.'},
    'DayDeferralPreview': {'sourceDate': 'Seçilen saatli/saatsiz öğelerin kaynak plan günü.', 'targetDate': 'Saat verilmeden ertelenecek hedef gün; sourceDate sonrasındadır.', 'issues': 'Açık koruma izni, çalışan iş veya tamamlanmış hedef öğe nedeniyle uygulamayı engelleyen sorunlar.', 'canApply': 'Sorun listesi boşsa true; onayda bütün sürüm ve koruma kontrolleri yeniden yapılır.', 'tasks': 'Hedefte yer alacak farklı görevler; birden fazla saatli parça görev kopyası üretmez.', 'schedules': 'İptal edilecek kaynak saat tahsisleri; hedef saat üretilmez.', 'items': 'Kaynak saatsiz öğeler; önizleme bu öğeleri değiştirmez.'},
    'DayDeferralTask': {'title': 'Ertelenen mevcut görevin güncel başlığı; yeni görev oluşturulmaz.', 'alreadyPlanned': 'Aynı görevin hedefte açık saatsiz öğesi varsa korunur; yeni öğe eklenmez.'},
    'DayDeferralIssue': {'code': 'Ertelemeyi engelleyen koruma/çalışan iş/hedefte tamamlanmış öğe kodu.', 'message': 'Kullanıcıya gösterilebilen sakin açıklama; açık eylem gerekli.'},
    'DayDeferralResult': {'schedules': 'Saatleri iptal edilmiş özgün tahsisler (Removed); kimlikleri geçmişte korunur.', 'items': 'Hedef günlerin açık öğeleri; defer-tasks yanıtında her görev kendi localDate değerini taşır. Görev kopyalanmaz, mevcut hedef öğenin saati korunur.', 'changeSetId': 'Saatli ve saatsiz değişikliklerin tek atomik grubu; day-items/undo ile telafi edilir.'},

    'ReturnManyToPoolRequest': {'tasks': '1–50 farklı görevin kimliği ve güncel sürümü; tek transaction, herhangi birinde uyuşmazlık varsa hiçbir görev değişmez.', 'poolId': 'Kullanıcının arşivlenmemiş hedef havuzu; görevlerin kendi havuz bağı değiştirilir, çocukların bağı değiştirilmez.'},
    'PoolTaskVersionRequest': {'id': 'Havuzda bekletilecek kullanıcıya ait görev kimliği; tekrarlanamaz.', 'version': 'Görevin güncel sürümü (en az 1); eksik/0 için 400, farklı güncel sürümde 409.'},
    'CreateScheduleRequest': {'kind': 'Work/Break/Buffer zorunlu; null400. OpenAPI nullable unionu bu Required davranışını tek başına yansıtmayabilir.',
                              'dayItemId': 'UI-R2: saat verilecek saatsiz gün öğesi; verilirse aynı görev ve gün olmalı, öğe aynı işlemde listeden düşer.',
                              'dayItemVersion': 'dayItemId ile birlikte zorunlu güncel gün öğesi sürümü; eski sürüm409.'},
    'CalendarItem': {'rootTaskId': 'Kök (en üst) görev; ay/hafta görünümü bu göreve göre gruplar.', 'rootTitle': 'Kök görevin güncel başlığı.', 'parentTitle': 'Doğrudan üst görevin güncel başlığı; kök görevde null.',
                     'completedAt': 'Yalnız bu plan öğesinin bittiği instant; görev tamamlanmasını göstermez.', 'startsAt': 'Saatli öğede başlangıç; saatsiz öğede null.', 'endsAt': 'Saatli öğede bitiş; saatsiz öğede null.'},
    'DayItemView': {'taskTitle': 'Görevin güncel başlığı (plan anı snapshotı değildir).', 'parentTitle': 'Doğrudan üst görevin güncel başlığı; kök görevde null.',
                    'sortOrder': 'Gün içindeki ekleme sırası; yalnız gösterim sırasıdır.', 'completedAt': 'Yalnız bu gün öğesinin bittiği instant; görev tamamlanmasını göstermez.'},
    'TaskStateRequest': {'action': 'TaskAction zorunlu; null400. OpenAPI nullable unionu bu Required davranışını tek başına yansıtmayabilir.'},
    'FocusPresetRequest': {'settings': 'FocusSettings zorunlu; null400. Nullable wire unionuna rağmen Required validation uygulanır.'},
    'UpdateFocusPresetRequest': {'settings': 'Tam FocusSettings zorunlu; null400. Nullable wire unionuna rağmen Required validation uygulanır.'},
    'FocusView': {'activeSeconds': 'Yalnız bu focus döngüsünün effective çalışma kesişimi; WorkView tüm session actualını tekrar eklemeyin.',
                  'remainingSeconds': 'max(0,workSeconds-activeSeconds); hedefin tükenmesi tamamlanma değildir.'},
    'TaskAllocation': {'remainingSeconds': 'ServerNow itibarıyla lifetime actualdan kalan doğrudan iş; unknown ise null. Gelecek cutoffa kadar çalışılacağı varsayılmaz.',
                       'allocatedSeconds': 'İstenen aralıkta geleceğe kalan kabul edilmiş Work tahsisi.',
                       'unallocatedSeconds': 'Kalan işten ayrılmamış miktar; unknown ise null.',
                       'excessAllocatedSeconds': 'Kalan işi aşan plan tahsisi; actual overtime değildir.',
                       'cutoff': 'Tahsis kesimi max(from,serverNow); DirectActualSeconds serverNow itibarıyladır.'},
    'TaskStartDecision': {'reasons': 'TaskGraph CanStart nedenleri; blocked start HTTP409 code olarak ilk nedeni de döndürebilir.'},
    'NotificationPage': {'total': 'Gelen kutusuna uygun Ready kayıtların toplamı; ScheduleStart/ScheduleEnd ve bekleyen/geçersiz/susturulmuş teknik kayıtlar dahil değildir. ReadAt okunmamış durumunu ayrı belirtir.'},
    'CustomReminderCommand': {'version': 'Create için gerekmez; PUT için güncel sürüm zorunlu, eksikse409.', 'repeat': 'İsteğe bağlı haftalık tekrar; null tek seferdir. timeZoneId IANA, localTime dakika hassasiyetinde, weekDays 0=Pazar..6=Cumartesi farklı 1..7 gün. Aynı yerel saat sunucuda sürdürülür; geçmiş tarihlerde alarm seli yaratılmaz.'},
    'CustomReminderView': {'repeat': 'Kalıcı haftalık tekrar veya null. dueAt tekrarlayan etkin kayıtta sonraki zamanı gösterir; taskId eski istemciler içindir, yeni UI görev bağlamaz.'},
    'ReminderRepeat': {'weekDays': '0=Pazar, 1=Pazartesi..6=Cumartesi; farklı en az bir gün.', 'localTime': 'Her seçili günde aynı yerel saat; yalnız dakika hassasiyeti. DST boşluğunda ilk geçerli dakika, tekrarlanan saatte sonraki oluşum.', 'timeZoneId': 'Tekrarın kayıt sırasında sabitlenen IANA saat dilimi.'},
    'ReadAllNotificationsResult': {'readCount': 'Bu owner için o anda Ready ve okunmamış olup okundu yapılan kayıt sayısı.', 'readAt': 'Sunucudaki toplu okuma zamanı; sonraki Ready kayıtlar ve Pending hatırlatmalar etkilenmez.'},
    'RecurrenceTemplateView': {'version': 'Template version; occurrence skip/cancel body version da template sürümüdür.'},
    'ChangeOccurrence': {'version': 'Template sürümü; TaskView.version değildir.', 'taskVersion': 'Occurrence taskı varsa zorunlu güncel task sürümü; henüz task yoksa gönderilmez.'},
    'SchedulingPreviewView': {'expiresAt': 'Snapshot serverNow+2dk. Aynı key replay süresini uzatmaz; Expired veya stale ise yeni preview.'},
}


def operation_notes(method, path):
    if method == 'POST' and path == '/api/calendar/days/{date}/defer-tasks':
        return ['Görev Ertele: tasks[{taskId,targetDate}] 1–50 farklı görev ve her birinin kaynak günden sonraki hedefi; expectedPlanningVersion ve zorunlu Idempotency-Key. Sunucu görevlerin kaynak gündeki bütün açık saatli/saatsiz parçalarını bulur (en çok500 öğe); UI sayfaları tam olmak zorunda değildir. Önizleme/onay adımı yok. Tüm hedefler tek transaction/ChangeSet, tek planning version artışı; rutin görevi/protected/running/stale/owner/hedefte tamamlanmış öğe veya DB hatasında tamamı rollback. Hedefte mevcut açık öğe korunur; diğerleri saatsiz taşınır, görev ve actual değişmez. Sonuç items farklı localDate içerebilir. Aynı normalize seçim+key özgün sonucu döndürür; belirsiz yazı yalnız açık kullanıcı isteğiyle aynı key ile alınır. [Ayrıntı](../task-deferral.md).']
    if path == '/api/tasks/picker':
        return ['UI-R4: owner açık/doğrudan işler; date atanmış/diğer grupları ayrılır. offset/assignedOffset bağımsız, limit1..100; UI25. Ebeveyn başlığı aynı sorguda, HasExactMatch bütün uygun kümede. Literal Türkçe substring; her satır için ek parent GET yok. Coverage aynı repeatable-read snapshot içindeki owner sürümleridir; UI yalnız bütün sayfalar güncel planning sürümü ve ±15sn tazelik taşıyorsa handshake tekrar okumasını atlar; eksik/eski sertifika yeniden okunur.']
    if path == '/api/daily-plans/{date}/entries':
        return ['UI-R4: taskId veya title tam biri; expectedPlanningVersion ve zorunlu Idempotency-Key. Yeni görev+day item tek transaction. IsUrgent yalnız plana ekler, çalışma/focus başlatmaz veya duraklatmaz. Başlangıç serverNow yerel dakikası; bitiş null. Aynı key aynı makbuz; farklı payload409. Normal ekleme saatsiz; öncelik/efor yalnız yeni görev içindir. Undo day-items/undo üzerinden; geçmiş korunur.']
    if path == '/api/day-items/{id}/time':
        return ['UI-R4: version ve expectedPlanningVersion; start null olabilir, end varsa start gerekli ve pozitif en çok24saat. Başlangıç öğenin kayıtlı gününde; saat dilimi gün planından. Acil day itemda end dolabilir ve overlap reddi yoktur; normal tam aralık mevcut schedules dönüşümünü kullanır. Key yok; belirsiz yazı tekrarlanmaz.']
    notes = []
    if method == 'GET' and path == '/api/notes':
        notes.append('NextStep notları kind=NextStep istenmedikçe sayım/sayfalama öncesinde dışlanır (Gün Planlama sonraki adımı ayrı okur). categoryId tek kategori (kaldırılmış dahil), taskLinked=true göreve bağlı notlar (görev başlığına göre sıralı), excludePinned=true etkin ve Tümü\'nde sabit kategorilerin notlarını dışlar. search başlık+metinde Türkçe büyük/küçük harf duyarsız, en çok200karakter. Daily artık oluşturulmaz; eski kayıtlar okunur.')
    if path.startswith('/api/note-categories') or path == '/api/notes/view-modes':
        notes.append('Kategoriler owner kapsamlıdır; yeni kullanıcıda ve migration ile mevcut kullanıcılarda bir kez Uyarı (Kırmızı, çubukta, Tümü\'nde sabit) oluşur, kaldırılırsa yeniden eklenmez. Etkin kategori en çok100. remove kalıcı silme değildir: notların categoryId bağı değişmez. restore ad çakışmasında 409 note_category_name_taken. Bütün yazılar NotesVersion artırır; view-modes aynı değerle tekrarı sürüm artırmaz.')
    if method == 'POST' and path == '/api/notes/{id}/restore':
        notes.append('Geri al: silinmiş notu aynı alanlarla geri getirir; version silme yanıtındaki sürümdür. Silinmemiş not için 409 note_not_deleted.')
    if method == 'POST' and path == '/api/notifications/read-all':
        notes.append('Gelen kutusu açıldığında bir kez çağrılır. Owner lock altında o anda Ready/okunmamış kayıtları topluca okur; sürümleri artar. Pending/başka owner/sonraki Ready kayıtlar değişmez. Belirsiz sonuçta kendiliğinden tekrar yok; açık kullanıcı niyetiyle yeniden gönderilebilir.')
    if path == '/api/notifications/reminders' or path == '/api/notifications/reminders/{id}':
        notes.append('repeat null veya verilmemişse tek sefer. Haftalık tekrar seçili günlerde aynı kayıt/sürüm altında yeni intent üretir; ilk uygun gelecek günden başlar. Idempotency tekrarında özgün sonuç döner; düzenleme/iptal eski sürümün intentlerini geçersiz kılar. Sonraki intent sunucuda atomik üretilir; gecikmiş alarm tekrarları atlanır, kullanıcıya geçmiş alarm seli gönderilmez.')
    if method == 'GET' and path in ('/api/tasks', '/api/tasks/children'):
        notes.append('excludeRecurring varsayılan false; true olduğunda aynı owner recurrence occurrence kaydına bağlı görevler sayım/sayfalama öncesinde dışlanır. Şablon kapalı veya görev tamamlanmış olsa da köken bağı sürer. Görevler ekranı true kullanır; gün planı, rutin, görev ayrıntısı ve seçicilerin varsayılan okumaları değişmez. Çocuk özetleri tüm domain alt ağacını anlatmayı sürdürür.')
    if method == 'GET' and path == '/api/daily-plans/{date}/signals':
        notes.append('İsteğe bağlı Today destekleri için küçük okuma: ReturnToTask eşiği, son çalışma, gerçek Ready/okunmamış bildirim işaretleri ve çalışan görevin kendi tahmini. En çok1000 işaret; complete=false yokluk kanıtı değildir. observeFocus varsayılan false; true ancak owner bugününde çalışan iş ve açık nudge desteği varken mevcut focus/current geçişini gözlemler. Diğer gün/koşullarda pasif kalır. Yanıt private/no-store; owner token/cookie ile belirlenir.')
    if method == 'GET' and path == '/api/daily-plans/{date}/overview':
        notes.append('DayOverview aynı owner snapshot içinde gün metadata, bağımsız saatli/saatsiz ilk sayfalar, bütün gün glance toplamları ve küçük destek durumunu döndürür. Limitler1..100, offset0..100000; eksik sayfa tam gün toplamı yerine kullanılamaz. WindowStartsAt/EndsAt frozen zone içindir; read günlük plan yaratmaz. Versions yalnız planning/notes/specialDays kapsamındadır. Standart mutation id/version alanları korunur; yeni yazma endpointi değildir.')
    if method == 'GET' and path == '/api/workspace/snapshot':
        notes.append('UI-R3 performance: owner cookie/Bearer korunur; me doğrulaması önce gelir. Varsayılan includeFocus=false pasiftir. true mevcut focus/current değerlendirmesini aynı owner transaction sınırında uygular; FocusIncluded=false ile doğrulanmış ActiveFocus=null farklıdır. ActiveWork Running öncelikli, yoksa en son başlayan Paused kaydıdır. Preferences yalnız küçük görüntüleme projeksiyonudur; tam PUT belgesi veya tam preferences cache girdisi değildir. PlanningVersion bütün kaynakların sürümü sayılmaz. Yanıt no-store, private; serverNow aynı snapshot içindeki sürelerin ortak kesimidir.')
    if method == 'GET' and path == '/api/tasks/{id}/detail-view':
        notes.append('Görev panelinin tam task belgesi, row summary, workload/time/progress, mevcut sınıflandırma ve yalnız seçili kaynak adları aynı RepeatableRead snapshotında üretilir. Alt ağaç girdisi bir kez paylaşılır; gerçek çalışma arşivli dalları da korur. Not/ilişki/iş bileşeni/çocuk listesi burada yoktur. Küçük etiket/parent satırı tam resource/TaskView cache girdisi değildir. Salt okuma, private/no-store.')
    if method == 'GET' and path == '/api/tasks/{id}/ancestors':
        notes.append('Yakından uzağa üst görev yolu; başlangıç görevi hariç. limit varsayılan16,1..100; sınırsız mantıksal derinliğin açık sayfalı okuması. nextCursor null bitiştir; imleç owner/task/planningVersion/offset ve HMAC ile doğrulanır. Değişmiş planning sürümünde409 ancestor_cursor_stale ile baştan oku; bozuk/yabancı imleç400. Owner filtreli recursive SQL, döngü güvenliği; SQL komut sayısı derinlikle artmaz fakat traversal satır/CPU maliyeti ücretsiz değildir.')
    if method == 'GET' and path == '/api/tasks':
        notes.append('orderBy: CreatedDesc/Title/Priority/Deadline/CompletedDesc (UI-R2: tamamlananlar en yeni önce). Silinmiş görevler includeArchived ile de dönmez. assignedOn=YYYY-MM-DD kendi atanmış aralığı o günü kapsayan görevleri döndürür (kapsayıcılar dahil; çocuklardan türeyen aralık bu filtreye girmez). Search literal case-insensitive başlık alt dizisi, en çok200karakter; %/_ joker değildir. isPlanned verilirse from/to pozitif ve en çok366gün zorunlu; yalnız now sonrası Planned Work kesişimi aranır. from/to tek başına deadline veya create filtresi değildir.')
    if path == '/api/work-sessions/current':
        notes.append('ActiveSession yalnız Running kaydıdır. Paused oturum varken null dönebilir; sync.workSessionId veya state=Paused listesi üzerinden geri yükleyin.')
    if path == '/api/work-sessions/start':
        notes.append('taskId zorunlu; genel work bu endpointten başlamaz. scheduleId ve scheduleVersion birlikte verilir veya ikisi de boş. Focus planlı başlayacaksa önce bu çağrı, sonra focus-start mevcut workSessionId/workSessionVersion ile attach edilir.')
    if path.startswith('/api/focus-sessions') and method == 'GET' and (path.endswith('/current') or '{id}' in path):
        notes.append('Current/detail GET hedef ve mola zamanını ObserveFocus ile kalıcı değerlendirebilir; version/state/planningVersion değişebilir. Liste GET aynı gözlem akışını çalıştırmaz. GET yanıtını shared cache veya SWde saklamayın.')
    if path == '/api/focus-sessions' and method == 'POST':
        notes.append('presetId ile settings birlikte verilmez. workSessionId/workSessionVersion çifti mevcut Running/Paused worke attach eder; taskId yoksa yeni genel odak mümkündür. plan bloğu için önce normal planlı work başlatın; bu requestte scheduleId yoktur.')
    if path.endswith('/next') and '/focus-sessions/' in path:
        notes.append('Yanıt yeni focusId içerir; önceki focus Finished olur. WorkSessionId korunur. UI yeni focus version ve workSessionVersion değerlerine geçmelidir.')
    if '/scheduling/' in path and (path.endswith('/preview') or path.endswith('distribute-preview')):
        notes.append('Proposal kaydı saklanır fakat accepted plan/revision değişmez. Geçerlilik2dk; /preview Auto tercihte de otomatik apply yapmaz.')
    if path.endswith('/start-now'):
        notes.append('planningStatus Preview/Applied/NeedsPreview/Unavailable olabilir. Son ikisinde plan null olsa da work gerçekten başlamıştır; yeniden work oluşturmayın, current/sync ve yeni preview ile toparlanın.')
    if path.endswith('/state'):
        notes.append('reason en çok2000karakter. ParentCompletionChoice.Cancel komutu iptal eder; TaskAction.Cancel görevi Canceled yapar. InProgress/Paused bu endpointte action olarak gönderilmez; work komutlarından türetilir.')
    if method == 'DELETE' and ('/dependencies/' in path or '/ordering/' in path):
        notes.append('Path sourceId ilişki kaydının Id alanı değil, predecessor/before task kimliğidir. Query version hedef /tasks/{id} görevinin güncel sürümüdür;204sonrası hedef task sürümünü yeniden okuyun.')
    if method == 'POST' and path == '/api/tasks/{id}/archive':
        notes.append('Açık/arşivlenmemiş çocuk veya Running/Paused work varsa409. Soft archive200TaskView döndürür; ilgili gelecekteki bloklar revisionla kapanabilir. Unarchive endpointi yoktur.')
    if method == 'GET' and path == '/api/tasks/children':
        notes.append('UI-R2: completed=false açık kardeşleri kardeş sırasıyla, completed=true tamamlananları en yeni tamamlanma önce döndürür; boşsa ikisi birlikte. summaries her satır için doğrudan çocuk sayıları ve bilinen alt ağaç tahminini taşır.')
    if path.startswith('/api/notifications'):
        notes.append('UI-R4: özel hatırlatmanın title alanı oluşturulan notification intent içinde snapshot olarak saklanır ve NotificationView.title ile okunur; düzenleme eski bildirimi yeniden adlandırmaz. Önceki kayıtlar null title ile tür etiketine düşer. Hazır/okundu/cihaza teslim ayrı durumlardır.')
    if path.startswith('/api/recurrence-templates'):
        notes.append('UI-R4: rule.startTime ve autoAddToPlan son teslimden ayrıdır. Checkbox kapalı eski davranıştır. Açıkken sunucu üretimi her uygun oluşumu tek plan bağına ekler; saat yoksa saatsiz, saat/tahmin yoksa başlangıçlı-bitişsiz, pozitif tahminle normal saatli blok. Çakışma/DST/zone sorunu timingIssue taşıyan bitişsiz öğe bırakır; çalışma başlamaz. Mevcut veya kaldırılmış plan bağı yeniden oluşturulmaz; geçmiş/elle değişmiş/çalışılmış görev korunur. Mevcut worker bugün+7gün penceresini üretir; daha ileri günler açık materialize ile gelir.')
    if method == 'PUT' and path == '/api/tasks/{id}/planned-range':
        notes.append('UI-R2: plannedFrom/plannedTo birlikte gönderilir veya ikisi null ile temizlenir; from<=to ve en çok367gün. Plan bloğu oluşturmaz/engellemez. Çocuklardan türeyen üst aralık /summary ve children summaries içindedir.')
    if method == 'GET' and path == '/api/tasks/{id}/summary':
        notes.append('UI-R2 tek görev satır özeti: doğrudan çocuk sayıları, bilinen alt ağaç tahmini ve etkin gün aralığı. Silinmiş görev404.')
    if method == 'POST' and path == '/api/tasks/{id}/delete':
        notes.append('UI-R2 soft delete: görev ve açık alt ağacı tek işlemde bütün listelerden düşer; Running/Paused work bitirilir, gelecekteki bloklar revisionla kapanır, üst görevin otomatik tamamlanması uzlaştırılır. Geçmiş work/revision silinmez. Aynı sürümle tekrar200; arşivlenmiş görev409 task_archived. Geri alma /restore.')
    if method == 'POST' and path == '/api/tasks/{id}/restore':
        notes.append('Yalnız aynı silme işleminin batchini geri getirir; kapatılan work ve kaldırılan bloklar geri gelmez. Silinmemiş görev409 task_not_deleted, silinmiş/arşivli üst409 parent_deleted.')
    if path == '/api/daily-plans/{date}/items' and method == 'GET':
        notes.append('UI-R2 saatsiz gün öğeleri: yalnız Planned durumundakiler sortOrder sırasıyla; silinmiş/arşivli görevin öğesi düşer. UI-R3 değişiklikleri revision/undo ve planningVersion üretir; yalnız okuma sürüm değiştirmez. UI-R4 startsAt/endsAt/isUrgent/priority/energyDemand/timingIssue projeksiyonu vardır; bitişsiz süre sıfır kabul edilmez. taskTitle/parentTitle/directEstimatedSeconds güncel görevden okunur.')
    if path == '/api/daily-plans/{date}/items' and method == 'POST':
        notes.append('Açık doğrudan işi (hasDirectWork, bitmemiş, arşivsiz) güne saatsiz ekler; kapsayıcı veya kapalı görev409 task_not_plannable. Aynı gün aynı görev için tek Planned öğe vardır:409 day_item_exists. Idempotency-Key yoktur; belirsiz sonuçta yeniden göndermeyin, listeyi GET ile okuyun.')
    if path.startswith('/api/day-items/{id}/'):
        notes.append('Gün öğesinin version değeri gönderilir; eski version409 version_conflict, Planned olmayan öğe409 day_item_not_planned, başka hesap veya silinmiş görev404. complete/reopen yalnız o günün öğesini işaretler; görevi tamamlamaz veya yeniden açmaz.')
    if path == '/api/day-items/{id}/move':
        notes.append('Öğeyi saatsiz olarak hedef güne taşır ve tamamlanma işaretini kaldırır. Aynı gün400 day_item_same_day; hedefte aynı görev varsa409 day_item_exists.')
    if method == 'POST' and path in ('/api/schedules/{id}/complete', '/api/schedules/{id}/reopen'):
        notes.append('UI-R2 saatli plan öğesini bitirir/yeniden açar; görev durumu, planningVersion ve revisionlar değişmez. Gece yarısını geçen bloğun bağlı parçaları birlikte değişir ve hepsi döner. Kaldırılmış blok409 schedule_removed.')
    if method == 'POST' and path == '/api/schedules':
        notes.append('UI-R2: dayItemId ve dayItemVersion verilirse aynı görev ve günün saatsiz öğesi aynı işlemde saatli bloğa dönüşür (öğe listeden düşer). dayItemVersion eksik400 day_item_version_required; görev farklı400 day_item_task_mismatch; gün farklı400 day_item_day_mismatch.')
    if method == 'GET' and path == '/api/calendar/overview':
        notes.append('1–42 yerel gün; her günün tüm item/completed/root-group toplamları ve ilk görünüm sırasındaki en çok3 kök önizlemesi. Saatli Work ve saatsiz öğe filtreleri calendar/items ile aynıdır. Grup done bütün grup üzerinden hesaplanır; görünmeyen öğeler istemciye taşınmaz. Frozen gün zone, owner planningVersion ve serverNow aynı RepeatableRead snapshotındadır. Read gün yaratmaz; private/no-store.')
    if method == 'GET' and path == '/api/calendar/items':
        notes.append('UI-R2 takvim öğeleri: 1–42 günlük aralıkta her günün güncel planı (saatli Work blokları ve saatsiz gün öğeleri). Mola/tampon, kaldırılmış bloklar ve silinmiş görevler dönmez. Her öğe görevin, doğrudan üst görevin ve kök görevin güncel başlığını taşır; ay/hafta görünümü kök göreve göre gruplar. Sıra: gün, saatliler başlangıca göre, sonra saatsizler ekleme sırasıyla. offset/limit (en çok500) ve total ile sayfalanır.')
    if method == 'PUT' and path == '/api/tasks/{id}/auto-complete':
        notes.append('UI-R2 görev başına otomatik tamamlama anahtarı. true yapıldığında görev hemen uzlaştırılır (çocukları bitmişse Automatic tamamlanır); false yapmak tamamlanmış görevi yeniden açmaz.')
    if method == 'POST' and path == '/api/tasks/{id}/children':
        notes.append('Çocuk parentın project/pool/category/tag bağlarını başlangıçta miras alır. İlk çocukta parentın direct estimate/history/future plan durumuna göre PreserveDirect/ConvertToContainer seçimi gerekebilir. Yanıt çocuktur; parent sürümünü de refetch edin.')
    if method == 'PUT' and path == '/api/preferences':
        notes.append('Bütün values belgesini gönderin. MinimumSplit1..86400/Transition0..86400; Weekly<=70/Exceptions<=366, her istisnada<=24aralık. Empty exceptions.intervals o gün çalışılmayacağını belirtir.')
    if method == 'PUT' and path == '/api/notifications/reminders/{id}':
        notes.append('CustomReminderCommand.version nullable şemaya rağmen update için davranışsal olarak gereklidir; eksik/stale409. DueAt serverNowdan ileri ve en çok bir yıl, title1..200.')
    if method == 'GET' and path == '/api/notifications':
        notes.append('Gelen kutusu yalnız Ready bildirimleri listeler. ScheduleStart/ScheduleEnd gönderimleri sürer fakat gelen kutusuna dahil edilmez; teknik intentler veri tabanında korunur. Total bu sorgunun toplamıdır; Pending/Suppressed/Obsolete/Expired kayıtlar sayılmaz. Açılışta read-all ayrı açık komuttur.')
    if method == 'GET' and path == '/api/notifications/alerts':
        notes.append('Ön plan alarmı için salt okunur sunucu otoritesi: limit varsayılan25,1..50 aday; Ready ve unread, dueAt≤serverNow ve en çok120sn eski, güncel kaynak/version/revision/tür/enabled/sessiz saat kontrolleri. Ses kapalı öğe kalır; soundEnabled global ses ve FocusTarget/BreakEnd için focus snapshot sesinin birleşimidir. PushEnabled bu yerel kanalı kapatmaz. dueAt açık snooze turunda NotBefore, schedule/deadline için OccurredAt−LeadSeconds, diğerlerinde NotBefore??OccurredAt. Artan (dueAt,id) keyset cursor ilk sayfanın sabit üst sınırını korur; her sayfa güncel tazelik/policy kontrolünü yeniden yapar. Geçersiz adaylar yüzünden boş items ile nextCursor gelebilir; null bitiştir. Yeni poll/sync turunda cursor kullanma. İmleç auth tokenı değildir; bozuk/yabancı/eski (>120sn) cursor400 notification_alert_cursor_invalid. GET job tetiklemez, readAt veya receipt yazmaz. ReadyAt ilk hazırlama anıdır; yeni snooze turunun baseline anı NotBefore olur. Browser unlock/mount öncesi tarihçeyi çalmama ve owner/id/snoozeCount kanal dedupu frontend sorumluluğudur.')
    if method == 'GET' and path == '/api/notifications/reminders':
        notes.append('Doğrudan array döner; offset/limit var fakat total yok. activeOnly varsayılan false: uzlaştırma için iptal/geçmiş kayıtlar da okunabilir. Hatırlatmalar ekranı activeOnly=true kullanır: owner kapsamında, sayfalama öncesinde iptal kayıtlar ve DueAt≤serverNow tek seferlik kayıtlar çıkarılır; iptal edilmemiş haftalık tekrarlar etkin kalır. Kayıtlar silinmez, bildirim gönderimi ve geçmişi değişmez.')
    if method == 'PUT' and path == '/api/notes/{id}':
        notes.append('Yalnız text/dueAt güncellenir; dueAt gönderilmezse null olur. Kind/task/work/localDate bu komutla değiştirilemez.')
    if '/recurrence-templates/' in path and path.endswith(('/skip', '/cancel')):
        notes.append('Body version template versiondır; occurrence taskı varsa taskVersion da gerekir. Üretilmemiş örnekte taskVersion verilmez. Geçmiş/completed/arşivlenmiş instance korunur.')

    if method == 'POST' and path in ('/api/calendar/days/{date}/defer-preview', '/api/calendar/days/{date}/defer'):
        notes.append('UI-R3 erteleme: atanmış saatleri iptal et ve aynı görevleri targetDate gününe saatsiz al. Hedef saat/çakışma hesabı yoktur. schedules + items toplam 1–50 id/version; expectedPlanningVersion, açık koruma izni. Önizleme planı değiştirmez; apply bütün kontrolleri yeniden yapar ve Idempotency-Key ister. Bir görev için mevcut hedef saatsiz öğe korunur, aksi halde kaynak saatsiz öğe taşınır veya yeni plan öğesi eklenir. Tamamlanmış öğe/gerçek çalışma korunur; çalışan iş durdurulmaz. Tek ChangeSet, herhangi bir hatada tam rollback; day-items/undo ile telafi. Aynı key makbuz replayidir, undo sonrasında tekrar uygulamaz.')
    if method == 'POST' and path == '/api/calendar/days/{date}/pool-batch':
        notes.append('UI-R3 Hafiflet: 1–50 farklı tasks[{id,version}], poolId ve expectedPlanningVersion; zorunlu Idempotency-Key. Tek transaction/ChangeSet: seçilen görevlerin kendi havuzu değişir, gelecekteki saatli tahsisleri ve kaynak günün açık saatsiz öğeleri kaldırılır; tamamlanmış öğeler/gerçek çalışma korunur. Owner/stale/running/protected hatasında tamamı rollback olur. PlanMutation receipt sonrası GET ile güncelleyin; aynı key yeniden etki uygulamaz.')
    if method == 'POST' and path == '/api/day-items/undo':
        notes.append('Defer erteleme grubu da saatli iptal ve saatsiz öğeleri birlikte geri alır; mevcut hedef öğeyi bozmaz, sonradan hedefe verilen saati geri sarmaz. Görev tanımı, actual ve eski revizyonlar değişmez. Sonraki sürüm/plan değişikliği ya da çalışan iş 409 verir.')
        notes.append('UI-R3 Pool grubu da bu uçtan changeSetId + expectedPlanningVersion ile geri alınır: havuz bağı + saatli/saatsiz öğe kimlikleri birlikte telafi edilir. Sonraki kullanıcı değişikliği veya başlayan saatli tahsis 409 verir; görev tamamlanması ya da gerçek çalışma geri sarılmaz.')
    return notes

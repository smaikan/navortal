# Plan uyarıları, açıklamalar ve yerleşememe nedenleri

Bu değerler başarılı HTTP200/201 yanıtının içinde bulunabilir; [HTTP hata kodlarıyla](Hata-Kodlari.md) aynı kanal değildir. `Warnings`, `Explanations`, `Unplaced` ve `HasConstraintConflicts` birlikte okunur; bilinmeyen yeni kod geldiğinde listeyi düşürmek yerine güvenli genel açıklama gösterin. Code büyük/küçük harfi önemlidir. [Kaynak sözleşme](../../API/src/Adhd.Domain/Scheduling/SchedulingContracts.cs).

## UnplacedReason

| Değer | Anlam / uygun sonraki eylem |
| --- | --- |
| NoEstimate | Doğrudan iş tahmini yok; tahmin ekle veya plansız çalışma başlat. |
| NeedsEstimateExtension | Tahmini tüketilmiş fakat açık iş; ek süre veya tamamlama kararı gerekir. |
| TaskInactive | Arşiv/durum/doğrudan iş uygunluğu nedeniyle seçili bileşen planlanamıyor. |
| DependencyBlocked | Ön koşulun uygun öngörülen tamamlanması sağlanamıyor; gerçek completed izniyle karıştırma. |
| NoWorkingHours | Gün için kullanılabilir çalışma penceresi yok. |
| InsufficientCapacity | Uygun pencerelerde yeterli toplam kapasite bulunamadı. Optimum matematiksel imkânsızlık ispatı değildir. |
| NoContiguousSlot | Bölünemez iş için yeterli tek kesintisiz yer bulunamadı. |
| DeadlineRisk | Deadline içinde uygun yer yok; farklı saat/gün veya açık son teslim kararı gerekir. |
| MinimumSplitConstraint | Parçalama/minimum parça kuralıyla yerleştirilemedi. |
| ActiveReservationTooShort | Aktif işin korunan tahsisi kalan işi kapsamıyor; gerçek çalışmayı sessiz kesme. |

RemainingSeconds null bilinmeyen miktardır;0gibi gösterilmez. Distribution Days[n].Unplaced ara gün sonucudur; üst Distribution.Unplaced son toplam kalan sonucu temsil eder. Günlerin Unplaced değerlerini toplayarak aynı işi çoğaltmayın.

## SchedulingMessage.Code

| Code | Açıklama |
| --- | --- |
| NoWorkingHours | Çalışma saatleri boş veya uygun değil. |
| PlacedContiguously | İş tek uygun aralığa yerleştirildi. |
| ExistingPlacementKept | Uygun mevcut yerleşim korundu. |
| PlacedFragment | Bölünebilir işin bir parçası yerleştirildi. |
| AlreadyReserved | Kalan miktar başka korunan/tahsisli bloklarla zaten kapsanmış. |
| ReservedExceedsRemaining | Korunan ayrılmış süre kalan işten fazla; Seconds farkı bildirir. |
| OutsideCompletionUnknown | Diğer gün tahsisinin öngörülen bitişi bilinmiyor. |
| ActiveEndUnknown | Aktif işin bitişi güvenle tahmin edilemiyor; kalan günü serbest varsayma. |
| ActiveReservationTooShort | Aktif iş için korunan tahsis eksik. |
| ActiveBeforeReservation | Gerçek aktif çalışma ile gelecekteki reservation başlangıcı arasında koruma çatışması. |
| ActiveOutsideEndUnknown | Dağıtım aralığı dışındaki aktif işin bitişi bilinmiyor. |
| ActiveOutsideReservationTooShort | Aralık dışındaki aktif işin reservationı kalan miktardan kısa. |
| ProtectedConflict | Fixed/locked/active korunan bloklar kendi aralarında çakışıyor. |
| ProtectedExternalConflict | Korunan blok başka günün busy aralığıyla çakışıyor. |
| ProtectedExternalTransition | Korunan blok ile harici iş arasında tampon sağlanamıyor. |
| ProtectedInactiveTask | Korunan Work bloğu artık açık/plannable taska bağlı değil. |
| ProtectedDependencyConflict | Korunan blok gerçek ön koşul sırasıyla uyuşmuyor. |
| DeadlineRisk | Korunan/önerilen yerleşim deadlineı aşıyor. |
| OrderingPreferenceUnmet | Yumuşak sıralama tercihi sağlanamadı; gerçek bağımlılık ihlaliyle aynı değil. |
| TransitionGapMissing | Komşu korunan işler arasında tercih edilen tampon yok. |
| UndoScheduleChanged | Eski değişiklikten sonra blok sürümü değişmiş; kör restore edilmez. |
| UndoActiveWorkProtected | Aktif gerçek çalışma bağlantısı korunuyor. |
| UndoProtectedIntentRequired | Fixed/locked ters değişiklik için açık allowProtectedChange gerekiyor. |
| UndoHistoryPreserved | Geçmiş veya başlamış bölüm geri yazılmıyor. |
| UndoTaskInactive | Önceki task artık uygun açık direct iş değil. |
| UndoEstimateUnknown | Eski bloğu doğrulamak için tahmin eksik. |
| UndoOutsideWorkingHours | Eski gelecek yerleşim güncel çalışma penceresine uymuyor. |
| UndoElapsedPartNotRestored | Geçmişte kalmış parça geri yüklenmedi; Seconds miktarı bildirir. |
| UndoOverlap | Telafi güncel planla çakışıyor. |
| UndoExternalOverlap | Telafi diğer günlerin aralıklarıyla çakışıyor. |
| UndoQuantityExceeded | Telafi kalan iş miktarını aşacak. |
| UndoDeadlineConflict | Telafi güncel deadlinea uymuyor. |
| UndoNonSplitConflict | Telafi güncel bölünemezlik kuralına uymuyor. |
| UndoTransitionConflict | Telafide geçiş tamponu sağlanamıyor. |
| UndoDependencyConflict | Telafi güncel gerçek ön koşullarla uyuşmuyor. |
| UndoFutureCompensation | Geçerli gelecek ters etkisi yeni proposal içinde hesaplandı. |

Code tek başına apply durumuna dönüştürülmez; `CanApply` ve `HasConstraintConflicts` sunucudan alınır. TaskId/ScheduleId null olabilir. Seconds alanı ilgili miktar/farkı taşır, her mesajda dolu değildir. Kaynaklar: [motor](../../API/src/Adhd.Domain/Scheduling/SchedulingEngine.cs), [split/tampon](../../API/src/Adhd.Domain/Scheduling/SchedulingAdvanced.cs), [undo](../../API/src/Adhd.Domain/Scheduling/PlanUndoEngine.cs), [çok gün](../../API/src/Adhd.Domain/Scheduling/MultiDaySchedulingEngine.cs).

## Manuel PlanningWarning.Code

| Code | Anlam |
| --- | --- |
| manual_overlap_accepted | Manuel çakışma kullanıcı niyetiyle kabul edilmiş; ScheduleIds çakışan blokları taşır. |
| deadline_risk | Gelecek kabul edilmiş blok deadline sonuna taşıyor. |
| estimate_unknown | Doğrudan kalan tahmin bilinmiyor. |
| allocation_incomplete | Kalan işe göre geleceğe eksik tahsis; Seconds eksik miktar. |
| allocation_exceeds_remaining | Kalan işe göre fazla tahsis; Seconds fazla miktar. |

Kaynak: [allocation](../../API/src/Adhd.Infrastructure/Planning/PlanningAllocation.cs), [manuel plan](../../API/src/Adhd.Infrastructure/Planning/PlanningStore.cs). ScheduleIds blokların kimliğidir; taskId dizisi sanılmamalı. Manuel kabul edilmiş overlap gerçek WorkSession overlapına izin vermez.

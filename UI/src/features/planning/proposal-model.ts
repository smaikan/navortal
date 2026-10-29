import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { readSchedule } from "./model";

export type Proposal = components["schemas"]["SchedulingPreviewView"];
export type Block = components["schemas"]["SchedulingBlock"];
export type Applied = components["schemas"]["SchedulingApplyResult"];
export type Message = components["schemas"]["SchedulingMessage"];
export type ProposalContent = Pick<Proposal, "blocks" | "changes" | "unplaced" | "warnings" | "explanations">;
export const proposalPageSize = 25;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const seconds = (v: unknown) =>
  v === null ||
  ((typeof v === "number" || (typeof v === "string" && v.trim() !== "")) &&
    Number.isFinite(Number(v)) &&
    Number(v) >= 0);
function invalid(): never {
  throw new ApiError(
    "protocol",
    "Öneri yanıtı eksik veya geçersiz. Sonuç uygulanmış sayılmadı; güncel durumu kontrol et.",
  );
}
export function readBlock(v: Block): Block {
  if (
    !v ||
    !nullableId(v.existingScheduleId) ||
    !nullableId(v.taskId) ||
    !["Work", "Break", "Buffer"].includes(v.kind) ||
    (v.kind === "Work" ? !id(v.taskId) : v.taskId !== null) ||
    !instant(v.startsAt) ||
    !instant(v.endsAt) ||
    Date.parse(v.startsAt) >= Date.parse(v.endsAt) ||
    ![v.isFixed, v.isLocked, v.isActive, v.isPreserved, v.isAutomatic].every(n => typeof n === "boolean")
  )
    invalid();
  return v;
}
export function readApplied(v: Applied, expectedId?: string): Applied {
  if (
    !v ||
    !id(v.proposalId) ||
    (expectedId && v.proposalId !== expectedId) ||
    !integer(v.planningVersion) ||
    !nullableId(v.changeSetId) ||
    typeof v.noChanges !== "boolean" ||
    !Array.isArray(v.revisionIds) ||
    !v.revisionIds.every(id) ||
    (v.noChanges ? v.changeSetId !== null || v.revisionIds.length !== 0 : !v.changeSetId || !v.revisionIds.length)
  )
    invalid();
  return v;
}
export function readProposal(v: Proposal, expectedId?: string): Proposal {
  if (
    !v ||
    !id(v.proposalId) ||
    (expectedId && v.proposalId !== expectedId) ||
    !integer(v.inputVersion) ||
    ![v.createdAt, v.expiresAt, v.anchorAt].every(instant) ||
    Date.parse(v.createdAt) >= Date.parse(v.expiresAt) ||
    !["Preview", "Auto"].includes(v.planningMode) ||
    typeof v.algorithmVersion !== "string" ||
    !["Pending", "Applied", "Expired"].includes(v.status) ||
    typeof v.canApply !== "boolean" ||
    typeof v.hasConstraintConflicts !== "boolean" ||
    typeof v.isPartial !== "boolean" ||
    !Array.isArray(v.blocks) ||
    !Array.isArray(v.changes) ||
    !Array.isArray(v.unplaced) ||
    !Array.isArray(v.warnings) ||
    !Array.isArray(v.explanations)
  )
    invalid();
  readContent(v);
  if (v.applied != null) readApplied(v.applied, v.proposalId);
  if (
    (v.status === "Applied" && !v.applied) ||
    (v.status !== "Applied" && v.applied != null) ||
    (v.canApply && (v.status !== "Pending" || v.hasConstraintConflicts))
  )
    invalid();
  return v;
}
export function readContent(v: ProposalContent) {
  if (!v || ![v.blocks, v.changes, v.unplaced, v.warnings, v.explanations].every(Array.isArray)) invalid();
  v.blocks.forEach(readBlock);
  for (const c of v.changes) {
    if (
      !c ||
      typeof c.type !== "string" ||
      !nullableId(c.scheduleId) ||
      !nullableId(c.taskId) ||
      c.before === undefined ||
      c.after === undefined
    )
      invalid();
    if (c.before !== null) readSchedule(c.before);
    if (c.after !== null) readBlock(c.after);
  }
  for (const u of v.unplaced)
    if (!u || !id(u.taskId) || !seconds(u.remainingSeconds) || typeof u.reason !== "string" || !u.reason) invalid();
  for (const m of [...v.warnings, ...v.explanations])
    if (
      !m ||
      typeof m.code !== "string" ||
      !m.code ||
      (m.taskId !== undefined && !nullableId(m.taskId)) ||
      (m.scheduleId !== undefined && !nullableId(m.scheduleId)) ||
      (m.seconds !== undefined && !seconds(m.seconds))
    )
      invalid();
  return v;
}
export function canApply(v: Pick<Proposal, "status" | "canApply" | "hasConstraintConflicts">) {
  return v.status === "Pending" && v.canApply && !v.hasConstraintConflicts;
}
export function requestBody(
  date: string,
  ids: readonly string[],
  version: string | number,
): components["schemas"]["SchedulingRequestDto"] {
  if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || !ids.every(id))
    throw new RangeError("1–1000 farklı görev seç.");
  // newWorkNotBefore göndermiyoruz. 30 saniye/dakika ötelemesini ve önerilen bütün anları sunucu belirliyor.
  return { date, taskIds: [...ids].sort(), expectedPlanningVersion: version };
}
export const unplacedReasons: Record<string, string> = {
  NoEstimate: "Tahmin yok. Tahmin ekleyebilir veya plansız çalışabilirsin.",
  NeedsEstimateExtension: "Tahmin tüketilmiş; ek süre veya tamamlama kararı gerekiyor.",
  TaskInactive: "Bu işin durumu planlamaya uygun değil.",
  DependencyBlocked: "Ön koşul yerleşimi sağlanamadı; gerçek tamamlanma izni ayrı değerlendirilir.",
  NoWorkingHours: "Bu gün için kullanılabilir çalışma saati yok.",
  InsufficientCapacity: "Uygun saatlerde yeterli kapasite bulunamadı. Saatleri veya iş seçimini değiştirebilirsin.",
  NoContiguousSlot: "Bölünemez iş için yeterli kesintisiz aralık bulunamadı.",
  DeadlineRisk: "Son teslim içinde uygun yer bulunamadı.",
  MinimumSplitConstraint: "Minimum parça süresiyle yerleştirilemedi.",
  ActiveReservationTooShort: "Aktif işin korunan zamanı kalan işe yetmiyor; çalışma kesilmedi.",
};
const messages: Record<string, string> = {
  UndoCrossDayMoveIncomplete: "Taşımanın ters etkisi bütün günlerde birlikte uygulanamıyor; mevcut konumu korundu.",
  UndoCrossDayConstraint:
    "Günler arası miktar, sıra veya çakışma kısıtı nedeniyle bu telafi bölümü korunarak bırakıldı.",
  UndoScheduleChanged: "Blok sonradan değişmiş; eski hali zorla geri yüklenmedi.",
  UndoActiveWorkProtected: "Aktif gerçek çalışma ve başlangıç bağlamı korundu.",
  UndoProtectedIntentRequired: "Sabit veya kilitli bloğu ters değiştirmek için açık izin gerekiyor.",
  UndoHistoryPreserved: "Geçmiş veya başlamış bölüm korundu.",
  UndoTaskInactive: "Görev artık bu plan telafisine uygun açık bir iş değil.",
  UndoEstimateUnknown: "Eski yerleşimi doğrulamak için süre tahmini eksik.",
  UndoOutsideWorkingHours: "Eski gelecek yerleşim güncel çalışma saatlerine uymuyor.",
  UndoElapsedPartNotRestored: "Geçmişte kalan bölüm geri yüklenmedi.",
  UndoOverlap: "Telafi güncel planla çakışacağı için uygulanmadı.",
  UndoExternalOverlap: "Telafi başka günün dolu aralığıyla çakışıyor.",
  UndoQuantityExceeded: "Telafi kalan iş miktarını aşacağı için uygulanmadı.",
  UndoDeadlineConflict: "Telafi güncel son teslim zamanına uymuyor.",
  UndoNonSplitConflict: "Telafi güncel bölünemezlik kuralına uymuyor.",
  UndoTransitionConflict: "Telafi gerekli geçiş süresini sağlayamıyor.",
  UndoDependencyConflict: "Telafi güncel ön koşullarla uyuşmuyor.",
  UndoFutureCompensation: "Geçerli gelecek etkiler için telafi önerisi hazırlandı.",
  NoWorkingHours: "Kullanılabilir çalışma saati yok.",
  PlacedContiguously: "İş tek aralığa yerleştirildi.",
  ExistingPlacementKept: "Uygun mevcut yerleşim korundu.",
  PlacedFragment: "Bölünebilir işin bir parçası yerleştirildi.",
  AlreadyReserved: "Kalan iş başka tahsislerle kapsanıyor.",
  ReservedExceedsRemaining: "Korunan süre kalan işten fazla.",
  OutsideCompletionUnknown: "Diğer günlerdeki tahsisin öngörülen bitişi bilinmiyor.",
  ActiveEndUnknown: "Aktif işin bitişi bilinmiyor; kalan gün boş varsayılmadı.",
  ActiveReservationTooShort: "Aktif işin korunan zamanı yetersiz.",
  ActiveBeforeReservation: "Aktif çalışma ile korunan başlangıç arasında çatışma var.",
  ActiveOutsideEndUnknown: "Aralık dışındaki aktif işin bitişi bilinmiyor.",
  ActiveOutsideReservationTooShort: "Aralık dışındaki aktif işin korunan zamanı yetersiz.",
  ProtectedConflict: "Sabit, kilitli veya aktif bloklar çakışıyor.",
  ProtectedExternalConflict: "Korunan blok başka günün dolu aralığıyla çakışıyor.",
  ProtectedExternalTransition: "Korunan blok ile başka günün işi arasında geçiş sağlanamıyor.",
  ProtectedInactiveTask: "Korunan bloğun görevi artık planlamaya uygun değil.",
  ProtectedDependencyConflict: "Korunan blok ön koşul sırasıyla uyuşmuyor.",
  DeadlineRisk: "Bu yerleşim son teslim tarihinden sonraya düşüyor; istersen başka bir yer seç.",
  OrderingPreferenceUnmet: "Yumuşak sıra tercihi sağlanamadı.",
  TransitionGapMissing: "Korunan işler arasında tercih edilen geçiş süresi yok.",
};
export const messageText = (code: string) => messages[code] ?? `Yeni bir planlama koşulu bildirildi: ${code}`;
export const unplacedText = (code: string) => unplacedReasons[code] ?? `İş yerleştirilemedi; sunucu nedeni: ${code}`;
export function proposalFailure(error: unknown) {
  if (error instanceof RangeError) return error.message;
  if (error instanceof ApiError) {
    if (error.outcomeUnknown)
      return "Yanıt alınamadı; işlem tamamlanmış olabilir. Yeni bir yazı otomatik gönderilmedi.";
    if (error.kind === "offline" || error.kind === "protocol") return error.message;
    if (error.code === "support_disabled")
      return "İsteğe bağlı destekler kapalı. Ayarlardan açabilir veya normal planlamayı kullanabilirsin.";
    if (error.code === "rescue_today_required") return "Günü kurtar yalnız bugünün kalan kısmı için kullanılabilir.";
    if (error.code === "general_work_active")
      return "Genel odak çalışması sürüyor. Önce duraklat veya bitir; ardından yeni önizleme al.";
    if (error.status === 409)
      return "Öneri güncelliğini kaybetmiş veya kısıtlarla çatışıyor. İş seçimin duruyor; yeni önizleme gerekiyor.";
    if (error.status === 404) return "Bu öneriye veya seçilen göreve bu hesapta erişilemiyor.";
    if (error.status === 400) return "Sunucu seçimi kabul etmedi. Görevleri ve plan gününü kontrol et.";
  }
  return "Planlama sonucu alınamadı. Seçimin korunuyor; bağlantını kontrol et.";
}

import { validDate, validZone } from "../preferences/model";
import { dateFormat } from "../../lib/date-format";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import type { WallChoice } from "../../lib/time/wall-time";

export type Schedule = components["schemas"]["ScheduleView"];
export type Day = components["schemas"]["DailyPlanView"];
export type Allocation = components["schemas"]["TaskAllocation"];
export type Result = components["schemas"]["PlanMutation"];
export type DayItem = components["schemas"]["DayItemView"];
/** Gün listesinde her türden sınırlı bir sayfa okunuyor. */
export const blockLimit = 100;
export const dayItemLimit = 100;
export const kinds = { Work: "İş", Break: "Mola", Buffer: "Geçiş" };
export const pageSize = 25;
export type Draft = {
  start: string;
  end: string;
  startChoice: WallChoice;
  endChoice: WallChoice;
  kind: keyof typeof kinds;
  fixed: boolean;
  locked: boolean;
  conflicts: boolean;
  protected: boolean;
  reason: string;
};
const integer = (v: unknown) =>
  typeof v === "number" ? Number.isSafeInteger(v) && v >= 0 : typeof v === "string" && /^\d+$/.test(v);
const nullableId = (v: unknown) => v === null || (typeof v === "string" && validTaskId(v));
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApiError("protocol", "Plan yanıtı eksik veya geçersiz. Güncel planı yeniden yükle.");
}
export function readDay(v: Day, expectedDate?: string): Day {
  if (
    !v ||
    (expectedDate && v.localDate !== expectedDate) ||
    !nullableId(v.id) ||
    !nullableId(v.currentRevisionId) ||
    !nullableId(v.baselineRevisionId) ||
    !integer(v.version) ||
    !integer(v.planningVersion)
  )
    invalid();
  try {
    if (!validDate(v.localDate) || !validZone(v.timeZoneId)) invalid();
  } catch {
    invalid();
  }
  return v;
}
export function readSchedule(v: Schedule): Schedule {
  if (
    !v ||
    !validTaskId(v.id) ||
    !validTaskId(v.dailyPlanId) ||
    !nullableId(v.taskId) ||
    !Object.hasOwn(kinds, v.kind) ||
    !["Planned", "Removed"].includes(v.state) ||
    !(v.completedAt === null || v.completedAt === undefined || instant(v.completedAt)) ||
    !instant(v.startsAt) ||
    !instant(v.endsAt) ||
    Date.parse(v.startsAt) >= Date.parse(v.endsAt) ||
    !integer(v.version) ||
    String(v.version) === "0" ||
    typeof v.isFixed !== "boolean" ||
    typeof v.isLocked !== "boolean" ||
    (v.kind === "Work"
      ? !v.taskId ||
        typeof v.taskSnapshot?.task?.title !== "string" ||
        !v.taskSnapshot.task.title ||
        !(v.taskSnapshot.directEstimatedSeconds === null || integer(v.taskSnapshot.directEstimatedSeconds))
      : v.taskId !== null)
  )
    invalid();
  return v;
}
export function readSchedules(v: components["schemas"]["SchedulePage"], limit = pageSize) {
  if (!v || !Array.isArray(v.items) || v.items.length > limit || !integer(v.total) || !integer(v.offset)) invalid();
  return { ...v, items: v.items.map(readSchedule) };
}
export function readDayItem(v: DayItem, date?: string): DayItem {
  if (
    !v ||
    !validTaskId(v.id) ||
    !validTaskId(v.taskId) ||
    typeof v.localDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.localDate) ||
    (date && v.localDate !== date) ||
    !integer(v.sortOrder) ||
    !integer(v.version) ||
    String(v.version) === "0" ||
    !(v.completedAt === null || instant(v.completedAt)) ||
    typeof v.taskTitle !== "string" ||
    !v.taskTitle ||
    !nullableId(v.parentTaskId) ||
    !(v.parentTitle === null || typeof v.parentTitle === "string") ||
    !(v.directEstimatedSeconds === null || integer(v.directEstimatedSeconds)) ||
    (v.startsAt != null && !instant(v.startsAt)) ||
    (v.endsAt != null && (!instant(v.endsAt) || !v.startsAt || Date.parse(v.endsAt) <= Date.parse(v.startsAt))) ||
    (v.isUrgent !== undefined && typeof v.isUrgent !== "boolean") ||
    (v.timingIssue != null &&
      !["ScheduleOverlap", "LocalTimeUnavailable", "PlanTimeZoneMismatch", "EstimateTooLong"].includes(v.timingIssue))
  )
    invalid();
  return v;
}
export function readDayItems(v: components["schemas"]["DayItemPage"], date: string) {
  if (!v || !Array.isArray(v.items) || v.items.length > dayItemLimit || !integer(v.total) || !integer(v.offset))
    invalid();
  return { ...v, items: v.items.map(item => readDayItem(item, date)) };
}
export function readResult(v: Result) {
  if (
    !v ||
    !validTaskId(v.changeSetId) ||
    !integer(v.planningVersion) ||
    !Array.isArray(v.schedules) ||
    !Array.isArray(v.revisionIds) ||
    !v.revisionIds.every(validTaskId) ||
    !Array.isArray(v.warnings) ||
    !v.warnings.every(w => typeof w?.code === "string")
  )
    invalid();
  v.schedules.forEach(readSchedule);
  return v;
}
export function readAllocation(v: Allocation, id: string) {
  const seconds = (n: unknown) =>
    (typeof n === "number" || (typeof n === "string" && n.trim() !== "")) &&
    Number.isFinite(Number(n)) &&
    Number(n) >= 0;
  if (
    !v ||
    v.taskId !== id ||
    !instant(v.from) ||
    !instant(v.to) ||
    !instant(v.cutoff) ||
    !seconds(v.allocatedSeconds) ||
    !seconds(v.directActualSeconds) ||
    ![v.remainingSeconds, v.unallocatedSeconds, v.excessAllocatedSeconds].every(n => n === null || seconds(n))
  )
    invalid();
  return v;
}
export const titleOf = (block: Schedule) => block.taskSnapshot?.task.title ?? kinds[block.kind];
let minuteFormat: Intl.NumberFormat | undefined;
export function minutes(seconds: number | string | null) {
  return seconds === null
    ? "Bilinmiyor"
    : `${(minuteFormat ??= new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 })).format(Number(seconds) / 60)} dk`;
}
export function timeText(value: string, zone: string, format = "24h") {
  return dateFormat("tr-TR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: format === "12h",
  }).format(new Date(value));
}
export function planFailure(error: unknown) {
  if (error instanceof RangeError) return error.message;
  if (error instanceof ApiError) {
    if (error.outcomeUnknown)
      return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir. Aynı isteği aynı anahtarla yeniden gönderebilirsin.";
    if (error.kind === "offline" || error.kind === "protocol") return error.message;
    if (error.status === 409)
      return "Plan veya görev değişmiş ya da blok bir kısıtla çakışıyor. Taslağın korundu; güncel planı kontrol et. Çakışma ve koruma izinleri ayrı seçimlerdir.";
    if (error.status === 404) return "Blok veya görev bu hesapta bulunamadı. Güncel planı yükle.";
    if (error.status === 400) return "Sunucu bu aralığı kabul etmedi. Saatleri, görev türünü ve izinleri kontrol et.";
  }
  return "Plan alınamadı. Taslağın korundu; bağlantını kontrol edip yeniden dene.";
}
export function warningText(warning: components["schemas"]["PlanningWarning"]) {
  if (warning.code === "manual_overlap_accepted") return "Çakışma açık onayınla kabul edildi.";
  if (warning.code === "allocation_incomplete") return `${minutes(warning.seconds ?? null)} iş için zaman ayrılmadı.`;
  if (warning.code === "allocation_exceeds_remaining")
    return `Kalan işten ${minutes(warning.seconds ?? null)} fazla zaman ayrıldı.`;
  return `Plan uyarısı: ${warning.code}`;
}

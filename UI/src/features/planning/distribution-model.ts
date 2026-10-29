import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { readResult, type Day, type Result, type Schedule } from "./model";
import { dayWindow, localInput } from "./time-model";
import { readApplied, readContent, requestBody } from "./proposal-model";
import { undoFailure } from "./history-model";
export type Distribution = components["schemas"]["DistributionPreviewView"];
export type Range = { fromDate: string; toDate: string };
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApiError("protocol", "Çok günlük yanıt doğrulanamadı. Uygulanmış sayılmadı; güncel sonucu oku.");
}
export function rangeDates(from: string, to: string) {
  try {
    if (!/^\d{4}-\d\d-\d\d$/.test(from) || !/^\d{4}-\d\d-\d\d$/.test(to)) throw new Error();
    const a = Temporal.PlainDate.from(from),
      b = Temporal.PlainDate.from(to),
      count = a.until(b).days + 1;
    if (a.year < 2 || b.year > 9998 || count < 1 || count > 31) throw new Error();
    return Array.from({ length: count }, (_, i) => a.add({ days: i }).toString());
  } catch {
    throw new RangeError("Başlangıç ve bitiş dahil 1–31 günlük geçerli bir aralık seç.");
  }
}
export function distributionBody(fromDate: string, toDate: string, ids: readonly string[], version: number | string) {
  if (!integer(version)) throw new RangeError("Geçerli planlama sürümünü yeniden oku.");
  rangeDates(fromDate, toDate);
  const daily = requestBody(fromDate, ids, version);
  return { fromDate, toDate, taskIds: daily.taskIds, expectedPlanningVersion: version };
}
export function readDistribution(
  v: Distribution,
  binding: { id?: string; range?: Range; source?: string; day?: string } = {},
) {
  if (
    !v ||
    !validTaskId(v.proposalId) ||
    (binding.id && v.proposalId !== binding.id) ||
    !integer(v.inputVersion) ||
    ![v.createdAt, v.expiresAt].every(instant) ||
    Date.parse(v.createdAt) >= Date.parse(v.expiresAt) ||
    !["Preview", "Auto"].includes(v.planningMode) ||
    typeof v.algorithmVersion !== "string" ||
    !["Pending", "Applied", "Expired"].includes(v.status) ||
    ![v.canApply, v.hasConstraintConflicts, v.isPartial].every(x => typeof x === "boolean") ||
    !Array.isArray(v.days) ||
    v.days.length < 1 ||
    v.days.length > 31 ||
    !Array.isArray(v.unplaced)
  )
    invalid();
  if (binding.source ? v.reversesChangeSetId !== binding.source : v.reversesChangeSetId != null) invalid();
  let previous = "";
  for (const day of v.days) {
    try {
      rangeDates(day.localDate, day.localDate);
      dayWindow(day.localDate, day.timeZoneId);
    } catch {
      invalid();
    }
    if (day.localDate <= previous) invalid();
    previous = day.localDate;
    readContent(day);
  }
  if (
    binding.range &&
    JSON.stringify(v.days.map(d => d.localDate)) !==
      JSON.stringify(rangeDates(binding.range.fromDate, binding.range.toDate))
  )
    invalid();
  if (binding.day && !v.days.some(d => d.localDate === binding.day)) invalid();
  readContent({ blocks: [], changes: [], warnings: [], explanations: [], unplaced: v.unplaced });
  if (v.applied != null) readApplied(v.applied, v.proposalId);
  if (
    (v.status === "Applied" && !v.applied) ||
    (v.status !== "Applied" && v.applied != null) ||
    (v.canApply && (v.status !== "Pending" || v.hasConstraintConflicts))
  )
    invalid();
  return v;
}
export function readMoved(v: Result, block: Schedule, source: Day, target: Day) {
  readResult(v);
  const moved = v.schedules[0];
  if (
    v.revisionIds.length !== 2 ||
    new Set(v.revisionIds).size !== 2 ||
    v.schedules.length !== 1 ||
    moved.id !== block.id ||
    moved.taskId !== block.taskId ||
    moved.dailyPlanId === source.id ||
    (target.id && moved.dailyPlanId !== target.id) ||
    moved.state !== "Planned"
  )
    invalid();
  return v;
}
export function moveTimes(block: Schedule, source: Day, date: string) {
  rangeDates(date, date);
  const start = localInput(block.startsAt, source.timeZoneId),
    end = localInput(block.endsAt, source.timeZoneId);
  const endDate =
    end.slice(0, 10) > source.localDate ? Temporal.PlainDate.from(date).add({ days: 1 }).toString() : date;
  return { start: `${date}${start.slice(10)}`, end: `${endDate}${end.slice(10)}` };
}
export function multiFailure(error: unknown) {
  if (error instanceof ApiError) {
    const copy: Record<string, string> = {
      move_history_protected: "Geçmiş veya başlamış plan parçası taşınamaz; gerçek çalışma korunur.",
      move_active_work: "Aktif çalışmanın başlangıç bloğu taşınamaz. Önce gerçek çalışma için ayrı bir karar ver.",
      move_same_day: "Aynı gün için Saatleri düzenle seçeneğini kullan.",
      move_target_day_mismatch: "Aralık hedef günün kayıtlı saat dilimi içinde kalmalı.",
      undo_source_invalid: "Bu grup geri alınabilir bir kullanıcı plan kararı değil.",
    };
    if (error.code && copy[error.code]) return copy[error.code];
    if (error.code === "schedule_protected")
      return "Sabit veya kilitli bloğu taşımak için açık izin gerekiyor. Taslağını kontrol edip izin seçimini yap.";
    if (error.code === "schedule_overlap")
      return "Hedef aralık başka blokla çakışıyor. Saatleri değiştir veya çakışmayı ayrıca açıkça kabul et.";
  }
  return undoFailure(error);
}

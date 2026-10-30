import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { dayWindow } from "../planning/time-model";
import { readHistoricalSchedule } from "../planning/history-model";
import { states } from "../tasks/model";
export type RangeView = components["schemas"]["CalendarRangeView"];
export type DayView = components["schemas"]["CalendarDayView"];
export type Summary = DayView["summary"];
export type HistoricalState = components["schemas"]["HistoricalTaskState"];
export type Snapshot = components["schemas"]["TaskAtStart"];
export type Pages = { plan: number; actual: number; completions: number };
export const pageSize = 25;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) <= 9223372036854775807n;
const seconds = (v: unknown) =>
  (typeof v === "number" || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0;
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApiError(
    "protocol",
    "Takvim yanıtı doğrulanamadı. Tarih veya geçmiş başka kayıtla tamamlanmadı; yeniden oku.",
  );
}
export function dates(from: string, to: string) {
  try {
    if (![from, to].every(x => /^\d{4}-\d\d-\d\d$/.test(x))) throw new Error();
    const a = Temporal.PlainDate.from(from),
      b = Temporal.PlainDate.from(to),
      count = a.until(b).days + 1;
    if (a.year < 2 || b.year > 9998 || count < 1 || count > 42) throw new Error();
    return Array.from({ length: count }, (_, i) => a.add({ days: i }).toString());
  } catch {
    throw new RangeError("Başlangıç ve bitiş dahil 1–42 günlük geçerli takvim aralığı seç.");
  }
}
export function readSummary(v: Summary, date: string) {
  if (
    !v ||
    v.localDate !== date ||
    ![v.dailyPlanId, v.currentRevisionId, v.baselineRevisionId].every(nullableId) ||
    ![v.revisionNumber, v.planningVersion, v.plannedBlockCount, v.actualSegmentCount, v.completedTaskCount].every(
      integer,
    ) ||
    ![
      v.plannedWorkSeconds,
      v.plannedBreakSeconds,
      v.plannedBufferSeconds,
      v.baselineWorkSeconds,
      v.actualSeconds,
    ].every(seconds) ||
    typeof v.hasOpenWork !== "boolean"
  )
    invalid();
  try {
    dates(date, date);
    dayWindow(date, v.timeZoneId);
  } catch {
    invalid();
  }
  return v;
}
export function readRange(v: RangeView, from: string, to: string) {
  const expected = dates(from, to);
  if (
    !v ||
    v.fromDate !== from ||
    v.toDate !== to ||
    !instant(v.serverNow) ||
    !integer(v.legacyZoneCompletionCount) ||
    !Array.isArray(v.days) ||
    v.days.length !== expected.length
  )
    invalid();
  v.days.forEach((day, i) => readSummary(day, expected[i]));
  return v;
}
export function readSnapshot(v: Snapshot, taskId: string) {
  if (
    !v ||
    v.taskId !== taskId ||
    !integer(v.schemaVersion) ||
    !integer(v.taskVersion) ||
    typeof v.title !== "string" ||
    !Array.isArray(v.ancestors) ||
    !Array.isArray(v.tags) ||
    !integer(v.inputPlanningVersion) ||
    (v.capturedAt != null && !instant(v.capturedAt))
  )
    invalid();
  for (const n of [...v.ancestors, ...v.tags, ...[v.project, v.pool, v.category].filter(x => x !== null)])
    if (!n || !id(n.id) || typeof n.name !== "string") invalid();
  return v;
}
function historical(v: HistoricalState | null, taskId: string | null) {
  if (v === null) return;
  if (
    !v ||
    v.taskId !== taskId ||
    typeof v.available !== "boolean" ||
    !(v.state === null || Object.hasOwn(states, v.state)) ||
    (v.available && v.state === null) ||
    !(v.eventSequence === null || integer(v.eventSequence)) ||
    !(v.effectiveAt === null || instant(v.effectiveAt))
  )
    invalid();
}
export function readCalendarDay(v: DayView, date: string, offsets: Pages, revision?: string, limit = pageSize) {
  if (!v || !instant(v.serverNow) || !integer(v.legacyZoneCompletionCount)) invalid();
  readSummary(v.summary, date);
  for (const kind of ["plan", "actual", "completions"] as const) {
    const p = v[kind];
    if (
      !p ||
      !Array.isArray(p.items) ||
      p.items.length > limit ||
      ![p.total, p.offset, p.limit].every(integer) ||
      Number(p.offset) !== offsets[kind] ||
      Number(p.limit) !== limit ||
      Number(p.total) < p.items.length
    )
      invalid();
  }
  if (v.plan.revisionId !== (revision ?? v.summary.currentRevisionId)) invalid();
  for (const item of v.plan.items) {
    if (!item || !id(item.revisionItemId)) invalid();
    readHistoricalSchedule(item.schedule);
    if (item.schedule.dailyPlanId !== v.summary.dailyPlanId) invalid();
    historical(item.taskAtDayEnd, item.schedule.taskId);
  }
  for (const item of v.actual.items) {
    if (
      !item ||
      ![item.sessionId, item.segmentId].every(id) ||
      !nullableId(item.taskId) ||
      ![item.startsAt, item.endsAt, item.sourceStartedAt].every(instant) ||
      !(item.sourceEndedAt === null || instant(item.sourceEndedAt)) ||
      !seconds(item.activeSeconds) ||
      typeof item.sessionStillRunning !== "boolean"
    )
      invalid();
    try {
      const w = dayWindow(date, item.timeZoneId);
      if (
        Temporal.Instant.compare(item.startsAt, item.endsAt) >= 0 ||
        Temporal.Instant.compare(item.startsAt, w.from) < 0 ||
        Temporal.Instant.compare(item.endsAt, w.to) > 0
      )
        invalid();
    } catch {
      invalid();
    }
    if (item.taskAtStart !== null) {
      if (!item.taskId) invalid();
      readSnapshot(item.taskAtStart, item.taskId);
    }
    historical(item.taskAtDayEnd, item.taskId);
  }
  for (const item of v.completions.items) {
    if (
      !item ||
      ![item.eventId, item.taskId].every(id) ||
      !nullableId(item.parentTaskId) ||
      !instant(item.effectiveAt) ||
      !integer(item.sequence) ||
      !(item.title === null || typeof item.title === "string")
    )
      invalid();
    try {
      if (Temporal.Instant.from(item.effectiveAt).toZonedDateTimeISO(item.timeZoneId).toPlainDate().toString() !== date)
        invalid();
    } catch {
      invalid();
    }
  }
  return v;
}
export function calendarFailure(error: unknown) {
  return (error instanceof ApiError && error.kind === "protocol") || error instanceof RangeError
    ? error.message
    : "Takvim okunamadı. Bağlantını ve seçilen tarih/revizyonu kontrol edip yeniden dene.";
}

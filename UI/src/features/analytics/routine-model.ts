import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { day } from "./model";
import type { Range } from "./period";

export type RoutineCounts = components["schemas"]["RecurrenceCounts"];
export type RoutineReport = components["schemas"]["RecurrenceAnalyticsView"];
export type RoutineItem = components["schemas"]["RecurrenceAnalyticsItem"];
export type RoutineDetail = components["schemas"]["RecurrenceAnalyticsDetail"];
type Week = components["schemas"]["RecurrenceWeek"];
type Day = components["schemas"]["RecurrenceAnalyticsDay"];

export const firstPage = 5;
export const allPage = 100;
const count = (v: unknown) =>
  (typeof v === "number" || typeof v === "string") && Number.isSafeInteger(Number(v)) && Number(v) >= 0;
const classes = { OnTime: 1, Late: 1, NotDone: 1, TodayPending: 1, Skipped: 1, NotGenerated: 1 };
function invalid(): never {
  throw new ApiError("protocol", "Rutin analizi doğrulanamadı. Güncel raporu yeniden oku.");
}
function readCounts(c: RoutineCounts) {
  const ratio = c?.consistency == null ? null : Number(c.consistency);
  if (
    !c ||
    ![c.onTime, c.late, c.notDone, c.todayPending, c.skipped, c.notGenerated, c.completed, c.total].every(count) ||
    Number(c.completed) !== Number(c.onTime) + Number(c.late) ||
    Number(c.total) !== Number(c.completed) + Number(c.notDone) ||
    (ratio === null ? Number(c.total) !== 0 : !(ratio >= 0 && ratio <= 1))
  )
    invalid();
  return c;
}
function readWeek(w: Week) {
  if (!w || !day(w.weekStart) || !count(w.completed) || !count(w.total) || Number(w.completed) > Number(w.total))
    invalid();
  return w;
}
export function readRoutineReport(r: RoutineReport, range: Range) {
  if (
    !r ||
    r.fromDate !== range.fromDate ||
    r.toDate !== range.toDate ||
    !Array.isArray(r.items) ||
    ![r.activeCount, r.minimumSamples, r.total, r.offset, r.limit].every(count)
  )
    invalid();
  readCounts(r.totals);
  if (r.compare) readCounts(r.compare);
  for (const item of r.items) {
    if (!item || typeof item.templateId !== "string" || typeof item.title !== "string" || !Array.isArray(item.weeks))
      invalid();
    readCounts(item.counts);
    item.weeks.forEach(readWeek);
  }
  return r;
}
export function readRoutineDetail(d: RoutineDetail, id: string) {
  if (
    !d ||
    d.templateId !== id ||
    !day(d.today) ||
    !Array.isArray(d.days) ||
    !Array.isArray(d.weekdays) ||
    !count(d.longestRun) ||
    !d.work ||
    d.days.some((x: Day) => !x || !day(x.localDate) || !Object.hasOwn(classes, x.class))
  )
    invalid();
  readCounts(d.recent);
  readCounts(d.prior);
  return d;
}

/** Yüzde yalnız yeterli görev varsa gösterilir. Altında doğrudan sayı yazar. */
export function rateText(c: RoutineCounts, minimum: number) {
  const percent = ratePercent(c, minimum);
  if (percent !== null) return `%${percent}`;
  return Number(c.total) ? `${c.completed}/${c.total}` : "Görev yok";
}
export function ratePercent(c: RoutineCounts, minimum: number) {
  return Number(c.total) >= minimum && c.consistency != null ? Math.round(Number(c.consistency) * 100) : null;
}

const plain = (v: string) => Temporal.PlainDate.from(v);
const span = (from: string, to: string) => plain(from).until(plain(to)).days + 1;
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);
function shared(from: string, to: string, range: Range) {
  const start = later(from, range.fromDate),
    end = earlier(to, range.toDate);
  return start > end ? 0 : span(start, end);
}
/** Hafta, geçmiş günlerinin en az yarısı dönemdeyse işaretlenir. Tek günlük taşma komşu haftayı işaretlemez. */
export function weekInRange(weekStart: string, range: Range, today: string) {
  const end = earlier(plain(weekStart).add({ days: 6 }).toString(), today);
  return end >= weekStart && shared(weekStart, end, range) * 2 >= span(weekStart, end);
}
/** Ay, dönemin veya kendisinin en az yarısı örtüşüyorsa vurgulanır. */
export function monthInRange(month: string, range: Range, today: string) {
  const first = `${month}-01`,
    end = earlier(
      plain(first)
        .with({ day: plain(first).daysInMonth })
        .toString(),
      today,
    );
  return shared(first, end, range) * 2 >= Math.min(span(range.fromDate, range.toDate), span(first, end));
}

const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export type MonthRow = { month: string; label: string; dots: { date: string; done: boolean }[]; done: number };
/** Her ay tek satır, en yeni ay üstte. Yalnız sonucu belli görevler nokta olur. */
export function monthRows(days: Day[]): MonthRow[] {
  const months = new Map<string, MonthRow>();
  for (const item of [...days].sort((a, b) => a.localDate.localeCompare(b.localDate))) {
    const done = item.class === "OnTime" || item.class === "Late";
    if (!done && item.class !== "NotDone") continue;
    const month = item.localDate.slice(0, 7);
    const row = months.get(month) ?? { month, label: monthNames[plain(item.localDate).month - 1]!, dots: [], done: 0 };
    row.dots.push({ date: item.localDate, done });
    row.done += done ? 1 : 0;
    months.set(month, row);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
export function shortDay(value: string) {
  const d = plain(value);
  return `${d.day} ${monthNames[d.month - 1]}`;
}

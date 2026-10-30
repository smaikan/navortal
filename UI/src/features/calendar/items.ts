import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { states } from "../tasks/model";

export type CalendarItem = components["schemas"]["CalendarItem"];
export type CalendarItemPage = components["schemas"]["CalendarItemPage"];
export const itemPageLimit = 300;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || v === undefined || id(v);
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const integer = (v: unknown) =>
  typeof v === "number" ? Number.isSafeInteger(v) && v >= 0 : typeof v === "string" && /^\d+$/.test(v);
function invalid(): never {
  throw new ApiError("protocol", "Takvim yanıtı doğrulanamadı. Yeniden oku.");
}

export function readItemPage(v: CalendarItemPage, from: string, to: string, offset: number): CalendarItemPage {
  if (
    !v ||
    v.fromDate !== from ||
    v.toDate !== to ||
    !Array.isArray(v.items) ||
    !integer(v.total) ||
    Number(v.offset) !== offset ||
    v.items.length > itemPageLimit
  )
    invalid();
  for (const item of v.items) {
    if (
      !item ||
      !["Timed", "Untimed"].includes(item.kind) ||
      !id(item.id) ||
      !id(item.taskId) ||
      !id(item.rootTaskId) ||
      !nullableId(item.parentTaskId) ||
      typeof item.title !== "string" ||
      typeof item.rootTitle !== "string" ||
      typeof item.localDate !== "string" ||
      item.localDate < from ||
      item.localDate > to ||
      !Object.hasOwn(states, item.taskState) ||
      !(item.completedAt == null || instant(item.completedAt)) ||
      (item.kind === "Timed"
        ? !instant(item.startsAt) || !instant(item.endsAt)
        : (item.startsAt != null && !instant(item.startsAt)) ||
          (item.endsAt != null &&
            (!instant(item.endsAt) || !item.startsAt || Date.parse(item.endsAt) <= Date.parse(item.startsAt))))
    )
      invalid();
  }
  return v;
}

/** Yalnız takvim tarihi hesabı. Ay ve hafta kullanıcının ilk gününden başlıyor; 0 pazar. */
export function monthGrid(anchor: string, weekStartsOn: number) {
  const first = Temporal.PlainDate.from(anchor).with({ day: 1 });
  const start = first.subtract({ days: ((first.dayOfWeek % 7) - weekStartsOn + 7) % 7 });
  const last = first.add({ months: 1 }).subtract({ days: 1 });
  const weeks = Math.ceil((start.until(last).days + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => start.add({ days: i }));
  return {
    from: days[0].toString(),
    to: days.at(-1)!.toString(),
    days: days.map(d => ({ date: d.toString(), day: d.day, inMonth: d.month === first.month })),
    month: first,
  };
}
export function weekDays(anchor: string, weekStartsOn: number) {
  const date = Temporal.PlainDate.from(anchor);
  const start = date.subtract({ days: ((date.dayOfWeek % 7) - weekStartsOn + 7) % 7 });
  const days = Array.from({ length: 7 }, (_, i) => start.add({ days: i }).toString());
  return { from: days[0], to: days[6], days };
}
export function shiftAnchor(anchor: string, view: "month" | "week", step: number) {
  const date = Temporal.PlainDate.from(anchor);
  return (view === "month" ? date.with({ day: 1 }).add({ months: step }) : date.add({ weeks: step })).toString();
}

export type RootGroup = { rootTaskId: string; rootTitle: string; items: CalendarItem[]; done: boolean };
/** Yalnız görünüm için gün öğelerini kök göreve göre grupluyoruz. İlk görünme sırası korunuyor; hepsi bitince grup bitmiş sayılıyor. */
export function groupByRoot(items: CalendarItem[]): RootGroup[] {
  const groups = new Map<string, RootGroup>();
  for (const item of items) {
    const group = groups.get(item.rootTaskId) ?? {
      rootTaskId: item.rootTaskId,
      rootTitle: item.rootTitle,
      items: [],
      done: true,
    };
    group.items.push(item);
    group.done = group.done && !!item.completedAt;
    groups.set(item.rootTaskId, group);
  }
  return [...groups.values()];
}
export function byDay(items: CalendarItem[]) {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) map.set(item.localDate, [...(map.get(item.localDate) ?? []), item]);
  return map;
}
const months = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const weekdays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const shortWeekdays = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const monthLabel = (date: Temporal.PlainDate) => `${months[date.month - 1]} ${date.year}`;
export function dayTitle(date: string) {
  const d = Temporal.PlainDate.from(date);
  return `${weekdays[d.dayOfWeek % 7]}, ${d.day} ${months[d.month - 1]}`;
}
export function weekLabel(from: string, to: string) {
  const a = Temporal.PlainDate.from(from),
    b = Temporal.PlainDate.from(to);
  return a.month === b.month
    ? `${a.day}–${b.day} ${months[a.month - 1]} ${a.year}`
    : a.year === b.year
      ? `${a.day} ${months[a.month - 1]} – ${b.day} ${months[b.month - 1]} ${b.year}`
      : `${a.day} ${months[a.month - 1]} ${a.year} – ${b.day} ${months[b.month - 1]} ${b.year}`;
}

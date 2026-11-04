import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { dateFormat } from "../../lib/date-format";

type WirePreferences = components["schemas"]["PlanningPreferences"];
export type Preferences = Omit<
  Required<WirePreferences>,
  "weekly" | "exceptions" | "weekStartsOn" | "minimumSplitSeconds" | "transitionSeconds"
> & {
  weekStartsOn: number;
  minimumSplitSeconds: number;
  transitionSeconds: number;
  weekly: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  exceptions: { date: string; intervals: { startMinute: number; endMinute: number }[] }[];
};
export type Snapshot = { version: number | string; values: Preferences };
export type RangeDraft = { id: string; start: string; end: string };
export type Draft = {
  timeZoneId: string;
  planningMode: string;
  supportEnabled: boolean;
  minimumSplitSeconds: string;
  transitionSeconds: string;
  weekly: (RangeDraft & { dayOfWeek: number })[];
  exceptions: { id: string; date: string; intervals: RangeDraft[] }[];
};
export const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const weekOrder = [1, 2, 3, 4, 5, 6, 0];
export function clock(minute: number | string) {
  const value = Number(minute);
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
function minute(value: string, end = false): number | undefined {
  if (end && value === "24:00") return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 2 || Number(value.slice(0, 4)) > 9998)
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function localToday(zone: string) {
  const parts = dateFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function validZone(zone: string) {
  if (zone !== "UTC" && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone)) return false;
  try {
    dateFormat("tr", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
/** Üretilmiş tipte isteğe bağlı alan olması yanıt garantisi değil. Eksik yanıtı varsayılanla doldurmuyoruz. */
export function readSnapshot(input: components["schemas"]["PreferencesSnapshot"]): Snapshot {
  const values = input?.values;
  const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value);
  const range = (value: Preferences["exceptions"][number]["intervals"][number]) =>
    value &&
    integer(value.startMinute) &&
    integer(value.endMinute) &&
    value.startMinute >= 0 &&
    value.endMinute <= 1440 &&
    value.startMinute < value.endMinute;
  const version =
    (typeof input?.version === "string" && /^\d+$/.test(input.version)) ||
    (integer(input?.version) && Number(input.version) >= 0);
  if (
    !version ||
    !values ||
    typeof values.timeZoneId !== "string" ||
    !validZone(values.timeZoneId) ||
    typeof values.language !== "string" ||
    !["12h", "24h"].includes(values.timeFormat ?? "") ||
    !integer(values.weekStartsOn) ||
    Number(values.weekStartsOn) < 0 ||
    Number(values.weekStartsOn) > 6 ||
    !["Preview", "Auto"].includes(values.planningMode ?? "") ||
    !["Ask", "CompleteSubtree", "ParentOnly"].includes(values.parentCompletionPolicy ?? "") ||
    !integer(values.minimumSplitSeconds) ||
    Number(values.minimumSplitSeconds) < 1 ||
    Number(values.minimumSplitSeconds) > 86400 ||
    !integer(values.transitionSeconds) ||
    Number(values.transitionSeconds) < 0 ||
    Number(values.transitionSeconds) > 86400 ||
    typeof values.supportEnabled !== "boolean" ||
    !Array.isArray(values.weekly) ||
    values.weekly.length > 70 ||
    !values.weekly.every(
      item =>
        integer(item.dayOfWeek) &&
        Number(item.dayOfWeek) >= 0 &&
        Number(item.dayOfWeek) <= 6 &&
        range(item as Preferences["weekly"][number]),
    ) ||
    !Array.isArray(values.exceptions) ||
    values.exceptions.length > 366 ||
    !values.exceptions.every(
      item =>
        validDate(item.date) &&
        Array.isArray(item.intervals) &&
        item.intervals.length <= 24 &&
        item.intervals.every(interval => range(interval as Preferences["exceptions"][number]["intervals"][number])),
    )
  ) {
    throw new ApiError("protocol", "Tercihler eksiksiz okunamadı. Kaydetmeden önce yeniden yükle.");
  }
  return input as Snapshot;
}
export function toDraft(values: Preferences): Draft {
  return {
    timeZoneId: values.timeZoneId,
    planningMode: values.planningMode,
    supportEnabled: values.supportEnabled,
    minimumSplitSeconds: String(values.minimumSplitSeconds),
    transitionSeconds: String(values.transitionSeconds),
    weekly: values.weekly.map((item, i) => ({
      id: `w-${i}`,
      dayOfWeek: item.dayOfWeek,
      start: clock(item.startMinute),
      end: clock(item.endMinute),
    })),
    exceptions: values.exceptions.map((item, i) => ({
      id: `e-${i}`,
      date: item.date,
      intervals: item.intervals.map((range, j) => ({
        id: `e-${i}-${j}`,
        start: clock(range.startMinute),
        end: clock(range.endMinute),
      })),
    })),
  };
}
export type FieldIssue = { path: string; message: string };
export function buildValues(base: Preferences, draft: Draft): { values: Preferences; errors: FieldIssue[] } {
  const errors: FieldIssue[] = [];
  if (!validZone(draft.timeZoneId))
    errors.push({ path: "timeZoneId", message: "Geçerli bir IANA saat dilimi yaz; örneğin Europe/Istanbul veya UTC." });
  function seconds(key: "minimumSplitSeconds" | "transitionSeconds", minimum: number) {
    const value = Number(draft[key]);
    if (!/^\d+$/.test(draft[key]) || !Number.isSafeInteger(value) || value < minimum || value > 86400)
      errors.push({ path: key, message: `${minimum}–86400 arasında tam saniye yaz.` });
    return value;
  }
  function ranges(items: RangeDraft[], path: string) {
    const result = items.map(item => {
      const start = minute(item.start);
      const end = minute(item.end, true);
      if (start === undefined)
        errors.push({ path: `${path}.${item.id}.start`, message: "Başlangıcı SS:DD biçiminde yaz (00:00–23:59)." });
      if (end === undefined)
        errors.push({
          path: `${path}.${item.id}.end`,
          message: "Bitişi SS:DD biçiminde yaz; gün sonu için 24:00 kullan.",
        });
      if (start !== undefined && end !== undefined && end <= start)
        errors.push({
          path: `${path}.${item.id}.end`,
          message: "Bitiş başlangıçtan sonra olmalı. Geceyi aşan aralığı iki güne ayır.",
        });
      return { startMinute: start ?? 0, endMinute: end ?? 0 };
    });
    const sorted = result.map((item, i) => ({ ...item, i })).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].startMinute < sorted[i - 1].endMinute)
        errors.push({ path: `${path}.${items[sorted[i].i].id}.start`, message: "Bu günün saat aralıkları çakışıyor." });
    return result;
  }
  if (draft.weekly.length > 70) errors.push({ path: "weekly", message: "En fazla 70 haftalık aralık ekleyebilirsin." });
  const weekly = weekOrder.flatMap(dayOfWeek =>
    ranges(
      draft.weekly.filter(item => item.dayOfWeek === dayOfWeek),
      "weekly",
    ).map(item => ({ dayOfWeek, ...item })),
  );
  const dates = new Set<string>();
  if (draft.exceptions.length > 366)
    errors.push({ path: "exceptions", message: "En fazla 366 tarih istisnası ekleyebilirsin." });
  const exceptions = draft.exceptions.map(item => {
    if (!validDate(item.date))
      errors.push({ path: `exceptions.${item.id}.date`, message: "Geçerli bir tarih seç (yıl 0002–9998)." });
    else if (dates.has(item.date))
      errors.push({ path: `exceptions.${item.id}.date`, message: "Bu tarih zaten eklenmiş. Aynı istisnayı düzenle." });
    dates.add(item.date);
    if (item.intervals.length > 24)
      errors.push({ path: `exceptions.${item.id}.date`, message: "Bir tarihe en fazla 24 aralık ekleyebilirsin." });
    return { date: item.date, intervals: ranges(item.intervals, `exceptions.${item.id}`) };
  });
  return {
    errors,
    values: {
      ...base,
      timeZoneId: draft.timeZoneId,
      planningMode: draft.planningMode,
      supportEnabled: draft.supportEnabled,
      minimumSplitSeconds: seconds("minimumSplitSeconds", 1),
      transitionSeconds: seconds("transitionSeconds", 0),
      weekly,
      exceptions,
    },
  };
}

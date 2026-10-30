import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { dates } from "./model";
import { validZone } from "../preferences/model";
export type CalendarOverview = components["schemas"]["CalendarOverviewView"];
const integer = (n: unknown) =>
  (typeof n === "number" || typeof n === "string") && Number.isSafeInteger(Number(n)) && Number(n) >= 0;
export function readCalendarOverview(value: CalendarOverview, from: string, to: string) {
  const invalid = () => {
    throw new ApiError("protocol", "Takvim özeti doğrulanamadı. Yeniden oku.");
  };
  const expected = dates(from, to);
  if (
    !value ||
    value.fromDate !== from ||
    value.toDate !== to ||
    !Array.isArray(value.days) ||
    value.days.length !== expected.length ||
    !(typeof value.planningVersion === "number"
      ? Number.isSafeInteger(value.planningVersion) && value.planningVersion >= 0
      : /^(0|[1-9]\d*)$/.test(value.planningVersion) && BigInt(value.planningVersion) <= 9223372036854775807n) ||
    !Number.isFinite(Date.parse(value.serverNow))
  )
    invalid();
  value.days.forEach((day, i) => {
    if (
      !day ||
      day.localDate !== expected[i] ||
      !validZone(day.timeZoneId) ||
      ![day.itemCount, day.completedItemCount, day.rootGroupCount].every(integer) ||
      Number(day.completedItemCount) > Number(day.itemCount) ||
      Number(day.rootGroupCount) > Number(day.itemCount) ||
      !Array.isArray(day.roots) ||
      day.roots.length !== Math.min(3, Number(day.rootGroupCount))
    )
      invalid();
    const seen = new Set<string>();
    for (const root of day.roots) {
      if (
        !root ||
        !validTaskId(root.rootTaskId) ||
        seen.has(root.rootTaskId) ||
        typeof root.rootTitle !== "string" ||
        !root.rootTitle.trim() ||
        ![root.itemCount, root.completedItemCount].every(integer) ||
        Number(root.itemCount) < 1 ||
        Number(root.completedItemCount) > Number(root.itemCount) ||
        typeof root.done !== "boolean" ||
        root.done !== (Number(root.itemCount) === Number(root.completedItemCount))
      )
        invalid();
      seen.add(root.rootTaskId);
    }
  });
  return value;
}

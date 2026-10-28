import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
import { readVersions } from "../workspace/model";
import { readSupportDay } from "../support/model";
import { readDay, readDayItems, readSchedules, blockLimit, dayItemLimit } from "./model";
import { readGlance } from "./glance";

export type DayOverview = components["schemas"]["DayOverviewView"];
export type OverviewScope = {
  scheduleOffset?: number;
  itemOffset?: number;
  scheduleLimit?: number;
  itemLimit?: number;
};
export function readOverview(v: DayOverview, date: string, scope: OverviewScope = {}): DayOverview {
  if (!v) throw new ApiError("protocol", "Gün görünümü okunamadı. Yeniden yükle.");
  readDay(v.day, date);
  readSchedules(v.timed, blockLimit);
  readDayItems(v.untimed, date);
  readGlance(v.glance, date);
  readSupportDay(v.support, date);
  readVersions(v.versions);
  const from = Date.parse(v.windowStartsAt),
    to = Date.parse(v.windowEndsAt);
  if (
    !Array.isArray(v.recurringTaskIds) ||
    new Set(v.recurringTaskIds).size !== v.recurringTaskIds.length ||
    v.recurringTaskIds.some(
      id => !validTaskId(id) || ![...v.timed.items, ...v.untimed.items].some(item => item.taskId === id),
    ) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    ![v.day.planningVersion, v.glance.planningVersion, v.support.planningVersion].every(
      x => String(x) === String(v.versions.planning),
    ) ||
    v.timed.items.some(x => x.dailyPlanId !== v.day.id) ||
    Number(v.timed.offset) !== (scope.scheduleOffset ?? 0) ||
    Number(v.untimed.offset) !== (scope.itemOffset ?? 0) ||
    Number(v.timed.limit) !== (scope.scheduleLimit ?? blockLimit) ||
    Number(v.untimed.limit) !== (scope.itemLimit ?? dayItemLimit) ||
    Number(v.timed.total) < v.timed.items.length ||
    Number(v.untimed.total) < v.untimed.items.length
  )
    throw new ApiError("protocol", "Gün görünümünün kapsamı tutarsız. Yeniden yükle.");
  return v;
}

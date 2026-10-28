import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
import { readDayItem, readSchedule } from "./model";

export type TaskDeferralBody = components["schemas"]["DeferTasksRequest"];
export type TaskDeferralResult = components["schemas"]["DayDeferralResult"];
const integer = (value: unknown) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 0
    : typeof value === "string" && /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n;
export function readTaskDeferral(value: TaskDeferralResult, expected: TaskDeferralBody) {
  const targets = new Map(expected.tasks.map(x => [x.taskId, x.targetDate]));
  const invalid = (): never => {
    throw new ApiError(
      "protocol",
      "Erteleme yanıtı doğrulanamadı. Güncel planı kontrol et.",
      200,
      undefined,
      {},
      undefined,
      undefined,
      true,
    );
  };
  if (
    !value ||
    !validTaskId(value.changeSetId) ||
    !integer(value.planningVersion) ||
    BigInt(value.planningVersion) <= BigInt(expected.expectedPlanningVersion) ||
    !Array.isArray(value.revisionIds) ||
    !value.revisionIds.length ||
    value.revisionIds.some(x => !validTaskId(x)) ||
    !Array.isArray(value.items) ||
    value.items.some(x => !x || typeof x !== "object") ||
    value.items.length !== targets.size ||
    new Set(value.items.map(x => x.id)).size !== targets.size ||
    new Set(value.items.map(x => x.taskId)).size !== targets.size ||
    !Array.isArray(value.schedules) ||
    value.schedules.some(x => !x || typeof x !== "object")
  )
    invalid();
  for (const item of value.items) {
    const date = targets.get(item.taskId);
    if (!date || item.completedAt !== null) invalid();
    readDayItem(item, date!);
  }
  if (new Set(value.schedules.map(x => x.id)).size !== value.schedules.length) invalid();
  for (const schedule of value.schedules) {
    readSchedule(schedule);
    if (
      !schedule.taskId ||
      !targets.has(schedule.taskId) ||
      schedule.state !== "Removed" ||
      schedule.completedAt !== null
    )
      invalid();
  }
  return value;
}

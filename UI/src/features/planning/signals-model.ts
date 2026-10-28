import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { readWork } from "../work/model";
import { readCurrent } from "../focus/model";

export type DaySignals = components["schemas"]["DaySignalsView"];
const count = (value: unknown) =>
  (typeof value === "number" || (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value))) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) >= 0;
export function readSignals(value: DaySignals, date: string): DaySignals {
  const invalid = () => {
    throw new ApiError("protocol", "Gün destekleri doğrulanamadı. Yeniden yükle.");
  };
  if (
    !value ||
    value.localDate !== date ||
    !Number.isFinite(Date.parse(value.serverNow)) ||
    !count(value.returnThresholdSeconds) ||
    Number(value.returnThresholdSeconds) < 1 ||
    Number(value.returnThresholdSeconds) > 86400 ||
    typeof value.complete !== "boolean" ||
    typeof value.focusIncluded !== "boolean" ||
    (!value.focusIncluded && value.focus !== null) ||
    !Array.isArray(value.notifications) ||
    value.notifications.length > 1000 ||
    (value.runningWorkSessionId !== null && !validTaskId(value.runningWorkSessionId))
  )
    invalid();
  const ids = new Set<string>();
  for (const n of value.notifications) {
    if (
      !n ||
      !validTaskId(n.id) ||
      !validTaskId(n.sourceId) ||
      ids.has(n.id) ||
      !["ScheduleStart", "ScheduleEnd", "ReturnToTask"].includes(n.kind) ||
      n.state !== "Ready" ||
      n.readAt !== null ||
      !count(n.snoozeCount) ||
      Number(n.snoozeCount) < 0
    )
      invalid();
    ids.add(n.id);
  }
  if (value.lastWork !== null) {
    readWork(value.lastWork);
    if (value.lastWork.serverNow !== value.serverNow) invalid();
  }
  if (value.focusIncluded) readCurrent({ session: value.focus, serverNow: value.serverNow });
  const task = value.runningTask;
  if (
    task !== null &&
    (!value.runningWorkSessionId ||
      !validTaskId(task.taskId) ||
      typeof task.hasDirectWork !== "boolean" ||
      (task.directEstimatedSeconds !== null &&
        !(
          (typeof task.directEstimatedSeconds === "number" &&
            Number.isSafeInteger(task.directEstimatedSeconds) &&
            task.directEstimatedSeconds >= 0) ||
          (typeof task.directEstimatedSeconds === "string" &&
            /^(0|[1-9]\d*)$/.test(task.directEstimatedSeconds) &&
            BigInt(task.directEstimatedSeconds) <= 9223372036854775807n)
        )))
  )
    invalid();
  return value;
}

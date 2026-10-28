import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
import { readDayItem, readSchedule } from "./model";

export type DeferralBody = components["schemas"]["DeferDaySelectionRequest"];
export type DeferralPreview = components["schemas"]["DayDeferralPreview"];
export type DeferralResult = components["schemas"]["DayDeferralResult"];
export type DeferralExpectation = {
  sourceDate: string;
  targetDate: string;
  planningVersion: number | string;
  schedules: { id: string; taskId: string; version: number | string }[];
  items: { id: string; taskId: string; version: number | string }[];
};
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) <= 9223372036854775807n;
function invalid(): never {
  throw new ApiError(
    "protocol",
    "Erteleme yanıtı doğrulanamadı. Güncel planı okuyup kontrol et.",
    200,
    undefined,
    {},
    undefined,
    undefined,
    true,
  );
}
const taskIds = (expected: DeferralExpectation) =>
  new Set([...expected.schedules, ...expected.items].map(x => x.taskId));
function sameTasks(actual: { taskId: string }[], expected: DeferralExpectation) {
  const ids = taskIds(expected);
  return (
    actual.length === ids.size &&
    new Set(actual.map(x => x.taskId)).size === ids.size &&
    actual.every(x => ids.has(x.taskId))
  );
}
export function readDeferralPreview(value: DeferralPreview, expected: DeferralExpectation) {
  if (
    !value ||
    value.sourceDate !== expected.sourceDate ||
    value.targetDate !== expected.targetDate ||
    String(value.planningVersion) !== String(expected.planningVersion) ||
    !integer(value.planningVersion) ||
    !Array.isArray(value.schedules) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.issues) ||
    value.canApply !== (value.issues.length === 0)
  )
    invalid();
  value.schedules.forEach(readSchedule);
  value.items.forEach(x => readDayItem(x, expected.sourceDate));
  for (const [actual, wanted] of [
    [value.schedules, expected.schedules],
    [value.items, expected.items],
  ] as const) {
    if (
      actual.length !== wanted.length ||
      new Set(actual.map(x => x.id)).size !== wanted.length ||
      wanted.some(
        x =>
          !actual.some(
            a =>
              a.id === x.id &&
              a.taskId === x.taskId &&
              String(a.version) === String(x.version) &&
              a.completedAt == null,
          ),
      )
    )
      invalid();
  }
  if (
    value.schedules.some(x => x.state !== "Planned") ||
    value.tasks.some(
      x =>
        !x ||
        !validTaskId(x.taskId) ||
        typeof x.title !== "string" ||
        !x.title ||
        typeof x.alreadyPlanned !== "boolean",
    ) ||
    !sameTasks(value.tasks, expected) ||
    value.issues.some(x => !x || typeof x.code !== "string" || typeof x.message !== "string" || !x.message)
  )
    invalid();
  return value;
}
export function readDeferralResult(value: DeferralResult, expected: DeferralExpectation) {
  if (
    !value ||
    !validTaskId(value.changeSetId) ||
    !integer(value.planningVersion) ||
    BigInt(value.planningVersion) <= BigInt(expected.planningVersion) ||
    !Array.isArray(value.schedules) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.revisionIds) ||
    !value.revisionIds.length ||
    value.revisionIds.some(x => !validTaskId(x))
  )
    invalid();
  value.schedules.forEach(readSchedule);
  value.items.forEach(x => readDayItem(x, expected.targetDate));
  if (
    value.schedules.length !== expected.schedules.length ||
    new Set(value.schedules.map(x => x.id)).size !== expected.schedules.length ||
    expected.schedules.some(
      x => !value.schedules.some(a => a.id === x.id && a.taskId === x.taskId && a.state === "Removed"),
    ) ||
    !sameTasks(value.items, expected) ||
    new Set(value.items.map(x => x.id)).size !== value.items.length ||
    value.items.some(x => x.completedAt !== null)
  )
    invalid();
  return value;
}

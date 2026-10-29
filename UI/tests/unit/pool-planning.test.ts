import { expect, test } from "vitest";
import { ApiError } from "../../src/lib/api/errors";
import { acceptTaskPlan, blocksTaskPlanRetry, taskPlanFailure } from "../../src/features/planning/plan-task-model";
import type { DayItem } from "../../src/features/planning/model";
const taskId = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  date = "2026-12-10";
const item: DayItem = {
  id: other,
  isUrgent: false,
  taskId,
  taskTitle: "Havuz işi",
  taskState: "Pending",
  localDate: date,
  version: 1,
  sortOrder: 1,
  completedAt: null,
  parentTaskId: null,
  parentTitle: null,
  directEstimatedSeconds: null,
};
test("a confirmed pool plan keeps the selected task and day, including an unknown estimate", () => {
  expect(acceptTaskPlan(item, taskId, date)).toBe(item);
  expect(item.directEstimatedSeconds).toBeNull();
  expect(() => acceptTaskPlan({ ...item, taskId: other }, taskId, date)).toThrow(ApiError);
  expect(() => acceptTaskPlan({ ...item, localDate: "2026-12-11" }, taskId, date)).toThrow(ApiError);
});
test.each([
  new ApiError("network", "lost", 0, undefined, {}, undefined, undefined, true),
  new ApiError("protocol", "invalid"),
  new ApiError("http", "conflict", 409),
])("a keyless uncertain/protocol/conflict write requires reads before a new intent: %s", error => {
  expect(blocksTaskPlanRetry(error)).toBe(true);
  expect(taskPlanFailure(error)).toContain("oku");
  expect(taskPlanFailure(error)).not.toContain("yüklendi");
});
test.each([
  new ApiError("http", "invalid", 400),
  new ApiError("http", "missing", 404),
  new ApiError("offline", "offline"),
])("a known refusal is honest and never a save receipt: %s", error => {
  expect(blocksTaskPlanRetry(error)).toBe(false);
  expect(taskPlanFailure(error)).not.toContain("kaydedildi");
  expect(taskPlanFailure(error)).not.toContain("yüklendi");
});
test("a duplicate is not called a newly saved item, and a malformed ACK cannot open the next write", () => {
  expect(taskPlanFailure(new ApiError("http", "duplicate", 409, "day_item_exists"))).toContain("zaten var");
  try {
    acceptTaskPlan({ ...item, taskId: other }, taskId, date);
    throw new Error("should reject");
  } catch (error) {
    expect(blocksTaskPlanRetry(error)).toBe(true);
  }
});

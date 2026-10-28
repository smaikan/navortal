import { expect, test } from "vitest";
import { readTaskDeferral, type TaskDeferralBody } from "../../src/features/planning/task-deferral-model";
import {
  readDeferralPreview,
  readDeferralResult,
  type DeferralExpectation,
  type DeferralPreview,
  type DeferralResult,
} from "../../src/features/planning/deferral-model";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const expected: DeferralExpectation = {
  sourceDate: "2026-10-25",
  targetDate: "2026-10-26",
  planningVersion: "9007199254740993",
  schedules: [{ id: id(1), taskId: id(2), version: 1 }],
  items: [],
};
const block = {
  id: id(1),
  dailyPlanId: id(3),
  taskId: id(2),
  kind: "Work",
  state: "Planned",
  startsAt: "2026-10-25T09:00:00Z",
  endsAt: "2026-10-25T09:25:00Z",
  isFixed: false,
  isLocked: false,
  version: 1,
  taskSnapshot: { task: { title: "Rapor" }, directEstimatedSeconds: null },
  completedAt: null,
};
const item = {
  id: id(4),
  taskId: id(2),
  localDate: expected.targetDate,
  sortOrder: 0,
  completedAt: null,
  version: 1,
  taskTitle: "Rapor",
  parentTaskId: null,
  parentTitle: null,
  directEstimatedSeconds: null,
};
const preview = {
  sourceDate: expected.sourceDate,
  targetDate: expected.targetDate,
  planningVersion: expected.planningVersion,
  schedules: [block],
  items: [],
  tasks: [{ taskId: id(2), title: "Rapor", alreadyPlanned: false }],
  issues: [],
  canApply: true,
} as unknown as DeferralPreview;
const receipt = {
  changeSetId: id(5),
  planningVersion: "9007199254740994",
  schedules: [{ ...block, state: "Removed", version: 2 }],
  items: [item],
  revisionIds: [id(6), id(7)],
} as DeferralResult;
test("per-task deferral binds every target date, rejects foreign or duplicate tasks and keeps full-size versions", () => {
  const command: TaskDeferralBody = {
    expectedPlanningVersion: expected.planningVersion,
    tasks: [
      { taskId: id(2), targetDate: expected.targetDate },
      { taskId: id(9), targetDate: "2026-10-28" },
    ],
  };
  const result = {
    ...receipt,
    items: [item, { ...item, id: id(10), taskId: id(9), localDate: "2026-10-28" }],
  } as DeferralResult;
  expect(readTaskDeferral(result, command)).toBe(result);
  for (const items of [
    [result.items[0]],
    [result.items[0], { ...result.items[1], taskId: id(11) }],
    [result.items[0], { ...result.items[1], taskId: id(2) }],
    [result.items[0], { ...result.items[1], localDate: expected.targetDate }],
  ])
    expect(() => readTaskDeferral({ ...result, items }, command)).toThrow();
  expect(() => readTaskDeferral({ ...result, planningVersion: expected.planningVersion }, command)).toThrow();
});
test("deferral preview binds the exact selected source items, task identities, target and full-size version", () => {
  expect(readDeferralPreview(preview, expected)).toBe(preview);
  for (const patch of [
    { sourceDate: expected.targetDate },
    { targetDate: expected.sourceDate },
    { planningVersion: "9007199254740992" },
    { schedules: [] },
    { tasks: [] },
    { tasks: [{ ...preview.tasks[0], taskId: id(8) }] },
    { issues: [{ code: "protected", message: "Açık izin gerekli" }] },
  ])
    expect(() => readDeferralPreview({ ...preview, ...patch } as DeferralPreview, expected)).toThrow();
  const protectedPreview = {
    ...preview,
    issues: [{ code: "protected", message: "Açık izin gerekli" }],
    canApply: false,
  };
  expect(readDeferralPreview(protectedPreview, expected).canApply).toBe(false);
});
test("only a canceled source schedule and an open untimed item for the same task establish deferral success", () => {
  expect(readDeferralResult(receipt, expected)).toBe(receipt);
  for (const patch of [
    { schedules: [block] },
    { schedules: [] },
    { schedules: [{ ...receipt.schedules[0], taskId: id(8) }] },
    { items: [] },
    { items: [{ ...item, taskId: id(8) }] },
    { items: [{ ...item, localDate: expected.sourceDate }] },
    { items: [{ ...item, completedAt: "2026-10-25T09:00:00Z" }] },
    { revisionIds: [] },
    { planningVersion: expected.planningVersion },
  ])
    expect(() => readDeferralResult({ ...receipt, ...patch } as DeferralResult, expected)).toThrow();
});
test("several selected timed fragments produce one task item, and an existing target item may retain its identity", () => {
  const wanted = { ...expected, schedules: [...expected.schedules, { id: id(9), taskId: id(2), version: 1 }] };
  const result = { ...receipt, schedules: [...receipt.schedules, { ...receipt.schedules[0], id: id(9) }] };
  expect(readDeferralResult(result, wanted).items).toHaveLength(1);
  expect(() =>
    readDeferralResult({ ...result, items: [item, { ...item, id: id(10) }] } as DeferralResult, wanted),
  ).toThrow();
  expect(
    readDeferralResult({ ...receipt, items: [{ ...item, id: id(11), version: 6 }] } as DeferralResult, expected)
      .items[0].id,
  ).toBe(id(11));
});

test("malformed task-deferral receipts remain protocol-unknown, including unsafe numeric versions", () => {
  const command: TaskDeferralBody = {
    expectedPlanningVersion: 1,
    tasks: [{ taskId: id(2), targetDate: expected.targetDate }],
  };
  for (const patch of [{ planningVersion: Number.MAX_SAFE_INTEGER + 1 }, { items: [null] }, { schedules: [null] }]) {
    try {
      readTaskDeferral({ ...receipt, ...patch } as unknown as DeferralResult, command);
      throw new Error("accepted malformed receipt");
    } catch (error) {
      expect(error).toMatchObject({ kind: "protocol", outcomeUnknown: true });
    }
  }
});

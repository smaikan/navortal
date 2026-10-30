import { expect, test } from "vitest";
import {
  readRevision,
  readRevisions,
  readItems,
  readChanges,
  readHistoricalSchedule,
  readUndo,
  undoFailure,
  type Revision,
} from "../../src/features/planning/history-model";
import type { Schedule } from "../../src/features/planning/model";
import { messageText, type Proposal } from "../../src/features/planning/proposal-model";
import { readRevision as readRealtimeRevision } from "../../src/features/planning/revision-model";
import { ApiError } from "../../src/lib/api/errors";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
const revision: Revision = {
  id,
  dailyPlanId: id,
  number: 1,
  previousRevisionId: null,
  changeSetId: id,
  trigger: "Manual",
  reason: "ilk plan",
  createdAt: "2026-10-25T06:00:00Z",
  effectiveAt: "2026-10-25T06:00:00Z",
  algorithmVersion: "manual-v1",
  snapshotSchemaVersion: 1,
  reversesChangeSetId: null,
};
const schedule: Schedule = {
  id,
  dailyPlanId: id,
  taskId: id,
  kind: "Work",
  state: "Planned",
  startsAt: "2026-10-25T07:00:00Z",
  endsAt: "2026-10-25T08:00:00Z",
  isFixed: false,
  isLocked: false,
  version: 1,
  splitGroupId: null,
  originScheduleId: null,
  isAutomatic: false,
  taskSnapshot: {
    state: "Pending",
    hasDirectWork: true,
    directWorkCompleted: false,
    requiredForParent: true,
    directEstimatedSeconds: null,
    targetBudgetSeconds: 7200,
    task: {
      schemaVersion: 1,
      taskId: id,
      taskVersion: 1,
      title: "Eski ad",
      ancestors: [{ id: other, name: "Eski üst görev" }],
      project: null,
      pool: null,
      category: null,
      tags: [{ id: other, name: "Eski etiket" }],
      inputPlanningVersion: 1,
    },
  },
};
const proposal: Proposal = {
  proposalId: id,
  inputVersion: 1,
  createdAt: "2026-10-25T06:00:00Z",
  expiresAt: "2026-10-25T06:02:00Z",
  anchorAt: "2026-10-25T06:00:00Z",
  planningMode: "Preview",
  algorithmVersion: "undo-v1",
  hasConstraintConflicts: false,
  canApply: true,
  status: "Pending",
  blocks: [],
  changes: [],
  unplaced: [],
  warnings: [],
  explanations: [],
  applied: null,
  isPartial: true,
  reversesChangeSetId: id,
};
const page = <T>(items: T[], offset = 0, total = items.length) => ({ items, offset, total, limit: 25 });

test("revision identity, owning day and exact Int64 versions fail closed", () => {
  expect(readRealtimeRevision).toBe(readRevision);
  expect(readRevision({ ...revision, number: "9223372036854775807" }, id, id).number).toBe("9223372036854775807");
  expect(() => readRevision(revision, other)).toThrow();
  expect(() => readRevision(revision, id, other)).toThrow();
  for (const patch of [
    { number: 0 },
    { number: 9223372036854776000 },
    { number: "9223372036854775808" },
    { previousRevisionId: "bad" },
    { createdAt: "2026-10-25" },
  ])
    expect(() => readRevision({ ...revision, ...patch })).toThrow();
});
test("all history pages are bounded, validate the requested offset and preserve owner association", () => {
  expect(readRevisions(page([revision]), 0, id).total).toBe(1);
  for (const p of [
    page(Array(26).fill(revision)),
    { ...page([revision]), limit: 100 },
    page([revision], 25),
    page([revision], 0, 0),
  ])
    expect(() => readRevisions(p, 0, id)).toThrow();
  expect(() => readRevisions(page([revision]), 0, other)).toThrow();
  expect(readRevisions(page([], 25, 25), 25, id).items).toEqual([]);
});
test("frozen historical title/state/context and unknown estimate are returned unchanged, never filled from today's task", () => {
  const before = structuredClone(schedule);
  expect(readHistoricalSchedule(schedule)).toBe(schedule);
  expect(schedule).toEqual(before);
  expect(schedule.taskSnapshot?.task.title).toBe("Eski ad");
  expect(schedule.taskSnapshot?.directEstimatedSeconds).toBeNull();
  const s = schedule.taskSnapshot!;
  for (const taskSnapshot of [
    null,
    { ...s, state: "invented" },
    { ...s, directWorkCompleted: undefined },
    { ...s, task: { ...s.task, taskId: other } },
    { ...s, task: { ...s.task, tags: [{ id: "bad", name: "x" }] } },
  ])
    expect(() => readHistoricalSchedule({ ...schedule, taskSnapshot } as Schedule)).toThrow();
});
test("snapshot items require both their revision and owning day", () => {
  const item = { id, revisionId: id, schedule };
  expect(readItems(page([item]), 0, id, id).items[0].schedule).toBe(schedule);
  expect(() => readItems(page([item]), 0, other, id)).toThrow();
  expect(() => readItems(page([item]), 0, id, other)).toThrow();
});
test("delta before/after blocks must match the schedule; valid cross-day deltas retain original snapshots", () => {
  const change = {
    id,
    scheduleId: id,
    type: "Updated",
    before: schedule,
    after: { ...schedule, dailyPlanId: other },
    conflictsAccepted: false,
  };
  expect(readChanges(page([change]), 0).items[0].after?.dailyPlanId).toBe(other);
  for (const patch of [{ before: null, after: null }, { after: undefined }, { scheduleId: other }])
    expect(() => readChanges(page([{ ...change, ...patch }] as never[]), 0)).toThrow();
});
test("undo proposals bind to the exact source ChangeSet, including partial no-op proposals", () => {
  expect(readUndo(proposal, id)).toBe(proposal);
  expect(readUndo(proposal, id).isPartial).toBe(true);
  expect(() => readUndo(proposal, other)).toThrow();
  expect(() => readUndo({ ...proposal, reversesChangeSetId: null }, id)).toThrow();
  expect(() => readUndo(proposal, id, other)).toThrow();
});
test("undo errors distinguish latest/already-applied/multi-day/owner and warning codes remain understandable", () => {
  for (const [code, text] of [
    ["undo_not_latest", "son kullanıcı"],
    ["undo_already_applied", "daha önce"],
    ["undo_multiple_days", "birden fazla"],
    ["change_set_not_found", "bu hesapta"],
    ["revision_not_found", "bu hesapta"],
  ])
    expect(undoFailure(new ApiError("http", "", 409, code))).toContain(text);
  expect(messageText("UndoHistoryPreserved")).toContain("korundu");
  expect(messageText("UndoFutureCompensation")).toContain("gelecek");
  expect(messageText("FutureUndoCode")).toContain("FutureUndoCode");
});

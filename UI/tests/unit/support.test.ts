import { describe, expect, it } from "vitest";
import {
  criticalIds,
  readSupportDay,
  supportChange,
  validEnergy,
  type EndPreparation,
  type SupportDay,
} from "../../src/features/support/model";
import { readPreparation } from "../../src/features/support/preparation-model";
import type { Task } from "../../src/features/tasks/model";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  third = "00000000-0000-0000-0000-000000000003",
  fourth = "00000000-0000-0000-0000-000000000004";
const date = "2026-10-22";
const day: SupportDay = {
  localDate: date,
  timeZoneId: "Europe/Istanbul",
  availableEnergy: null,
  criticalTaskIds: [],
  version: 0,
  planningVersion: "9007199254740993",
  enabled: false,
};
const task: Task = {
  id,
  title: "Küçük adım",
  description: null,
  state: "Paused",
  priority: "Normal",
  deadlineAt: null,
  canSplit: true,
  directEstimatedSeconds: null,
  createdAt: "2026-10-22T06:00:00Z",
  updatedAt: "2026-10-22T06:00:00Z",
  archivedAt: null,
  version: 1,
  parentTaskId: null,
  sortOrder: 1024,
  hasDirectWork: true,
  targetBudgetSeconds: null,
  directWorkCompleted: false,
  requiredForParent: true,
  completionOrigin: null,
  completedAt: null,
  projectId: null,
  poolId: null,
  categoryId: null,
  autoCompleteFromChildren: true,
};
function end(): EndPreparation {
  return {
    day: {
      summary: {
        localDate: date,
        timeZoneId: "Europe/Istanbul",
        dailyPlanId: null,
        currentRevisionId: null,
        baselineRevisionId: null,
        revisionNumber: 0,
        planningVersion: day.planningVersion,
        plannedWorkSeconds: 0,
        plannedBreakSeconds: 0,
        plannedBufferSeconds: 0,
        baselineWorkSeconds: 0,
        plannedBlockCount: 0,
        actualSeconds: "0.000001",
        actualSegmentCount: 1,
        completedTaskCount: 0,
        hasOpenWork: true,
      },
      serverNow: "2026-10-22T09:00:00Z",
      plan: { items: [], offset: 0, limit: 50, total: 0, revisionId: null },
      actual: { items: [], offset: 0, limit: 50, total: 0 },
      completions: { items: [], offset: 0, limit: 50, total: 0 },
      legacyZoneCompletionCount: 0,
    },
    openWork: { localDate: date, items: [task], offset: 0, limit: 25, total: 26, planningVersion: day.planningVersion },
    availableActions: ["Carry", "Move", "Pool", "Cancel"],
  };
}
describe("optional support preferences", () => {
  it("keeps version zero and disabled/null facts without inventing a selection", () => {
    expect(readSupportDay(day, date)).toEqual(day);
    expect(supportChange(day, null, [])).toEqual({ version: 0, availableEnergy: null, criticalTaskIds: [] });
  });
  it("keeps 0..3 unique ids in user slot order, rejects 4, duplicates and fabricated ids", () => {
    expect(criticalIds([])).toEqual([]);
    expect(criticalIds([third, id, other])).toEqual([third, id, other]);
    for (const ids of [[id, other, third, fourth], [id, id], ["fake"]]) expect(() => criticalIds(ids)).toThrow();
  });
  it.each([
    { version: -1 },
    { version: 0.5 },
    { availableEnergy: "VeryLow" },
    { criticalTaskIds: [id, id] },
    { criticalTaskIds: [id, other, third, fourth] },
    { timeZoneId: "unknown" },
    { timeZoneId: undefined },
    { enabled: undefined },
    { localDate: "2026-10-23" },
  ])("rejects invalid day %j", patch => expect(() => readSupportDay({ ...day, ...patch } as never, date)).toThrow());
  it("never turns unknown energy into low energy; precise versions and selection order survive", () => {
    expect(validEnergy(null)).toBe(true);
    expect(validEnergy(undefined)).toBe(false);
    expect(validEnergy("Low")).toBe(true);
    expect(validEnergy(0)).toBe(false);
    expect(supportChange({ ...day, version: "9007199254740995" }, "High", [other, id])).toEqual({
      version: "9007199254740995",
      availableEnergy: "High",
      criticalTaskIds: [other, id],
    });
  });
});
describe("read-only end preparation snapshots", () => {
  it("validates the server's 50-row calendar pages separately from 25-row candidate pages; paused and unknown-duration own work remain real", () => {
    const v = end();
    expect(readPreparation(v, date, 0)).toBe(v);
    expect(v.openWork.total).toBe(26);
    expect(v.day.summary.actualSeconds).toBe("0.000001");
  });
  it("rejects a mismatched date or planning snapshot instead of stitching unrelated reads", () => {
    const v = end();
    expect(() => readPreparation(v, "2026-10-23", 0)).toThrow();
    expect(() =>
      readPreparation({ ...v, openWork: { ...v.openWork, planningVersion: "9007199254740994" } }, date, 0),
    ).toThrow();
  });
  it("rejects unbounded or displaced candidates and does not infer a full list from the first page", () => {
    const v = end();
    for (const patch of [{ items: Array(26).fill(task) }, { offset: 25 }, { limit: 50 }, { total: 0 }])
      expect(() => readPreparation({ ...v, openWork: { ...v.openWork, ...patch } }, date, 0)).toThrow();
  });
  it.each([
    { state: "Completed" },
    { archivedAt: task.updatedAt },
    { hasDirectWork: false },
    { directWorkCompleted: true },
  ])("rejects inactive/non-direct work %j", patch => {
    const v = end();
    expect(() =>
      readPreparation({ ...v, openWork: { ...v.openWork, items: [{ ...task, ...patch } as Task] } }, date, 0),
    ).toThrow();
  });
});

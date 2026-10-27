import { describe, expect, it } from "vitest";
import {
  duration,
  percentage,
  readComponents,
  readProgress,
  readSummary,
  readTime,
  rebaseWorkDraft,
  workBody,
  workDraft,
  workFailure,
  type Progress,
  type Summary,
  type Time,
} from "../../src/features/tasks/work/model";
import { ApiError } from "../../src/lib/api/errors";
import type { Task } from "../../src/features/tasks/model";
const id = "00000000-0000-0000-0000-000000000001";
const task = {
  id,
  version: "9223372036854775807",
  hasDirectWork: true,
  directEstimatedSeconds: "9223372036854775807",
  targetBudgetSeconds: null,
} as Task;
const summary: Summary = {
  taskId: id,
  knownEstimatedSeconds: 5400,
  unknownEstimateCount: 2,
  calculatedTotalSeconds: null,
  targetBudgetSeconds: 14400,
  targetDifferenceSeconds: null,
};
const time: Time = {
  taskId: id,
  directActualSeconds: 0.0000001,
  subtreeActualSeconds: "600.25",
  knownRemainingSeconds: 5400,
  unknownRemainingCount: 2,
  remainingSeconds: null,
  knownOvertimeSeconds: 0,
  unknownEstimateCount: 2,
  serverNow: "2026-10-17T08:00:00Z",
};
const progress: Progress = {
  taskId: id,
  totalTaskCount: 4,
  completedTaskCount: 0,
  componentCount: 3,
  completedComponentCount: 0,
  countProgress: 0,
  knownEstimatedSeconds: 5400,
  knownCompletedEstimatedSeconds: 0,
  unknownEstimateCount: 2,
  durationProgress: null,
  requiredChildCount: 3,
  incompleteRequiredChildCount: 3,
  hasOpenChildren: true,
  hasOpenDescendants: true,
};
describe("work definition and authoritative reports", () => {
  it("preserves an edited own estimate as a whole when remote work kind changes, retaining unedited remote budget", () => {
    const base = { ...task, directEstimatedSeconds: 600 };
    const draft = { ...workDraft(base), minutes: "25" };
    const latest = { ...base, hasDirectWork: false, directEstimatedSeconds: null, targetBudgetSeconds: 3600 };
    expect(workBody(latest, rebaseWorkDraft(base, draft, latest))).toMatchObject({
      hasDirectWork: true,
      directEstimatedSeconds: "1500",
      targetBudgetSeconds: "3600",
    });
  });
  it("does not mix remote minutes with local seconds or rebase an unedited duration over remote changes", () => {
    const base = { ...task, directEstimatedSeconds: 600, targetBudgetSeconds: 3600 };
    const draft = { ...workDraft(base), budgetSeconds: "15" };
    const latest = { ...base, directEstimatedSeconds: 1200, targetBudgetSeconds: 7200 };
    expect(workBody(latest, rebaseWorkDraft(base, draft, latest))).toMatchObject({
      directEstimatedSeconds: "1200",
      targetBudgetSeconds: "3615",
    });
  });
  it("roundtrips exact int64 seconds and version through minute/second fields", () => {
    expect(workBody(task, workDraft(task))).toEqual({
      version: task.version,
      hasDirectWork: true,
      directEstimatedSeconds: task.directEstimatedSeconds,
      targetBudgetSeconds: null,
    });
  });
  it("keeps unknown, explicit zero and container distinct without converting budget into work", () => {
    const draft = workDraft({ ...task, directEstimatedSeconds: null });
    expect(workBody(task, draft).directEstimatedSeconds).toBeNull();
    expect(workBody(task, { ...draft, minutes: "0" }).directEstimatedSeconds).toBe("0");
    expect(workBody(task, { ...draft, hasDirectWork: false, minutes: "90", budgetMinutes: "240" })).toMatchObject({
      directEstimatedSeconds: null,
      targetBudgetSeconds: "14400",
    });
  });
  it("rejects negative, fractional, out-of-range seconds and int64 overflow", () => {
    for (const values of [{ minutes: "-1" }, { minutes: "1.5" }, { seconds: "60" }, { minutes: "153722867280912931" }])
      expect(() => workBody(task, { ...workDraft(task), ...values })).toThrow();
  });
  it("formats exact signed budget difference, tiny actual decimals and nullable ratios", () => {
    expect(duration("9223372036854775807")).toBe("153722867280912930 dk 7 sn");
    expect(duration(-600)).toBe("−10 dk");
    expect(duration(0.0000001)).toBe("0 dk 0,0000001 sn");
    expect(duration("60.25")).toBe("1 dk 0,25 sn");
    expect(percentage(null)).toBe("Hesaplanamıyor");
    expect(percentage(0)).toContain("0");
    expect(percentage(0.5)).toContain("50");
  });
  it("accepts authoritative unknown reports without inventing totals or progress", () => {
    expect(readSummary(summary, id)).toBe(summary);
    expect(readTime(time, id)).toBe(time);
    expect(readProgress(progress, id)).toBe(progress);
  });
  it("rejects missing or foreign fields, invalid ratios and unsafe int64 numbers", () => {
    for (const patch of [
      { knownEstimatedSeconds: undefined },
      { taskId: "foreign" },
      { knownEstimatedSeconds: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() => readSummary({ ...summary, ...patch } as Summary, id)).toThrow();
    expect(() => readTime({ ...time, remainingSeconds: undefined } as unknown as Time, id)).toThrow();
    expect(() => readProgress({ ...progress, countProgress: 1.01 }, id)).toThrow();
    expect(() => readProgress({ ...progress, hasOpenChildren: undefined } as unknown as Progress, id)).toThrow();
  });
  it("enforces requested 25 component page, exact offset and unique identities", () => {
    const page = { items: [{ taskId: id, estimatedSeconds: null }], offset: 25, limit: 25, total: 26 };
    expect(readComponents(page, 25)).toBe(page);
    for (const patch of [
      { offset: 0 },
      { limit: 100 },
      { items: [...page.items, ...page.items] },
      { items: Array(26).fill(page.items[0]) },
    ])
      expect(() => readComponents({ ...page, ...patch }, 25)).toThrow();
  });
  it("explains genuine history/budget/overflow conflicts and uncertain writes", () => {
    expect(workFailure(new ApiError("http", "", 409, "work_history_exists"))).toContain("geçmişi");
    expect(workFailure(new ApiError("http", "", 409, "work_budget_required"))).toContain("açıkça");
    expect(workFailure(new ApiError("http", "", 400, "workload_overflow"))).toContain("toplamını");
    expect(workFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
      "Kaydedilmiş olabilir",
    );
  });
});

import { describe, expect, it } from "vitest";
import { moveTarget, placementAt, readTreePage, rowFacts } from "../../src/features/tasks/tree/model";
import { dayRange, estimateText, readTask, type Task } from "../../src/features/tasks/model";
import { moveBody, treeCommandFailure } from "../../src/features/tasks/tree/command-model";
import { ApiError } from "../../src/lib/api/errors";
const task: Task = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "İş",
  description: null,
  state: "Pending",
  priority: "Normal",
  deadlineAt: null,
  canSplit: true,
  directEstimatedSeconds: null,
  createdAt: "2026-10-17T08:00:00Z",
  updatedAt: "2026-10-17T08:00:00Z",
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
describe("bounded tree reads", () => {
  const child = { ...task, id: "00000000-0000-0000-0000-000000000002", parentTaskId: task.id };
  const summary = {
    taskId: task.id,
    childCount: 3,
    completedChildCount: 1,
    knownEstimatedSeconds: 8100,
    unknownEstimateCount: 0,
    effectiveFrom: "2026-10-24",
    effectiveTo: "2026-10-29",
    rangeFromChildren: true,
  };
  it("retains parent links, server order and row summaries with exact page metadata", () => {
    const page = readTreePage(
      { items: [child, task], offset: "25", limit: "25", hasMore: false, summaries: [summary] },
      25,
    );
    expect(page.items).toEqual([child, task]);
    expect(page.summaries.get(task.id)).toEqual(summary);
    expect(
      readTreePage({ items: [task], offset: 0, limit: 25, hasMore: false, summaries: null }, 0).summaries.size,
    ).toBe(0);
  });
  it("rejects missing, duplicate and malformed relationships and summaries", () => {
    for (const items of [[task, task], [{ ...task, parentTaskId: undefined }], [{ ...task, parentTaskId: "bad" }]])
      expect(() => readTreePage({ items: items as Task[], offset: 0, limit: 25, hasMore: false }, 0)).toThrow();
    for (const bad of [
      { completedChildCount: 4 },
      { childCount: -1 },
      { taskId: "bad" },
      { effectiveTo: null },
      { effectiveFrom: "24.10.2026" },
      { knownEstimatedSeconds: -5 },
    ])
      expect(() =>
        readTreePage({ items: [task], offset: 0, limit: 25, hasMore: false, summaries: [{ ...summary, ...bad }] }, 0),
      ).toThrow();
  });
  it("rejects wrong offsets, coercible nulls and impossible HasMore instead of paging blindly", () => {
    for (const changes of [
      { offset: null },
      { offset: false },
      { offset: "" },
      { offset: 25 },
      { limit: 100 },
      { hasMore: undefined },
      { hasMore: true },
    ])
      expect(() =>
        readTreePage({ items: [task], offset: 0, limit: 25, hasMore: false, ...changes } as never, 0),
      ).toThrow();
    expect(() => readTreePage({ items: [], offset: 100000, limit: 25, hasMore: false }, 100000)).not.toThrow();
  });
  it("rejects a half or malformed own day range on a task", () => {
    expect(() => readTask({ ...task, plannedFrom: "2026-10-24", plannedTo: null })).toThrow();
    expect(() => readTask({ ...task, plannedFrom: "2026-13-40", plannedTo: "2026-13-41" })).toThrow();
    expect(readTask({ ...task, plannedFrom: "2026-10-24", plannedTo: "2026-10-26" }).plannedTo).toBe("2026-10-26");
  });
});
describe("UI-R2 row facts", () => {
  it("shows priority except Normal, the effective range, the known estimate and child progress", () => {
    const facts = rowFacts(
      { ...task, priority: "Urgent" },
      {
        taskId: task.id,
        childCount: 3,
        completedChildCount: 1,
        knownEstimatedSeconds: 8100,
        unknownEstimateCount: 1,
        effectiveFrom: "2026-10-24",
        effectiveTo: "2026-10-29",
        rangeFromChildren: true,
      },
    );
    expect(facts).toMatchObject({
      priority: { text: "Acil" },
      range: "24–29 Eki",
      estimate: "2 sa 15 dk+",
      progress: "1/3",
      percent: 33,
    });
    expect(rowFacts(task).percent).toBe(0);
    expect(rowFacts(task).priority).toBeNull();
    expect(
      rowFacts({ ...task, directEstimatedSeconds: 2700, plannedFrom: "2026-10-23", plannedTo: "2026-10-23" }),
    ).toMatchObject({ estimate: "45 dk", range: "23 Eki", progress: "" });
  });
  it("never turns an unknown estimate into zero and never shows seconds", () => {
    expect(estimateText(null)).toBe("");
    expect(estimateText(0, 2)).toBe("");
    expect(estimateText(59)).toBe("1 dk");
    expect(estimateText(3600)).toBe("1 sa");
    expect(estimateText("5400")).toBe("1 sa 30 dk");
  });
  it("formats day ranges across months and years", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toBe("30 Eki – 2 Kas");
    expect(dayRange("2026-12-30", "2027-01-02")).toBe("30 Ara 2026 – 2 Oca 2027");
    expect(dayRange("2026-10-30", null)).toBe("");
  });
});
describe("UI-R2 drop and keyboard targets", () => {
  const source = { id: "s", parentTaskId: "p" };
  it("splits a row into before, child and after zones", () => {
    expect([0, 5, 20, 35, 40].map(y => placementAt(y, 0, 40))).toEqual(["before", "before", "child", "after", "after"]);
  });
  it("maps placements to the server move target and skips no-op moves", () => {
    expect(moveTarget(source, "before", { id: "a", parentTaskId: "p", nextId: "b" })).toEqual({
      parentId: "p",
      before: "a",
    });
    expect(moveTarget(source, "after", { id: "a", parentTaskId: "q", nextId: null })).toEqual({
      parentId: "q",
      before: null,
    });
    expect(moveTarget(source, "child", { id: "a", parentTaskId: "p", nextId: "b" })).toEqual({
      parentId: "a",
      before: null,
    });
    expect(moveTarget(source, "root-end", null)).toEqual({ parentId: null, before: null });
    expect(moveTarget(source, "child", { id: "s", parentTaskId: "p", nextId: null })).toBeNull();
    expect(moveTarget(source, "after", { id: "a", parentTaskId: "p", nextId: "s" })).toBeNull();
  });
});
describe("prepared tree commands", () => {
  const target = { ...task, id: "00000000-0000-0000-0000-000000000002", version: "9007199254740993" };
  it("preserves exact source and target versions with server sibling identity", () => {
    expect(
      moveBody(
        { ...task, version: "9007199254740995" },
        target,
        "00000000-0000-0000-0000-000000000003",
        "PreserveDirect",
      ),
    ).toEqual({
      version: "9007199254740995",
      parentTaskId: target.id,
      parentVersion: "9007199254740993",
      beforeSiblingId: "00000000-0000-0000-0000-000000000003",
      parentWorkDisposition: "PreserveDirect",
    });
    expect(moveBody(task, null, null, "")).toMatchObject({
      parentTaskId: null,
      parentVersion: null,
      beforeSiblingId: null,
    });
  });
  it("requires an explicit own-work choice for a new parent, but not sibling reorder", () => {
    expect(() => moveBody(task, target, null, "")).toThrow("kendi işine");
    expect(() => moveBody({ ...task, parentTaskId: target.id }, target, null, "")).not.toThrow();
  });
  it("rejects self destinations and archived parents before sending", () => {
    expect(() => moveBody(task, task, null, "PreserveDirect")).toThrow();
    expect(() => moveBody(task, null, task.id, "")).toThrow();
    expect(() => moveBody(task, { ...target, archivedAt: task.updatedAt }, null, "PreserveDirect")).toThrow();
  });
  it("keeps ambiguous writes distinct from definitive domain rejections", () => {
    expect(treeCommandFailure(new ApiError("http", "", 400, "tree_cycle"))).toContain("döngüsü");
    expect(treeCommandFailure(new ApiError("network", "", 0, "tree_cycle", {}, undefined, undefined, true))).toContain(
      "Kaydedilmiş olabilir",
    );
    expect(treeCommandFailure(new ApiError("http", "", 409, "parent_work_history"))).toContain("geçmişi");
  });
});

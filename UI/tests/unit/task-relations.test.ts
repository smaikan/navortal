import { describe, expect, it } from "vitest";
import type { Task } from "../../src/features/tasks/model";
import {
  predecessorNote,
  readRelation,
  readRelationPage,
  readStartDecision,
  reasonText,
  refreshAfter,
  relationFailure,
  relationKinds,
  visiblePath,
} from "../../src/features/tasks/relations/model";
import { ApiError } from "../../src/lib/api/errors";

const target = "00000000-0000-0000-0000-000000000001";
const source = "00000000-0000-0000-0000-000000000002";
const relation = {
  id: "00000000-0000-0000-0000-0000000000aa",
  sourceTaskId: source,
  targetTaskId: target,
  kind: "FinishToStart",
};
const task: Task = {
  id: source,
  title: "Ön iş",
  description: null,
  state: "Pending",
  priority: "Normal",
  deadlineAt: null,
  canSplit: true,
  directEstimatedSeconds: null,
  createdAt: "2026-10-18T08:00:00Z",
  updatedAt: "2026-10-18T08:00:00Z",
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

describe("relation responses", () => {
  it("keeps hard prerequisites and soft ordering as distinct wire kinds", () => {
    expect(readRelation(relation, "dependencies", target, source)).toEqual(relation);
    expect(() => readRelation(relation, "ordering", target)).toThrow();
    expect(readRelation({ ...relation, kind: "PreferredBefore" }, "ordering", target)).toMatchObject({
      kind: "PreferredBefore",
    });
    expect(relationKinds.dependencies.badge).not.toBe(relationKinds.ordering.badge);
    expect(relationKinds.ordering.help).toContain("engellemez");
  });
  it("rejects a reply for another target, another source or a self edge", () => {
    expect(() => readRelation({ ...relation, targetTaskId: source }, "dependencies", target)).toThrow();
    expect(() => readRelation(relation, "dependencies", target, target)).toThrow();
    expect(() => readRelation({ ...relation, sourceTaskId: target }, "dependencies", target)).toThrow();
    expect(() => readRelation({ ...relation, id: "bad" }, "dependencies", target)).toThrow();
  });
  it("validates exact page metadata and duplicates instead of paging blindly", () => {
    expect(
      readRelationPage({ items: [relation], offset: "10", limit: 10, total: "11" }, "dependencies", target, 10),
    ).toEqual({ items: [relation], offset: 10, total: 11 });
    for (const changes of [
      { offset: 0 },
      { limit: 50 },
      { total: null },
      { total: 5 },
      { items: [relation, relation] },
      { items: null },
    ]) {
      expect(() =>
        readRelationPage(
          { items: [relation], offset: 10, limit: 10, total: 11, ...changes } as Parameters<typeof readRelationPage>[0],
          "dependencies",
          target,
          10,
        ),
      ).toThrow();
    }
    expect(readRelationPage({ items: [], offset: 0, limit: 10, total: 0 }, "ordering", target, 0).total).toBe(0);
  });
});

describe("start eligibility", () => {
  it("accepts a blocked decision with its reasons and blocking predecessors", () => {
    const decision = {
      taskId: target,
      canStart: false,
      reasons: ["predecessor_incomplete"],
      blockingPredecessorIds: [source],
    };
    expect(readStartDecision(decision, target)).toEqual(decision);
    expect(reasonText("predecessor_incomplete")).toContain("üst görevinden");
  });
  it("rejects inconsistent or foreign decisions", () => {
    for (const value of [
      { taskId: source, canStart: true, reasons: [], blockingPredecessorIds: [] },
      { taskId: target, canStart: true, reasons: ["predecessor_incomplete"], blockingPredecessorIds: [] },
      { taskId: target, canStart: false, reasons: [], blockingPredecessorIds: [] },
      {
        taskId: target,
        canStart: false,
        reasons: ["predecessor_incomplete"],
        blockingPredecessorIds: [source, source],
      },
      { taskId: target, canStart: "false", reasons: ["x"], blockingPredecessorIds: [] },
    ])
      expect(() => readStartDecision(value as Parameters<typeof readStartDecision>[0], target)).toThrow();
  });
  it("keeps an unknown future reason visible", () => {
    expect(
      readStartDecision(
        { taskId: target, canStart: false, reasons: ["future_rule"], blockingPredecessorIds: [] },
        target,
      ).reasons,
    ).toEqual(["future_rule"]);
    expect(reasonText("future_rule")).toContain("başlatılamayacağını");
  });
  it("explains that deferred, skipped or canceled prerequisites still block", () => {
    for (const state of ["Deferred", "Skipped", "Canceled"] as const)
      expect(predecessorNote({ ...task, state })).toContain("engeli kaldırmaz");
    expect(predecessorNote({ ...task, state: "Completed" })).toContain("engel değil");
    expect(predecessorNote(task)).toContain("engeller");
    expect(predecessorNote(undefined)).toContain("okunamadı");
  });
});

describe("relation failures", () => {
  it("names cycles, self links, duplicates and foreign IDs", () => {
    expect(relationFailure(new ApiError("http", "", 400, "dependency_cycle"))).toContain("döngü");
    expect(relationFailure(new ApiError("http", "", 400, "relation_self"))).toContain("kendisine");
    expect(relationFailure(new ApiError("http", "", 409, "relation_exists"))).toContain("zaten var");
    expect(relationFailure(new ApiError("http", "", 404, "task_not_found"))).toContain("bu hesaba ait olmayabilir");
    expect(relationFailure(new ApiError("http", "", 409, "version_conflict"))).toContain("Güncel sürüm");
  });
  it("never presents an uncertain write as a definitive rejection", () => {
    const unknown = new ApiError("network", "", 0, "relation_exists", {}, undefined, undefined, true);
    expect(relationFailure(unknown)).toContain("kaydedilmiş olabilir");
    expect(refreshAfter(unknown)).toBe(false);
    expect(refreshAfter(new ApiError("http", "", 409, "version_conflict"))).toBe(true);
    expect(refreshAfter(new ApiError("http", "", 400, "dependency_cycle"))).toBe(false);
  });
});

describe("ancestor path", () => {
  it("collapses only the middle of long paths and keeps nearest parents", () => {
    const path = Array.from({ length: 128 }, (_, index) => index);
    expect(visiblePath(path, false)).toEqual({ head: [0], hidden: 125, tail: [126, 127] });
    expect(visiblePath(path, true).head).toHaveLength(128);
    expect(visiblePath([1, 2, 3, 4], false)).toEqual({ head: [1, 2, 3, 4], hidden: 0, tail: [] });
  });
});

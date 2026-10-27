import { describe, expect, it } from "vitest";
import {
  hasChildren,
  initialChoice,
  lifeFailure,
  ownWorkLabel,
  readLifeTask,
  stateAlreadyMatches,
  stateBody,
  type Choice,
} from "../../src/features/tasks/lifecycle/model";
import type { Task } from "../../src/features/tasks/model";
import { ApiError } from "../../src/lib/api/errors";
const id = "00000000-0000-0000-0000-000000000001";
const task: Task = {
  id,
  title: "İş",
  description: null,
  priority: "Normal",
  state: "Pending",
  deadlineAt: null,
  canSplit: true,
  directEstimatedSeconds: null,
  createdAt: "2026-10-17T08:00:00Z",
  updatedAt: "2026-10-17T08:00:00Z",
  archivedAt: null,
  version: "9223372036854775807",
  parentTaskId: null,
  sortOrder: 1,
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
describe("explicit task lifecycle intent", () => {
  it("keeps disposition reason separate from completion scope and validates UTF16 limits", () => {
    for (const action of ["Defer", "Skip", "Cancel"] as const)
      expect(stateBody(task, action, true, "CompleteSubtree", "  Açık karar.  ")).toMatchObject({
        action,
        parentCompletionChoice: null,
        reason: "Açık karar.",
      });
    expect(stateBody(task, "Defer", false, "", "  ").reason).toBeNull();
    expect(stateBody(task, "Complete", false, "", "Bu gerekçe bu formun kapsamında değil").reason).toBeNull();
    expect(stateBody(task, "Skip", false, "", "a".repeat(2000)).reason).toHaveLength(2000);
    expect(() => stateBody(task, "Cancel", false, "", "a".repeat(2001))).toThrow(/2000/);
    expect(() => stateBody(task, "Cancel", false, "", "😀".repeat(1001))).toThrow(/2000/);
  });
  it("rejects unchanged disposition so a new audit reason is never falsely claimed", () => {
    for (const [action, state] of [
      ["Defer", "Deferred"],
      ["Skip", "Skipped"],
      ["Cancel", "Canceled"],
    ] as const) {
      expect(stateAlreadyMatches({ ...task, state }, action)).toBe(true);
      expect(() => stateBody({ ...task, state }, action, false, "", "Yeni gerekçe")).toThrow(/zaten bu durumda/);
      expect(stateAlreadyMatches(task, action)).toBe(false);
    }
  });
  it("distinguishes containers from open and completed direct work", () => {
    expect(ownWorkLabel({ hasDirectWork: false, directWorkCompleted: false })).toBe("Kendi işi yok");
    expect(ownWorkLabel({ hasDirectWork: true, directWorkCompleted: false })).toBe("Kendi işi tamamlanmadı");
    expect(ownWorkLabel({ hasDirectWork: true, directWorkCompleted: true })).toBe("Kendi işi tamamlandı");
  });
  it("requires a real parent decision and preserves exact server version", () => {
    expect(() => stateBody(task, "Complete", true, "")).toThrow(/seç/);
    expect(stateBody(task, "Complete", true, "ParentOnly")).toEqual({
      version: task.version,
      action: "Complete",
      parentCompletionChoice: "ParentOnly",
      reason: null,
    });
    expect(stateBody(task, "Complete", true, "CompleteSubtree").parentCompletionChoice).toBe("CompleteSubtree");
  });
  it("never carries subtree choice into reopen, own work or leaf commands", () => {
    expect(stateBody(task, "Reopen", true, "CompleteSubtree").parentCompletionChoice).toBeNull();
    expect(stateBody(task, "CompleteDirectWork", true, "CompleteSubtree")).toMatchObject({
      action: "CompleteDirectWork",
      parentCompletionChoice: null,
    });
    expect(stateBody(task, "Complete", false, "ParentOnly").parentCompletionChoice).toBeNull();
  });
  it("rejects own work commands on containers, archived commands and cancel-as-save", () => {
    expect(() => stateBody({ ...task, hasDirectWork: false }, "CompleteDirectWork", false, "")).toThrow(/Kapsayıcı/);
    expect(() => stateBody({ ...task, archivedAt: task.updatedAt }, "Reopen", false, "")).toThrow(/Arşiv/);
    expect(() => stateBody(task, "Complete", true, "Cancel" as Choice)).toThrow(/vazgeçmek/);
  });
  it("honors only supported saved policies and otherwise asks explicitly", () => {
    expect(initialChoice("ParentOnly")).toBe("ParentOnly");
    expect(initialChoice("CompleteSubtree")).toBe("CompleteSubtree");
    expect(initialChoice("Ask")).toBe("");
    expect(initialChoice("unknown")).toBe("");
  });
  it("uses one child to establish scope, without treating HasMore as a total", () => {
    expect(hasChildren({ items: [], offset: 0, limit: 1, hasMore: false }, id)).toBe(false);
    expect(hasChildren({ items: [{ ...task, parentTaskId: id }], offset: 0, limit: 1, hasMore: true }, id)).toBe(true);
    expect(() => hasChildren({ items: [], offset: 0, limit: 1, hasMore: true }, id)).toThrow();
    expect(() => hasChildren({ items: [task], offset: 0, limit: 1, hasMore: false }, id)).toThrow();
  });
  it("rejects missing lifecycle fields and mismatched command response identities", () => {
    expect(readLifeTask(task, id)).toBe(task);
    for (const patch of [
      { directWorkCompleted: undefined },
      { requiredForParent: undefined },
      { completionOrigin: "Client" },
      { parentTaskId: undefined },
    ])
      expect(() => readLifeTask({ ...task, ...patch } as Task)).toThrow();
    expect(() => readLifeTask({ ...task, id: "00000000-0000-0000-0000-000000000002" }, id)).toThrow(/beklenen göreve/);
  });
  it("explains active work, scope and unknown results without claiming completion", () => {
    expect(lifeFailure(new ApiError("http", "", 409, "work_already_running"))).toContain("çalışmayı duraklat");
    expect(lifeFailure(new ApiError("http", "", 409, "completion_choice_required"))).toContain("kapsamı değişti");
    expect(lifeFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
      "Kaydedilmiş olabilir",
    );
    expect(lifeFailure(new ApiError("protocol", "Yanıt eksik"))).toBe("Yanıt eksik");
  });
});

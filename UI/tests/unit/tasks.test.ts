import { describe, expect, it } from "vitest";
import {
  changedFilters,
  ownEstimate,
  readPage,
  readTask,
  taskFailure,
  taskFilters,
  titleIssue,
  type Task,
} from "../../src/features/tasks/model";
import { taskDraft, taskUpdate } from "../../src/features/tasks/editor-model";
import { resolveDeadline } from "../../src/features/tasks/deadline";
import { ApiError } from "../../src/lib/api/errors";
const task: Task = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "İş",
  description: null,
  priority: "Normal",
  state: "Pending",
  deadlineAt: "2026-10-25T01:30:00.1234567Z",
  canSplit: false,
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
describe("task boundary and full-field editing", () => {
  it("distinguishes unknown from zero and formats int64 seconds without floating-point loss", () => {
    expect(ownEstimate(task)).toContain("belirtilmedi");
    expect(ownEstimate({ ...task, directEstimatedSeconds: 0 })).toBe("Kendi işi: 0 dk");
    expect(ownEstimate({ ...task, directEstimatedSeconds: "9223372036854775807" })).toBe(
      "Kendi işi: 153722867280912930 dk 7 sn",
    );
  });
  it("preserves unedited null fields, fractional deadline and exact int64 version", () => {
    const draft = { ...taskDraft(task, "Europe/Berlin"), title: "Yeni başlık" };
    expect(taskUpdate(task, draft, "Europe/Berlin")).toEqual({
      version: task.version,
      title: "Yeni başlık",
      description: null,
      priority: "Normal",
      deadlineAt: task.deadlineAt,
      canSplit: false,
    });
  });
  it("clears fields only by an explicit changed draft", () => {
    const base = { ...task, description: "Açıklama" };
    const draft = taskDraft(base, "Europe/Istanbul");
    draft.description = "";
    draft.deadline = "";
    expect(taskUpdate(base, draft, "Europe/Istanbul")).toMatchObject({
      description: null,
      deadlineAt: null,
      canSplit: false,
    });
  });
  it("accepts 300 UTF16 title units and rejects empty or longer wire values", () => {
    expect(titleIssue("a".repeat(300))).toBeUndefined();
    expect(titleIssue("a".repeat(301))).toBeTruthy();
    expect(titleIssue("  ")).toBeTruthy();
    expect(titleIssue("😀".repeat(151))).toBeTruthy();
  });
  it("rejects truncated mutation/read replies instead of applying defaults", () => {
    expect(readTask(task)).toBe(task);
    for (const values of [
      { description: undefined },
      { deadlineAt: undefined },
      { version: 0 },
      { canSplit: undefined },
      { directEstimatedSeconds: undefined },
    ])
      expect(() => readTask({ ...task, ...values } as Task)).toThrow();
    expect(() => readPage({ items: [task], total: 1000, offset: 0, limit: 25 })).not.toThrow();
    expect(() => readPage({ items: Array(101).fill(task), total: 1000, offset: 0, limit: 100 })).toThrow();
  });
  it("does not shift DST gaps and asks which repeated instant was intended", () => {
    expect(() => resolveDeadline("2026-03-29T02:30", "Europe/Berlin", "earlier")).toThrow(/bulunmuyor/);
    expect(() => resolveDeadline("2026-10-25T02:30", "Europe/Berlin", "")).toThrow(/iki kez/);
    expect(resolveDeadline("2026-10-25T02:30", "Europe/Berlin", "earlier")).toBe("2026-10-25T00:30:00Z");
    expect(resolveDeadline("2026-10-25T02:30", "Europe/Berlin", "later")).toBe("2026-10-25T01:30:00Z");
  });
});
describe("bounded URL task filters", () => {
  it("uses 25 records, validates filters and preserves foreign context and panel", () => {
    const original = new URLSearchParams(
      `date=2026-10-17&taskId=${task.id}&search=eski&offset=25&projectId=${task.id}`,
    );
    const next = changedFilters(original, { search: "Türkçe %_" });
    expect(next.get("date")).toBe("2026-10-17");
    expect(next.get("taskId")).toBe(task.id);
    expect(next.has("offset")).toBe(false);
    expect(taskFilters(next)).toEqual({ query: { offset: 0, limit: 25, search: "Türkçe %_", projectId: task.id } });
    expect(original.get("offset")).toBe("25");
  });
  it("blocks invalid limits, enum and date contexts without sending writes", () => {
    for (const text of [
      "offset=-1",
      "offset=100001",
      "priority=admin",
      "state=done",
      "includeArchived=1",
      "projectId=bad",
      "isPlanned=true",
      "from=2026-01-01T00:00:00Z",
      `search=${"a".repeat(201)}`,
    ])
      expect(taskFilters(new URLSearchParams(text)).issue).toBeTruthy();
    expect(
      taskFilters(new URLSearchParams("isPlanned=false&from=2026-10-17T00:00:00Z&to=2026-10-18T00:00:00Z")).issue,
    ).toBeUndefined();
  });
  it("distinguishes archive blockers and unknown command outcomes", () => {
    expect(taskFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
      "Kaydedilmiş olabilir",
    );
    expect(taskFailure(new ApiError("http", "", 409, "task_has_children"))).toContain("alt görev");
    expect(taskFailure(new ApiError("http", "", 409, "task_has_work"))).toContain("oturumunu bitir");
  });
});

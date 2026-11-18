import { describe, expect, it } from "vitest";
import { completedNow, mapTasks, reopenedNow } from "../../src/features/tasks/tree/optimistic";
import type { Task } from "../../src/features/tasks/model";

const task = (id: string, state = "Pending") => ({ id, state, completedAt: null, version: 1 }) as unknown as Task;

describe("task tree optimistic patches", () => {
  it("changes the matching task in a single page and keeps the others", () => {
    const page = { items: [task("a"), task("b")], offset: 0 };
    const next = mapTasks(page, "b", row => completedNow(row, "2026-11-18T10:00:00Z")) as typeof page;
    expect(next.items[1].state).toBe("Completed");
    expect(next.items[1].completedAt).toBe("2026-11-18T10:00:00Z");
    expect(next.items[0]).toBe(page.items[0]);
    expect(next.offset).toBe(0);
  });
  it("reaches into infinite query pages", () => {
    const data = { pages: [{ items: [task("a")] }, { items: [task("b", "Completed")] }], pageParams: [0, 1] };
    const next = mapTasks(data, "b", reopenedNow) as typeof data;
    expect(next.pages[1].items[0].state).toBe("Pending");
    expect(next.pages[1].items[0].completedAt).toBeNull();
    expect(next.pages[0]).toBe(data.pages[0]);
    expect(next.pageParams).toBe(data.pageParams);
  });
  it("returns the same object when the task is not in the data so nothing re-renders", () => {
    const page = { items: [task("a")] };
    const data = { pages: [page] };
    expect(mapTasks(page, "x", reopenedNow)).toBe(page);
    expect(mapTasks(data, "x", reopenedNow)).toBe(data);
    expect(mapTasks(undefined, "x", reopenedNow)).toBeUndefined();
    expect(mapTasks({ summary: true }, "x", reopenedNow)).toEqual({ summary: true });
  });
  it("does not mutate the cached value", () => {
    const page = { items: [task("a")] };
    const snapshot = JSON.stringify(page);
    mapTasks(page, "a", row => completedNow(row, "x"));
    expect(JSON.stringify(page)).toBe(snapshot);
  });
});

import { planMove } from "../../src/features/tasks/tree/optimistic";

describe("optimistic task move", () => {
  const withParent = (id: string, parentTaskId: string | null, state = "Pending") =>
    ({ id, parentTaskId, state, completedAt: null, version: 1 }) as unknown as Task;
  const branch = (parentId: string | null, items: Task[], hasMore = false, completed: boolean | null = false) =>
    [
      ["user", "u", "task-tree", { kind: "branch", parentId, completed, excludeRecurring: false }],
      { pages: [{ items, hasMore, offset: 0, limit: 50, summaries: new Map<string, unknown>() }], pageParams: [0] },
    ] as [readonly unknown[], unknown];
  const idsOf = (patch: { next: unknown }) =>
    (patch.next as { pages: { items: Task[] }[] }).pages.flatMap(p => p.items.map(i => i.id));

  it("reorders inside the same parent", () => {
    const [a, b, c] = [withParent("a", null), withParent("b", null), withParent("c", null)];
    const patches = planMove([branch(null, [a, b, c])], c, { parentId: null, before: "a" });
    expect(patches).toHaveLength(1);
    expect(idsOf(patches[0])).toEqual(["c", "a", "b"]);
  });
  it("moves a task to another parent that is loaded, keeping its summary and updating its parent", () => {
    const child = withParent("x", "p1");
    const source = branch("p1", [child]);
    (source[1] as { pages: { summaries: Map<string, unknown> }[] }).pages[0].summaries.set("x", { taskId: "x" });
    const target = branch("p2", [withParent("y", "p2")]);
    const patches = planMove([source, target], child, { parentId: "p2", before: null });
    expect(patches).toHaveLength(2);
    expect(idsOf(patches.find(p => p.key === source[0])!)).toEqual([]);
    const next = patches.find(p => p.key === target[0])!.next as {
      pages: { items: Task[]; summaries: Map<string, unknown> }[];
    };
    expect(next.pages[0].items.map(i => i.id)).toEqual(["y", "x"]);
    expect(next.pages[0].items[1].parentTaskId).toBe("p2");
    expect(next.pages[0].summaries.get("x")).toEqual({ taskId: "x" });
  });
  it("only leaves the old place when the destination is not loaded or the end of the list is unknown", () => {
    const child = withParent("x", "p1");
    expect(planMove([branch("p1", [child])], child, { parentId: "p2", before: null })).toHaveLength(1);
    const partial = branch("p2", [withParent("y", "p2")], true);
    const patches = planMove([branch("p1", [child]), partial], child, { parentId: "p2", before: null });
    expect(patches.find(p => p.key === partial[0])).toBeUndefined();
    const missingSibling = planMove([branch("p1", [child]), branch("p2", [withParent("y", "p2")])], child, {
      parentId: "p2",
      before: "zzz",
    });
    expect(missingSibling).toHaveLength(1);
  });
  it("puts a completed task only into completed lists and never twice", () => {
    const done = withParent("d", "p1", "Completed");
    const open = branch("p2", [withParent("y", "p2")], false, false);
    const completed = branch("p2", [withParent("z", "p2", "Completed")], false, true);
    const patches = planMove([branch("p1", [done], false, true), open, completed], done, {
      parentId: "p2",
      before: null,
    });
    expect(patches.find(p => p.key === open[0])).toBeUndefined();
    expect(idsOf(patches.find(p => p.key === completed[0])!)).toEqual(["z", "d"]);
  });
});

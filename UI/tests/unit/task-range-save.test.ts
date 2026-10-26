import { describe, expect, it, vi } from "vitest";
import { rangeBody } from "../../src/features/tasks/range-model";
import { createPanelSaves } from "../../src/components/layout/task-panel-saves";
import { createTaskRangeDraft } from "../../src/features/tasks/range-drafts";
import type { Task } from "../../src/features/tasks/model";

describe("task date drafts", () => {
  it("normalizes either single day, preserves an inclusive range and clears both dates", () => {
    expect(rangeBody("2026-10-29", "")).toEqual({ plannedFrom: "2026-10-29", plannedTo: "2026-10-29" });
    expect(rangeBody("", "2026-10-29")).toEqual({ plannedFrom: "2026-10-29", plannedTo: "2026-10-29" });
    expect(rangeBody("2026-10-29", "2026-11-02")).toEqual({ plannedFrom: "2026-10-29", plannedTo: "2026-11-02" });
    expect(rangeBody("", "")).toEqual({ plannedFrom: null, plannedTo: null });
    expect(rangeBody("2028-01-01", "2029-01-01").plannedTo).toBe("2029-01-01");
  });
  it.each([
    ["2026-11-02", "2026-10-29"],
    ["2028-01-01", "2029-01-02"],
    ["2026-02-29", ""],
    ["2026-04-31", ""],
    ["0000-01-01", ""],
    ["2026-1-1", ""],
    ["2026-", ""],
  ])("does not silently discard invalid dates %s / %s", (from, to) => expect(() => rangeBody(from, to)).toThrow());
});

describe("panel saves", () => {
  it("keeps date drafts and pending/uncertain state when a responsive surface subscriber is replaced", () => {
    const record = createTaskRangeDraft({ id: "one", version: 1, plannedFrom: null, plannedTo: null } as Task);
    const old = vi.fn(),
      next = vi.fn();
    const stop = record.subscribe(old);
    record.setDraft({ from: "2026-10-29", to: "" });
    record.patch({ busy: true });
    stop();
    record.subscribe(next);
    expect(record.getSnapshot().draft.from).toBe("2026-10-29");
    expect(record.getSnapshot().busy).toBe(true);
    record.setBlocked(true);
    record.patch({ busy: false, failure: "Unknown", needsCheck: true });
    expect(old).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
    expect(record.getSnapshot().needsCheck).toBe(true);
  });
  it("includes dirty subscribers mounted during an earlier save", async () => {
    const saves = createPanelSaves(),
      second = vi.fn(async () => false);
    saves.register({
      dirty: () => true,
      save: async () => {
        saves.register({ dirty: () => true, save: second });
        return true;
      },
    });
    expect(await saves.flush()).toBe(false);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it("awaits each dirty field group before closing, skips clean/unmounted groups, and keeps a later draft on failure", async () => {
    const saves = createPanelSaves(),
      order: string[] = [];
    let release!: (value: boolean) => void;
    const held = new Promise<boolean>(resolve => {
      release = resolve;
    });
    saves.register({
      dirty: () => true,
      save: async () => {
        order.push("first");
        return held;
      },
    });
    saves.register({
      dirty: () => false,
      save: vi.fn(() => {
        throw new Error("clean");
      }),
    });
    const removed = saves.register({
      dirty: () => true,
      save: vi.fn(() => {
        throw new Error("unmounted");
      }),
    });
    removed();
    saves.register({
      dirty: () => true,
      save: async () => {
        order.push("second");
        return false;
      },
    });
    saves.register({
      dirty: () => true,
      save: async () => {
        order.push("third");
        return true;
      },
    });
    expect(saves.dirty()).toBe(true);
    const result = saves.flush();
    expect(order).toEqual(["first"]);
    release(true);
    expect(await result).toBe(false);
    expect(order).toEqual(["first", "second"]);
  });
  it("permits closing only after confirmed saves and catches unexpected failures", async () => {
    const saves = createPanelSaves();
    let dirty = true;
    const stop = saves.register({
      dirty: () => dirty,
      save: async () => {
        dirty = false;
        return true;
      },
    });
    expect(await saves.flush()).toBe(true);
    expect(saves.dirty()).toBe(false);
    stop();
    saves.register({
      dirty: () => true,
      save: async () => {
        throw new Error("failed");
      },
    });
    expect(await saves.flush()).toBe(false);
  });
});

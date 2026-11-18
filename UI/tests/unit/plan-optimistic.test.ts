import { describe, expect, it } from "vitest";
import {
  patchGlance,
  removeEntry,
  replaceRows,
  restoreEntry,
  setEntryDone,
} from "../../src/features/planning/optimistic";
import type { DayOverview } from "../../src/features/planning/overview-model";
import type { DayItem, Schedule } from "../../src/features/planning/model";
import type { Glance } from "../../src/features/planning/glance";

const item = (id: string, completedAt: string | null = null) => ({ id, completedAt, version: 1 }) as unknown as DayItem;
const block = (id: string, completedAt: string | null = null) =>
  ({ id, completedAt, version: 1 }) as unknown as Schedule;
const glance = (completed: number | string, open: number | string) =>
  ({ completedItemCount: completed, openItemCount: open }) as unknown as Glance;
const overview = (): DayOverview =>
  ({
    timed: { items: [block("b1"), block("b2", "2026-11-18T08:00:00Z")], total: 2 },
    untimed: { items: [item("i1"), item("i2")], total: 2 },
    glance: glance(1, 3),
  }) as unknown as DayOverview;

describe("optimistic day plan changes", () => {
  it("marks an untimed item done immediately and moves the summary counters", () => {
    const next = setEntryDone(overview(), "i1", true, "2026-11-18T10:00:00Z");
    expect(next.untimed.items[0].completedAt).toBe("2026-11-18T10:00:00Z");
    expect(next.untimed.items[1].completedAt).toBeNull();
    expect(next.glance.completedItemCount).toBe(2);
    expect(next.glance.openItemCount).toBe(2);
  });
  it("reopens a timed block and keeps string counters as strings", () => {
    const base = { ...overview(), glance: glance("1", "3") } as DayOverview;
    const next = setEntryDone(base, "b2", false, "2026-11-18T10:00:00Z");
    expect(next.timed.items[1].completedAt).toBeNull();
    expect(next.glance.completedItemCount).toBe("0");
    expect(next.glance.openItemCount).toBe("4");
  });
  it("does nothing when the row is missing or already in that state, so counters never drift", () => {
    const base = overview();
    expect(setEntryDone(base, "missing", true, "x")).toBe(base);
    expect(setEntryDone(base, "b2", true, "x")).toBe(base);
    expect(setEntryDone(base, "i1", false, "x")).toBe(base);
  });
  it("never drops counters below zero", () => {
    expect(patchGlance(glance(0, 0), -1).completedItemCount).toBe(0);
    expect(patchGlance(glance(0, 0), 1).openItemCount).toBe(0);
  });
  it("does not mutate the previous cache value", () => {
    const base = overview();
    const snapshot = JSON.stringify(base);
    setEntryDone(base, "i1", true, "x");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
  it("writes the server rows back by id and keeps other rows and the counters untouched", () => {
    const base = setEntryDone(overview(), "i1", true, "client-time");
    const server = { ...item("i1", "server-time"), version: 2 } as DayItem;
    const next = replaceRows(base, { items: [server] });
    expect(next.untimed.items[0]).toBe(server);
    expect(next.untimed.items[1]).toBe(base.untimed.items[1]);
    expect(next.glance).toBe(base.glance);
    expect(replaceRows(base, { items: [item("unknown")] })).toBe(base);
  });
});

describe("optimistic removal from the day plan", () => {
  const base = () =>
    ({
      timed: { items: [block("b1"), block("b2")], total: 2 },
      untimed: { items: [item("i1"), item("i2"), item("i3")], total: "3" },
      glance: glance(0, 5),
    }) as unknown as DayOverview;
  it("removes an untimed row, lowers the total and remembers where it was", () => {
    const hit = removeEntry(base(), "i2")!;
    expect(hit.overview.untimed.items.map(r => r.id)).toEqual(["i1", "i3"]);
    expect(hit.overview.untimed.total).toBe("2");
    expect(hit.removed).toMatchObject({ kind: "untimed", index: 1 });
  });
  it("removes a timed row and restores it in the same position", () => {
    const start = base();
    const hit = removeEntry(start, "b1")!;
    expect(hit.overview.timed.items.map(r => r.id)).toEqual(["b2"]);
    const back = restoreEntry(hit.overview, hit.removed);
    expect(back.timed.items.map(r => r.id)).toEqual(["b1", "b2"]);
    expect(back.timed.total).toBe(2);
  });
  it("restoring twice or removing a missing row changes nothing", () => {
    const start = base();
    expect(removeEntry(start, "missing")).toBeNull();
    const hit = removeEntry(start, "i3")!;
    const once = restoreEntry(hit.overview, hit.removed);
    expect(restoreEntry(once, hit.removed)).toBe(once);
    expect(once.untimed.items.map(r => r.id)).toEqual(["i1", "i2", "i3"]);
  });
});

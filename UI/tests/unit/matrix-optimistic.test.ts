import { describe, expect, it } from "vitest";
import { dropCard, moveCard, withVersion } from "../../src/features/matrix/optimistic";
import type { Board, Quadrant } from "../../src/features/matrix/model";

const card = (id: string) => ({ task: { id, title: id } });
const column = (quadrant: Quadrant, ids: string[], total = ids.length, offset = 0) => ({
  quadrant,
  items: ids.map(card),
  offset,
  limit: 25,
  total,
});
const board = () =>
  ({
    version: 5,
    columns: [
      column("Inbox", ["a", "b"]),
      column("Do", ["c", "d", "e"]),
      column("Schedule", []),
      column("Delegate", ["f"], 40),
      column("Eliminate", []),
    ],
  }) as unknown as Board;
const ids = (b: Board, q: Quadrant) => b.columns.find(c => c.quadrant === q)!.items.map(i => i.task.id);
const total = (b: Board, q: Quadrant) => b.columns.find(c => c.quadrant === q)!.total;

describe("optimistic matrix changes", () => {
  it("moves a card to the end of an empty area and updates both totals", () => {
    const next = moveCard(board(), "a", "Schedule", null)!;
    expect(ids(next, "Inbox")).toEqual(["b"]);
    expect(ids(next, "Schedule")).toEqual(["a"]);
    expect(total(next, "Inbox")).toBe(1);
    expect(total(next, "Schedule")).toBe(1);
  });
  it("moves a card before another card in a different area", () => {
    const next = moveCard(board(), "a", "Do", "d")!;
    expect(ids(next, "Do")).toEqual(["c", "a", "d", "e"]);
  });
  it("reorders inside the same area without changing its total", () => {
    const next = moveCard(board(), "e", "Do", "c")!;
    expect(ids(next, "Do")).toEqual(["e", "c", "d"]);
    expect(total(next, "Do")).toBe(3);
    expect(moveCard(board(), "c", "Do", null)).not.toBeNull();
    expect(ids(moveCard(board(), "c", "Do", null)!, "Do")).toEqual(["d", "e", "c"]);
  });
  it("cannot place a card when the reference card or the end of the area is not loaded", () => {
    expect(moveCard(board(), "a", "Do", "not-loaded")).toBeNull();
    expect(moveCard(board(), "a", "Delegate", null)).toBeNull();
    expect(moveCard(board(), "missing", "Do", null)).toBeNull();
  });
  it("removes a card from the matrix and never mutates the old board", () => {
    const start = board();
    const snapshot = JSON.stringify(start);
    const next = dropCard(start, "d")!;
    expect(ids(next, "Do")).toEqual(["c", "e"]);
    expect(total(next, "Do")).toBe(2);
    expect(dropCard(start, "missing")).toBeNull();
    expect(JSON.stringify(start)).toBe(snapshot);
  });
  it("stores the version from the server answer only when it changed", () => {
    const start = board();
    expect(withVersion(start, 5)).toBe(start);
    expect(withVersion(start, "6").version).toBe("6");
  });
});

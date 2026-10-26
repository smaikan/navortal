import { describe, expect, it } from "vitest";
import {
  addRow,
  addSibling,
  draftIssue,
  draftMaxRows,
  draftTree,
  editRow,
  indent,
  outdent,
  removeRow,
  type DraftRow,
} from "../../src/features/tasks/tree/draft";

const row = (id: string, text: string, depth: number): DraftRow => ({ id, text, depth });
let n = 0;
const next = () => `n${++n}`;

describe("new task draft", () => {
  it("opens a first-level row from the title plus and a child row from a row plus", () => {
    const one = addRow([], "a");
    expect(one).toEqual([row("a", "", 1)]);
    expect(addRow([row("a", "x", 1), row("b", "y", 1)], "c", "a")).toEqual([
      row("a", "x", 1),
      row("c", "", 2),
      row("b", "y", 1),
    ]);
    // Beşinci seviyede (derinlik 4) "+" yeni seviye açmaz.
    expect(addRow([row("a", "x", 4)], "c", "a")).toEqual([row("a", "x", 4)]);
  });
  it("typing in the last row opens the next empty row at the same level, not in the middle", () => {
    const rows = editRow([row("a", "", 2)], "a", "Tablo", next);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ text: "", depth: 2 });
    expect(editRow([row("a", "", 1), row("b", "", 1)], "a", "x", next)).toHaveLength(2);
    // Boşluk yazmak satır açmaz.
    expect(editRow([row("a", "", 1)], "a", "  ", next)).toHaveLength(1);
  });
  it("Enter adds a sibling after the row's own children", () => {
    const rows = [row("a", "x", 1), row("b", "c", 2), row("d", "y", 1)];
    expect(addSibling(rows, "e", "a").map(r => [r.id, r.depth])).toEqual([
      ["a", 1],
      ["b", 2],
      ["e", 1],
      ["d", 1],
    ]);
  });
  it("Tab indents with children only under a previous row; Shift+Tab outdents", () => {
    const rows = [row("a", "x", 1), row("b", "y", 1), row("c", "z", 2)];
    expect(indent(rows, "a")).toBeNull();
    expect(indent(rows, "b")!.map(r => r.depth)).toEqual([1, 2, 3]);
    expect(indent(rows, "c")).toBeNull();
    expect(indent([row("a", "", 4), row("b", "", 4)], "b")).toBeNull();
    expect(outdent(rows, "a")).toBeNull();
    expect(outdent(rows, "c")!.map(r => r.depth)).toEqual([1, 1, 1]);
  });
  it("remove keeps the removed row's children by lifting them one level", () => {
    const rows = [row("a", "x", 1), row("b", "y", 2), row("c", "z", 3), row("d", "w", 1)];
    expect(removeRow(rows, "b").map(r => [r.id, r.depth])).toEqual([
      ["a", 1],
      ["c", 2],
      ["d", 1],
    ]);
  });
  it("builds the nested request, dropping empty rows and re-parenting their children", () => {
    const rows = [
      row("a", " Tablolar ", 1),
      row("b", "Tablo 1", 2),
      row("c", "", 2),
      row("d", "", 1),
      row("e", "Kaynak", 2),
      row("f", "Grafik", 1),
      row("g", "", 1),
    ];
    expect(draftTree(" Tez ", rows)).toEqual({
      title: "Tez",
      children: [{ title: "Tablolar", children: [{ title: "Tablo 1" }, { title: "Kaynak" }] }, { title: "Grafik" }],
    });
    expect(draftTree("Tek", [row("a", " ", 1)])).toEqual({ title: "Tek" });
  });
  it("validates titles and caps rows at the API limit", () => {
    expect(draftIssue(" ", [])).toBe("Bir görev başlığı yaz.");
    expect(draftIssue("Tez", [row("a", "x".repeat(301), 1)])).toMatch(/300/);
    expect(draftIssue("Tez", [row("a", "x", 1)])).toBeUndefined();
    const full = Array.from({ length: draftMaxRows }, (_, i) => row(`r${i}`, "x", 1));
    expect(addRow(full, "z")).toHaveLength(draftMaxRows);
    expect(addSibling(full, "z", "r0")).toHaveLength(draftMaxRows);
    expect(editRow(full, `r${draftMaxRows - 1}`, "y", next)).toHaveLength(draftMaxRows);
  });
});

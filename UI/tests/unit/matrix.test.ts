import { describe, expect, it } from "vitest";
import { areas, readBoard, readCandidates, type Board, type Row } from "../../src/features/matrix/model";
const row: Row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "İlk iş",
  parentTaskId: null,
  parentTitle: null,
  directEstimatedSeconds: null,
  priority: "Normal",
  energyDemand: null,
};
const board = (): Board => ({
  version: "9007199254740993",
  columns: areas.map(a => ({
    quadrant: a.id,
    offset: 0,
    limit: 25,
    total: a.id === "Do" ? 1 : 0,
    items: a.id === "Do" ? [{ task: { ...row } }] : [],
  })),
});
describe("matrix wire boundary", () => {
  it("preserves exact versions and unknown estimates", () => {
    const b = readBoard(board());
    expect(b.version).toBe("9007199254740993");
    expect(b.columns[1].items[0].task.directEstimatedSeconds).toBeNull();
  });
  it("rejects duplicates across areas and malformed snapshots", () => {
    const duplicate = board();
    duplicate.columns[2].items = [{ task: { ...row } }];
    duplicate.columns[2].total = 1;
    expect(() => readBoard(duplicate)).toThrow();
    for (const value of [
      null,
      { ...board(), version: 9007199254740992 },
      { ...board(), columns: [] },
      { ...board(), columns: [null, ...board().columns.slice(1)] },
    ])
      expect(() => readBoard(value as Board)).toThrow();
  });
  it("rejects malformed candidate identities and invalid paging", () => {
    const page = { items: [row], offset: 0, limit: 25, total: 1 };
    expect(readCandidates(page).items[0].title).toBe("İlk iş");
    expect(() => readCandidates({ ...page, items: [{ ...row, id: "foreign-text" }] })).toThrow();
    expect(() => readCandidates({ ...page, limit: 0 })).toThrow();
  });
});

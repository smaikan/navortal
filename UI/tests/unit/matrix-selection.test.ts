import { describe, expect, it } from "vitest";
import { addSelection } from "../../src/features/matrix/selection";

describe("matrix selection writes", () => {
  it("uses exact server receipts in sequence and never submits duplicate selections", async () => {
    const calls: [string, number | string][] = [];
    const receipts = ["9007199254740997", "9007199254741009"];
    const added = await addSelection(["a", "a", "b"], "9007199254740993", async (id, version) => {
      calls.push([id, version]);
      return receipts[calls.length - 1];
    });
    expect(calls).toEqual([
      ["a", "9007199254740993"],
      ["b", "9007199254740997"],
    ]);
    expect(added).toEqual(["a", "b"]);
  });
  it("stops on the first failed or unknown write without retrying it or sending later tasks", async () => {
    const calls: string[] = [];
    const added = await addSelection(["a", "b", "c"], 0, async id => {
      calls.push(id);
      return id === "a" ? 1 : false;
    });
    expect(calls).toEqual(["a", "b"]);
    expect(added).toEqual(["a"]);
  });
  it("does not write without a verified board version", async () => {
    let calls = 0;
    expect(
      await addSelection(["a"], undefined, async () => {
        calls++;
        return 1;
      }),
    ).toEqual([]);
    expect(calls).toBe(0);
  });
});

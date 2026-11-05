import { describe, expect, it } from "vitest";
import { pickCard, type PickCard } from "../../src/features/planning/card-pick-model";

const card = (taskId: string): PickCard => ({ taskId, title: taskId, meta: "" });

describe("card pick", () => {
  it("picks only from the given cards and never repeats the current one", () => {
    const cards = [card("a"), card("b"), card("c")];
    for (const value of [0, 0.34, 0.67, 0.99]) {
      const picked = pickCard(cards, "b", () => value);
      expect(cards).toContain(picked);
      expect(picked.taskId).not.toBe("b");
    }
  });
  it("keeps the only card when nothing else exists", () => {
    expect(pickCard([card("a")], "a", () => 0.5).taskId).toBe("a");
  });
});

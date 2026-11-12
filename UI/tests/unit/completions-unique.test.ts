import { describe, expect, it } from "vitest";
import { uniqueCompletions } from "../../src/features/calendar/model";

const e = (eventId: string, taskId: string, sequence: number, effectiveAt: string) => ({
  eventId,
  taskId,
  sequence,
  effectiveAt,
});

describe("day-end completion list", () => {
  it("shows a task once even when it was finished, reopened and finished again the same day", () => {
    const items = [
      e("e1", "a", 1, "2026-11-14T08:00:00Z"),
      e("e2", "b", 2, "2026-11-14T09:00:00Z"),
      e("e3", "a", 5, "2026-11-14T11:00:00Z"),
      e("e4", "a", 9, "2026-11-14T12:00:00Z"),
    ];
    expect(uniqueCompletions(items).map(i => i.eventId)).toEqual(["e2", "e4"]);
  });
  it("keeps distinct tasks and the original order untouched", () => {
    const items = [e("e1", "a", 1, "t"), e("e2", "b", 2, "t"), e("e3", "c", 3, "t")];
    expect(uniqueCompletions(items)).toEqual(items);
    expect(uniqueCompletions([])).toEqual([]);
  });
  it("accepts sequence numbers sent as strings", () => {
    const items = [e("e1", "a", 10, "t"), { ...e("e2", "a", 2, "t"), sequence: "9" }];
    expect(uniqueCompletions(items).map(i => i.eventId)).toEqual(["e1"]);
  });
});

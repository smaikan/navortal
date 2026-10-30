import { expect, test } from "vitest";
import { civilDate, instantToLocal, wallTimeToInstant } from "../../src/lib/time/wall-time";

test("Istanbul conversion and civil date preserve the selected local day", () => {
  expect(civilDate("2026-10-16")).toBe("2026-10-16");
  expect(wallTimeToInstant("2026-10-16T01:30", "Europe/Istanbul", "reject")).toBe("2026-10-15T22:30:00Z");
  expect(instantToLocal("2026-10-15T22:30:00Z", "Europe/Istanbul").toPlainDate().toString()).toBe("2026-10-16");
  expect(() => civilDate("2026-02-30")).toThrow();
});
test("DST gap requires an explicit decision", () => {
  expect(() => wallTimeToInstant("2026-03-29T02:30", "Europe/Berlin", "reject")).toThrow();
  expect(wallTimeToInstant("2026-03-29T02:30", "Europe/Berlin", "earlier")).toBe("2026-03-29T00:30:00Z");
  expect(wallTimeToInstant("2026-03-29T02:30", "Europe/Berlin", "later")).toBe("2026-03-29T01:30:00Z");
});
test("DST overlap selects two distinct instants", () => {
  expect(() => wallTimeToInstant("2026-10-25T02:30", "Europe/Berlin", "reject")).toThrow();
  expect(wallTimeToInstant("2026-10-25T02:30", "Europe/Berlin", "earlier")).toBe("2026-10-25T00:30:00Z");
  expect(wallTimeToInstant("2026-10-25T02:30", "Europe/Berlin", "later")).toBe("2026-10-25T01:30:00Z");
});
test("a midnight crossing keeps its next local day", () => {
  const start = instantToLocal(wallTimeToInstant("2026-10-16T23:30", "Europe/Istanbul", "reject"), "Europe/Istanbul");
  expect(start.add({ minutes: 60 }).toPlainDate().toString()).toBe("2026-10-17");
});

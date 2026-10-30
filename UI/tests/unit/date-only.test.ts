import { expect, test } from "vitest";
import { shiftDate } from "../../src/lib/time/date-only";
import { validDate } from "../../src/features/preferences/model";

test("civil day navigation crosses DST, leap days and century years without a local timezone offset", () => {
  for (const [date, amount, expected] of [
    ["2026-03-29", 1, "2026-03-30"],
    ["2026-10-25", -1, "2026-10-24"],
    ["2024-02-28", 1, "2024-02-29"],
    ["1900-02-28", 1, "1900-03-01"],
    ["2000-03-01", -1, "2000-02-29"],
    ["2026-01-01", -89, "2025-10-04"],
    ["0002-01-01", 1, "0002-01-02"],
    ["9998-12-30", 1, "9998-12-31"],
  ] as const)
    expect(shiftDate(date, amount)).toBe(expected);
});
test("read-only dates reject normalized invalid days and unsupported years", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-00-01", "0001-12-31", "9999-01-01", "2026-1-01"])
    expect(validDate(date)).toBe(false);
  expect(validDate("0002-01-01")).toBe(true);
  expect(validDate("2024-02-29")).toBe(true);
});

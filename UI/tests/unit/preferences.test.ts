import { describe, expect, it } from "vitest";
import {
  buildValues,
  clock,
  readSnapshot,
  toDraft,
  validDate,
  type Preferences,
} from "../../src/features/preferences/model";

const base: Preferences = {
  timeZoneId: "Europe/Istanbul",
  language: "en-GB",
  timeFormat: "12h",
  weekStartsOn: 0,
  planningMode: "Preview",
  parentCompletionPolicy: "ParentOnly",
  minimumSplitSeconds: 900,
  transitionSeconds: 0,
  supportEnabled: true,
  uiSupports: {
    calmView: false,
    dayBar: true,
    calibrationHints: true,
    nudges: true,
    resumeCard: true,
    openTodayAsOneThing: false,
  },
  weekly: [],
  exceptions: [],
};
describe("preferences document boundary", () => {
  it("keeps a new empty week, version zero and every unedited setting", () => {
    const snapshot = readSnapshot({ version: 0, values: base });
    const built = buildValues(snapshot.values, { ...toDraft(base), timeZoneId: "UTC" });
    expect(built.errors).toEqual([]);
    expect(built.values).toEqual({ ...base, timeZoneId: "UTC" });
  });
  it("preserves second precision, unknown future fields and date-off overrides", () => {
    const values = {
      ...base,
      minimumSplitSeconds: 1,
      transitionSeconds: 13,
      futurePreference: { enabled: true },
      weekly: [{ dayOfWeek: 1, startMinute: 0, endMinute: 1440 }],
      exceptions: [{ date: "2026-10-19", intervals: [] }],
    };
    const built = buildValues(values, toDraft(values));
    expect(built).toEqual({ values, errors: [] });
    expect(clock(1440)).toBe("24:00");
  });
  it("accepts adjacent ranges but rejects same-day overlap and overnight ranges", () => {
    const draft = toDraft(base);
    draft.weekly = [
      { id: "a", dayOfWeek: 1, start: "09:00", end: "10:00" },
      { id: "b", dayOfWeek: 1, start: "10:00", end: "24:00" },
    ];
    expect(buildValues(base, draft).errors).toEqual([]);
    draft.weekly[1].start = "09:59";
    expect(buildValues(base, draft).errors.map(item => item.message)).toContain("Bu günün saat aralıkları çakışıyor.");
    draft.weekly = [{ id: "a", dayOfWeek: 1, start: "23:00", end: "01:00" }];
    expect(buildValues(base, draft).errors[0].message).toContain("iki güne ayır");
  });
  it("rejects invalid clocks, duplicate dates and impossible calendar dates", () => {
    const draft = toDraft(base);
    draft.weekly = [{ id: "a", dayOfWeek: 0, start: "24:00", end: "24:01" }];
    draft.exceptions = [
      { id: "e1", date: "2026-10-19", intervals: [] },
      { id: "e2", date: "2026-10-19", intervals: [] },
    ];
    expect(buildValues(base, draft).errors).toHaveLength(3);
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(validDate("0001-01-01")).toBe(false);
  });
  it("rejects invalid zone, fractional seconds and out-of-range settings", () => {
    const draft = {
      ...toDraft(base),
      timeZoneId: "Invalid/Place",
      minimumSplitSeconds: "1.5",
      transitionSeconds: "86401",
    };
    expect(buildValues(base, draft).errors.map(item => item.path)).toEqual([
      "timeZoneId",
      "minimumSplitSeconds",
      "transitionSeconds",
    ]);
  });
  it("fails closed on incomplete server documents rather than silently inventing hours", () => {
    expect(() => readSnapshot({ version: 0, values: { timeZoneId: "UTC" } })).toThrow("eksiksiz");
    expect(() => readSnapshot({ version: 0, values: { ...base, weekly: undefined } })).toThrow("eksiksiz");
    expect(readSnapshot({ version: "9007199254740993", values: base }).version).toBe("9007199254740993");
  });
});

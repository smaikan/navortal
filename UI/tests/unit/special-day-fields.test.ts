import { describe, expect, it } from "vitest";
import { arrange, toBody, toDraft, whenLabel, type SpecialDay } from "../../src/features/special-days/model";

const existing = (year: number | null, recurrence: "Once" | "Yearly") =>
  ({
    title: "Mevcut gün",
    kind: "Birthday",
    month: 2,
    day: 6,
    year,
    recurrence,
    reminder: "None",
    nonWorking: false,
  }) as SpecialDay;

describe("special day month and day fields", () => {
  it("saves a named month/day without inventing a year for annual dates", () => {
    const draft = { ...toDraft(), title: "Doğum günü", month: "2", day: "6" };
    expect(toBody(draft, 2026)).toMatchObject({ month: 2, day: 6, year: null, recurrence: "Yearly" });
    expect(toBody({ ...draft, yearly: false }, 2026)).toMatchObject({ year: 2026, recurrence: "Once" });
  });
  it("keeps saved one-off years and annual start boundaries on a name-only edit", () => {
    for (const recurrence of ["Once", "Yearly"] as const)
      expect(toBody({ ...toDraft(existing(2024, recurrence)), title: "Yeni ad" }, 2026).year).toBe(2024);
  });
  it("uses calendar context for the month/day without adding its year", () => {
    expect(toBody({ ...toDraft(undefined, "2030-02-06"), title: "Tatil" }, 2026)).toMatchObject({
      month: 2,
      day: 6,
      year: null,
    });
  });
  it("supports annual leap day but refuses an impossible one-off date without clamping it", () => {
    const draft = { ...toDraft(), title: "Artık gün", month: "2", day: "29" };
    expect(toBody(draft, 2026).day).toBe(29);
    expect(() => toBody({ ...draft, yearly: false }, 2026)).toThrow("2026 yılında 29 Şubat yok");
    expect(toBody({ ...draft, yearly: false }, 2028).year).toBe(2028);
  });
  it.each([
    ["4", "31"],
    ["2", "30"],
    ["13", "1"],
    ["0", "1"],
    ["2", "0"],
    ["", "6"],
    ["2", "6.5"],
  ])("rejects invalid month/day %s/%s", (month, day) => {
    expect(() => toBody({ ...toDraft(), title: "Gün", month, day }, 2026)).toThrow();
  });
});

describe("special day list grouping", () => {
  const day = (id: string, nextOccurrence: string | null) =>
    ({ ...existing(null, "Yearly"), id, title: id, nextOccurrence }) as SpecialDay;
  it("puts the next 30 days first with calm labels, later ones by month in date order", () => {
    const result = arrange(
      [
        day("dec", "2026-12-09"),
        day("tomorrow", "2026-10-29"),
        day("day30", "2026-11-27"),
        day("today", "2026-10-28"),
        day("day31", "2026-11-28"),
        day("jan", "2027-01-01"),
        day("dec-early", "2026-12-01"),
        day("past", null),
      ],
      "2026-10-28",
    );
    expect(result.soon.map(x => [x.day.id, whenLabel(x.days)])).toEqual([
      ["today", "Bugün"],
      ["tomorrow", "Yarın"],
      ["day30", "30 gün sonra"],
    ]);
    expect(result.later.map(g => [g.label, g.items.map(x => x.id)])).toEqual([
      ["Kasım 2026", ["day31"]],
      ["Aralık 2026", ["dec-early", "dec"]],
      ["Ocak 2027", ["jan"]],
    ]);
    expect(result.past.map(x => x.id)).toEqual(["past"]);
  });
  it("counts across a leap February and a year end", () => {
    const result = arrange([day("leap", "2028-02-29")], "2028-01-31");
    expect(result.soon[0].days).toBe(29);
    expect(arrange([day("ny", "2027-01-01")], "2026-12-31").soon[0].days).toBe(1);
  });
});

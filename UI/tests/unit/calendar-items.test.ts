import { describe, expect, test } from "vitest";
import { ApiError } from "../../src/lib/api/errors";
import {
  byDay,
  dayTitle,
  groupByRoot,
  monthGrid,
  readItemPage,
  shiftAnchor,
  weekDays,
  weekLabel,
  type CalendarItem,
} from "../../src/features/calendar/items";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const item = (n: number, extra: Partial<CalendarItem> = {}): CalendarItem => ({
  kind: "Untimed",
  id: id(n),
  localDate: "2026-10-21",
  taskId: id(100 + n),
  title: `İş ${n}`,
  parentTaskId: null,
  parentTitle: null,
  rootTaskId: id(100 + n),
  rootTitle: `İş ${n}`,
  startsAt: null,
  endsAt: null,
  completedAt: null,
  taskState: "Pending",
  ...extra,
});

describe("UI-R2 calendar", () => {
  test("a month starts on the user's first weekday and covers whole weeks (October 2026: 5 rows from Monday, 5 rows from Sunday)", () => {
    const monday = monthGrid("2026-10-23", 1);
    expect([monday.from, monday.to, monday.days.length]).toEqual(["2026-09-28", "2026-11-01", 35]);
    expect(monday.days.filter(d => d.inMonth)).toHaveLength(31);
    const sunday = monthGrid("2026-10-23", 0);
    expect([sunday.from, sunday.to]).toEqual(["2026-09-27", "2026-10-31"]);
    expect(monthGrid("2026-08-10", 1).days.length).toBe(42); // Ağustos 2026 için altı satır gerekiyor.
  });
  test("a week and the arrows follow civil dates across month and year ends", () => {
    expect(weekDays("2026-10-23", 1)).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    expect(weekDays("2027-01-01", 1)).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
    expect(shiftAnchor("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftAnchor("2026-10-23", "week", -1)).toBe("2026-10-16");
    expect(weekLabel("2026-12-28", "2027-01-03")).toBe("28 Aralık 2026 – 3 Ocak 2027");
    expect(dayTitle("2026-10-21")).toBe("Çarşamba, 21 Ekim");
  });
  test("display grouping keeps one entry per root task per day; a group is done only when every item is", () => {
    const root = id(900);
    const items = [
      item(1, { rootTaskId: root, rootTitle: "Tez", completedAt: "2026-10-21T08:00:00Z" }),
      item(2),
      item(3, { rootTaskId: root, rootTitle: "Tez" }),
      item(4, { localDate: "2026-10-22" }),
    ];
    const day = byDay(items).get("2026-10-21")!;
    const groups = groupByRoot(day);
    expect(groups.map(g => [g.rootTitle, g.items.length, g.done])).toEqual([
      ["Tez", 2, false],
      ["İş 2", 1, false],
    ]);
    expect(groupByRoot([items[0]])[0].done).toBe(true);
  });
  test("item pages are decoded strictly: wrong day, timed item without times or an end without a start are refused", () => {
    const page = (items: CalendarItem[], offset = 0) => ({
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
      items,
      offset,
      limit: 300,
      total: items.length,
    });
    expect(
      readItemPage(
        page([item(1), item(2, { kind: "Timed", startsAt: "2026-10-21T06:00:00Z", endsAt: "2026-10-21T07:00:00Z" })]),
        "2026-10-19",
        "2026-10-25",
        0,
      ).items,
    ).toHaveLength(2);
    expect(
      readItemPage(page([item(1, { startsAt: "2026-10-21T06:00:00Z" })]), "2026-10-19", "2026-10-25", 0).items,
    ).toHaveLength(1);
    for (const bad of [
      item(1, { localDate: "2026-10-30" }),
      item(1, { kind: "Timed" }),
      item(1, { endsAt: "2026-10-21T07:00:00Z" }),
      item(1, { rootTaskId: "x" }),
      item(1, { completedAt: "dün" }),
    ])
      expect(() => readItemPage(page([bad]), "2026-10-19", "2026-10-25", 0)).toThrow(ApiError);
    expect(() => readItemPage(page([item(1)], 5), "2026-10-19", "2026-10-25", 0)).toThrow(ApiError);
  });
});

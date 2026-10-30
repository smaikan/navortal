import { expect, test } from "vitest";
import { readCalendarOverview, type CalendarOverview } from "../../src/features/calendar/overview";
const date = "2026-10-25";
const root = {
  rootTaskId: "11111111-1111-4111-8111-111111111111",
  rootTitle: "Tez",
  itemCount: 301,
  completedItemCount: 300,
  done: false,
};
const view: CalendarOverview = {
  fromDate: date,
  toDate: date,
  serverNow: `${date}T09:00:00Z`,
  planningVersion: 1,
  days: [
    {
      localDate: date,
      timeZoneId: "Europe/Berlin",
      itemCount: 301,
      completedItemCount: 300,
      rootGroupCount: 1,
      roots: [root],
    },
  ],
};
test("month preview carries whole-group counts without pretending that hidden items are loaded", () => {
  expect(readCalendarOverview(view, date, date)).toBe(view);
  for (const patch of [
    { days: [] },
    { fromDate: "2026-10-24" },
    { serverNow: "bad" },
    { days: [{ ...view.days[0], rootGroupCount: 2 }] },
    { days: [{ ...view.days[0], roots: [{ ...root, done: true }] }] },
    { days: [{ ...view.days[0], completedItemCount: 302 }] },
  ])
    expect(() => readCalendarOverview({ ...view, ...patch } as CalendarOverview, date, date)).toThrow();
});

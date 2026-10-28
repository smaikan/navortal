import { describe, expect, test } from "vitest";
import { ApiError } from "../../src/lib/api/errors";
import { dayFailure } from "../../src/features/planning/day-actions";
import { partialTimeRange, timeRange } from "../../src/features/planning/time-range";
import { entryFacts, orderEntries } from "../../src/features/planning/day-plan";
import {
  readDayItem,
  readDayItems,
  readSchedule,
  type DayItem,
  type Schedule,
} from "../../src/features/planning/model";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const item = (n: number, extra: Partial<DayItem> = {}): DayItem => ({
  isUrgent: false,
  id: id(n),
  localDate: "2026-10-22",
  taskId: id(100 + n),
  sortOrder: n,
  completedAt: null,
  version: 1,
  taskTitle: `İş ${n}`,
  parentTaskId: null,
  parentTitle: null,
  directEstimatedSeconds: null,
  taskState: "Pending",
  ...extra,
});
test("R4 partial start remains open-ended and its plan item orders with timed entries", () => {
  const time = partialTimeRange("2026-10-22", "Europe/Istanbul", "11:25", "");
  expect(time.startsAt).toBe("2026-10-22T08:25:00Z");
  expect(time.endsAt).toBeNull();
  const urgent = item(5, { startsAt: time.startsAt, isUrgent: true });
  expect(readDayItem(urgent)).toBe(urgent);
  expect(orderEntries([], [item(1), urgent]).timed).toEqual([{ kind: "item", item: urgent }]);
  expect(() => readDayItem({ ...urgent, startsAt: null, endsAt: "2026-10-22T09:00:00Z" })).toThrow();
});
const block = (n: number, start: string, end: string, extra: Partial<Schedule> = {}): Schedule => ({
  id: id(n),
  dailyPlanId: id(99),
  taskId: id(200 + n),
  kind: "Work",
  state: "Planned",
  startsAt: start,
  endsAt: end,
  isFixed: false,
  isLocked: false,
  splitGroupId: null,
  originScheduleId: null,
  version: 1,
  isAutomatic: false,
  completedAt: null,
  taskSnapshot: {
    task: {
      schemaVersion: 1,
      taskId: id(200 + n),
      taskVersion: 1,
      title: `Blok ${n}`,
      ancestors: [{ id: id(300), name: "Ana görev" }],
      project: null,
      pool: null,
      category: null,
      tags: [],
      inputPlanningVersion: 1,
      capturedAt: null,
    },
    state: "Pending",
    hasDirectWork: true,
    directWorkCompleted: false,
    requiredForParent: true,
    directEstimatedSeconds: 1500,
    targetBudgetSeconds: null,
  },
  ...extra,
});

describe("UI-R2 day list", () => {
  test("timed entries sort by start, untimed by the order they were added; the parent name comes from the plan snapshot", () => {
    const { timed, untimed } = orderEntries(
      [
        block(2, "2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z"),
        block(1, "2026-10-22T07:00:00Z", "2026-10-22T08:00:00Z"),
      ],
      [item(5, { sortOrder: 3 }), item(4, { sortOrder: 1 })],
    );
    expect(timed.map(e => entryFacts(e).title)).toEqual(["Blok 1", "Blok 2"]);
    expect(untimed.map(e => entryFacts(e).title)).toEqual(["İş 4", "İş 5"]);
    expect(entryFacts(timed[0])).toMatchObject({ parent: "Ana görev", estimate: "25 dk", done: false });
    expect(
      entryFacts({
        kind: "item",
        item: item(1, { completedAt: "2026-10-22T08:00:00Z", parentTitle: "Proje", directEstimatedSeconds: null }),
      }),
    ).toMatchObject({ parent: "Proje", estimate: "", done: true });
  });
  test("an end at or before the start is the next day; local wall times resolve in the plan zone and DST gaps are refused", () => {
    expect(timeRange("2026-10-22", "Europe/Istanbul", "09:00", "10:30")).toEqual({
      startsAt: "2026-10-22T06:00:00Z",
      endsAt: "2026-10-22T07:30:00Z",
      nextDay: false,
    });
    expect(timeRange("2026-10-22", "Europe/Istanbul", "23:30", "00:30")).toEqual({
      startsAt: "2026-10-22T20:30:00Z",
      endsAt: "2026-10-22T21:30:00Z",
      nextDay: true,
    });
    expect(timeRange("2026-10-22", "Europe/Istanbul", "10:00", "10:00").nextDay).toBe(true);
    expect(() => timeRange("2026-10-22", "Europe/Istanbul", "", "10:00")).toThrow(/saatini gir/);
    expect(() => timeRange("2026-03-29", "Europe/Berlin", "02:30", "04:00")).toThrow(/bulunmuyor/);
  });
  test("day item decoding rejects a wrong day, a zero version and an empty title; completion is optional", () => {
    expect(readDayItem(item(1), "2026-10-22").taskTitle).toBe("İş 1");
    for (const bad of [
      item(1, { localDate: "2026-10-23" }),
      item(1, { version: 0 }),
      item(1, { taskTitle: "" }),
      item(1, { completedAt: "dün" }),
      item(1, { parentTaskId: "x" }),
    ])
      expect(() => readDayItem(bad, "2026-10-22")).toThrow(ApiError);
    expect(() =>
      readDayItems(
        { items: Array.from({ length: 101 }, (_, n) => item(n)), offset: 0, limit: 100, total: 101 },
        "2026-10-22",
      ),
    ).toThrow(ApiError);
    expect(
      readSchedule(block(1, "2026-10-22T07:00:00Z", "2026-10-22T08:00:00Z", { completedAt: "2026-10-22T07:30:00Z" }))
        .completedAt,
    ).toBe("2026-10-22T07:30:00Z");
    expect(() =>
      readSchedule(block(1, "2026-10-22T07:00:00Z", "2026-10-22T08:00:00Z", { completedAt: "yarın" })),
    ).toThrow(ApiError);
  });
  test("failures speak plainly: duplicates, unplannable tasks, midnight edits, unknown results and conflicts", () => {
    const failure = (status: number, code?: string, unknown = false) =>
      dayFailure(new ApiError("http", "x", status, code, {}, undefined, undefined, unknown));
    expect(failure(409, "day_item_exists")).toContain("zaten var");
    expect(failure(409, "task_not_plannable")).toContain("plana eklenemez");
    expect(failure(409, "schedule_move_requires_intent")).toContain("gece yarısını");
    expect(failure(409, "version_conflict")).toContain("Güncel planı kontrol edip yeniden seç");
    expect(failure(0, undefined, true)).toContain("otomatik tekrar gönderilmedi");
    expect(dayFailure(new RangeError("Saat aralığını kontrol et."))).toBe("Saat aralığını kontrol et.");
  });
});

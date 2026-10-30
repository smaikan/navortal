import { expect, test } from "vitest";
import {
  dates,
  readRange,
  readCalendarDay,
  readSnapshot,
  type DayView,
  type RangeView,
  type Pages,
  type Snapshot,
} from "../../src/features/calendar/model";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
const offsets: Pages = { plan: 0, actual: 0, completions: 0 };
const summary = (date = "2026-10-15"): DayView["summary"] => ({
  localDate: date,
  timeZoneId: "Europe/Istanbul",
  dailyPlanId: id,
  currentRevisionId: id,
  baselineRevisionId: other,
  revisionNumber: 2,
  planningVersion: "9223372036854775807",
  plannedWorkSeconds: 3600,
  plannedBreakSeconds: 0,
  plannedBufferSeconds: 0,
  baselineWorkSeconds: 7200,
  plannedBlockCount: 1,
  actualSeconds: "1800.000001",
  actualSegmentCount: 1,
  completedTaskCount: 0,
  hasOpenWork: false,
});
const view = (): DayView => ({
  summary: summary(),
  serverNow: "2026-10-21T09:00:00Z",
  plan: { items: [], offset: 0, limit: 25, total: 0, revisionId: id },
  actual: { items: [], offset: 0, limit: 25, total: 0 },
  completions: { items: [], offset: 0, limit: 25, total: 0 },
  legacyZoneCompletionCount: 0,
});
const range = (): RangeView => ({
  fromDate: "2026-10-15",
  toDate: "2026-10-16",
  serverNow: "2026-10-21T09:00:00Z",
  days: [summary(), summary("2026-10-16")],
  legacyZoneCompletionCount: 0,
});
test("civil range accepts 1/42 days and refuses 43/invalid/reversed dates", () => {
  expect(dates("2026-10-01", "2026-11-11")).toHaveLength(42);
  expect(dates("2026-10-25", "2026-10-25")).toHaveLength(1);
  for (const [a, b] of [
    ["2026-10-01", "2026-11-12"],
    ["2026-10-02", "2026-10-01"],
    ["2026-02-30", "2026-03-01"],
    ["0001-01-01", "0001-01-01"],
    ["9999-01-01", "9999-01-01"],
  ])
    expect(() => dates(a, b)).toThrow();
});
test("range has exactly requested days in order and validates each frozen zone; unknown legacy completions are retained", () => {
  const r = range();
  r.legacyZoneCompletionCount = 3;
  expect(readRange(r, r.fromDate, r.toDate)).toBe(r);
  for (const days of [
    [],
    [...r.days].reverse(),
    [r.days[0], r.days[0]],
    [{ ...r.days[0], timeZoneId: "invalid" }, r.days[1]],
  ])
    expect(() => readRange({ ...r, days }, r.fromDate, r.toDate)).toThrow();
  expect(() =>
    readRange(
      { ...r, days: [{ ...r.days[0], actualSeconds: null }, r.days[1]] } as unknown as RangeView,
      r.fromDate,
      r.toDate,
    ),
  ).toThrow();
});
test("revision binding is independent of current/baseline summary and never substitutes another revision", () => {
  const v = view();
  v.plan.revisionId = other;
  expect(readCalendarDay(v, v.summary.localDate, offsets, other)).toBe(v);
  expect(v.summary.plannedWorkSeconds).toBe(3600);
  expect(v.summary.baselineWorkSeconds).toBe(7200);
  expect(() => readCalendarDay(v, v.summary.localDate, offsets)).toThrow();
  expect(() => readCalendarDay(v, "2026-10-16", offsets, other)).toThrow();
});
test("three bounded pages validate their own offsets and limits; one offset does not advance another list", () => {
  const v = view();
  v.actual.offset = 25;
  expect(readCalendarDay(v, v.summary.localDate, { ...offsets, actual: 25 })).toBe(v);
  expect(() => readCalendarDay(v, v.summary.localDate, offsets)).toThrow();
  expect(() =>
    readCalendarDay({ ...v, actual: { ...v.actual, limit: 100 } }, v.summary.localDate, { ...offsets, actual: 25 }),
  ).toThrow();
  expect(() =>
    readCalendarDay({ ...view(), plan: { ...view().plan, items: Array(26).fill({}) } }, v.summary.localDate, offsets),
  ).toThrow();
});
test("actual clips in its source zone rather than summary zone, retains decimal seconds and rejects a different local day's segment", () => {
  const v = view();
  v.actual.total = 1;
  v.actual.items = [
    {
      sessionId: id,
      segmentId: other,
      taskId: null,
      timeZoneId: "America/New_York",
      startsAt: "2026-10-16T03:30:00Z",
      endsAt: "2026-10-16T04:00:00Z",
      sourceStartedAt: "2026-10-16T03:30:00Z",
      sourceEndedAt: "2026-10-16T04:30:00Z",
      activeSeconds: "1800.000001",
      sessionStillRunning: false,
      taskAtStart: null,
      taskAtDayEnd: null,
    },
  ];
  expect(readCalendarDay(v, v.summary.localDate, offsets).actual.items[0].activeSeconds).toBe("1800.000001");
  expect(() =>
    readCalendarDay(
      { ...v, actual: { ...v.actual, items: [{ ...v.actual.items[0], endsAt: "2026-10-16T04:01:00Z" }] } },
      v.summary.localDate,
      offsets,
    ),
  ).toThrow();
  const tiny = {
    ...v.actual.items[0],
    startsAt: "2026-10-16T03:59:59.999998Z",
    endsAt: "2026-10-16T03:59:59.999999Z",
    activeSeconds: "0.000001",
  };
  expect(
    readCalendarDay({ ...v, actual: { ...v.actual, items: [tiny] } }, v.summary.localDate, offsets).actual.items[0]
      .activeSeconds,
  ).toBe("0.000001");
  expect(() =>
    readCalendarDay(
      { ...v, actual: { ...v.actual, items: [{ ...tiny, endsAt: "2026-10-16T04:00:00.000001Z" }] } },
      v.summary.localDate,
      offsets,
    ),
  ).toThrow();
});
test("missing historical names/states remain unknown; completion belongs to its own source date and cannot be reassigned to summary zone", () => {
  const v = view();
  v.completions.total = 1;
  v.completions.items = [
    {
      eventId: id,
      taskId: other,
      parentTaskId: null,
      effectiveAt: "2026-10-16T03:30:00Z",
      timeZoneId: "America/New_York",
      title: null,
      sequence: "9223372036854775807",
    },
  ];
  expect(readCalendarDay(v, v.summary.localDate, offsets).completions.items[0].title).toBeNull();
  expect(() =>
    readCalendarDay(
      {
        ...v,
        completions: { ...v.completions, items: [{ ...v.completions.items[0], timeZoneId: "Europe/Istanbul" }] },
      },
      v.summary.localDate,
      offsets,
    ),
  ).toThrow();
});
test("legacy capture timestamp is nullable/optional, while the historical title/id and malformed timestamps remain guarded", () => {
  const s: Snapshot = {
    schemaVersion: 1,
    taskId: id,
    taskVersion: 1,
    title: "Eski başlangıç başlığı",
    ancestors: [],
    project: null,
    pool: null,
    category: null,
    tags: [],
    inputPlanningVersion: 0,
  };
  expect(readSnapshot(s, id)).toBe(s);
  expect(readSnapshot({ ...s, capturedAt: null }, id).capturedAt).toBeNull();
  expect(() => readSnapshot({ ...s, capturedAt: "invalid" }, id)).toThrow();
  expect(() => readSnapshot(s, other)).toThrow();
});

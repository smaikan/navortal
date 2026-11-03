import { describe, expect, it } from "vitest";
import {
  monthInRange,
  monthRows,
  ratePercent,
  rateText,
  readRoutineDetail,
  readRoutineReport,
  shortDay,
  weekInRange,
  type RoutineCounts,
  type RoutineDetail,
  type RoutineReport,
} from "../../src/features/analytics/routine-model";

const counts = (over: Partial<RoutineCounts> = {}): RoutineCounts => ({
  onTime: 2,
  late: 1,
  notDone: 1,
  todayPending: 0,
  skipped: 0,
  notGenerated: 0,
  completed: 3,
  total: 4,
  consistency: 0.75,
  ...over,
});
const report = (over: Partial<RoutineReport> = {}) =>
  ({
    fromDate: "2026-10-01",
    toDate: "2026-10-31",
    compareFromDate: null,
    compareToDate: null,
    weekStartsOn: 1,
    minimumSamples: 3,
    activeCount: 1,
    totals: counts(),
    compare: null,
    items: [],
    offset: 0,
    limit: 5,
    total: 0,
    serverNow: "2026-11-06T09:00:00Z",
    ...over,
  }) as RoutineReport;
const range = { fromDate: "2026-10-01", toDate: "2026-10-31" };

describe("routine analytics", () => {
  it("shows a percentage only with enough tasks", () => {
    expect(rateText(counts(), 3)).toBe("%75");
    expect(ratePercent(counts(), 3)).toBe(75);
    const small = counts({ onTime: 2, late: 0, notDone: 0, completed: 2, total: 2, consistency: 1 });
    expect(rateText(small, 3)).toBe("2/2");
    expect(ratePercent(small, 3)).toBeNull();
    const none = counts({ onTime: 0, late: 0, notDone: 0, completed: 0, total: 0, consistency: null });
    expect(rateText(none, 3)).toBe("Görev yok");
  });
  it("marks a week only when most of its elapsed days are in the period", () => {
    const today = "2026-11-06";
    // 1 Kasım Pazar: Bu ay önceki haftayı işaretlemez.
    expect(weekInRange("2026-10-26", { fromDate: "2026-11-01", toDate: today }, today)).toBe(false);
    expect(weekInRange("2026-11-02", { fromDate: "2026-11-01", toDate: today }, today)).toBe(true);
    // Haftanın ilk günü bile bu hafta sayılır.
    expect(weekInRange("2026-11-02", { fromDate: "2026-11-02", toDate: "2026-11-02" }, "2026-11-02")).toBe(true);
    expect(weekInRange("2026-09-28", range, today)).toBe(true);
    expect(weekInRange("2026-09-21", range, today)).toBe(false);
  });
  it("marks a month when it holds most of the period or most of itself", () => {
    const today = "2026-11-06",
      lastWeek = { fromDate: "2026-10-26", toDate: "2026-11-01" };
    expect(monthInRange("2026-10", lastWeek, today)).toBe(true);
    expect(monthInRange("2026-11", lastWeek, today)).toBe(false);
    expect(monthInRange("2026-09", { fromDate: "2026-08-03", toDate: "2026-09-30" }, today)).toBe(true);
    expect(monthInRange("2026-08", { fromDate: "2026-08-03", toDate: "2026-09-30" }, today)).toBe(true);
  });
  it("builds month rows newest first with only known results", () => {
    const rows = monthRows([
      { localDate: "2026-10-02", class: "OnTime" },
      { localDate: "2026-10-01", class: "NotDone" },
      { localDate: "2026-10-03", class: "Skipped" },
      { localDate: "2026-11-02", class: "Late" },
      { localDate: "2026-11-06", class: "TodayPending" },
      { localDate: "2026-09-10", class: "NotGenerated" },
    ]);
    expect(rows.map(x => [x.label, x.done, x.dots.length])).toEqual([
      ["Kas", 1, 1],
      ["Eki", 1, 2],
    ]);
    expect(rows[1]!.dots.map(x => x.done)).toEqual([false, true]);
    expect(shortDay("2026-10-26")).toBe("26 Eki");
  });
  it("rejects inconsistent server totals and foreign ranges", () => {
    expect(readRoutineReport(report(), range).activeCount).toBe(1);
    expect(() => readRoutineReport(report({ fromDate: "2026-09-01" }), range)).toThrow();
    expect(() => readRoutineReport(report({ totals: counts({ total: 9 }) }), range)).toThrow();
    expect(() => readRoutineReport(report({ totals: counts({ consistency: null }) }), range)).toThrow();
    expect(() => readRoutineReport(report({ totals: counts({ consistency: 2 }) }), range)).toThrow();
  });
  it("rejects a detail of another routine or an unknown class", () => {
    const detail = {
      templateId: "a",
      today: "2026-11-06",
      days: [{ localDate: "2026-11-05", class: "Late" }],
      weekdays: [],
      recent: counts(),
      prior: counts(),
      longestRun: 2,
      work: {
        totalSeconds: 0,
        sampleCount: 0,
        averageSeconds: null,
        excludedWithoutWorkCount: 0,
        estimatedSeconds: null,
      },
    } as unknown as RoutineDetail;
    expect(readRoutineDetail(detail, "a")).toBe(detail);
    expect(() => readRoutineDetail(detail, "b")).toThrow();
    expect(() =>
      readRoutineDetail(
        { ...detail, days: [{ localDate: "2026-11-05", class: "Other" }] } as unknown as RoutineDetail,
        "a",
      ),
    ).toThrow();
  });
});

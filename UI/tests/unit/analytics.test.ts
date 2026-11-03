import { describe, expect, it } from "vitest";
import {
  analyticsFailure,
  duration,
  pageSize,
  readActual,
  readBreakdown,
  readFilters,
  reportUrl,
  type Actual,
  type Breakdown,
} from "../../src/features/analytics/model";
import { ApiError } from "../../src/lib/api/errors";
const today = "2026-10-23",
  filters = readFilters(new URLSearchParams("fromDate=2026-10-01&toDate=2026-10-23&bucket=Month"), today);
const metrics: Actual["totals"] = {
  workSeconds: "1800.123456",
  taskWorkSeconds: "1800.123456",
  generalWorkSeconds: 0,
  manualWorkSeconds: "1800.123456",
  sessionCount: 1,
  segmentCount: 1,
  missingSnapshotSeconds: 0,
  focus: {
    activeSeconds: 0,
    overtimeSeconds: 0,
    activeCycleCount: 0,
    startedCount: 0,
    finishedCount: 0,
    effectiveTargetsReached: 0,
    recordedTargetsReached: 0,
    averageActiveSeconds: null,
  },
};
const actual: Actual = {
  fromDate: filters.fromDate,
  toDate: filters.toDate,
  bucket: "Month",
  weekStartsOn: 1,
  timeZonePolicy: "SourceSessionZone",
  serverNow: "2026-10-23T06:00:00.123456Z",
  planningVersion: "9007199254740993",
  sourceTimeZones: ["Europe/Istanbul"],
  totals: metrics,
  buckets: [
    {
      bucketStart: "2026-10-01",
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      sourceTimeZones: ["Europe/Istanbul"],
      metrics,
    },
  ],
};
const item = {
  id: "00000000-0000-0000-0000-000000000001",
  label: "Geçmiş isim",
  snapshotAvailable: true,
  workSeconds: 600,
  sessionCount: 1,
};
const breakdown: Breakdown = {
  fromDate: filters.fromDate,
  toDate: filters.toDate,
  dimension: "Task",
  timeZonePolicy: "SourceSessionZone",
  serverNow: actual.serverNow,
  totalWorkSeconds: 2700,
  items: [item],
  offset: 0,
  limit: pageSize,
  total: 31,
};
describe("analytics range and URL intent", () => {
  it("defaults to seven inclusive local dates and retains all selected filters on reload", () => {
    const f = readFilters(new URLSearchParams(), today);
    expect(f.fromDate).toBe("2026-10-17");
    expect(f.toDate).toBe(today);
    expect(readFilters(new URL(reportUrl(f), "https://local.test").searchParams, today)).toEqual(f);
  });
  it.each([
    "fromDate=2024-01-01&toDate=2024-12-31",
    "fromDate=2026-10-23&toDate=2026-10-23",
    "fromDate=2026-03-28&toDate=2026-03-30&bucket=Week",
  ])("accepts inclusive boundary independent of DST: %s", p =>
    expect(() => readFilters(new URLSearchParams(p), today)).not.toThrow(),
  );
  it.each([
    "fromDate=2024-01-01&toDate=2025-01-01",
    "fromDate=2026-10-24&toDate=2026-10-23",
    "fromDate=2026-02-29",
    "fromDate=0001-01-01",
    "toDate=9999-01-01",
    "bucket=Year",
    "dimension=Owner",
    "offset=-1",
    "offset=100001",
    "offset=1e2",
    "fromDate=2026-10-01&fromDate=2026-10-02",
  ])("rejects invalid intent before any query: %s", p =>
    expect(() => readFilters(new URLSearchParams(p), today)).toThrow(),
  );
});
describe("server-owned actual totals and historical labels", () => {
  it("preserves decimal precision, distinct counts, null average and int64 version without client rollup", () => {
    expect(readActual(actual, filters)).toBe(actual);
    expect(actual.totals.workSeconds).toBe("1800.123456");
    expect(actual.totals.focus.averageActiveSeconds).toBeNull();
  });
  it.each([
    { fromDate: "2026-09-30" },
    { bucket: "Week" },
    { planningVersion: 9007199254740992 },
    { weekStartsOn: 7 },
    { timeZonePolicy: "CurrentZone" },
    { serverNow: "today" },
    { sourceTimeZones: ["unknown-zone"] },
    { buckets: [] },
    { buckets: [actual.buckets[0], actual.buckets[0]] },
  ])("rejects malformed or mismatched report %j", patch =>
    expect(() => readActual({ ...actual, ...patch } as never, filters)).toThrow(),
  );
  it.each([NaN, Infinity, -1, "", "-1", " 1", null])(
    "rejects missing/invalid actual rather than inventing zero: %s",
    workSeconds =>
      expect(() => readActual({ ...actual, totals: { ...metrics, workSeconds } } as never, filters)).toThrow(),
  );
  it("accepts partial week/month boundaries and never recomputes distinct totals from periods", () => {
    const r = { ...actual, buckets: [{ ...actual.buckets[0], bucketStart: "2026-09-28" }] };
    expect(readActual(r, filters)).toBe(r);
  });
  it("retains the whole-report total on a page and accepts renamed historical rows plus legacy coverage", () => {
    const p = {
      ...breakdown,
      items: [
        item,
        { ...item, label: "Yeni geçmiş isim" },
        { ...item, id: null, label: "Geçmiş bağlam bilinmiyor", snapshotAvailable: false },
      ],
    };
    expect(readBreakdown(p, filters)).toBe(p);
    expect(p.totalWorkSeconds).toBe(2700);
  });
  it.each([
    { offset: 25 },
    { limit: 50 },
    { dimension: "Category" },
    { total: 0 },
    { items: [item, item] },
    { items: [{ ...item, snapshotAvailable: null }] },
    { items: [{ ...item, id: "foreign-unknown" }] },
  ])("rejects mismatched or malformed page %j", patch =>
    expect(() => readBreakdown({ ...breakdown, ...patch } as never, filters)).toThrow(),
  );
  it("separates absent average, zero and sub-second work", () => {
    expect(duration(null)).toContain("örnek yok");
    expect(duration(0)).toBe("0 sn");
    expect(duration(0.123456)).toBe("1 sn’den az");
    expect(duration("5400")).toBe("1 sa 30 dk");
  });
  it("offers a shorter range for density, not mutation conflict recovery", () =>
    expect(analyticsFailure(new ApiError("http", "", 409, "analytics_range_too_dense"))).toContain("50.000 kaynak"));
});

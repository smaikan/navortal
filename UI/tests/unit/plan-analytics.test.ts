import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanComparison } from "../../src/features/analytics/plan-metrics";
import {
  percent,
  planFilters,
  planUrl,
  readPlan,
  readPlanMetrics,
  readReview,
  readSuggestion,
  signedDuration,
  type Plan,
  type PlanMetrics,
  type Review,
  type Suggestion,
} from "../../src/features/analytics/plan-model";
const task = "00000000-0000-0000-0000-000000000001",
  context = "00000000-0000-0000-0000-000000000002",
  date = "2026-10-15",
  at = "2026-10-15T12:00:00.123456Z";
const f = planFilters(new URLSearchParams(`fromDate=${date}&toDate=${date}&suggestionTask=${task}`), date);
const delay = {
  sampleCount: 0,
  lateCount: 0,
  earlyCount: 0,
  onTimeCount: 0,
  averageSignedDelaySeconds: null,
  averageLateSeconds: null,
};
const empty: PlanMetrics = {
  plannedWorkSeconds: 0,
  conflictingPlannedSeconds: 0,
  componentCount: 0,
  completedComponentCount: 0,
  unknownCompletionCount: 0,
  countCompletion: null,
  knownEstimatedSeconds: 0,
  knownCompletedEstimatedSeconds: 0,
  unknownEstimateCount: 0,
  estimateCoverage: null,
  durationCompletion: null,
  conflictingEstimateCount: 0,
  missingSnapshotBlockCount: 0,
  quotaSeconds: 0,
  quotaFulfilledSeconds: 0,
  quotaRatio: null,
  unplannedActualSeconds: 0,
  accuracy: {
    sampleCount: 0,
    excludedWithoutRecordedWorkCount: 0,
    meanErrorSeconds: null,
    meanAbsoluteErrorSeconds: null,
  },
  fixedStarts: delay,
  flexibleStarts: delay,
};
const baseline = {
  ...empty,
  componentCount: 2,
  completedComponentCount: 1,
  countCompletion: 0.5,
  knownEstimatedSeconds: 11400,
  knownCompletedEstimatedSeconds: 600,
  estimateCoverage: 1,
  durationCompletion: 600 / 11400,
};
const current = {
  ...baseline,
  componentCount: 3,
  completedComponentCount: 2,
  countCompletion: 2 / 3,
  knownEstimatedSeconds: 13500,
  knownCompletedEstimatedSeconds: 2700,
  durationCompletion: 0.2,
};
const day: Review = {
  date,
  planTimeZoneId: "Europe/Istanbul",
  dailyPlanId: context,
  baselineRevisionId: task,
  currentRevisionId: context,
  actualSeconds: 2700,
  baseline,
  current,
  revisionCount: 3,
  revisionReasons: [{ trigger: "Manual", reason: "Acil C", count: 1 }],
  deferCount: 1,
  deferReasons: [{ reason: null, reasonAvailable: false, count: 1 }],
};
const report: Plan = {
  fromDate: date,
  toDate: date,
  serverNow: at,
  planningVersion: "9007199254740993",
  actualTimeZonePolicy: "SourceSessionZone",
  startToleranceSeconds: 60,
  actualSeconds: 2700,
  baseline,
  current,
  revisionCount: 3,
  deferCount: 1,
  legacyZoneDeferCount: 0,
  days: [day],
};
const sample = (i: number) => ({
  taskId: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  title: `Geçmiş ${i}`,
  completedAt: at,
  estimatedSeconds: null,
  actualSeconds: 600,
});
const suggestion: Suggestion = {
  taskId: task,
  fromDate: date,
  toDate: date,
  comparisonContext: "Category",
  contextId: context,
  sampleCount: 3,
  excludedWithoutWorkCount: 0,
  excludedUnknownZoneCount: 0,
  suggestedSeconds: 600,
  unavailableReason: null,
  method: "MedianCompletedComparableActual",
  applied: false,
  sampleLimit: 20,
  samples: [sample(1), sample(2), sample(3)],
  serverNow: at,
};
describe("plan URL and denominator boundaries", () => {
  it("round-trips tolerance/day/task without borrowing unrelated actual-report filters", () =>
    expect(planFilters(new URL(planUrl({ ...f, reviewDate: date }), "https://local.test").searchParams, date)).toEqual({
      ...f,
      reviewDate: date,
    }));
  it.each(["startToleranceSeconds=0", "startToleranceSeconds=3600", "fromDate=2024-01-01&toDate=2024-12-31"])(
    "accepts endpoint boundaries %s",
    params => expect(() => planFilters(new URLSearchParams(params), date)).not.toThrow(),
  );
  it.each([
    "startToleranceSeconds=-1",
    "startToleranceSeconds=3601",
    "startToleranceSeconds=1.5",
    "startToleranceSeconds=1e2",
    "reviewDate=2026-11-01",
    "suggestionTask=foreign",
    "startToleranceSeconds=60&startToleranceSeconds=0",
    "fromDate=2024-01-01&toDate=2025-01-01",
  ])("rejects invalid or ambiguous URL intent %s", params =>
    expect(() => planFilters(new URLSearchParams(params), date)).toThrow(),
  );
  it("keeps A10/B180 initial denominator and C35 current denominator from the server", () => {
    expect(readPlan(report, f)).toBe(report);
    expect(report.baseline.knownEstimatedSeconds).toBe(11400);
    expect(report.current.knownEstimatedSeconds).toBe(13500);
    expect(report.baseline.durationCompletion).toBe(600 / 11400);
    expect(report.current.durationCompletion).toBe(0.2);
  });
  it("renders frozen A10/B180 and added C35 in separate first/current columns", () => {
    const html = renderToStaticMarkup(createElement(PlanComparison, { baseline, current }));
    expect(html).toContain("<td>1 / 2</td><td>2 / 3</td>");
    expect(html).toContain("<td>10 dk / 3 sa 10 dk</td><td>45 dk / 3 sa 45 dk</td>");
  });
  it("does not turn one hour's quota fulfillment into completion of a 12-hour task", () => {
    const m = {
      ...empty,
      componentCount: 1,
      completedComponentCount: 0,
      countCompletion: 0,
      knownEstimatedSeconds: 43200,
      durationCompletion: 0,
      quotaSeconds: 3600,
      quotaFulfilledSeconds: 3600,
      quotaRatio: 1,
    };
    expect(readPlanMetrics(m)).toBe(m);
    expect(percent(m.quotaRatio)).toBe("%100");
    expect(percent(m.countCompletion)).toBe("%0");
  });
  it("separates null/unknown coverage from zero and retains signed early starts/errors", () => {
    expect(percent(null)).toContain("payda veya kapsam yok");
    expect(percent(0)).toBe("%0");
    expect(signedDuration(-60)).toBe("−1 dk");
    expect(signedDuration(null)).toContain("örnek yok");
    expect(
      readPlanMetrics({
        ...empty,
        unknownEstimateCount: 1,
        estimateCoverage: 0.5,
        fixedStarts: { ...delay, sampleCount: 1, earlyCount: 1, averageSignedDelaySeconds: -60, averageLateSeconds: 0 },
        accuracy: { ...empty.accuracy, meanErrorSeconds: -120 },
      }),
    ).toBeTruthy();
  });
  it.each([
    { actualSeconds: -1 },
    { planningVersion: 9007199254740992 },
    { startToleranceSeconds: 0 },
    { actualTimeZonePolicy: "CurrentZone" },
    { days: [] },
    { days: [day, day] },
    { serverNow: "today" },
  ])("rejects missing/foreign report scope %j", patch =>
    expect(() => readPlan({ ...report, ...patch } as never, f)).toThrow(),
  );
  it.each([
    { countCompletion: 2 },
    { quotaRatio: -1 },
    { durationCompletion: "" },
    { estimateCoverage: NaN },
    { componentCount: 1.5 },
    { accuracy: {} },
    { fixedStarts: null },
  ])("rejects malformed metrics %j", patch => expect(() => readPlanMetrics({ ...empty, ...patch } as never)).toThrow());
  it.each([
    { date: "2026-10-16" },
    { planTimeZoneId: undefined },
    { planTimeZoneId: "Mars" },
    { dailyPlanId: undefined },
    { deferReasons: [{ reasonAvailable: true, reason: null, count: 1 }] },
  ])("rejects mismatched daily review %j", patch =>
    expect(() => readReview({ ...day, ...patch } as never, date)).toThrow(),
  );
});
describe("read-only estimate suggestion", () => {
  it("preserves a whole-population median instead of recomputing from the last20 preview", () => {
    const s = {
      ...suggestion,
      sampleCount: 21,
      samples: Array.from({ length: 20 }, (_, i) => sample(i + 1)),
      suggestedSeconds: 999,
    };
    expect(readSuggestion(s, f)).toBe(s);
    expect(s.suggestedSeconds).toBe(999);
  });
  it("represents insufficient samples and no context explicitly without fallback", () => {
    expect(
      readSuggestion(
        {
          ...suggestion,
          sampleCount: 2,
          samples: suggestion.samples.slice(0, 2),
          suggestedSeconds: null,
          unavailableReason: "insufficient_samples",
        },
        f,
      ).comparisonContext,
    ).toBe("Category");
    expect(
      readSuggestion(
        {
          ...suggestion,
          comparisonContext: "None",
          contextId: null,
          sampleCount: 0,
          samples: [],
          suggestedSeconds: null,
          unavailableReason: "no_comparable_context",
        },
        f,
      ).suggestedSeconds,
    ).toBeNull();
  });
  it.each([
    { applied: true },
    { applied: "false" },
    { taskId: context },
    { method: "ClientMedian" },
    { suggestedSeconds: 0 },
    { sampleCount: 2 },
    { suggestedSeconds: null },
    { unavailableReason: "insufficient_samples" },
    { contextId: null },
    { sampleLimit: 21 },
    { samples: [] },
    { samples: [sample(1), sample(1), sample(2)] },
    { samples: [{ ...sample(1), taskId: task }, sample(2), sample(3)] },
  ])("rejects malformed/unsafe recommendation %j", patch =>
    expect(() => readSuggestion({ ...suggestion, ...patch } as never, f)).toThrow(),
  );
});

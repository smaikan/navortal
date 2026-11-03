import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { day, duration, readFilters } from "./model";
export type Plan = components["schemas"]["PlanAnalyticsView"];
export type Review = components["schemas"]["PlanAnalyticsDay"];
export type PlanMetrics = components["schemas"]["PlanMetrics"];
export type Suggestion = components["schemas"]["EstimateSuggestionView"];
export type PlanFilters = {
  fromDate: string;
  toDate: string;
  startToleranceSeconds: number;
  reviewDate: string | null;
  suggestionTask: string | null;
};
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const numeric = (v: unknown) =>
  (typeof v === "number" || (typeof v === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))) &&
  Number.isFinite(Number(v));
const positive = (v: unknown) => numeric(v) && Number(v) >= 0;
const integer = (v: unknown) => positive(v) && Number.isSafeInteger(Number(v));
const version = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
const ratio = (v: unknown) => v === null || (positive(v) && Number(v) <= 1);
const nullable = (v: unknown, predicate = positive) => v === null || predicate(v);
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
function invalid(): never {
  throw new ApiError("protocol", "Plan analizi yanıtı eksik veya seçilen raporla uyumsuz. Yeniden oku.");
}
export function planFilters(params: URLSearchParams, today: string): PlanFilters {
  for (const key of ["fromDate", "toDate", "startToleranceSeconds", "reviewDate", "suggestionTask"])
    if (params.getAll(key).length > 1) throw new RangeError("Aynı plan analizi filtresi birden fazla verilmiş.");
  const range = new URLSearchParams();
  for (const key of ["fromDate", "toDate"]) if (params.has(key)) range.set(key, params.get(key)!);
  const { fromDate, toDate } = readFilters(range, today),
    tolerance = params.get("startToleranceSeconds") ?? "60",
    reviewDate = params.get("reviewDate"),
    suggestionTask = params.get("suggestionTask");
  if (!/^(0|[1-9]\d*)$/.test(tolerance) || Number(tolerance) > 3600)
    throw new RangeError("Başlangıç toleransı 0–3600 saniye olmalı.");
  if (reviewDate !== null && (!day(reviewDate) || reviewDate < fromDate || reviewDate > toDate))
    throw new RangeError("Gün özeti seçilen rapor aralığında olmalı.");
  if (suggestionTask !== null && !id(suggestionTask))
    throw new RangeError("Tahmin önerisi için geçerli bir görev seç.");
  return { fromDate, toDate, startToleranceSeconds: Number(tolerance), reviewDate, suggestionTask };
}
export function planUrl(f: PlanFilters) {
  const params = new URLSearchParams({
    fromDate: f.fromDate,
    toDate: f.toDate,
    startToleranceSeconds: String(f.startToleranceSeconds),
  });
  if (f.reviewDate) params.set("reviewDate", f.reviewDate);
  if (f.suggestionTask) params.set("suggestionTask", f.suggestionTask);
  return `/analytics/plan?${params}`;
}
function delay(d: PlanMetrics["fixedStarts"]) {
  if (
    !d ||
    ![d.sampleCount, d.lateCount, d.earlyCount, d.onTimeCount].every(integer) ||
    !nullable(d.averageSignedDelaySeconds, numeric) ||
    !nullable(d.averageLateSeconds)
  )
    invalid();
}
export function readPlanMetrics(m: PlanMetrics) {
  if (
    !m ||
    ![
      m.plannedWorkSeconds,
      m.conflictingPlannedSeconds,
      m.knownEstimatedSeconds,
      m.knownCompletedEstimatedSeconds,
      m.quotaSeconds,
      m.quotaFulfilledSeconds,
      m.unplannedActualSeconds,
    ].every(positive) ||
    ![
      m.componentCount,
      m.completedComponentCount,
      m.unknownCompletionCount,
      m.unknownEstimateCount,
      m.conflictingEstimateCount,
      m.missingSnapshotBlockCount,
    ].every(integer) ||
    ![m.countCompletion, m.durationCompletion, m.estimateCoverage, m.quotaRatio].every(ratio)
  )
    invalid();
  const a = m.accuracy;
  if (
    !a ||
    ![a.sampleCount, a.excludedWithoutRecordedWorkCount].every(integer) ||
    !nullable(a.meanErrorSeconds, numeric) ||
    !nullable(a.meanAbsoluteErrorSeconds)
  )
    invalid();
  delay(m.fixedStarts);
  delay(m.flexibleStarts);
  return m;
}
export function readReview(r: Review, date: string) {
  if (
    !r ||
    r.date !== date ||
    typeof r.planTimeZoneId !== "string" ||
    !r.planTimeZoneId ||
    !nullableId(r.dailyPlanId) ||
    !nullableId(r.baselineRevisionId) ||
    !nullableId(r.currentRevisionId) ||
    !positive(r.actualSeconds) ||
    ![r.revisionCount, r.deferCount].every(integer) ||
    !Array.isArray(r.revisionReasons) ||
    !Array.isArray(r.deferReasons)
  )
    invalid();
  try {
    Temporal.Now.zonedDateTimeISO(r.planTimeZoneId);
  } catch {
    invalid();
  }
  for (const reason of r.revisionReasons)
    if (!reason || typeof reason.trigger !== "string" || typeof reason.reason !== "string" || !integer(reason.count))
      invalid();
  for (const reason of r.deferReasons)
    if (
      !reason ||
      typeof reason.reasonAvailable !== "boolean" ||
      !(reason.reason === null || typeof reason.reason === "string") ||
      !integer(reason.count) ||
      (reason.reasonAvailable && !reason.reason?.trim())
    )
      invalid();
  readPlanMetrics(r.baseline);
  readPlanMetrics(r.current);
  return r;
}
export function readPlan(r: Plan, f: PlanFilters) {
  if (
    !r ||
    r.fromDate !== f.fromDate ||
    r.toDate !== f.toDate ||
    !instant(r.serverNow) ||
    !version(r.planningVersion) ||
    r.actualTimeZonePolicy !== "SourceSessionZone" ||
    !integer(r.startToleranceSeconds) ||
    Number(r.startToleranceSeconds) !== f.startToleranceSeconds ||
    !positive(r.actualSeconds) ||
    ![r.revisionCount, r.deferCount, r.legacyZoneDeferCount].every(integer) ||
    !Array.isArray(r.days) ||
    r.days.length !== Temporal.PlainDate.from(f.fromDate).until(f.toDate).days + 1
  )
    invalid();
  readPlanMetrics(r.baseline);
  readPlanMetrics(r.current);
  r.days.forEach((row, i) => readReview(row, Temporal.PlainDate.from(f.fromDate).add({ days: i }).toString()));
  return r;
}
export const contexts = {
  RecurrenceTemplate: "Tekrar şablonu",
  Category: "Kategori",
  Project: "Proje",
  None: "Karşılaştırma bağlamı yok",
};
export function readSuggestion(s: Suggestion, f: PlanFilters) {
  if (
    !s ||
    s.taskId !== f.suggestionTask ||
    s.fromDate !== f.fromDate ||
    s.toDate !== f.toDate ||
    s.applied !== false ||
    s.method !== "MedianCompletedComparableActual" ||
    !Object.hasOwn(contexts, s.comparisonContext) ||
    ![s.sampleCount, s.excludedWithoutWorkCount, s.excludedUnknownZoneCount].every(integer) ||
    !instant(s.serverNow) ||
    !integer(s.sampleLimit) ||
    Number(s.sampleLimit) !== 20 ||
    !Array.isArray(s.samples) ||
    s.samples.length !== Math.min(Number(s.sampleCount), 20) ||
    !nullableId(s.contextId)
  )
    invalid();
  if (
    s.suggestedSeconds === null
      ? !["no_comparable_context", "insufficient_samples"].includes(s.unavailableReason ?? "")
      : !positive(s.suggestedSeconds) ||
        Number(s.suggestedSeconds) === 0 ||
        Number(s.sampleCount) < 3 ||
        s.unavailableReason !== null
  )
    invalid();
  if (
    s.comparisonContext === "None"
      ? s.contextId !== null ||
        s.unavailableReason !== "no_comparable_context" ||
        Number(s.sampleCount) !== 0 ||
        s.suggestedSeconds !== null
      : !id(s.contextId) ||
        (Number(s.sampleCount) < 3
          ? s.suggestedSeconds !== null || s.unavailableReason !== "insufficient_samples"
          : s.suggestedSeconds === null)
  )
    invalid();
  const seen = new Set<string>();
  for (const sample of s.samples) {
    if (
      !sample ||
      !id(sample.taskId) ||
      sample.taskId === s.taskId ||
      seen.has(sample.taskId) ||
      typeof sample.title !== "string" ||
      !sample.title.trim() ||
      !instant(sample.completedAt) ||
      !positive(sample.actualSeconds) ||
      Number(sample.actualSeconds) === 0 ||
      !(sample.estimatedSeconds === null || version(sample.estimatedSeconds))
    )
      invalid();
    seen.add(sample.taskId);
  }
  return s;
}
export function percent(value: number | string | null) {
  return value === null
    ? "— (payda veya kapsam yok)"
    : `%${(Number(value) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}
export function signedDuration(value: number | string | null) {
  return value === null
    ? "— (örnek yok)"
    : `${Number(value) < 0 ? "−" : Number(value) > 0 ? "+" : ""}${duration(Math.abs(Number(value)))}`;
}
export function planFailure(e: unknown) {
  if (e instanceof ApiError && e.status === 404) return "Görev bulunamadı veya bu hesaba ait değil.";
  if (e instanceof ApiError && e.kind === "protocol") return e.message;
  return null;
}

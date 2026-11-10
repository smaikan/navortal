import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";

export type Actual = components["schemas"]["ActualAnalyticsView"];
export type Breakdown = components["schemas"]["ActualBreakdownPage"];
export type Metrics = components["schemas"]["ActualMetrics"];
export const buckets = { Day: "Günlük", Week: "Haftalık", Month: "Aylık" };
export const dimensions = { Task: "Görev", Project: "Proje", Category: "Kategori" };
export const pageSize = 25;
export type Filters = {
  fromDate: string;
  toDate: string;
  bucket: Actual["bucket"];
  dimension: Breakdown["dimension"];
  offset: number;
};
const own = (map: object, key: string) => Object.hasOwn(map, key);
export function day(value: unknown): value is string {
  try {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number(value.slice(0, 4)) >= 2 &&
      Number(value.slice(0, 4)) <= 9998 &&
      Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}
export function readFilters(params: URLSearchParams, today: string): Filters {
  for (const key of ["fromDate", "toDate", "bucket", "dimension", "offset"])
    if (params.getAll(key).length > 1) throw new RangeError("Aynı rapor filtresi birden fazla kez verilmiş.");
  const fromDate = params.get("fromDate") ?? Temporal.PlainDate.from(today).subtract({ days: 6 }).toString(),
    toDate = params.get("toDate") ?? today;
  if (!day(fromDate) || !day(toDate) || fromDate > toDate || Temporal.PlainDate.from(fromDate).until(toDate).days > 365)
    throw new RangeError("Başlangıç ve bitiş dahil 1–366 gün seç. Başlangıç bitişten sonra olamaz.");
  const bucket = params.get("bucket") ?? "Day",
    dimension = params.get("dimension") ?? "Task",
    rawOffset = params.get("offset") ?? "0";
  if (
    !own(buckets, bucket) ||
    !own(dimensions, dimension) ||
    !/^(0|[1-9]\d*)$/.test(rawOffset) ||
    Number(rawOffset) > 100000
  )
    throw new RangeError("Geçerli gruplama, kırılım ve sayfa seç.");
  return {
    fromDate,
    toDate,
    bucket: bucket as Filters["bucket"],
    dimension: dimension as Filters["dimension"],
    offset: Number(rawOffset),
  };
}
export function reportUrl(f: Filters) {
  return `/analytics?${new URLSearchParams({ fromDate: f.fromDate, toDate: f.toDate, bucket: f.bucket, dimension: f.dimension, offset: String(f.offset) })}`;
}
function invalid(): never {
  throw new ApiError("protocol", "Analiz yanıtı eksik veya seçilen raporla uyumsuz. Raporu yeniden oku.");
}
const decimal = (v: unknown) =>
  (typeof v === "number" || (typeof v === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0;
const integer = (v: unknown) => decimal(v) && Number.isSafeInteger(Number(v));
const version = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
const zones = (v: unknown) =>
  Array.isArray(v) &&
  v.every(z => {
    try {
      return typeof z === "string" && !!Temporal.Now.zonedDateTimeISO(z);
    } catch {
      return false;
    }
  });
function metrics(m: Metrics) {
  if (
    !m ||
    ![m.workSeconds, m.taskWorkSeconds, m.generalWorkSeconds, m.manualWorkSeconds, m.missingSnapshotSeconds].every(
      decimal,
    ) ||
    ![m.sessionCount, m.segmentCount].every(integer)
  )
    invalid();
  const f = m.focus;
  if (
    !f ||
    ![f.activeSeconds, f.overtimeSeconds].every(decimal) ||
    ![f.activeCycleCount, f.startedCount, f.finishedCount, f.effectiveTargetsReached, f.recordedTargetsReached].every(
      integer,
    ) ||
    !(f.averageActiveSeconds === null || decimal(f.averageActiveSeconds))
  )
    invalid();
}
export function readActual(r: Actual, f: Pick<Filters, "fromDate" | "toDate" | "bucket">) {
  if (
    !r ||
    r.fromDate !== f.fromDate ||
    r.toDate !== f.toDate ||
    r.bucket !== f.bucket ||
    !integer(r.weekStartsOn) ||
    Number(r.weekStartsOn) > 6 ||
    r.timeZonePolicy !== "SourceSessionZone" ||
    !version(r.planningVersion) ||
    !instant(r.serverNow) ||
    !zones(r.sourceTimeZones) ||
    !Array.isArray(r.buckets) ||
    r.buckets.length > 366 ||
    !r.buckets.length
  )
    invalid();
  metrics(r.totals);
  let previous = "";
  for (const b of r.buckets) {
    if (
      !b ||
      !day(b.bucketStart) ||
      b.bucketStart <= previous ||
      !day(b.fromDate) ||
      !day(b.toDate) ||
      b.fromDate < f.fromDate ||
      b.toDate > f.toDate ||
      b.fromDate > b.toDate ||
      b.bucketStart > b.fromDate ||
      !zones(b.sourceTimeZones)
    )
      invalid();
    metrics(b.metrics);
    previous = b.bucketStart;
  }
  return r;
}
export function readBreakdown(r: Breakdown, f: Pick<Filters, "fromDate" | "toDate" | "dimension" | "offset">) {
  if (
    !r ||
    r.fromDate !== f.fromDate ||
    r.toDate !== f.toDate ||
    r.dimension !== f.dimension ||
    r.timeZonePolicy !== "SourceSessionZone" ||
    !instant(r.serverNow) ||
    !decimal(r.totalWorkSeconds) ||
    !integer(r.total) ||
    !integer(r.offset) ||
    Number(r.offset) !== f.offset ||
    Number(r.limit) !== pageSize ||
    !Array.isArray(r.items) ||
    r.items.length > pageSize ||
    r.items.length > Math.max(0, Number(r.total) - f.offset)
  )
    invalid();
  const seen = new Set<string>();
  for (const item of r.items) {
    if (
      !item ||
      !(item.id === null || (typeof item.id === "string" && validTaskId(item.id))) ||
      typeof item.label !== "string" ||
      !item.label.trim() ||
      typeof item.snapshotAvailable !== "boolean" ||
      !decimal(item.workSeconds) ||
      !integer(item.sessionCount)
    )
      invalid();
    // Aynı kaydın eski başlığı geçmişte farklı olabilir, bu normal.
    const key = JSON.stringify([item.id, item.label, item.snapshotAvailable]);
    if (seen.has(key)) invalid();
    seen.add(key);
  }
  return r;
}
export function duration(value: number | string | null) {
  if (value === null) return "— (örnek yok)";
  const seconds = Number(value);
  if (seconds === 0) return "0 sn";
  if (seconds < 1) return "1 sn’den az";
  const whole = Math.floor(seconds),
    h = Math.floor(whole / 3600),
    m = Math.floor((whole % 3600) / 60),
    s = whole % 60;
  return [h && `${h} sa`, m && `${m} dk`, s && `${s} sn`].filter(Boolean).join(" ");
}
export function analyticsFailure(e: unknown) {
  if (e instanceof ApiError && e.status === 409 && e.code === "analytics_range_too_dense")
    return "Bu aralık 50.000 kaynak sınırını aşıyor. Daha kısa bir tarih aralığı seç; kısmi toplam gösterilmedi.";
  if (e instanceof ApiError && e.status === 400)
    return "Tarih aralığını ve gruplamayı kontrol et. En çok 366 gün seçebilirsin.";
  if (e instanceof ApiError && ["offline", "protocol"].includes(e.kind)) return e.message;
  return "Rapor okunamadı. Bağlantını kontrol edip yeniden dene.";
}

/** Ölçülen çalışma ile sayaçsız tamamlanan tahminler ayrı kaynaklardır. */
export const accountedSeconds = (m: { workSeconds: number | string; estimatedCompletedSeconds?: number | string }) =>
  Number(m.workSeconds) + Number(m.estimatedCompletedSeconds ?? 0);

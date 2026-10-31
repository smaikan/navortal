import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { resolveWallTime, type WallChoice } from "../../lib/time/wall-time";
import { readWork, workFailure, type Segment, type Work } from "./model";

export type Correction = components["schemas"]["CorrectionView"];
export const workPageSize = 25;
export const correctionPageSize = 50;
export const reasonLimit = 2000;
export const workStates = ["Running", "Paused", "Finished", "Canceled"] as const;
export const sourceLabels: Record<string, string> = { Timer: "Sayaç", Manual: "Manuel kayıt" };
export const correctionKinds: Record<string, string> = { ManualAdded: "Manuel eklendi", Adjusted: "Düzeltildi" };

const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value);
const integer = (value: unknown, min = 0) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= min
    : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) >= BigInt(min);
function invalid(): never {
  throw new ApiError("protocol", "Çalışma kaydı yanıtı eksik veya geçersiz. Yeniden yükle.");
}
const segment = (value: Segment | null) =>
  !!value &&
  validTaskId(value.id) &&
  instant(value.startedAt) &&
  (value.endedAt === null || instant(value.endedAt)) &&
  typeof value.isVoided === "boolean" &&
  integer(value.version, 1);

export function readWorkPage(value: components["schemas"]["WorkPage"]) {
  if (!value || !Array.isArray(value.items) || !integer(value.total) || value.items.length > 100) invalid();
  return { items: value.items.map(readWork), total: Number(value.total) };
}
export function readCorrections(value: components["schemas"]["CorrectionPage"]) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    value.items.length > 100 ||
    !value.items.every(
      item =>
        item &&
        validTaskId(item.id) &&
        integer(item.sequence, 1) &&
        typeof item.kind === "string" &&
        typeof item.reason === "string" &&
        instant(item.createdAt) &&
        segment(item.newValues) &&
        (item.previousValues === null || segment(item.previousValues)),
    )
  )
    invalid();
  return { items: value.items, total: Number(value.total) };
}

/** Anı cihazın değil oturumun saat diliminde gösteriyoruz. Saniyeler korunur, :00 tarayıcı gibi atılır. */
export function localInput(value: string, zone: string) {
  return Temporal.Instant.from(value)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "second" })
    .replace(/:00$/, "");
}
export type RangeDraft = { start: string; end: string; startChoice: WallChoice; endChoice: WallChoice; reason: string };
export const emptyRange: RangeDraft = { start: "", end: "", startChoice: "", endChoice: "", reason: "" };

/** Yalnız alan kontrolü. Çakışma, gelecek zaman ve sahiplikte sunucu otorite. */
export function rangeBody(draft: RangeDraft, zone: string, openEnd: boolean) {
  if (!draft.start) throw new RangeError("Başlangıç zamanını gir.");
  if (!draft.end && !openEnd) throw new RangeError("Bitiş zamanını gir.");
  const startedAt = resolveWallTime(draft.start, zone, draft.startChoice);
  const endedAt = draft.end ? resolveWallTime(draft.end, zone, draft.endChoice) : null;
  if (
    endedAt !== null &&
    Temporal.Instant.compare(Temporal.Instant.from(endedAt), Temporal.Instant.from(startedAt)) <= 0
  )
    throw new RangeError("Bitiş başlangıçtan sonra olmalı.");
  const reason = draft.reason.trim();
  if (!reason || reason.length > reasonLimit)
    throw new RangeError(`Neden gerekli; en çok ${reasonLimit} karakter olabilir.`);
  return { startedAt, endedAt, reason };
}

export function correctionFailure(error: unknown) {
  if (error instanceof RangeError) return error.message;
  if (error instanceof ApiError && !error.outcomeUnknown) {
    const messages: Record<string, string> = {
      work_overlap: "Bu aralık başka bir gerçek çalışmayla çakışıyor. Saatleri değiştir; taslağın korundu.",
      work_range_invalid:
        "Aralık geçersiz: gelecekte olamaz, bitiş başlangıçtan önce olamaz ve geçersiz sayılan aralık kapalı olmalı.",
      correction_cannot_resume:
        "Kapanmış bir aralık düzeltmeyle yeniden açılamaz. Çalışmaya dönmek için oynatıcıdaki “Devam et”i kullan.",
      correction_reason_required: `Neden gerekli; en çok ${reasonLimit} karakter olabilir.`,
      segment_not_found: "Bu aralık artık bulunamıyor. Güncel kayıt yüklendi.",
      version_conflict:
        "Kayıt başka bir sekmede veya cihazda değişti. Güncel aralıklar yüklendi; taslağın korundu, kontrol edip yeniden kaydet.",
      idempotency_conflict: "Bu kayıt isteği başka bir içerikle karıştı. Güncel kayıtları kontrol et.",
      direct_work_required: "Bu görevin kendi işi yok; manuel çalışmayı alt görevine ekle.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return workFailure(error);
}

/** Geçmiş satırında başlangıç–bitiş oturumun saat diliminde gösterilir. */
export function rangeText(value: Segment, zone: string) {
  const format = new Intl.DateTimeFormat("tr", { timeZone: zone, dateStyle: "short", timeStyle: "medium" });
  return `${format.format(new Date(value.startedAt))} – ${value.endedAt ? format.format(new Date(value.endedAt)) : "sürüyor"}${value.isVoided ? " (geçersiz)" : ""}`;
}
/** Gün başlığında yalnız saat yeterli. Gece yarısını geçen oturum tam aralıkla kalır. */
export function dayRangeText(value: Segment, zone: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  if (!value.endedAt || value.isVoided || day.format(new Date(value.startedAt)) !== day.format(new Date(value.endedAt)))
    return rangeText(value, zone);
  const time = new Intl.DateTimeFormat("tr", { timeZone: zone, hour: "2-digit", minute: "2-digit" });
  return `${time.format(new Date(value.startedAt))}–${time.format(new Date(value.endedAt))}`;
}
export type { Work };

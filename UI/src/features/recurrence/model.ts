import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { localDate } from "../notes/model";
export type Template = components["schemas"]["RecurrenceTemplateView"];
export type Definition = components["schemas"]["RecurrenceDefinitionView"];
export type Occurrence = components["schemas"]["OccurrenceView"];
export type Effect = components["schemas"]["RecurrenceEffect"];
export type Rule = Template["rule"];
export type Projection = components["schemas"]["RecurrenceProjectionView"];
export type ProjectionItem = Projection["items"][number];
export const pageSize = 25;
export const frequencies = {
  Daily: "Her gün",
  IntervalDays: "Belirli gün aralığı",
  Weekly: "Haftalık",
  Monthly: "Aylık",
};
export const weekDays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
/** Hafta Pazartesi başlar; API değerleri 0 = Pazar … 6 = Cumartesi kalır. */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0];
export const weekShort = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const weekPresets = [
  { key: "weekdays", label: "Hafta içi", days: [1, 2, 3, 4, 5] },
  { key: "weekend", label: "Hafta sonu", days: [6, 0] },
  { key: "all", label: "Her gün", days: [1, 2, 3, 4, 5, 6, 0] },
];
export const noDaysMessage = "En az bir gün seç.";
export function sameDays(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && b.every(x => a.includes(x));
}
/** Yalnız seçimin okunur özeti. Sonraki tarih burada hesaplanmaz. */
export function weekDaySummary(days: readonly number[]) {
  const sel = weekOrder.filter(d => days.includes(d));
  const preset = weekPresets.find(p => sameDays(sel, p.days));
  return preset ? preset.label : sel.map(d => weekShort[d]).join(", ");
}
export function weekDayNames(days: readonly number[]) {
  const names = weekOrder.filter(d => days.includes(d)).map(d => weekDays[d]);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}`;
}
/** Başlangıç gününün haftanın günü (0 = Pazar). Yalnız arayüz varsayılanıdır. */
export function weekdayOf(date: string) {
  try {
    return Temporal.PlainDate.from(date).dayOfWeek % 7;
  } catch {
    return null;
  }
}
export const gaps = { Reject: "İşlemi reddet", Skip: "O günü atla", ShiftForward: "İlk geçerli dakikaya ilerlet" };
export const overlaps = { Reject: "İşlemi reddet", Earlier: "İlk oluşum", Later: "İkinci oluşum" };
export const monthEnds = { Skip: "O ayı atla", ClampToLastDay: "Ayın son gününü kullan" };
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" &&
      /^(0|[1-9]\d*)$/.test(v) &&
      BigInt(v) >= BigInt(min) &&
      BigInt(v) <= 9223372036854775807n;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
const member = (v: unknown, values: object) => typeof v === "string" && Object.hasOwn(values, v);
function invalid(): never {
  throw new ApiError("protocol", "Tekrar yanıtı doğrulanamadı. Güncel kayıtları yeniden oku.");
}
export function windowDates(fromDate: string, toDate: string) {
  localDate(fromDate);
  localDate(toDate);
  const days = Temporal.PlainDate.from(fromDate).until(toDate).days;
  if (days < 0 || days > 92) throw new RangeError("Başlangıç ve bitiş dahil 1–93 günlük aralık seç.");
  return { fromDate, toDate };
}
export function validRule(r: Rule) {
  try {
    localDate(r.startDate);
    if (r.untilDate != null && localDate(r.untilDate) < r.startDate) return false;
    if (!r.timeZoneId || r.timeZoneId.length > 100 || (r.timeZoneId !== "UTC" && !r.timeZoneId.includes("/")))
      return false;
    Temporal.Now.zonedDateTimeISO(r.timeZoneId);
    if (
      !member(r.frequency, frequencies) ||
      !member(r.gap, gaps) ||
      !member(r.overlap, overlaps) ||
      !integer(r.interval, 1)
    )
      return false;
    if (r.dueTime != null && !/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(r.dueTime)) return false;
    if (r.startTime != null && !/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(r.startTime)) return false;
    if (r.autoAddToPlan != null && typeof r.autoAddToPlan !== "boolean") return false;
    const days = r.weekDays ?? [];
    if (!Array.isArray(days)) return false;
    if (r.frequency === "Weekly")
      return (
        Number(r.interval) <= 52 &&
        days.length >= 1 &&
        days.length <= 7 &&
        days.every(d => integer(d) && Number(d) <= 6) &&
        new Set(days.map(Number)).size === days.length &&
        r.monthDay == null &&
        r.monthEnd == null
      );
    if (days.length) return false;
    if (r.frequency === "Monthly")
      return (
        Number(r.interval) <= 24 &&
        integer(r.monthDay, 1) &&
        Number(r.monthDay) <= 31 &&
        (r.monthEnd == null ? Number(r.monthDay) <= 28 : member(r.monthEnd, monthEnds))
      );
    return (
      r.monthDay == null &&
      r.monthEnd == null &&
      (r.frequency === "Daily" ? Number(r.interval) === 1 : Number(r.interval) <= 366)
    );
  } catch {
    return false;
  }
}
function validTask(t: Template["task"]) {
  return (
    !!t &&
    typeof t.title === "string" &&
    !!t.title.trim() &&
    t.title.length <= 300 &&
    (t.description == null || (typeof t.description === "string" && t.description.length <= 10000)) &&
    (t.estimatedSeconds == null || integer(t.estimatedSeconds)) &&
    member(t.priority, { Low: 1, Normal: 1, High: 1, Urgent: 1 }) &&
    typeof t.canSplit === "boolean" &&
    (t.poolId == null || id(t.poolId)) &&
    (t.energyDemand == null || member(t.energyDemand, { Low: 1, Medium: 1, High: 1 }))
  );
}
export function readTemplate(t: Template, expected?: string): Template {
  if (
    !t ||
    !id(t.id) ||
    (expected && t.id !== expected) ||
    !id(t.definitionId) ||
    !integer(t.version, 1) ||
    !integer(t.definitionNumber, 1) ||
    typeof t.enabled !== "boolean" ||
    !validRule(t.rule) ||
    !validTask(t.task) ||
    !instant(t.createdAt)
  )
    invalid();
  try {
    localDate(t.effectiveFrom);
  } catch {
    invalid();
  }
  return t;
}
export function readDefinition(d: Definition): Definition {
  if (!d || !id(d.id) || !integer(d.number, 1) || !validRule(d.rule) || !validTask(d.task) || !instant(d.createdAt))
    invalid();
  try {
    localDate(d.effectiveFrom);
  } catch {
    invalid();
  }
  return d;
}
export function readOccurrence(o: Occurrence, templateId?: string): Occurrence {
  if (
    !o ||
    !id(o.id) ||
    !id(o.templateId) ||
    (templateId && o.templateId !== templateId) ||
    ![o.originalDefinitionId, o.appliedDefinitionId].every(id) ||
    !member(o.state, { Materialized: 1, Skipped: 1, Canceled: 1 }) ||
    typeof o.timeAdjusted !== "boolean" ||
    typeof o.taskChangedSinceSync !== "boolean" ||
    !(o.reason === null || typeof o.reason === "string") ||
    !(o.originalDueAt === null || instant(o.originalDueAt))
  )
    invalid();
  if (
    o.taskId === null
      ? o.taskState !== null || o.taskVersion !== null || o.state === "Materialized"
      : !id(o.taskId) ||
        !integer(o.taskVersion, 1) ||
        !member(o.taskState, {
          Pending: 1,
          InProgress: 1,
          Paused: 1,
          Completed: 1,
          Deferred: 1,
          Skipped: 1,
          Canceled: 1,
        })
  )
    invalid();
  try {
    localDate(o.localDate);
    Temporal.Now.zonedDateTimeISO(o.originalTimeZoneId);
    if (
      !o.originalTimeZoneId ||
      (o.originalDueTime !== null && !/^([01]\d|2[0-3]):[0-5]\d:00(?:\.0+)?$/.test(o.originalDueTime))
    )
      invalid();
  } catch {
    invalid();
  }
  return o;
}
export function readPage<T>(
  p: { items: T[]; offset: number | string; limit: number | string; total: number | string },
  offset: number,
  decode: (v: T) => T,
  key: (v: T) => string,
) {
  if (
    !p ||
    !Array.isArray(p.items) ||
    p.items.length > pageSize ||
    !integer(p.offset) ||
    Number(p.offset) !== offset ||
    Number(p.limit) !== pageSize ||
    !integer(p.total) ||
    Number(p.total) < p.items.length ||
    (p.items.length && Number(p.total) < offset + p.items.length)
  )
    invalid();
  const items = p.items.map(decode);
  if (new Set(items.map(key)).size !== items.length) invalid();
  return { items, total: Number(p.total), offset };
}
export function readProjection(p: Projection, from: string, to: string): Projection {
  if (!p || p.fromDate !== from || p.toDate !== to || !Array.isArray(p.items)) invalid();
  for (const item of p.items)
    if (
      !id(item.templateId) ||
      !integer(item.templateVersion) ||
      typeof item.title !== "string" ||
      item.localDate < from ||
      item.localDate > to
    )
      invalid();
  return p;
}
export function readEffect(e: Effect, expected?: string): Effect {
  if (
    !e ||
    !integer(e.planningVersion) ||
    typeof e.replayed !== "boolean" ||
    !Array.isArray(e.occurrences) ||
    e.occurrences.length > 93 ||
    ![e.refreshedTaskIds, e.protectedTaskIds].every(
      a => Array.isArray(a) && a.length <= 93 && a.every(id) && new Set(a).size === a.length,
    )
  )
    invalid();
  readTemplate(e.template, expected);
  e.occurrences.forEach(o => readOccurrence(o, e.template.id));
  if (
    new Set(e.occurrences.map(o => o.localDate)).size !== e.occurrences.length ||
    e.refreshedTaskIds.some(x => e.protectedTaskIds.includes(x))
  )
    invalid();
  return e;
}
export type Draft = {
  title: string;
  description: string;
  estimatedSeconds: string;
  priority: NonNullable<Template["task"]["priority"]>;
  canSplit: boolean;
  poolId: string;
  energyDemand: string;
  startDate: string;
  timeZoneId: string;
  frequency: keyof typeof frequencies;
  interval: string;
  weekDays: number[];
  monthDay: string;
  monthEnd: string;
  untilDate: string;
  dueTime: string;
  startTime: string;
  autoAddToPlan: boolean;
  gap: keyof typeof gaps;
  overlap: keyof typeof overlaps;
};
export function draftTemplate(zone: string, date: string, t?: Template): Draft {
  const r = t?.rule,
    f = t?.task;
  return {
    title: f?.title ?? "",
    description: f?.description ?? "",
    estimatedSeconds: f?.estimatedSeconds == null ? "" : String(f.estimatedSeconds),
    priority: f?.priority ?? "Normal",
    canSplit: f?.canSplit ?? true,
    poolId: f?.poolId ?? "",
    energyDemand: f?.energyDemand ?? "",
    startDate: r?.startDate ?? date,
    timeZoneId: r?.timeZoneId ?? zone,
    frequency: r?.frequency ?? "Daily",
    interval: String(r?.interval ?? 1),
    weekDays: r?.weekDays?.map(Number) ?? [],
    monthDay: String(r?.monthDay ?? 1),
    monthEnd: r?.monthEnd ?? "",
    untilDate: r?.untilDate ?? "",
    dueTime: r?.dueTime?.slice(0, 5) ?? "",
    startTime: r?.startTime?.slice(0, 5) ?? "",
    autoAddToPlan: r?.autoAddToPlan ?? false,
    gap: r?.gap ?? "Reject",
    overlap: r?.overlap ?? "Reject",
  };
}
export function templateFields(d: Draft) {
  const rule: Rule = {
    startDate: d.startDate,
    timeZoneId: d.timeZoneId.trim(),
    frequency: d.frequency,
    interval: d.frequency === "Daily" ? 1 : Number(d.interval),
    weekDays: d.frequency === "Weekly" ? d.weekDays : [],
    monthDay: d.frequency === "Monthly" ? Number(d.monthDay) : null,
    monthEnd: d.frequency === "Monthly" ? (d.monthEnd as Rule["monthEnd"]) || null : null,
    untilDate: d.untilDate || null,
    dueTime: d.dueTime ? `${d.dueTime}:00` : null,
    startTime: d.startTime ? `${d.startTime}:00` : null,
    autoAddToPlan: d.autoAddToPlan,
    gap: d.gap,
    overlap: d.overlap,
  };
  const task: Template["task"] = {
    title: d.title.trim(),
    description: d.description || null,
    estimatedSeconds: d.estimatedSeconds === "" ? null : d.estimatedSeconds,
    priority: d.priority,
    canSplit: d.canSplit,
    poolId: d.poolId || null,
    energyDemand: (d.energyDemand as Template["task"]["energyDemand"]) || null,
  };
  if (d.frequency === "Weekly" && !d.weekDays.length) throw new RangeError(noDaysMessage);
  if (d.untilDate && d.untilDate < d.startDate) throw new RangeError("Bitiş tarihi başlangıç gününden önce olamaz.");
  if (!validRule(rule))
    throw new RangeError("Tekrar tarihlerini, sıklığı ve ay sonu/yaz saati politikalarını kontrol et.");
  if (!validTask(task))
    throw new RangeError("Başlık 1–300 karakter, tahmin boş veya tam dakika olmalı. Görev alanlarını kontrol et.");
  return { rule, task };
}
export function ruleSummary(r: Rule) {
  const f = r.frequency!;
  return `${r.autoAddToPlan ? "Gün planlarına eklenir · " : ""}${r.startTime ? `Başlangıç ${r.startTime.slice(0, 5)} · ` : ""}${frequencies[f]}${f === "Daily" ? "" : ` · ${r.interval} ${f === "Weekly" ? "haftada" : f === "Monthly" ? "ayda" : "günde"}`}${f === "Weekly" ? ` · ${weekDaySummary(r.weekDays!.map(Number))}` : ""}${f === "Monthly" ? ` · ayın ${r.monthDay}. günü${r.monthEnd ? ` · ${monthEnds[r.monthEnd]}` : ""}` : ""} · ${r.untilDate ? `${r.startDate}–${r.untilDate}` : `${r.startDate} tarihinden itibaren`}${r.dueTime ? ` · son teslim ${r.dueTime.slice(0, 5)}` : ""}`;
}
/** Liste ve başlık için kısa özet. Ayrıntılı metin ruleSummary'de kalır. */
export function shortSummary(r: Rule) {
  const f = r.frequency!;
  const every = Number(r.interval);
  const base =
    f === "Daily"
      ? "Her gün"
      : f === "Weekly"
        ? `${weekDaySummary(r.weekDays!.map(Number))}${every > 1 ? ` · ${every} haftada bir` : ""}`
        : f === "Monthly"
          ? `Ayın ${r.monthDay}. günü${every > 1 ? ` · ${every} ayda bir` : ""}`
          : `${every} günde bir`;
  const time = r.startTime ? r.startTime.slice(0, 5) : r.dueTime ? `son teslim ${r.dueTime.slice(0, 5)}` : "";
  return [base, time, r.untilDate ? `bitiş ${untilLabel(r.untilDate)}` : ""].filter(Boolean).join(" · ");
}
function untilLabel(date: string) {
  return new Intl.DateTimeFormat("tr", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
/** Görünen durum. Bitiş günü geçen rutin etkin olsa da artık yeni gün üretmez. */
export function routineState(t: Template, today: string) {
  if (!t.enabled) return "Pasif";
  return t.rule.untilDate && t.rule.untilDate < today ? "Sona erdi" : "Etkin";
}
/** Geçmiş görev listesi pencereleri: 0 = bugüne kadar son 25 gün, 1 = ondan önceki 25 gün… */
export function historyWindow(today: string, k: number) {
  const to = Temporal.PlainDate.from(today).subtract({ days: k * pageSize });
  return { from: to.subtract({ days: pageSize - 1 }).toString(), to: to.toString() };
}
export function dayLabel(localDate: string, today: string) {
  const text = new Intl.DateTimeFormat("tr", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T12:00:00Z`));
  return localDate === today ? `Bugün · ${text}` : text;
}
/** Oluşan görevin durumu. Yapılmayan geçmiş görev yargısız "Yapılmadı" der. */
export function occurrenceStatus(o: Occurrence, today: string): { text: string; tone: "done" | "missed" | "muted" } {
  if (o.state === "Skipped") return { text: "Atlandı", tone: "muted" };
  if (o.state === "Canceled") return { text: "İptal edildi", tone: "muted" };
  if (o.taskState === "Completed") return { text: "Yapıldı", tone: "done" };
  if (o.taskState === "Skipped") return { text: "Atlandı", tone: "muted" };
  if (o.taskState === "Canceled") return { text: "İptal edildi", tone: "muted" };
  if (o.localDate < today) return { text: "Yapılmadı", tone: "missed" };
  return { text: o.taskState === "Pending" || !o.taskState ? "Bekliyor" : "Sürüyor", tone: "muted" };
}
export function recurrenceFailure(e: unknown) {
  if (e instanceof RangeError) return e.message;
  if (e instanceof ApiError) {
    if (e.kind === "offline" || e.kind === "protocol") return e.message;
    if (e.outcomeUnknown)
      return "İşlemin sonucu alınamadı; kaydedilmiş olabilir. Aynı işlem kimliğiyle güvenle yeniden deneyebilir veya güncel kaydı okuyabilirsin.";
    const codes: Record<string, string> = {
      recurrence_disabled: "Şablon pasif; yeni görev üretilmez. Var olan görevler korunur.",
      recurrence_past_protected: "Geçmiş tarihler seri komutuyla değiştirilemez.",
      recurrence_history_protected: "Tamamlanmış veya arşivlenmiş görev korunur.",
      recurrence_local_time_invalid:
        "Seçilen son teslim saati bu saat diliminde yok veya iki kez oluşuyor. Yaz saati politikasını açıkça değiştir.",
      recurrence_window_invalid: "Başlangıç ve bitiş dahil 1–93 günlük aralık seç.",
      occurrence_invalid: "Bu tarih veya görev sürümü uygun değil. Güncel oluşumları oku.",
      pool_not_found: "Seçilen havuza erişilemiyor; güncel aktif havuz seç.",
    };
    if (e.code && codes[e.code]) return codes[e.code];
    if (e.status === 409) return "Şablon veya görev değişmiş. Seçimlerin korundu; güncel kaydı okuyup yeniden hazırla.";
    if (e.status === 404) return "Bu kayda bu hesapta erişilemiyor.";
    if (e.status === 400) return "Alanlar kabul edilmedi. Tarih, sıklık, sürüm ve görev seçimlerini kontrol et.";
  }
  return "Tekrar bilgisi alınamadı. Taslağın korundu; bağlantını kontrol et.";
}

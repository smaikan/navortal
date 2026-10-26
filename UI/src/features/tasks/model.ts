import { readCoverage } from "../workspace/read-coverage";
import type { components, paths } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";

export type Task = components["schemas"]["TaskView"];
export type TaskQuery = NonNullable<paths["/api/tasks"]["get"]["parameters"]["query"]>;
export const priorities = { Low: "Düşük", Normal: "Normal", High: "Yüksek", Urgent: "Acil" } as const;
export const states = {
  Pending: "Bekliyor",
  InProgress: "Çalışılıyor",
  Paused: "Duraklatıldı",
  Completed: "Tamamlandı",
  Deferred: "Ertelendi",
  Skipped: "Atlandı",
  Canceled: "İptal edildi",
} as const;
export const orders = { CreatedDesc: "En yeni", Title: "Başlık", Priority: "Öncelik", Deadline: "Son teslim" } as const;
export const pageSize = 25;
export const maxTaskOffset = 100000;
export function ownEstimate(task: Task) {
  if (!task.hasDirectWork) return "Kapsayıcı görev";
  if (task.directEstimatedSeconds === null) return "Kendi işinin tahmini belirtilmedi";
  const seconds = BigInt(task.directEstimatedSeconds);
  return `Kendi işi: ${seconds / 60n} dk${seconds % 60n ? ` ${seconds % 60n} sn` : ""}`;
}
const integer = (value: unknown, min = 0): boolean =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= min
    : typeof value === "string" &&
      /^\d+$/.test(value) &&
      BigInt(value) >= BigInt(min) &&
      BigInt(value) <= 9223372036854775807n;
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value);
const nullable = (value: unknown, check: (value: unknown) => boolean) => value === null || check(value);
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || value === null || check(value);
export const localDay = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
/** Kullandığımız veya gönderdiğimiz alanları kontrol ediyoruz. Üretilen required bilgisi çalışma zamanı doğrulaması değildir. */
export function readTask(value: Task): Task {
  if (
    !value ||
    !validTaskId(value.id) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 300 ||
    !nullable(value.description, v => typeof v === "string" && v.length <= 10000) ||
    !Object.hasOwn(priorities, value.priority) ||
    !Object.hasOwn(states, value.state) ||
    typeof value.canSplit !== "boolean" ||
    !nullable(value.deadlineAt, instant) ||
    !nullable(value.archivedAt, instant) ||
    !instant(value.updatedAt) ||
    !integer(value.version, 1) ||
    !nullable(value.directEstimatedSeconds, integer) ||
    typeof value.hasDirectWork !== "boolean" ||
    !nullable(value.targetBudgetSeconds, integer) ||
    typeof value.directWorkCompleted !== "boolean" ||
    typeof value.requiredForParent !== "boolean" ||
    !nullable(value.parentTaskId, v => typeof v === "string" && validTaskId(v)) ||
    !nullable(value.completedAt, instant) ||
    !nullable(value.completionOrigin, v => v === "Manual" || v === "Automatic") ||
    !optional(value.autoCompleteFromChildren, v => typeof v === "boolean") ||
    !optional(value.plannedFrom, localDay) ||
    !optional(value.plannedTo, localDay) ||
    ((value.plannedFrom ?? null) === null) !== ((value.plannedTo ?? null) === null)
  ) {
    throw new ApiError("protocol", "Görev yanıtı eksik veya geçersiz. Kaydetmeden önce yeniden yükle.");
  }
  return value;
}
export function readPage(value: components["schemas"]["TaskPage"]) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > 100 ||
    !integer(value.total) ||
    !integer(value.offset) ||
    !integer(value.limit, 1) ||
    Number(value.limit) > 100 ||
    value.items.length > Number(value.limit)
  )
    throw new ApiError("protocol", "Görev listesi eksik veya geçersiz.");
  readCoverage(value.coverage);
  return { ...value, items: value.items.map(readTask) };
}
export function titleIssue(title: string) {
  return !title.trim()
    ? "Bir görev başlığı yaz."
    : title.length > 300
      ? "Başlık en fazla 300 karakter olabilir."
      : undefined;
}
/** Süre aralıkları URL'de kısa adla durur. Sınırlar saniyedir ve kesişmez. */
export const estimateRanges = {
  short: { label: "30 dk ve altı", maxEstimateSeconds: 1800 },
  medium: { label: "30 dk – 1 sa", minEstimateSeconds: 1801, maxEstimateSeconds: 3600 },
  long: { label: "1 – 2 sa", minEstimateSeconds: 3601, maxEstimateSeconds: 7200 },
  extended: { label: "2 sa üstü", minEstimateSeconds: 7201 },
} as const;
/** API'ye yalnız geçerli filtre gider. İlgisiz URL bilgisi düzenlemede korunur. */
export function taskFilters(params: URLSearchParams): { query: TaskQuery; issue?: string } {
  const query: TaskQuery = { offset: 0, limit: pageSize };
  const search = params.get("search");
  if (search) {
    if (search.length > 200) return { query, issue: "Arama en fazla 200 karakter olabilir." };
    query.search = search;
  }
  for (const [key, values] of [
    ["priority", priorities],
    ["state", states],
    ["orderBy", orders],
    ["energyDemand", { Low: "Düşük", Medium: "Orta", High: "Yüksek" }],
  ] as const) {
    const value = params.get(key);
    if (value) {
      if (!Object.hasOwn(values, value))
        return { query, issue: "Bağlantıdaki filtre geçersiz. Filtreleri sıfırlayabilirsin." };
      Object.assign(query, { [key]: value });
    }
  }
  for (const key of ["includeCompleted", "includeArchived", "isPlanned"] as const) {
    const value = params.get(key);
    if (value !== null) {
      if (!["true", "false"].includes(value)) return { query, issue: "Bağlantıdaki filtre geçersiz." };
      query[key] = value === "true";
    }
  }
  for (const key of ["projectId", "poolId", "categoryId", "tagId"] as const) {
    const value = params.get(key);
    if (value) {
      if (!validTaskId(value)) return { query, issue: "Bağlantıdaki sınıflandırma filtresi geçersiz." };
      query[key] = value;
    }
  }
  const estimate = params.get("estimate");
  if (estimate) {
    if (!Object.hasOwn(estimateRanges, estimate))
      return { query, issue: "Bağlantıdaki filtre geçersiz. Filtreleri sıfırlayabilirsin." };
    const range: { minEstimateSeconds?: number; maxEstimateSeconds?: number } =
      estimateRanges[estimate as keyof typeof estimateRanges];
    query.minEstimateSeconds = range.minEstimateSeconds;
    query.maxEstimateSeconds = range.maxEstimateSeconds;
  }
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (dateFrom || dateTo) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFrom || !dateTo || !day.test(dateFrom) || !day.test(dateTo) || dateFrom > dateTo)
      return { query, issue: "Tarih aralığı geçersiz. Filtreleri sıfırlayabilirsin." };
    if (Date.parse(dateTo) - Date.parse(dateFrom) > 366 * 86400000)
      return { query, issue: "Tarih aralığı en çok bir yıl olabilir." };
    query.dateFrom = dateFrom;
    query.dateTo = dateTo;
  }
  for (const key of ["from", "to"] as const) {
    const value = params.get(key);
    if (value) {
      if (!instant(value)) return { query, issue: "Plan filtresinin tarih aralığı geçersiz." };
      query[key] = value;
    }
  }
  if (query.isPlanned !== undefined || query.from || query.to) {
    if (
      !query.from ||
      !query.to ||
      Date.parse(query.to) <= Date.parse(query.from) ||
      Date.parse(query.to) - Date.parse(query.from) > 366 * 86400000
    )
      return { query, issue: "Plan filtresi için en fazla 366 günlük geçerli aralık gerekir." };
  }
  const offset = params.get("offset");
  if (offset !== null) {
    if (!/^\d+$/.test(offset) || Number(offset) > maxTaskOffset) return { query, issue: "Sayfa bağlantısı geçersiz." };
    query.offset = Number(offset);
  }
  return { query };
}
export function changedFilters(params: URLSearchParams, changes: Record<string, string | null>, resetOffset = true) {
  const next = new URLSearchParams(params);
  if (resetOffset) next.delete("offset");
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
  }
  return next;
}
export function taskFailure(error: unknown) {
  if (!(error instanceof ApiError)) return "İşlem tamamlanamadı. Taslağın burada duruyor.";
  if (error.outcomeUnknown)
    return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Sunucudaki durumu kontrol et.";
  if (error.kind === "offline") return error.message;
  if (error.status === 400) return "Sunucu bu alanları kabul etmedi. Başlığı ve diğer değerleri kontrol et.";
  if (error.status === 404) return "Bu göreve erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.";
  if (error.code === "task_has_children")
    return "Önce alt görevleri başka bir yere taşı veya arşivle. Bu görevin alt görevleri var.";
  if (error.code === "task_has_work")
    return "Bu görevin açık veya duraklatılmış çalışması var. Önce çalışma oturumunu bitir.";
  if (error.status === 409) return "Görev başka bir yerde değişti. Taslağın korundu; güncel kaydı kontrol et.";
  return "İşlem tamamlanamadı. Taslağın burada duruyor; bağlantını kontrol edip yeniden dene.";
}

/** Tahmin dakika olarak gösterilir. Bilinmeyen parça sıfır sayılmaz, artı işaretiyle görünür. */
export function estimateText(seconds: number | string | null | undefined, unknownCount = 0) {
  const total = seconds === null || seconds === undefined ? null : Number(seconds);
  if (total === null || !Number.isFinite(total) || total <= 0) return "";
  const minutes = Math.round(total / 60),
    h = Math.floor(minutes / 60),
    m = minutes % 60;
  return `${h ? `${h} sa${m ? ` ${m} dk` : ""}` : `${m} dk`}${unknownCount > 0 ? "+" : ""}`;
}
const shortMonths = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** Yerel günleri 24 Eki, 24–29 Eki veya yıl değişince tam yıl ile gösteriyoruz. */
export function dayRange(from?: string | null, to?: string | null) {
  if (!from || !to || !localDay(from) || !localDay(to)) return "";
  const [fy, fm, fd] = from.split("-").map(Number),
    [ty, tm, td] = to.split("-").map(Number);
  const label = (d: number, m: number, y?: number) => `${d} ${shortMonths[m - 1]}${y ? ` ${y}` : ""}`;
  if (from === to) return label(fd, fm);
  if (fy !== ty) return `${label(fd, fm, fy)} – ${label(td, tm, ty)}`;
  return fm === tm ? `${fd}–${td} ${shortMonths[fm - 1]}` : `${label(fd, fm)} – ${label(td, tm)}`;
}
export const priorityTone = {
  Urgent: { text: "Acil", tone: "urgent" },
  High: { text: "Yüksek", tone: "high" },
  Low: { text: "Düşük", tone: "low" },
} as const;

/** Önce sürüm okuyan yazı da çevrimdışıyken hiçbir şey gönderilmediğini açıkça söylemeli. */
export const offlineWrite = "Bağlantı yok. Değişiklik gönderilmedi; yeniden bağlanınca kendiliğinden gönderilmeyecek.";
export const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

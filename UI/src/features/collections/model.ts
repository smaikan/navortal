import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { taskFailure } from "../tasks/model";

export type ResourceKind = "projects" | "pools" | "categories" | "tags";
export type Resource = components["schemas"]["NamedResourceView"];
export type ResourceWorkload = components["schemas"]["NamedResourceWorkload"];
export type ResourceDraft = { name: string; description: string };
export type ResourceQuery = {
  offset: number;
  limit: number;
  includeArchived: boolean;
  search?: string;
  includeSummary?: boolean;
};
export type ResourceSummary = { taskCount: number; completed: number; open: number; known: number; unknown: number };
export const resourcePageSize = 25;
export const resourceTaskPageSize = 25;
export const nameLimit = 200;
export const descriptionLimit = 10000;

/** Kaynak türleri aynı ekranı kullanıyor, yalnız yazı, adres ve görev filtresi değişiyor. */
export const resourceKinds = {
  projects: {
    route: "/projects",
    title: "Projeler",
    singular: "Proje",
    lower: "proje",
    plural: "projeler",
    accusative: "projeyi",
    locative: "projede",
    taskFilter: "projectId",
    intro:
      "Birbiriyle ilgili işlerini bir araya getir. Görevler kopyalanmaz; aynı görev burada ve görev listesinde görünür.",
    create: "Proje oluştur",
    empty: "Uzun soluklu bir işi takip etmek için bir proje oluştur.",
  },
  pools: {
    route: "/pool",
    title: "Havuz",
    singular: "Havuz",
    lower: "havuz",
    plural: "havuzlar",
    accusative: "havuzu",
    locative: "havuzda",
    taskFilter: "poolId",
    intro:
      "Güne henüz ayırmadığın işleri havuzlarda beklet. Bir görev havuzdayken de aynı görevdir; plana alınınca kopyası oluşmaz.",
    create: "Havuz oluştur",
    empty: "Sonra bakmak istediğin işler için bir havuz oluştur.",
  },
  categories: {
    route: "/categories",
    title: "Kategoriler",
    singular: "Kategori",
    lower: "kategori",
    plural: "kategoriler",
    accusative: "kategoriyi",
    locative: "kategoride",
    taskFilter: "categoryId",
    intro:
      "Bir görev en fazla bir kategoride olur. Kategoriler işlerini türüne göre ayırmana yardım eder; görev kopyalanmaz.",
    create: "Kategori oluştur",
    empty: "İşlerini türüne göre ayırmak için bir kategori oluştur.",
  },
  tags: {
    route: "/tags",
    title: "Etiketler",
    singular: "Etiket",
    lower: "etiket",
    plural: "etiketler",
    accusative: "etiketi",
    locative: "etikette",
    taskFilter: "tagId",
    intro: "Bir göreve en fazla 50 etiket eklenebilir. Etiketler bağlamı işaretler; görev kopyalanmaz.",
    create: "Etiket oluştur",
    empty: "Henüz etiket yok. İşlerini bağlama göre işaretlemek için bir etiket oluştur.",
  },
} as const;
export const resourceOrder: ResourceKind[] = ["projects", "pools", "categories"];

const integer = (value: unknown, min = 0) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= min
    : typeof value === "string" &&
      /^(0|[1-9]\d*)$/.test(value) &&
      BigInt(value) >= BigInt(min) &&
      BigInt(value) <= 9223372036854775807n;
const exact = (value: unknown, expected: number) => integer(value) && Number(value) === expected;
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value);
function invalid(what = "Kayıt"): never {
  throw new ApiError("protocol", `${what} yanıtı eksik veya geçersiz. Yeniden yükle.`);
}

export function readResource(value: Resource): Resource {
  if (
    !value ||
    !validTaskId(value.id) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > nameLimit ||
    !(
      value.description === null ||
      (typeof value.description === "string" && value.description.length <= descriptionLimit)
    ) ||
    !instant(value.createdAt) ||
    !instant(value.updatedAt) ||
    !(value.archivedAt === null || instant(value.archivedAt)) ||
    !integer(value.version, 1)
  )
    invalid();
  return value;
}
export function readResourcePage(value: components["schemas"]["NamedResourcePage"], offset: number) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > resourcePageSize ||
    !exact(value.offset, offset) ||
    !exact(value.limit, resourcePageSize) ||
    !integer(value.total)
  )
    invalid("Liste");
  const items = value.items.map(readResource);
  if (new Set(items.map(item => item.id)).size !== items.length || Number(value.total) < offset + items.length)
    invalid("Liste");
  const summaries = new Map<string, ResourceSummary>();
  for (const row of value.summaries ?? []) {
    const counts = [
      row.taskCount,
      row.completedCount,
      row.openComponentCount,
      row.knownEstimatedSeconds,
      row.unknownEstimateCount,
    ];
    if (!counts.every(x => integer(x))) invalid("Liste");
    const [taskCount, completed, open, known, unknown] = counts.map(Number);
    summaries.set(row.resourceId, { taskCount, completed, open, known, unknown });
  }
  return { items, offset, total: Number(value.total), summaries };
}
export function readWorkload(value: ResourceWorkload, id: string): ResourceWorkload {
  const v = value?.values;
  if (
    !value ||
    value.resourceId !== id ||
    !v ||
    ![v.taskCount, v.directComponentCount, v.openComponentCount, v.knownEstimatedSeconds, v.unknownEstimateCount].every(
      x => integer(x),
    ) ||
    !(v.calculatedTotalSeconds === null || integer(v.calculatedTotalSeconds)) ||
    Number(v.openComponentCount) > Number(v.directComponentCount)
  )
    invalid("İş yükü");
  return value;
}

/** API'ye yalnız bilinen URL anahtarları gider. taskId ve hash gibi diğer bilgiler sayfada korunur. */
export function resourceFilters(params: URLSearchParams): { query: ResourceQuery; id: string | null; issue?: string } {
  const query: ResourceQuery = {
    offset: 0,
    limit: resourcePageSize,
    includeArchived: params.get("includeArchived") === "true",
  };
  const raw = params.get("id");
  const id = raw && validTaskId(raw) ? raw : null;
  if (raw && !id) return { query, id: null, issue: "Bağlantıdaki kayıt kimliği geçersiz." };
  const search = params.get("search");
  if (search) {
    if (search.length > 200) return { query, id, issue: "Arama en fazla 200 karakter olabilir." };
    query.search = search;
  }
  const archived = params.get("includeArchived");
  if (archived !== null && !["true", "false"].includes(archived))
    return { query, id, issue: "Bağlantıdaki filtre geçersiz." };
  const offset = params.get("offset");
  if (offset !== null) {
    if (!/^\d+$/.test(offset) || Number(offset) > 100000) return { query, id, issue: "Sayfa bağlantısı geçersiz." };
    query.offset = Number(offset);
  }
  return { query, id };
}

export function resourceDraft(resource?: Resource | null): ResourceDraft {
  return { name: resource?.name ?? "", description: resource?.description ?? "" };
}
export function nameIssue(name: string) {
  return !name.trim()
    ? "Bir ad yaz."
    : name.trim().length > nameLimit
      ? `Ad en fazla ${nameLimit} karakter olabilir.`
      : undefined;
}
/** Açıklamayı her PUT'ta gönderiyoruz; eksik bırakmak silebilir. Boş alan açıklama yok demek. */
export function resourceFields(draft: ResourceDraft): { name: string; description: string | null } {
  const issue = nameIssue(draft.name);
  if (issue) throw new Error(issue);
  if (draft.description.length > descriptionLimit)
    throw new Error(`Açıklama en fazla ${descriptionLimit.toLocaleString("tr")} karakter olabilir.`);
  return { name: draft.name.trim(), description: draft.description.trim() ? draft.description : null };
}
/** Uzlaştırmada yalnız yerelde değişen alanlar korunuyor. Sunucuda değişen diğer alanlar kaybolmuyor. */
export function rebaseResourceDraft(base: Resource, draft: ResourceDraft, latest: Resource): ResourceDraft {
  const original = resourceDraft(base);
  const remote = resourceDraft(latest);
  return {
    name: draft.name !== original.name ? draft.name : remote.name,
    description: draft.description !== original.description ? draft.description : remote.description,
  };
}

export function resourceFailure(error: unknown, create = false) {
  if (error instanceof ApiError && error.outcomeUnknown)
    return create
      ? "Kaydın sonucu alınamadı. Oluşturulmuş olabilir; otomatik tekrar gönderilmedi. Yeniden göndermek ikinci bir kayıt oluşturabilir; önce listeyi kontrol et."
      : "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Sunucudaki kaydı kontrol et.";
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      resource_invalid: `Ad boş olamaz ve en fazla ${nameLimit} karakter olabilir; açıklama en fazla ${descriptionLimit.toLocaleString("tr")} karakter olabilir.`,
      validation_failed: "Ad alanını kontrol et; boş bırakılamaz.",
      resource_archived: "Arşivlenmiş kayıt düzenlenemez. Görevler ve geçmiş kayıtlar korunur.",
      resource_not_found: "Bu kayda erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      version_conflict: "Kayıt başka bir yerde değişti. Taslağın korundu; sunucudaki kaydı kontrol et.",
      resource_query_invalid: "Liste filtreleri geçersiz. Filtreleri sıfırlayabilirsin.",
      workload_overflow: "Bu kaydın toplam süresi desteklenen aralığı aşıyor.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 404) return messages.resource_not_found;
    if (error.status === 409) return messages.version_conflict;
  }
  return error instanceof Error && !(error instanceof ApiError) ? error.message : taskFailure(error);
}
export function blocksWrite(error: unknown) {
  return error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status === 404);
}

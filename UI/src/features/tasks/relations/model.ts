import type { components } from "../../../lib/api/generated/schema";
import { ApiError } from "../../../lib/api/errors";
import { validTaskId } from "../../../components/layout/task-panel-url";
import { taskFailure, type Task } from "../model";

export type RelationKind = "dependencies" | "ordering";
export type Relation = components["schemas"]["TaskRelationView"];
export type RelationPage = components["schemas"]["TaskRelationPage"];
export type StartDecision = components["schemas"]["TaskStartDecision"];
export const relationPageSize = 10;
export const ancestorPageSize = 16;

/** Zorunlu bağımlılık ve yumuşak sıra ayrı API kaynaklarıdır. Yazıları da ayrı kalmalı. */
export const relationKinds = {
  dependencies: {
    wire: "FinishToStart",
    title: "Ön koşullar",
    badge: "Sert ön koşul",
    add: "Ön koşul ekle",
    submit: "Ön koşulu ekle",
    remove: "ön koşulunu kaldır",
    help: "Bu görev, buradaki görevlerin her biri tamamlanmadan başlatılamaz. Ertelenen, atlanan veya iptal edilen bir ön koşul engeli kaldırmaz.",
    empty: "Doğrudan eklenen ön koşul yok. Üst görevlerden gelen engeller başlatılabilirlik bölümünde gösterilir.",
    meaning: (source: string, target: string) => `“${source}” tamamlanmadan “${target}” başlatılamaz.`,
    added: (source: string) => `Ön koşul eklendi: “${source}” tamamlanmadan bu görev başlatılamaz.`,
    removed: (source: string) => `Ön koşul kaldırıldı: ${source}`,
  },
  ordering: {
    wire: "PreferredBefore",
    title: "Tercih edilen sıra",
    badge: "Yumuşak sıra",
    add: "Önce yapılacak görev ekle",
    submit: "Sıra tercihini ekle",
    remove: "sıra tercihini kaldır",
    help: "Planlama bu görevleri mümkünse daha önce yerleştirir. Başlatmayı engellemez; uygulanamazsa plan bir uyarı gösterir.",
    empty: "Sıra tercihi yok.",
    meaning: (source: string, target: string) =>
      `Planlama mümkünse “${source}” görevini “${target}” görevinden önce yerleştirir. Başlatma engellenmez.`,
    added: (source: string) => `Sıra tercihi eklendi: “${source}” mümkünse önce planlanır.`,
    removed: (source: string) => `Sıra tercihi kaldırıldı: ${source}`,
  },
} as const;

export const startReasons: Record<string, string> = {
  predecessor_incomplete: "Tamamlanmamış bir ön koşul var. Ön koşul bu görevden veya bir üst görevinden gelebilir.",
  task_inactive: "Görev ertelenmiş, atlanmış veya iptal edilmiş. Başlatmak için önce yeniden aç.",
  task_archived: "Görev arşivlenmiş.",
  direct_work_required: "Bu görevin kendi işi yok; çalışma alt görevlerinde yapılır.",
  direct_work_completed: "Bu görevin kendi işi zaten tamamlanmış.",
};

const exact = (value: unknown, expected?: number) =>
  ((typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === "string" && /^(0|[1-9]\d{0,9})$/.test(value))) &&
  (expected === undefined || Number(value) === expected);
function invalid(): never {
  throw new ApiError("protocol", "İlişki yanıtı eksik veya geçersiz. Yeniden yükle.");
}

export function readRelation(value: Relation, kind: RelationKind, targetId: string, sourceId?: string): Relation {
  if (
    !value ||
    !validTaskId(value.id) ||
    !validTaskId(value.sourceTaskId) ||
    value.targetTaskId !== targetId ||
    value.kind !== relationKinds[kind].wire ||
    (sourceId !== undefined && value.sourceTaskId !== sourceId) ||
    value.sourceTaskId === targetId
  )
    invalid();
  return value;
}
export function readRelationPage(value: RelationPage, kind: RelationKind, targetId: string, offset: number) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !exact(value.offset, offset) ||
    !exact(value.limit, relationPageSize) ||
    !exact(value.total) ||
    value.items.length > relationPageSize
  )
    invalid();
  const items = value.items.map(item => readRelation(item, kind, targetId));
  if (
    new Set(items.map(item => item.sourceTaskId)).size !== items.length ||
    Number(value.total) < offset + items.length
  )
    invalid();
  return { items, offset, total: Number(value.total) };
}
export function readStartDecision(value: StartDecision, id: string): StartDecision {
  if (
    !value ||
    value.taskId !== id ||
    typeof value.canStart !== "boolean" ||
    !Array.isArray(value.reasons) ||
    !value.reasons.every(reason => typeof reason === "string" && /^[a-z_]{1,64}$/.test(reason)) ||
    !Array.isArray(value.blockingPredecessorIds) ||
    !value.blockingPredecessorIds.every(validTaskId) ||
    new Set(value.blockingPredecessorIds).size !== value.blockingPredecessorIds.length ||
    (value.canStart && (value.reasons.length > 0 || value.blockingPredecessorIds.length > 0)) ||
    (!value.canStart && value.reasons.length === 0)
  ) {
    throw new ApiError("protocol", "Başlatılabilirlik yanıtı eksik veya geçersiz. Yeniden denetle.");
  }
  return value;
}
/** Gelecekte bilinmeyen neden gelirse sessizce atmayıp gösteriyoruz. */
export function reasonText(reason: string) {
  return startReasons[reason] ?? "Sunucu bu görevin şu an başlatılamayacağını bildirdi.";
}

/** Uzun yolda kök ve yakın üstler görünür. Ortası tek açma eylemiyle ulaşılır. */
export function visiblePath<T>(path: readonly T[], expanded: boolean): { head: T[]; hidden: number; tail: T[] } {
  if (expanded || path.length <= 4) return { head: [...path], hidden: 0, tail: [] };
  return { head: path.slice(0, 1), hidden: path.length - 3, tail: path.slice(-2) };
}

export function predecessorNote(task: Task | undefined) {
  if (!task) return "Durumu okunamadı; sunucu başlatmada yine denetler.";
  if (task.state === "Completed") return "Tamamlandı; artık engel değil.";
  if (task.archivedAt) return "Arşivlenmiş ve tamamlanmamış; başlatmayı engeller. Gerekmiyorsa ön koşulu kaldır.";
  if (["Deferred", "Skipped", "Canceled"].includes(task.state))
    return "Ertelenmiş, atlanmış veya iptal edilmiş bir ön koşul engeli kaldırmaz. Ön koşulu tamamla ya da gerekmiyorsa kaldır.";
  return "Henüz tamamlanmadı; bu görevin başlatılmasını engeller.";
}

export function relationFailure(error: unknown) {
  if (error instanceof ApiError && !error.outcomeUnknown) {
    const messages: Record<string, string> = {
      relation_self: "Bir görev kendisine bağlanamaz. Başka bir görev seç.",
      dependency_cycle:
        "Bu ön koşul, görev ağacıyla birlikte bir döngü oluşturur: görevler birbirini bekler. Başka bir görev seç.",
      relation_exists: "Bu ilişki zaten var. Güncel liste yüklendi.",
      relation_not_found: "Bu ilişki artık yok; başka bir yerde kaldırılmış olabilir. Güncel liste yüklendi.",
      task_archived: "Arşivlenmiş görevin ilişkileri değiştirilemez.",
      task_not_found: "Seçilen göreve erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      version_conflict: "Görev başka bir yerde değişti. Güncel sürüm yüklendi; işlemi yeniden seçebilirsin.",
      relation_query_invalid: "İlişki listesi sayfası geçersiz. İlk sayfaya dönebilirsin.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 400) return "Sunucu bu ilişkiyi kabul etmedi. Seçimi kontrol et.";
  }
  if (error instanceof ApiError && error.outcomeUnknown)
    return "İşlemin sonucu alınamadı. Değişiklik kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel ilişkileri kontrol et.";
  return taskFailure(error);
}
/** Bu kodlarda sonraki adım yeni okuma. Yazının kendisini tekrarlamıyoruz. */
export function refreshAfter(error: unknown) {
  return (
    error instanceof ApiError &&
    !error.outcomeUnknown &&
    ["version_conflict", "relation_exists", "relation_not_found"].includes(error.code ?? "")
  );
}

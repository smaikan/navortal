import type { components } from "../../../lib/api/generated/schema";
import { ApiError } from "../../../lib/api/errors";
import { validTaskId } from "../../../components/layout/task-panel-url";
import { dayRange, estimateText, localDay, priorityTone, readTask, type Task } from "../model";

export type RowSummary = components["schemas"]["TreeRowSummary"];
export type TreePage = {
  items: Task[];
  offset: number;
  limit: number;
  hasMore: boolean;
  summaries: Map<string, RowSummary>;
};
export const treePageSize = 25;
const exact = (value: unknown, expected: number) =>
  ((typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value))) &&
  Number(value) === expected;
const count = (value: unknown) =>
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value));
const day = (value: unknown) => value === null || value === undefined || localDay(value);
export function readSummary(value: RowSummary): RowSummary {
  if (
    !value ||
    !validTaskId(value.taskId) ||
    !count(value.childCount) ||
    !count(value.completedChildCount) ||
    Number(value.completedChildCount) > Number(value.childCount) ||
    !(
      value.knownEstimatedSeconds === null ||
      value.knownEstimatedSeconds === undefined ||
      count(value.knownEstimatedSeconds)
    ) ||
    !count(value.unknownEstimateCount) ||
    !day(value.effectiveFrom) ||
    !day(value.effectiveTo) ||
    !value.effectiveFrom !== !value.effectiveTo
  )
    throw new ApiError("protocol", "Görev özeti eksik veya geçersiz.");
  return value;
}
export function readTreePage(value: components["schemas"]["TreePage"], offset: number, limit = treePageSize): TreePage {
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > limit ||
    !exact(value.offset, offset) ||
    !exact(value.limit, limit) ||
    typeof value.hasMore !== "boolean" ||
    (value.hasMore && value.items.length !== limit)
  )
    throw new ApiError("protocol", "Görev ağacı yanıtı eksik veya geçersiz.");
  const items = value.items.map(item => {
    const task = readTask(item);
    if (task.parentTaskId !== null && !validTaskId(task.parentTaskId))
      throw new ApiError("protocol", "Görevin üst bağlantısı eksik veya geçersiz.");
    return task;
  });
  if (new Set(items.map(item => item.id)).size !== items.length)
    throw new ApiError("protocol", "Görev ağacında yinelenen kayıt var. Yeniden yükle.");
  const summaries = new Map(
    (value.summaries ?? []).map(raw => {
      const summary = readSummary(raw);
      return [summary.taskId, summary] as const;
    }),
  );
  return { items, offset, limit, hasMore: value.hasMore, summaries };
}
export function treeMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 404)
    return "Bu görev ağacına erişilemiyor. Kök görevlere dönebilirsin.";
  if (error instanceof ApiError && error.kind === "offline")
    return "Bağlantı yok. Görev ağacını yeniden yüklemek için bağlantını kontrol et.";
  return "Görev ağacı alınamadı. Bağlantını kontrol edip yeniden yükle.";
}

/** Satırdaki kısa bilgi: öncelik, gün aralığı, bilinen tahmin ve çocuk ilerlemesi. Normal öncelik gizli. */
export function rowFacts(task: Task, summary?: RowSummary) {
  const priority = task.priority in priorityTone ? priorityTone[task.priority as keyof typeof priorityTone] : null;
  const range = summary
    ? dayRange(summary.effectiveFrom, summary.effectiveTo)
    : dayRange(task.plannedFrom, task.plannedTo);
  const estimate = summary
    ? estimateText(summary.knownEstimatedSeconds, Number(summary.unknownEstimateCount))
    : task.hasDirectWork
      ? estimateText(task.directEstimatedSeconds)
      : "";
  const children = Number(summary?.childCount ?? 0),
    done = Number(summary?.completedChildCount ?? 0);
  return {
    priority,
    range,
    estimate,
    children,
    progress: children ? `${done}/${children}` : "",
    // Yüzde yalnız sunucunun saydığı tamamlanan/alt görev sayılarından çizilir.
    percent: children ? Math.round((Math.min(done, children) / children) * 100) : 0,
    progressLabel: children ? `${children} alt görevden ${done} tamamlandı` : "",
  };
}

export type Placement = "before" | "after" | "child";
/** Üst çeyreğe bırakma önceye, alt çeyrek sonraya, orta bölüm alt göreve taşır. */
export function placementAt(pointerY: number, top: number, height: number): Placement {
  const at = (pointerY - top) / Math.max(1, height);
  return at < 0.28 ? "before" : at > 0.72 ? "after" : "child";
}
/** Bırakma veya klavye taşımasının sunucu hedefi. Değişiklik yoksa null. */
export function moveTarget(
  source: Pick<Task, "id" | "parentTaskId">,
  placement: Placement | "root-end",
  over: { id: string; parentTaskId: string | null; nextId: string | null } | null,
): { parentId: string | null; before: string | null } | null {
  if (placement === "root-end") return { parentId: null, before: null };
  if (!over || over.id === source.id) return null;
  if (placement === "child") return { parentId: over.id, before: null };
  const before = placement === "before" ? over.id : over.nextId;
  if (before === source.id) return null;
  return { parentId: over.parentTaskId, before };
}

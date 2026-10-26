import { ApiError } from "../../../lib/api/errors";
import { readTask, taskFailure, type Task } from "../model";
import { validTaskId } from "../../../components/layout/task-panel-url";
import type { components } from "../../../lib/api/generated/schema";

export type Disposition = "" | "PreserveDirect" | "ConvertToContainer";
export type MoveHint = { parentId: string | null; before: string | null; beforeTitle?: string };
export function readTreeTask(value: Task) {
  const task = readTask(value);
  if (task.parentTaskId !== null && !validTaskId(task.parentTaskId))
    throw new ApiError("protocol", "Üst görev bağlantısı eksik.");
  return task;
}
export function moveBody(
  source: Task,
  target: Task | null,
  before: string | null,
  disposition: Disposition,
): components["schemas"]["MoveTaskRequest"] {
  if (target?.id === source.id || before === source.id)
    throw new Error("Görevi kendi altına veya kendi önüne taşıyamazsın.");
  if (target?.archivedAt) throw new Error("Arşivlenmiş bir görev hedef olamaz.");
  if (target?.hasDirectWork && target.id !== source.parentTaskId && !disposition)
    throw new Error("Hedef görevin kendi işine ne olacağını seç.");
  return {
    version: source.version,
    parentTaskId: target?.id ?? null,
    parentVersion: target?.version ?? null,
    beforeSiblingId: before,
    parentWorkDisposition: disposition || null,
  };
}
export function treeCommandFailure(error: unknown) {
  if (error instanceof ApiError && !error.outcomeUnknown) {
    const messages: Record<string, string> = {
      tree_cycle: "Bu konum bir görev döngüsü oluşturur. Başka bir hedef seç.",
      dependency_cycle: "Bu taşıma görevlerin ön koşullarında döngü oluşturur. Başka bir konum seç.",
      sibling_invalid: "Seçilen kardeş artık bu konumda değil. Güncel görevle yeniden hazırlan.",
      parent_work_decision_required: "Üst görevin kendi işine ne olacağını seç.",
      parent_work_history: "Üst görevin çalışma geçmişi var. Kendi işini koruma seçeneğini kullan.",
      parent_has_schedule: "Üst görevin planlı işi var. Kendi işini koruma seçeneğini kullan.",
      parent_budget_conflict:
        "Üst görevin hedef bütçesi bu dönüşümle uyuşmuyor. Kendi işini koru veya bütçeyi ayrıca düzenle.",
      parent_direct_completed: "Üst görevin tamamlanmış kendi işi korunmalı.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return error instanceof Error && !(error instanceof ApiError) ? error.message : taskFailure(error);
}

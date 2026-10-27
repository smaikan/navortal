import type { components } from "../../../lib/api/generated/schema";
import { ApiError } from "../../../lib/api/errors";
import type { Task } from "../model";
import { readWorkTask, workFailure } from "../work/model";
export type LifeAction = NonNullable<components["schemas"]["TaskAction"]>;
export type Choice = "" | "ParentOnly" | "CompleteSubtree";
export type LifeIntent = { kind: "state"; action: LifeAction } | { kind: "required"; required: boolean };
export type LifeCommand = LifeIntent & { trigger: HTMLElement };
export const actionNames: Record<LifeAction, string> = {
  Complete: "Görevi tamamla",
  Reopen: "Görevi yeniden aç",
  CompleteDirectWork: "Kendi işini tamamla",
  ReopenDirectWork: "Kendi işini yeniden aç",
  Defer: "Görevi ertele",
  Skip: "Bu işi atla",
  Cancel: "İşi iptal et",
};
export const dispositionStates = { Defer: "Deferred", Skip: "Skipped", Cancel: "Canceled" } as const;
export function isDisposition(action: LifeAction): action is keyof typeof dispositionStates {
  return action === "Defer" || action === "Skip" || action === "Cancel";
}
export function stateAlreadyMatches(task: Task, action: LifeAction) {
  return isDisposition(action) && task.state === dispositionStates[action];
}
export function ownWorkLabel(task: Pick<Task, "hasDirectWork" | "directWorkCompleted">) {
  return !task.hasDirectWork
    ? "Kendi işi yok"
    : task.directWorkCompleted
      ? "Kendi işi tamamlandı"
      : "Kendi işi tamamlanmadı";
}
export function readLifeTask(task: Task, expectedId?: string): Task {
  readWorkTask(task);
  if (expectedId && task.id !== expectedId)
    throw new ApiError("protocol", "Yanıt beklenen göreve ait değil. Yeniden yükle.");
  return task;
}
export function hasChildren(page: components["schemas"]["TreePage"], id: string) {
  if (
    !page ||
    !Array.isArray(page.items) ||
    Number(page.offset) !== 0 ||
    Number(page.limit) !== 1 ||
    page.items.length > 1 ||
    typeof page.hasMore !== "boolean" ||
    (page.hasMore && page.items.length !== 1) ||
    !page.items.every(task => readLifeTask(task).parentTaskId === id)
  )
    throw new ApiError("protocol", "Alt görev kapsamı doğrulanamadı. Yeniden yükle.");
  return page.items.length > 0;
}
export function initialChoice(policy: string): Choice {
  return policy === "ParentOnly" || policy === "CompleteSubtree" ? policy : "";
}
export function stateBody(
  task: Task,
  action: LifeAction,
  children: boolean,
  choice: Choice,
  reason = "",
): components["schemas"]["TaskStateRequest"] {
  if (task.archivedAt) throw new Error("Arşivlenmiş görev değiştirilemez.");
  if (!["", "ParentOnly", "CompleteSubtree"].includes(choice))
    throw new Error("Tamamlama seçimi geçersiz. İşlemden vazgeçmek için pencereyi kapat.");
  if (action === "Complete" && children && !choice)
    throw new Error("Yalnız üst görevi mi, bütün alt görevleri de mi tamamlayacağını seç.");
  if ((action === "CompleteDirectWork" || action === "ReopenDirectWork") && !task.hasDirectWork)
    throw new Error("Kapsayıcıda tamamlanacak kendi işi yok. Bir alt görev seç.");
  if (stateAlreadyMatches(task, action))
    throw new Error("Görev zaten bu durumda. Başka bir durum seçmek için işlemden vazgeç.");
  if (isDisposition(action) && reason.length > 2000) throw new Error("Gerekçe en çok 2000 karakter olabilir.");
  return {
    version: task.version,
    action,
    parentCompletionChoice: action === "Complete" && children ? choice || null : null,
    reason: isDisposition(action) ? reason.trim() || null : null,
  };
}
export function lifeFailure(error: unknown) {
  if (error instanceof ApiError && !error.outcomeUnknown) {
    const messages: Record<string, string> = {
      reason_invalid: "Gerekçe en çok 2000 karakter olabilir. Metnini kısaltıp yeniden dene.",
      completion_choice_required:
        "Üst görevin tamamlama kapsamı değişti. Güncel görevi inceleyip alt görev seçimini yeniden yap.",
      direct_work_required: "Kapsayıcının kendi işi yok. Bir alt görev seç.",
      task_not_active:
        "Önce görevi yeniden aç; ertelenmiş, atlanmış veya iptal edilmiş işin kendi kısmı burada tamamlanamaz.",
      work_already_running: "Görevi yeniden açmadan önce devam eden çalışmayı duraklat veya bitir.",
      task_archived: "Bu görev arşivlenmiş. Yaşam döngüsü değiştirilemez.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.kind === "protocol") return error.message;
    if (error.status === 400)
      return "Sunucu bu durum değişikliğini kabul etmedi. Seçimleri kontrol et; taslağın korundu.";
  }
  return workFailure(error);
}

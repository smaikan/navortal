import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
import { states } from "../tasks/model";
import { readSchedule, type Schedule } from "./model";
import { readProposal, proposalFailure, type Proposal } from "./proposal-model";
import { readRevision } from "./revision-model";
export { readRevision, type Revision } from "./revision-model";
export type Item = components["schemas"]["RevisionItemView"];
export type Change = components["schemas"]["RevisionChangeView"];
export const historyPageSize = 25;
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) >= BigInt(min) && BigInt(v) <= 9223372036854775807n;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
function invalid(): never {
  throw new ApiError("protocol", "Geçmiş yanıtı doğrulanamadı. Başka bir kaydın verisiyle tamamlanmadı; yeniden oku.");
}
export function readHistoricalSchedule(v: Schedule): Schedule {
  readSchedule(v);
  if (v.kind === "Work") {
    const s = v.taskSnapshot!;
    const t = s.task;
    if (
      !Object.hasOwn(states, s.state) ||
      ![s.hasDirectWork, s.directWorkCompleted, s.requiredForParent].every(b => typeof b === "boolean") ||
      !(s.targetBudgetSeconds === null || integer(s.targetBudgetSeconds)) ||
      t.taskId !== v.taskId ||
      !integer(t.schemaVersion, 1) ||
      !integer(t.taskVersion, 1) ||
      !Array.isArray(t.ancestors) ||
      !Array.isArray(t.tags)
    )
      invalid();
    for (const n of [...t.ancestors, ...t.tags, ...[t.project, t.pool, t.category].filter(n => n !== null)])
      if (!n || !id(n.id) || typeof n.name !== "string") invalid();
  }
  return v;
}
function page<T>(
  v: { items: T[]; total: number | string; offset: number | string; limit: number | string },
  offset: number,
  read: (x: T) => T,
) {
  if (
    !v ||
    !Array.isArray(v.items) ||
    v.items.length > historyPageSize ||
    !integer(v.total) ||
    !integer(v.offset) ||
    Number(v.offset) !== offset ||
    Number(v.limit) !== historyPageSize ||
    Number(v.total) < v.items.length
  )
    invalid();
  return { ...v, items: v.items.map(read), total: Number(v.total) };
}
export const readRevisions = (v: components["schemas"]["RevisionPage"], offset: number, dayId: string | null) =>
  page(v, offset, x => readRevision(x, undefined, dayId));
export const readItems = (
  v: components["schemas"]["RevisionItemPage"],
  offset: number,
  revisionId: string,
  dayId: string,
) =>
  page(v, offset, x => {
    if (!x || !id(x.id) || x.revisionId !== revisionId) invalid();
    readHistoricalSchedule(x.schedule);
    if (x.schedule.dailyPlanId !== dayId) invalid();
    return x;
  });
type DayItemSnapshot = components["schemas"]["DayItemSnapshot"];
function readDayItemSnapshot(s: DayItemSnapshot, dayItemId: string) {
  if (!s || s.id !== dayItemId || !id(s.taskId) || typeof s.localDate !== "string" || typeof s.state !== "string")
    invalid();
}
export const readChanges = (v: components["schemas"]["RevisionChangePage"], offset: number) =>
  page(v, offset, x => {
    // Saatsiz değişiklikte schedule yerine dayItemId ve gün öğesi kopyaları var.
    if (x && x.dayItemId != null) {
      if (!id(x.id) || !id(x.dayItemId) || x.scheduleId != null || typeof x.type !== "string" || !x.dayItemAfter)
        invalid();
      readDayItemSnapshot(x.dayItemAfter!, x.dayItemId);
      if (x.dayItemBefore) readDayItemSnapshot(x.dayItemBefore, x.dayItemId);
      return x;
    }
    if (
      !x ||
      !id(x.id) ||
      !id(x.scheduleId) ||
      typeof x.type !== "string" ||
      typeof x.conflictsAccepted !== "boolean" ||
      x.before === undefined ||
      x.after === undefined ||
      (x.before === null && x.after === null)
    )
      invalid();
    for (const s of [x.before, x.after])
      if (s !== null) {
        readHistoricalSchedule(s);
        if (s.id !== x.scheduleId) invalid();
      }
    return x;
  });
export function readUndo(v: Proposal, changeSetId: string, proposalId?: string) {
  const p = readProposal(v, proposalId);
  if (p.reversesChangeSetId !== changeSetId) invalid();
  return p;
}
export function undoFailure(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      undo_not_latest:
        "Bu, günün son kullanıcı plan değişikliği değil. Güncel geçmişi oku ve geri almak istediğin uygun kaydı seç.",
      undo_already_applied: "Bu değişiklik için telafi daha önce kabul edilmiş. Güncel geçmişi oku.",
      undo_multiple_days: "Bu değişiklik birden fazla günü kapsıyor. Tek gün geri alma burada uygulanamaz.",
      change_set_not_found: "Bu değişiklik grubuna bu hesapta erişilemiyor.",
      revision_not_found: "Bu revizyona bu hesapta erişilemiyor.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return proposalFailure(error);
}
export const triggerLabel = (value: string) =>
  (
    ({
      Manual: "Manuel düzenleme",
      Replan: "Yeniden planlama",
      Undo: "Geri alma telafisi",
      TaskState: "Görev durumu değişikliği",
      DayItem: "Saatsiz plan değişikliği",
      DayGroup: "Görev grubu değişikliği",
      Pool: "Havuzda bekletme",
      Defer: "Saati iptal ederek erteleme",
    }) as Record<string, string>
  )[value] ?? value;
export const deltaLabel = (value: string) =>
  (
    ({
      Added: "Eklendi",
      Updated: "Değişti",
      Removed: "Kaldırıldı",
      Restored: "Geri getirildi",
      MovedOut: "Başka güne taşındı",
      MovedIn: "Bu güne taşındı",
      DayItemAdded: "Plana eklendi",
      DayItemAddedFirst: "Günün başına eklendi",
      DayItemCompleted: "Plan öğesi bitti",
      DayItemReopened: "Plan öğesi yeniden açıldı",
      DayItemRemoved: "Plandan kaldırıldı",
      DayItemMovedOut: "Başka güne taşındı",
      DayItemMovedIn: "Bu güne taşındı",
      DayItemUndone: "Geri alındı",
      DayItemReturnedToPool: "Havuzda bekletildi",
      PoolReturnUndone: "Havuz işlemi geri alındı",
    }) as Record<string, string>
  )[value] ?? value;

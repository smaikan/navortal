import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
import { priorities } from "../tasks/model";
import { energies } from "../support/model";
export type Quadrant = components["schemas"]["MatrixQuadrant"];
export type Board = components["schemas"]["MatrixView"];
export type Row = components["schemas"]["TaskPickerRow"];
export type Column = components["schemas"]["MatrixColumn"];
export const areas: { id: Quadrant; title: string; meaning: string; hint: string }[] = [
  {
    id: "Inbox",
    title: "Ayrılmamış işler",
    meaning: "Önce bir alan seç",
    hint: "Seçtiğin görevleri buradan dört alana ayır.",
  },
  { id: "Do", title: "Şimdi yap", meaning: "Önemli · Acil", hint: "Yakın ilgini gerektiren işler." },
  { id: "Schedule", title: "Planla", meaning: "Önemli · Acil değil", hint: "Yer açmak istediğin işler." },
  {
    id: "Delegate",
    title: "Devret / değerlendir",
    meaning: "Önemli değil · Acil",
    hint: "Paylaşabileceğin veya yeniden değerlendireceğin işler.",
  },
  {
    id: "Eliminate",
    title: "Ele / azalt",
    meaning: "Önemli değil · Acil değil",
    hint: "Zaman ayırmayı yeniden düşünebileceğin işler.",
  },
];
export const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
const invalid = () => new ApiError("protocol", "Matris yanıtı doğrulanamadı. Listeyi yeniden yükle.");
export function readRow(row: Row) {
  if (
    !row ||
    !validTaskId(row.id) ||
    typeof row.title !== "string" ||
    !row.title.trim() ||
    row.title.length > 300 ||
    (row.parentTaskId !== null && !validTaskId(row.parentTaskId)) ||
    (row.parentTitle !== null && typeof row.parentTitle !== "string") ||
    (row.directEstimatedSeconds !== null && !integer(row.directEstimatedSeconds)) ||
    !Object.hasOwn(priorities, row.priority) ||
    (row.energyDemand !== null && !Object.hasOwn(energies, row.energyDemand))
  )
    throw invalid();
  return row;
}
export function readCandidates(page: components["schemas"]["TaskPickerPage"]) {
  if (
    !page ||
    !Array.isArray(page.items) ||
    ![page.offset, page.limit, page.total].every(integer) ||
    Number(page.limit) < 1 ||
    Number(page.limit) > 100 ||
    page.items.length > Number(page.limit)
  )
    throw invalid();
  page.items.forEach(readRow);
  if (new Set(page.items.map(x => x.id)).size !== page.items.length) throw invalid();
  return page;
}
export function readBoard(board: Board) {
  if (
    !board ||
    !integer(board.version) ||
    !Array.isArray(board.columns) ||
    board.columns.length !== areas.length ||
    board.columns.some(c => !c || !Array.isArray(c.items))
  )
    throw invalid();
  const seen = new Set<string>();
  if (new Set(board.columns.map(x => x.quadrant)).size !== areas.length) throw invalid();
  for (const col of board.columns) {
    if (!areas.some(x => x.id === col.quadrant)) throw invalid();
    readCandidates({ ...col, items: col.items.map(c => c.task) });
    for (const { task } of col.items) {
      if (seen.has(task.id)) throw invalid();
      seen.add(task.id);
    }
  }
  return board;
}

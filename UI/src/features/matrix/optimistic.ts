import type { Board, Quadrant } from "./model";

/**
 * Kart taşımak veya matristen çıkarmak ekranda hemen görünür. Bu dosya yalnız saf dönüşümleri tutar.
 * Sunucu yanıtı gelince tahta sürümü yazılır, hata olursa eski tahta geri konur.
 */
const bump = (value: number | string, delta: number) =>
  typeof value === "string" ? String(Math.max(0, Number(value) + delta)) : Math.max(0, value + delta);

type Card = Board["columns"][number]["items"][number];

function locate(board: Board, taskId: string) {
  for (const column of board.columns) {
    const at = column.items.findIndex(card => card.task.id === taskId);
    if (at >= 0) return { quadrant: column.quadrant, at, card: column.items[at] };
  }
  return null;
}

/** Kartı hedef alana, istenen kartın önüne koyar. Önündeki kart yüklü değilse veya alan sonu yüklenmemişse konamaz. */
export function moveCard(board: Board, taskId: string, quadrant: Quadrant, beforeTaskId: string | null): Board | null {
  const from = locate(board, taskId);
  if (!from) return null;
  const target = board.columns.find(column => column.quadrant === quadrant);
  if (!target) return null;
  const sameColumn = from.quadrant === quadrant;
  const rest = target.items.filter(card => card.task.id !== taskId);
  let at: number;
  if (beforeTaskId) {
    at = rest.findIndex(card => card.task.id === beforeTaskId);
    if (at < 0) return null;
  } else {
    // Alanın sonu yalnız bütün kartlar yüklüyse bilinir.
    if (Number(target.offset) + target.items.length < Number(target.total)) return null;
    at = rest.length;
  }
  const items = [...rest.slice(0, at), from.card as Card, ...rest.slice(at)];
  return {
    ...board,
    columns: board.columns.map(column => {
      if (column.quadrant === quadrant)
        return { ...column, items, total: sameColumn ? column.total : bump(column.total, 1) };
      if (column.quadrant === from.quadrant)
        return {
          ...column,
          items: column.items.filter(card => card.task.id !== taskId),
          total: bump(column.total, -1),
        };
      return column;
    }),
  };
}

/** Kartı matristen çıkarır (görev silinmez). Kart yoksa null. */
export function dropCard(board: Board, taskId: string): Board | null {
  const from = locate(board, taskId);
  if (!from) return null;
  return {
    ...board,
    columns: board.columns.map(column =>
      column.quadrant === from.quadrant
        ? { ...column, items: column.items.filter(card => card.task.id !== taskId), total: bump(column.total, -1) }
        : column,
    ),
  };
}

export const withVersion = (board: Board, version: Board["version"]): Board =>
  String(board.version) === String(version) ? board : { ...board, version };

import { ApiError } from "../../../lib/api/errors";
import type { Task } from "../model";
import { ancestorPageSize } from "./model";

export type AncestorCursor = { nextId: string | null; visitedIds: readonly string[] };
export type AncestorPage = { items: Task[]; next: AncestorCursor | undefined };

/** Okuma boyutunu sınırlıyoruz, hiyerarşi derinliğini değil. Yakın üstten uzağa sayfalıyoruz. */
export async function readAncestorPage(
  cursor: AncestorCursor,
  read: (id: string) => Promise<Task>,
  signal?: AbortSignal,
): Promise<AncestorPage> {
  const seen = new Set(cursor.visitedIds);
  const items: Task[] = [];
  let next = cursor.nextId;
  while (next && items.length < ancestorPageSize) {
    signal?.throwIfAborted();
    if (seen.has(next)) throw new ApiError("protocol", "Üst görev yolu döngü içeriyor. Güncel görevi yeniden yükle.");
    const id = next;
    const parent = await read(id);
    signal?.throwIfAborted();
    if (parent.id !== id) throw new ApiError("protocol", "Üst görev yanıtı başka bir kayda ait.");
    seen.add(id);
    items.push(parent);
    next = parent.parentTaskId;
  }
  return { items, next: next ? { nextId: next, visitedIds: [...seen] } : undefined };
}

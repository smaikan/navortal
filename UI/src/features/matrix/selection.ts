import type { Board } from "./model";

/** Sıradaki yazı sunucu makbuzunu kullanır. Başarısız veya belirsiz yazıda kalan seçimler durur. */
export async function addSelection(
  ids: string[],
  version: Board["version"] | undefined,
  add: (id: string, version: Board["version"]) => Promise<Board["version"] | false>,
) {
  const added: string[] = [];
  if (version === undefined) return added;
  for (const id of new Set(ids)) {
    const result = await add(id, version);
    if (result === false) break;
    added.push(id);
    version = result;
  }
  return added;
}

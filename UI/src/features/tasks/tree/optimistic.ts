import type { Task } from "../model";

/**
 * Görev ağacı sayfaları iki biçimde saklanır: tek sayfa ({ items }) ve sonsuz sorgu ({ pages: [{ items }] }).
 * Görev bu sayfalarda bulunursa değişiklik uygulanır. Bulunmazsa aynı nesne döner, böylece gereksiz yeniden çizim olmaz.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function mapItems(page: unknown, id: string, change: (task: Task) => Task): unknown {
  if (!isRecord(page) || !Array.isArray(page.items)) return page;
  const index = page.items.findIndex(item => isRecord(item) && item.id === id);
  if (index < 0) return page;
  const items = page.items.slice();
  items[index] = change(items[index] as Task);
  return { ...page, items };
}

export function mapTasks(data: unknown, id: string, change: (task: Task) => Task): unknown {
  if (!isRecord(data)) return data;
  if (Array.isArray(data.pages)) {
    let changed = false;
    const pages = data.pages.map(page => {
      const next = mapItems(page, id, change);
      if (next !== page) changed = true;
      return next;
    });
    return changed ? { ...data, pages } : data;
  }
  return mapItems(data, id, change);
}

/** Görev bitirildiğinde ekranda hemen görünen durum. Gerçek değer sunucu yanıtıyla değiştirilir. */
export const completedNow = (task: Task, at: string): Task => ({ ...task, state: "Completed", completedAt: at });
/** Yeniden açılan görevin kesin durumunu sunucu belirler; o gelene kadar bekliyor görünür. */
export const reopenedNow = (task: Task): Task => ({ ...task, state: "Pending", completedAt: null });

export type MoveTarget = { parentId: string | null; before: string | null };
export type MovePatch = { key: readonly unknown[]; prev: unknown; next: unknown };
type BranchPage = { items: Task[]; hasMore: boolean; summaries?: Map<string, unknown> };
type BranchData = { pages: BranchPage[]; pageParams?: unknown[] };
const isBranch = (data: unknown): data is BranchData =>
  isRecord(data) && Array.isArray(data.pages) && data.pages.every(page => isRecord(page) && Array.isArray(page.items));

/**
 * Taşıma önbellekte hemen görünür: görev eski üstün listesinden çıkar, yeni üstün (yüklüyse) listesinde istenen yere girer.
 * Hedef kardeş veya liste sonu henüz yüklenmemişse oraya konamaz; satır yalnız eski yerinden kalkar ve sunucu yanıtı gelince yerleşir.
 * Satırın özeti (alt görev sayısı, ilerleme) taşınırken kaybolmasın diye hedef sayfaya da kopyalanır.
 */
export function planMove(entries: [readonly unknown[], unknown][], task: Task, target: MoveTarget): MovePatch[] {
  let summary: unknown;
  for (const [, data] of entries)
    if (isBranch(data)) for (const page of data.pages) summary ??= page.summaries?.get(task.id);
  const moved: Task = { ...task, parentTaskId: target.parentId };
  const completed = task.state === "Completed";
  const patches: MovePatch[] = [];
  for (const [key, data] of entries) {
    const filters = key[3] as { kind?: string; parentId?: string | null; completed?: boolean | null } | undefined;
    if (filters?.kind !== "branch" || !isBranch(data)) continue;
    const parent = filters.parentId ?? null;
    let pages = data.pages;
    let changed = false;
    if (parent === (task.parentTaskId ?? null))
      pages = pages.map(page => {
        const at = page.items.findIndex(item => item.id === task.id);
        if (at < 0) return page;
        changed = true;
        return { ...page, items: page.items.filter((_, i) => i !== at) };
      });
    const fits = filters.completed == null || filters.completed === completed;
    if (parent === target.parentId && fits && !pages.some(page => page.items.some(item => item.id === task.id))) {
      const withTask = (page: BranchPage, at: number): BranchPage => ({
        ...page,
        items: [...page.items.slice(0, at), moved, ...page.items.slice(at)],
        ...(summary ? { summaries: new Map(page.summaries).set(task.id, summary) } : {}),
      });
      if (target.before) {
        const pageAt = pages.findIndex(page => page.items.some(item => item.id === target.before));
        if (pageAt >= 0) {
          const at = pages[pageAt].items.findIndex(item => item.id === target.before);
          pages = pages.map((page, i) => (i === pageAt ? withTask(page, at) : page));
          changed = true;
        }
      } else if (pages.length && !pages[pages.length - 1].hasMore) {
        const last = pages.length - 1;
        pages = pages.map((page, i) => (i === last ? withTask(page, page.items.length) : page));
        changed = true;
      }
    }
    if (changed) patches.push({ key, prev: data, next: { ...data, pages } });
  }
  return patches;
}

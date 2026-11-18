import type { DayOverview } from "./overview-model";
import type { DayItem, Schedule } from "./model";
import type { Glance } from "./glance";

/**
 * Gün planında kutu işaretlenince arayüz sunucu yanıtını beklemez: önbellekteki satır hemen bitti/açık olur.
 * Bu dosya yalnız saf dönüşümleri tutar. Sunucu yanıtı gelince satırın kendisi yazılır, hata olursa tersi uygulanır.
 */
const bump = (value: number | string, delta: number) =>
  typeof value === "string" ? String(Math.max(0, Number(value) + delta)) : Math.max(0, value + delta);

/** Satırın bitti durumunu değiştirir. Satır yoksa veya zaten o durumdaysa null döner (değişiklik yok). */
function patchRow<T extends { id: string; completedAt?: string | null }>(
  rows: T[],
  id: string,
  done: boolean,
  at: string,
) {
  const index = rows.findIndex(row => row.id === id);
  if (index < 0 || !!rows[index].completedAt === done) return null;
  const next = rows.slice();
  next[index] = { ...rows[index], completedAt: done ? at : null };
  return next;
}

export function patchGlance(glance: Glance, delta: number): Glance {
  return {
    ...glance,
    completedItemCount: bump(glance.completedItemCount, delta),
    openItemCount: bump(glance.openItemCount, -delta),
  };
}

/** Özet sayaçlar (biten/açık) yalnız satır gerçekten değiştiyse oynar. */
export function setEntryDone(overview: DayOverview, id: string, done: boolean, at: string): DayOverview {
  const timed = patchRow<Schedule>(overview.timed.items, id, done, at);
  const untimed = patchRow<DayItem>(overview.untimed.items, id, done, at);
  if (!timed && !untimed) return overview;
  return {
    ...overview,
    timed: timed ? { ...overview.timed, items: timed } : overview.timed,
    untimed: untimed ? { ...overview.untimed, items: untimed } : overview.untimed,
    glance: patchGlance(overview.glance, done ? 1 : -1),
  };
}

/** Sunucunun döndürdüğü güncel satırlar (sürüm, tamamlanma zamanı, görev alanları) önbelleğe aynen yazılır. */
export function replaceRows(overview: DayOverview, rows: { items?: DayItem[]; schedules?: Schedule[] }): DayOverview {
  const swap = <T extends { id: string }>(current: T[], incoming: T[] | undefined) => {
    if (!incoming?.length) return null;
    let changed = false;
    const next = current.map(row => {
      const found = incoming.find(candidate => candidate.id === row.id);
      if (!found) return row;
      changed = true;
      return found;
    });
    return changed ? next : null;
  };
  const timed = swap<Schedule>(overview.timed.items, rows.schedules);
  const untimed = swap<DayItem>(overview.untimed.items, rows.items);
  if (!timed && !untimed) return overview;
  return {
    ...overview,
    timed: timed ? { ...overview.timed, items: timed } : overview.timed,
    untimed: untimed ? { ...overview.untimed, items: untimed } : overview.untimed,
  };
}

export type RemovedRow =
  { kind: "timed"; row: Schedule; index: number } | { kind: "untimed"; row: DayItem; index: number };

/** Satırı listeden çıkarır; geri koymak için yerini döndürür. Satır yoksa null. */
export function removeEntry(overview: DayOverview, id: string): { overview: DayOverview; removed: RemovedRow } | null {
  const timedAt = overview.timed.items.findIndex(row => row.id === id);
  if (timedAt >= 0)
    return {
      removed: { kind: "timed", row: overview.timed.items[timedAt], index: timedAt },
      overview: {
        ...overview,
        timed: {
          ...overview.timed,
          items: overview.timed.items.filter((_, i) => i !== timedAt),
          total: bump(overview.timed.total, -1),
        },
      },
    };
  const untimedAt = overview.untimed.items.findIndex(row => row.id === id);
  if (untimedAt < 0) return null;
  return {
    removed: { kind: "untimed", row: overview.untimed.items[untimedAt], index: untimedAt },
    overview: {
      ...overview,
      untimed: {
        ...overview.untimed,
        items: overview.untimed.items.filter((_, i) => i !== untimedAt),
        total: bump(overview.untimed.total, -1),
      },
    },
  };
}

/** removeEntry'nin tersi. Satır zaten listedeyse dokunmaz. */
export function restoreEntry(overview: DayOverview, saved: RemovedRow): DayOverview {
  if (saved.kind === "timed") {
    if (overview.timed.items.some(row => row.id === saved.row.id)) return overview;
    const items = overview.timed.items.slice();
    items.splice(Math.min(saved.index, items.length), 0, saved.row);
    return { ...overview, timed: { ...overview.timed, items, total: bump(overview.timed.total, 1) } };
  }
  if (overview.untimed.items.some(row => row.id === saved.row.id)) return overview;
  const items = overview.untimed.items.slice();
  items.splice(Math.min(saved.index, items.length), 0, saved.row);
  return { ...overview, untimed: { ...overview.untimed, items, total: bump(overview.untimed.total, 1) } };
}

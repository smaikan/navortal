import { pageSize } from "./model";

/** Yalnız verisiz sayfa gezinmeyi kilitler. Arka plan yenilemesi tıklamayı yutmamalı. */
export function Paging({
  offset,
  total,
  loading,
  noun,
  set,
}: {
  offset: number;
  total: number;
  loading: boolean;
  noun: string;
  set: (n: number) => void;
}) {
  if (total <= pageSize && !offset) return null;
  return (
    <div className="actions">
      <button disabled={loading || !offset} onClick={() => set(offset - pageSize)}>
        Önceki {noun}
      </button>
      <span>
        {total} kayıt · {offset / pageSize + 1}. sayfa
      </span>
      <button
        disabled={loading || offset >= 100000 || offset + pageSize >= total}
        onClick={() => set(offset + pageSize)}
      >
        Sonraki {noun}
      </button>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useTasks } from "../tasks/queries";
import { readTask } from "../tasks/model";
import { ApiError } from "../../lib/api/errors";
export function CriticalNames({
  ids,
  remove,
  move,
}: {
  ids: string[];
  remove?: (id: string) => void;
  move?: (index: number) => void;
}) {
  const { session, state } = useSession();
  const rows = useQueries({
    queries: ids.map(id => ({
      queryKey: queryKeys.resource(state.user!.id, "task", { id }),
      networkMode: "always" as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const v = readTask(await session.api.read("/api/tasks/{id}", { path: { id }, signal }));
        if (v.id !== id) throw new ApiError("protocol", "Görev kimliği uyuşmuyor.");
        return v;
      },
    })),
  });
  return (
    <ol className="support-critical-list">
      {ids.map((id, i) => (
        <li key={id}>
          <span>
            {rows[i]?.data?.title ?? `Kritik iş ${i + 1}${rows[i]?.isError ? " · Okunamadı" : " · Okunuyor…"}`}
          </span>
          {remove && (
            <button type="button" onClick={() => remove(id)} aria-label={`${i + 1}. kritik işi çıkar`}>
              Çıkar
            </button>
          )}
          {move && i > 0 && (
            <button type="button" onClick={() => move(i)} aria-label={`${i + 1}. kritik işi yukarı taşı`}>
              Yukarı
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
export function CriticalChoice({ ids, change }: { ids: string[]; change: (ids: string[]) => void }) {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const q = useTasks({
    offset,
    limit: 25,
    search: search || undefined,
    includeArchived: false,
    includeCompleted: false,
    orderBy: "Title",
  });
  return (
    <section aria-label="Kritik iş seçimi">
      <p>En fazla 3 önemli iş seçebilirsin. Seçmemek de mümkün; bu seçim çalışma başlatmaz.</p>
      <CriticalNames
        ids={ids}
        remove={id => change(ids.filter(x => x !== id))}
        move={i => {
          const next = [...ids];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          change(next);
        }}
      />
      <label>
        Önemli iş ara
        <input maxLength={200} value={text} onChange={e => setText(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          setSearch(text.trim());
          setOffset(0);
        }}
      >
        İş ara
      </button>
      {q.isPending && <p role="status">İşler okunuyor…</p>}
      {q.isError && (
        <p role="alert">
          İşler okunamadı.
          <button type="button" onClick={() => void q.refetch()}>
            İşleri yeniden oku
          </button>
        </p>
      )}
      <ul className="support-picker">
        {q.data?.items.map(t => (
          <li key={t.id}>
            <button
              type="button"
              disabled={ids.length >= 3 || ids.includes(t.id)}
              onClick={() => change([...ids, t.id])}
            >
              {t.title} · Kritiklere ekle
            </button>
          </li>
        ))}
      </ul>
      {q.data && !q.data.items.length && <p>Bu aramada iş yok.</p>}
      <div className="actions">
        <button type="button" disabled={!offset || q.isFetching} onClick={() => setOffset(offset - 25)}>
          Önceki işler
        </button>
        <button
          type="button"
          disabled={q.isFetching || offset + 25 >= Number(q.data?.total ?? 0) || offset >= 100000}
          onClick={() => setOffset(offset + 25)}
        >
          Sonraki işler
        </button>
      </div>
    </section>
  );
}

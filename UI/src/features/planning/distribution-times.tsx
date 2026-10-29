"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { duration, readTime } from "../tasks/work/model";
export function DistributionTimes({ selected }: { selected: ReadonlyMap<string, string> }) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0);
  const start = Math.min(offset, Math.max(0, Math.ceil(selected.size / 25) - 1) * 25);
  return (
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Seçilen işlerin gerçek ve kalan süreleri</summary>
      <p>Alt işler dahil toplamlar sunucudan okunur. Kalan iş, bu aralığa henüz yerleşmemiş miktardan ayrıdır.</p>
      {open && (
        <section aria-label="Seçili iş süreleri">
          <ul className="proposal-list">
            {[...selected].slice(start, start + 25).map(([id, title]) => (
              <li key={id}>
                <TaskTime id={id} title={title} />
              </li>
            ))}
          </ul>
          {selected.size > 25 && (
            <nav aria-label="Seçili iş süre sayfaları" className="task-pagination">
              <button disabled={!start} onClick={() => setOffset(Math.max(0, start - 25))}>
                Önceki
              </button>
              <span>
                {Math.min(start + 25, selected.size)} / {selected.size}
              </span>
              <button disabled={start + 25 >= selected.size} onClick={() => setOffset(start + 25)}>
                Sonraki
              </button>
            </nav>
          )}
        </section>
      )}
    </details>
  );
}
function TaskTime({ id, title }: { id: string; title: string }) {
  const { session, state } = useSession();
  const result = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-time", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readTime(await session.api.read("/api/tasks/{id}/time", { path: { id }, signal }), id),
  });
  return (
    <>
      <strong>{title}</strong>
      {result.data && (
        <p>
          Gerçek çalışma: {duration(result.data.subtreeActualSeconds)} · Kalan iş:{" "}
          {result.data.remainingSeconds === null ? "Bilinmiyor" : duration(result.data.remainingSeconds)}
        </p>
      )}
      {result.isPending && <p role="status">Süreler okunuyor…</p>}
      {result.isError && (
        <p role="alert">
          Güncel süreler okunamadı.<button onClick={() => void result.refetch()}>Süreyi yeniden oku</button>
        </p>
      )}
    </>
  );
}

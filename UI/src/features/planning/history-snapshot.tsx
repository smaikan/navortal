"use client";
import type { components } from "../../lib/api/generated/schema";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { states } from "../tasks/model";
import { kinds, minutes, titleOf, type Schedule } from "./model";
import { deltaLabel, historyPageSize, readChanges, readItems, undoFailure } from "./history-model";

export function HistoryPager({
  offset,
  count,
  total,
  busy,
  change,
  label,
}: {
  offset: number;
  count: number;
  total: number;
  busy: boolean;
  change: (v: number) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="task-pagination">
      <button disabled={busy || !offset} onClick={() => change(Math.max(0, offset - historyPageSize))}>
        Önceki
      </button>
      <span>
        {count ? offset + count : 0} / {total}
      </span>
      <button
        disabled={busy || offset + count >= total || offset >= 100000}
        onClick={() => change(offset + historyPageSize)}
      >
        Sonraki
      </button>
    </nav>
  );
}
export function HistoricBlock({ block, zone, format }: { block: Schedule; zone: string; format: string }) {
  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone: zone,
    dateStyle: "short",
    timeStyle: "medium",
    hour12: format === "12h",
  });
  const s = block.taskSnapshot;
  return (
    <div className="history-block">
      <strong>{titleOf(block)}</strong>
      <p>
        {kinds[block.kind]} · {block.state === "Removed" ? "Kaldırılmış blok" : "Planlı blok"}
        {block.isFixed && " · Sabit"}
        {block.isLocked && " · Kilitli"}
      </p>
      <p>
        <time dateTime={block.startsAt}>{time.format(new Date(block.startsAt))}</time> –{" "}
        <time dateTime={block.endsAt}>{time.format(new Date(block.endsAt))}</time>
      </p>
      {s && (
        <>
          <p>
            Plan anındaki görev durumu: {states[s.state]} · Kendi işi{" "}
            {s.directWorkCompleted ? "tamamlanmış" : "tamamlanmamış"}
          </p>
          <p>
            Plan anındaki kendi iş tahmini: {minutes(s.directEstimatedSeconds)} · Hedef bütçe:{" "}
            {minutes(s.targetBudgetSeconds)}
          </p>
          <details>
            <summary>Plan anındaki bağlam</summary>
            {s.task.ancestors.length > 0 && <p>{s.task.ancestors.map(x => x.name).join(" › ")}</p>}
            <p>
              Proje: {s.task.project?.name ?? "—"} · Havuz: {s.task.pool?.name ?? "—"} · Kategori:{" "}
              {s.task.category?.name ?? "—"}
            </p>
          </details>
        </>
      )}
    </div>
  );
}
export function RevisionSnapshot({
  id,
  dayId,
  zone,
  format,
  label,
}: {
  id: string;
  dayId: string;
  zone: string;
  format: string;
  label: string;
}) {
  const { session, state } = useSession();
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "revision-items", { id, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readItems(
        await session.api.read("/api/plan-revisions/{id}/items", {
          path: { id },
          query: { Offset: offset, Limit: historyPageSize },
          signal,
        }),
        offset,
        id,
        dayId,
      ),
  });
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      {query.isPending && <p role="status">Revizyon blokları okunuyor…</p>}
      {query.isError && (
        <div role="alert">
          {undoFailure(query.error)}
          <button onClick={() => void query.refetch()}>Blokları yeniden oku</button>
        </div>
      )}
      {query.data && (
        <>
          {!query.data.total && <p>Bu revizyonda blok yok.</p>}
          <ol className="proposal-list" aria-label={`${label} blokları`}>
            {query.data.items.map(item => (
              <li key={item.id}>
                <HistoricBlock block={item.schedule} zone={zone} format={format} />
              </li>
            ))}
          </ol>
          <HistoryPager
            offset={offset}
            count={query.data.items.length}
            total={query.data.total}
            busy={query.isFetching}
            change={setOffset}
            label={`${label} sayfaları`}
          />
        </>
      )}
    </section>
  );
}
export function RevisionChanges({ id, zone, format }: { id: string; zone: string; format: string }) {
  const { session, state } = useSession();
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "revision-changes", { id, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readChanges(
        await session.api.read("/api/plan-revisions/{id}/changes", {
          path: { id },
          query: { Offset: offset, Limit: historyPageSize },
          signal,
        }),
        offset,
      ),
  });
  return (
    <section aria-label="Revizyonun değişiklikleri">
      <h3>Bu revizyonun önce/sonra farkları</h3>
      {query.isPending && <p role="status">Farklar okunuyor…</p>}
      {query.isError && (
        <div role="alert">
          {undoFailure(query.error)}
          <button onClick={() => void query.refetch()}>Farkları yeniden oku</button>
        </div>
      )}
      {query.data && (
        <>
          {!query.data.total && <p>Kaydedilmiş fark yok.</p>}
          <ol className="proposal-list" aria-label="Kaydedilmiş farklar">
            {query.data.items.map(change => (
              <li key={change.id}>
                <h4>{deltaLabel(change.type)}</h4>
                {change.conflictsAccepted && <p>Bu düzenlemede plan çakışması açıkça kabul edilmiş.</p>}
                {change.dayItemId ? (
                  <div className="proposal-pair">
                    <div>
                      <h4>Önce</h4>
                      {change.dayItemBefore ? <HistoricDayItem item={change.dayItemBefore} /> : <p>Planda değildi</p>}
                    </div>
                    <div>
                      <h4>Sonra</h4>
                      {change.dayItemAfter ? <HistoricDayItem item={change.dayItemAfter} /> : <p>Planda değil</p>}
                    </div>
                  </div>
                ) : (
                  <div className="proposal-pair">
                    <div>
                      <h4>Önce</h4>
                      {change.before ? (
                        <HistoricBlock block={change.before} zone={zone} format={format} />
                      ) : (
                        <p>Blok yok</p>
                      )}
                    </div>
                    <div>
                      <h4>Sonra</h4>
                      {change.after ? (
                        <HistoricBlock block={change.after} zone={zone} format={format} />
                      ) : (
                        <p>Blok yok</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <HistoryPager
            offset={offset}
            count={query.data.items.length}
            total={query.data.total}
            busy={query.isFetching}
            change={setOffset}
            label="Revizyon fark sayfaları"
          />
        </>
      )}
    </section>
  );
}

const itemStates: Record<string, string> = {
  Planned: "Saatsiz planda",
  Removed: "Plandan kaldırılmış",
  Scheduled: "Saatli bloğa dönüştü",
};
/** Plan geçmişindeki saatsiz öğenin günü, listedeki yeri ve durumu. */
function HistoricDayItem({ item }: { item: components["schemas"]["DayItemSnapshot"] }) {
  return (
    <p>
      {new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(
        new Date(`${item.localDate}T12:00:00Z`),
      )}{" "}
      · {itemStates[item.state] ?? item.state}
      {item.completedAt ? " · bitti" : ""}
    </p>
  );
}

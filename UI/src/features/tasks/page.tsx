"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Calendar, Check, CircleCheck, Clock, Search } from "lucide-react";
import { useCurrentTask, useTaskPanel } from "../../components/layout/task-panel";
import { ListSkeleton } from "../../components/ui/skeleton";
import { DateFilter } from "./date-filter";
import { changedFilters, estimateRanges, maxTaskOffset, taskFilters, type TaskQuery } from "./model";
import { useTasks } from "./queries";
import { rowFacts } from "./tree/model";
import { RowLevels } from "./row-levels";
import "./styles.css";
const TaskTree = lazy(() => import("./tree/view").then(module => ({ default: module.TaskTree })));

/** Aramada ağaç düz sonuç listesine döner. Arama temizlenince ağaç geri gelir. */
export function TasksPage() {
  const params = useSearchParams();
  const pathname = usePathname();
  const committed = params.get("search") ?? "";
  // Proje, havuz, kategori ve etiket bağlantıları düz filtreli liste olarak çalışır.
  const filters = taskFilters(params);
  const query = filters.query;
  const linked = [
    "projectId",
    "poolId",
    "categoryId",
    "tagId",
    "priority",
    "state",
    "isPlanned",
    "energyDemand",
    "estimate",
    "dateFrom",
    "dateTo",
  ].some(key => params.has(key));
  const filtered = !!committed || linked;
  function clear() {
    setTerm("");
    window.history.replaceState({}, "", pathname + window.location.hash);
  }
  function setFilters(changes: Record<string, string | null>) {
    const next = changedFilters(new URLSearchParams(window.location.search), changes);
    window.history.replaceState({}, "", pathname + (next.size ? `?${next}` : "") + window.location.hash);
  }
  function setOffset(offset: number) {
    const next = changedFilters(new URLSearchParams(window.location.search), {
      offset: offset ? String(offset) : null,
    });
    window.history.replaceState({}, "", pathname + (next.size ? `?${next}` : "") + window.location.hash);
  }
  const [term, setTerm] = useState(committed);
  useEffect(() => {
    if (term.trim() === committed) return;
    const timer = setTimeout(() => {
      const next = changedFilters(new URLSearchParams(window.location.search), { search: term.trim() || null });
      window.history.replaceState({}, "", pathname + (next.size ? `?${next}` : "") + window.location.hash);
    }, 250);
    return () => clearTimeout(timer);
  }, [term, committed, pathname]);
  return (
    <main id="main" className="workspace-main r2-tasks wide-scale" tabIndex={-1}>
      <header className="r2-head">
        <h1 tabIndex={-1}>Görevler</h1>
        <div className="r2-tools">
          <Link href="/tasks/completed" prefetch={false} className="button secondary head-action">
            <CircleCheck aria-hidden="true" size={16} />
            Biten görevler
          </Link>
          <label className="r2-search">
            <Search aria-hidden="true" size={14} />
            <span className="sr-only">Görevlerde ara</span>
            <input
              type="search"
              maxLength={200}
              value={term}
              placeholder="Görevlerde ara"
              onChange={event => setTerm(event.target.value)}
            />
          </label>
        </div>
      </header>
      <div className="r2-filters">
        <label>
          <span className="sr-only">Önceliğe göre süz</span>
          <select
            value={params.get("priority") ?? ""}
            onChange={event => setFilters({ priority: event.target.value || null })}
          >
            <option value="">Tüm öncelikler</option>
            <option value="Urgent">Acil öncelik</option>
            <option value="High">Yüksek öncelik</option>
            <option value="Normal">Normal öncelik</option>
            <option value="Low">Düşük öncelik</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Tahmini süreye göre süz</span>
          <select
            value={params.get("estimate") ?? ""}
            onChange={event => setFilters({ estimate: event.target.value || null })}
          >
            <option value="">Tüm süreler</option>
            {Object.entries(estimateRanges).map(([value, range]) => (
              <option key={value} value={value}>
                {range.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Efora göre süz</span>
          <select
            value={params.get("energyDemand") ?? ""}
            onChange={event => setFilters({ energyDemand: event.target.value || null })}
          >
            <option value="">Tüm eforlar</option>
            <option value="Low">Düşük efor</option>
            <option value="Medium">Orta efor</option>
            <option value="High">Yüksek efor</option>
          </select>
        </label>
        <DateFilter
          from={params.get("dateFrom") ?? ""}
          to={params.get("dateTo") ?? ""}
          change={(dateFrom, dateTo) => setFilters({ dateFrom, dateTo })}
        />
      </div>
      {filters.issue ? (
        <p role="alert" className="form-error">
          {filters.issue}
        </p>
      ) : filtered ? (
        <>
          <FilterNote linked={linked} clear={clear} />
          <SearchResults
            query={{
              ...query,
              limit: 50,
              includeCompleted:
                query.includeCompleted ??
                ((!query.energyDemand && !query.priority && !params.has("estimate") && !query.dateFrom) ||
                  query.state === "Completed"),
              includeArchived: false,
              excludeRecurring: true,
            }}
            setOffset={setOffset}
          />
        </>
      ) : (
        <Suspense fallback={<ListSkeleton label="Görevler okunuyor…" rows={6} />}>
          <TaskTree />
        </Suspense>
      )}
    </main>
  );
}

function FilterNote({ linked, clear }: { linked: boolean; clear: () => void }) {
  return linked ? (
    <p className="r2-filter">
      Süzülmüş liste.
      <button type="button" onClick={clear}>
        Filtreyi temizle
      </button>
    </p>
  ) : null;
}
function SearchResults({ query, setOffset }: { query: TaskQuery; setOffset: (offset: number) => void }) {
  const open = useTaskPanel();
  const currentTaskId = useCurrentTask();
  const results = useTasks(query);
  if (results.isPending) return <p role="status">Aranıyor…</p>;
  if (!results.data)
    return (
      <div role="alert" className="form-error">
        <p>Arama yapılamadı. Bağlantını kontrol et.</p>
        <button onClick={() => void results.refetch()}>Yeniden dene</button>
      </div>
    );
  const { items } = results.data;
  const offset = Number(results.data.offset);
  const limit = Number(results.data.limit);
  const total = Number(results.data.total);
  const hasNext = offset + limit < total && offset + limit <= maxTaskOffset;
  return (
    <section aria-label="Arama sonuçları" className="r2-tree">
      <p role="status" className="r2-result-count">
        {items.length === 0
          ? offset > 0
            ? "Bu sayfada görev yok."
            : "Bu aramayla veya filtreyle görev yok."
          : total > items.length
            ? `${offset + items.length} / ${total} sonuç`
            : `${total} sonuç`}
      </p>
      <ul className="r2-list">
        {items.map(task => {
          const facts = rowFacts(task);
          const done = task.state === "Completed";
          return (
            <li key={task.id} className="r2-node">
              <div className={`r2-row${done ? " done" : ""}`} data-task-panel-target>
                <span className="r2-leaf" aria-hidden="true">
                  {done ? <Check size={14} /> : <span className="r2-dot" />}
                </span>
                <button
                  type="button"
                  className="r2-title"
                  data-task-title={task.id}
                  onClick={event => open(task.id, event.currentTarget)}
                  aria-label={`${task.title} ayrıntısını aç`}
                  aria-current={currentTaskId === task.id || undefined}
                >
                  <span className="r2-text">{task.title}</span>
                  {task.parentTaskId && <span className="r2-sub">alt görev</span>}
                </button>
                <span className="r2-meta">
                  <RowLevels priority={facts.priority} effort={task.energyDemand} />
                  <span className="r2-range">
                    {facts.range && (
                      <>
                        <Calendar aria-hidden="true" size={12} />
                        <span className="sr-only">Tarih: </span>
                        {facts.range}
                      </>
                    )}
                  </span>
                  <span className="r2-estimate">
                    {facts.estimate && (
                      <>
                        <Clock aria-hidden="true" size={12} />
                        <span className="sr-only">Tahmini süre: </span>
                        {facts.estimate}
                      </>
                    )}
                  </span>
                  <span className="r2-progress" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {(offset > 0 || hasNext) && (
        <nav className="task-pagination" aria-label="Görev sonuçları sayfaları">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Önceki sayfa
          </button>
          <button type="button" disabled={!hasNext} onClick={() => setOffset(offset + limit)}>
            Sonraki sayfa
          </button>
        </nav>
      )}
    </section>
  );
}

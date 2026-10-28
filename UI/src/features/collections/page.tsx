"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { subscribeTraversal } from "../../lib/navigation/traversal";
import { changedFilters } from "../tasks/model";
import { duration } from "../tasks/work/model";
import { CreateResource } from "./create";
import { ResourceDetail } from "./detail";
import {
  resourceFailure,
  resourceFilters,
  resourceKinds,
  resourcePageSize,
  type ResourceKind,
  type ResourceSummary,
} from "./model";
import { useResources } from "./queries";
import { ResourceTile } from "./resource-tile";
import "./styles.css";

const summaryText = (value: ResourceSummary) =>
  !value.taskCount ? "Görev yok" : `${value.open} açık · ${value.known ? duration(value.known) : "süre belirsiz"}`;
const leave = "Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?";
/** Proje ve havuzun ortak liste/ayrıntı ekranı. Filtre ve açık kayıt URL'de. */
export function ResourcePage({ kind }: { kind: ResourceKind }) {
  const meta = resourceKinds[kind];
  const search = useSearchParams();
  const pathname = usePathname();
  const source = search.toString();
  const [urlState, setUrlState] = useState({ source, value: source });
  if (urlState.source !== source) setUrlState({ source, value: source });
  const params = new URLSearchParams(urlState.value);
  const filters = resourceFilters(params);
  const list = useResources(kind, filters.query, !filters.issue, true);
  const guard = useRef({ dirty: false, pending: false });
  const [term, setTerm] = useState<string | null>(null);
  const restore = useRef<string | null>(null);
  const report = useCallback((change: { dirty?: boolean; pending?: boolean }) => {
    Object.assign(guard.current, change);
  }, []);
  function allow() {
    return !guard.current.pending && (!guard.current.dirty || window.confirm(leave));
  }
  function navigate(changes: Record<string, string | null>, mode: "push" | "replace", resetOffset: boolean) {
    const next = changedFilters(new URLSearchParams(window.location.search), changes, resetOffset);
    setUrlState({ source, value: next.toString() });
    const url = pathname + (next.size ? `?${next}` : "") + window.location.hash;
    if (mode === "push") window.history.pushState({ adhdResource: true }, "", url);
    else window.history.replaceState(window.history.state, "", url);
  }
  function change(changes: Record<string, string | null>) {
    if (allow()) {
      guard.current.dirty = false;
      navigate({ ...changes, id: null }, "replace", true);
    }
  }
  function select(id: string) {
    if (id === filters.id || !allow()) return;
    guard.current.dirty = false;
    navigate({ id }, filters.id ? "replace" : "push", false);
  }
  function close() {
    if (!allow()) return;
    const id = filters.id;
    guard.current.dirty = false;
    restore.current = id;
    if (window.history.state?.adhdResource) window.history.back();
    else navigate({ id: null }, "replace", false);
  }
  const data = list.data;
  // Geri geçişi eşzamanlı değil. Liste görünür olunca odağı geri veriyoruz.
  useEffect(() => {
    if (filters.id || !restore.current || !data) return;
    (
      document.querySelector<HTMLElement>(`[data-resource-id="${restore.current}"]`) ??
      document.querySelector<HTMLElement>("#main h1")
    )?.focus();
    restore.current = null;
  }, [filters.id, data]);
  useEffect(() => {
    const id = filters.id;
    if (!id) return;
    const href = location.href;
    const unsubscribe = subscribeTraversal(event => {
      if (location.href === href) return;
      if (guard.current.dirty || guard.current.pending) {
        if (guard.current.pending || !window.confirm(leave)) {
          event.stopImmediatePropagation();
          history.pushState({ adhdResource: true }, "", href);
          return;
        }
        guard.current.dirty = false;
      }
      // Tarayıcıdaki Geri de sayfa düğmesi gibi ayrıntıyı kapatıyor ve odağı satıra döndürüyor.
      restore.current = id;
    }, 50);
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current.dirty || guard.current.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // Sayfa bağlantısı veya yerel çıkış taslağı sessizce kaybettirmemeli.
    const leaveAllowed = () => {
      if (!guard.current.dirty && !guard.current.pending) return true;
      if (guard.current.pending || !window.confirm(leave)) return false;
      guard.current.dirty = false;
      return true;
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self") || anchor.href === location.href)
        return;
      if (!leaveAllowed()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const logout = (event: Event) => {
      if (!leaveAllowed()) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("adhd:before-local-logout", logout);
    document.addEventListener("click", click, true);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("adhd:before-local-logout", logout);
      document.removeEventListener("click", click, true);
    };
  }, [filters.id]);
  function find(event: FormEvent) {
    event.preventDefault();
    change({ search: term ?? params.get("search") ?? "" });
    setTerm(null);
  }
  useEffect(() => {
    if (term === null) return;
    const timer = setTimeout(() => {
      if (term !== (params.get("search") ?? "")) {
        change({ search: term });
      }
      setTerm(null);
    }, 400);
    return () => clearTimeout(timer);
  });
  const focusCreate = () => document.getElementById(`${kind}-name`)?.focus();
  const offset = filters.query.offset;
  const count = data?.items.length ?? 0;
  const filtered = !!filters.query.search || filters.query.includeArchived;
  return (
    <main id="main" className="workspace-main resource-page" tabIndex={-1}>
      <header className="resource-head">
        <h1 tabIndex={-1}>{meta.title}</h1>
        <button type="button" className="primary resource-add" onClick={focusCreate}>
          <Plus aria-hidden="true" size={16} />
          Yeni {meta.lower}
        </button>
      </header>
      <div className="resource-shell">
        <div className={`resource-layout${filters.id ? " has-detail" : ""}`}>
          <section className="resource-list" aria-labelledby={`${kind}-list-heading`}>
            <h2 id={`${kind}-list-heading`} className="sr-only">
              Kayıtlı {meta.plural}
            </h2>
            <div className="resource-tools">
              <form role="search" onSubmit={find} className="resource-search r2-search">
                <label htmlFor={`${kind}-search`} className="sr-only">
                  {meta.singular} ara
                </label>
                <input
                  id={`${kind}-search`}
                  type="search"
                  maxLength={200}
                  placeholder={`${meta.singular} ara`}
                  value={term ?? params.get("search") ?? ""}
                  onChange={event => setTerm(event.target.value)}
                />
              </form>
              {data && (
                <p role="status" className="task-count">
                  {count
                    ? `${offset + count} / ${data.total} ${meta.lower}`
                    : `${data.total} ${meta.lower}`}
                  {list.isFetching && " · Yenileniyor…"}
                </p>
              )}
              <label className="r2-check-row r2-archived-toggle">
                <input
                  type="checkbox"
                  checked={filters.query.includeArchived}
                  onChange={event => change({ includeArchived: event.target.checked ? "true" : null })}
                />{" "}
                Arşivlenenleri göster
              </label>
            </div>

            {filters.issue ? (
              <div role="alert" className="form-error">
                <p>{filters.issue}</p>
                <button
                  type="button"
                  onClick={() => {
                    guard.current.dirty = false;
                    navigate({ search: null, includeArchived: null, offset: null, id: null }, "replace", true);
                    setTerm(null);
                  }}
                >
                  Filtreleri sıfırla
                </button>
              </div>
            ) : data ? (
              <>
                {list.isError && (
                  <div role="alert" className="form-error">
                    <p>Liste yenilenemedi. Gösterilen kayıtlar son alınan durumdur.</p>
                    <button type="button" onClick={() => void list.refetch()}>
                      Listeyi yeniden yükle
                    </button>
                  </div>
                )}
                {count ? (
                  <ul
                    className={`resource-items${kind === "categories" ? "" : " cards"}`}
                    aria-label={`${meta.title} listesi`}
                  >
                    {data.items.map(item => {
                      const summary = data.summaries.get(item.id);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="resource-row"
                            data-resource-id={item.id}
                            aria-current={item.id === filters.id ? "true" : undefined}
                            onClick={() => select(item.id)}
                          >
                            <span className="resource-row-head">
                              <ResourceTile kind={kind} />
                              <span className="resource-row-title">
                                <span className="resource-name">{item.name}</span>
                                {summary && <span className="resource-summary">{summaryText(summary)}</span>}
                              </span>
                            </span>
                            {item.description && <span className="resource-excerpt">{item.description}</span>}
                            {item.archivedAt && <span className="task-row-meta">Arşivlendi</span>}
                            {summary && summary.taskCount > 0 && kind !== "categories" && (
                              <span className="resource-progress">
                                <span>
                                  <i style={{ width: `${(summary.completed / summary.taskCount) * 100}%` }} />
                                </span>
                                {summary.completed}/{summary.taskCount}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="empty-state resource-empty">
                    <ResourceTile kind={kind} size={30} />
                    <h3>
                      {filtered
                        ? `Bu filtrelerle ${meta.lower} yok`
                        : offset
                          ? "Bu sayfada kayıt yok"
                          : `Henüz ${meta.lower} yok`}
                    </h3>
                    <p className="muted">
                      {filtered || offset ? "Aramayı veya filtreleri değiştirebilirsin." : meta.empty}
                    </p>
                  </div>
                )}
                <CreateResource
                  kind={kind}
                  created={resource => {
                    guard.current.dirty = false;
                    navigate({ id: resource.id, search: null, offset: null }, filters.id ? "replace" : "push", false);
                  }}
                />
                {(offset > 0 || data.total > resourcePageSize) && (
                  <nav className="task-pagination" aria-label={`${meta.title} sayfaları`}>
                    <button
                      type="button"
                      disabled={offset === 0 || list.isPending}
                      onClick={() =>
                        navigate({ offset: String(Math.max(0, offset - resourcePageSize)) }, "replace", false)
                      }
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      disabled={offset + count >= data.total || offset >= 100000 || list.isPending}
                      onClick={() => navigate({ offset: String(offset + resourcePageSize) }, "replace", false)}
                    >
                      Sonraki
                    </button>
                  </nav>
                )}
              </>
            ) : list.isPending ? (
              <p role="status">{meta.title} okunuyor…</p>
            ) : (
              <div role="alert" className="form-error">
                <p>{resourceFailure(list.error)}</p>
                <button type="button" onClick={() => void list.refetch()}>
                  Listeyi yeniden yükle
                </button>
              </div>
            )}
          </section>
          {filters.id && <ResourceDetail key={filters.id} kind={kind} id={filters.id} close={close} report={report} />}
        </div>
      </div>
    </main>
  );
}

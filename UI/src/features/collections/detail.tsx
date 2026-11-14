"use client";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { useCollectionTasks, ResourceTaskTree } from "./task-tree";
import { duration } from "../tasks/work/model";
import { ResourceTile } from "./resource-tile";
import {
  blocksWrite,
  descriptionLimit,
  nameLimit,
  readResource,
  rebaseResourceDraft,
  resourceDraft,
  resourceFailure,
  resourceFields,
  resourceKinds,
  resourceTaskPageSize,
  type Resource,
  type ResourceKind,
} from "./model";
import { resourceApi, useCollectionCache, useResource, useResourceWorkload } from "./queries";
const PlanTask = lazy(() => import("../planning/plan-task").then(module => ({ default: module.PlanTask })));
const ResourceTaskPicker = lazy(() => import("./task-picker").then(module => ({ default: module.ResourceTaskPicker })));

type Report = (change: { dirty?: boolean; pending?: boolean }) => void;
export function ResourceDetail({
  kind,
  id,
  close,
  report,
}: {
  kind: ResourceKind;
  id: string;
  close: () => void;
  report: Report;
}) {
  const meta = resourceKinds[kind];
  const resource = useResource(kind, id);
  const sections = useRef({ tasks: { dirty: false, pending: false }, editor: { dirty: false, pending: false } });
  const reportSection = useCallback(
    (section: "tasks" | "editor", change: { dirty?: boolean; pending?: boolean }) => {
      Object.assign(sections.current[section], change);
      report({
        dirty: sections.current.tasks.dirty || sections.current.editor.dirty,
        pending: sections.current.tasks.pending || sections.current.editor.pending,
      });
    },
    [report],
  );
  const reportTasks = useCallback(
    (change: { dirty?: boolean; pending?: boolean }) => reportSection("tasks", change),
    [reportSection],
  );
  const reportEditor = useCallback(
    (change: { dirty?: boolean; pending?: boolean }) => reportSection("editor", change),
    [reportSection],
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: false });
  }, [id]);
  const data = resource.data;
  return (
    <section className="resource-detail" aria-labelledby={`${kind}-detail-heading`}>
      <button type="button" className="resource-back" onClick={close}>
        {meta.title} listesine dön
      </button>
      <div className="resource-title">
        <ResourceTile kind={kind} size={24} />
        <div>
          <h2 id={`${kind}-detail-heading`} ref={heading} tabIndex={-1}>
            {data ? data.name : `${meta.singular} ayrıntısı`}
          </h2>
          {data && <p className="resource-state">{data.archivedAt ? "Arşivlendi · düzenlenemez" : "Etkin"}</p>}
        </div>
      </div>
      {resource.isError && !data && (
        <div role="alert" className="form-error">
          <p>{resourceFailure(resource.error)}</p>
          {!(resource.error instanceof ApiError && resource.error.status === 404) && (
            <button type="button" onClick={() => void resource.refetch()}>
              Yeniden yükle
            </button>
          )}
        </div>
      )}
      {!data && !resource.isError && <p role="status">{meta.singular} okunuyor…</p>}
      {data && (
        <>
          {data.description && <p className="task-description resource-description">{data.description}</p>}
          <WorkloadSummary kind={kind} id={id} />
          <ResourceTasks kind={kind} id={id} archived={!!data.archivedAt} report={reportTasks} />
          <ResourceEditor key={data.id} kind={kind} initial={data} report={reportEditor} />
        </>
      )}
    </section>
  );
}

function WorkloadSummary({ kind, id }: { kind: ResourceKind; id: string }) {
  const workload = useResourceWorkload(kind, id);
  const values = workload.data?.values;
  return (
    <section className="resource-block resource-workload" aria-labelledby={`${kind}-workload-heading`}>
      <h3 id={`${kind}-workload-heading`}>İş yükü</h3>
      {workload.isError && (
        <div role="alert" className="form-error">
          <p>
            {resourceFailure(workload.error)}
            {values && " Gösterilen değerler güncel olmayabilir."}
          </p>
          <button type="button" onClick={() => void workload.refetch()}>
            İş yükünü yeniden yükle
          </button>
        </div>
      )}
      {!values && !workload.isError && <p role="status">İş yükü okunuyor…</p>}
      {values && (
        <dl className="resource-metrics" aria-label={`${resourceKinds[kind].singular} iş yükü`}>
          <div>
            <dt>Görev</dt>
            <dd>{values.taskCount}</dd>
          </div>
          <div>
            <dt>Açık iş</dt>
            <dd>{values.openComponentCount}</dd>
          </div>
          <div>
            <dt>Bilinen tahmin süre</dt>
            <dd>{duration(values.knownEstimatedSeconds)}</dd>
          </div>
          <div>
            <dt>Tahminsiz iş</dt>
            <dd>{values.unknownEstimateCount}</dd>
          </div>
        </dl>
      )}
      <details className="resource-workload-note">
        <summary>İş yükü nasıl hesaplanır?</summary>
        <p className="muted form-hint">
          {kind === "tags"
            ? "Arşivlenmemiş görevler sayılır."
            : "Alt görevi olan ana görev sayılmaz; alt görevler ve tekil görevler sayılır."}{" "}
          Üst görev ve alt görevi aynı gruptaysa iş bir kez sayılır. Tahminsiz iş sıfır sayılmaz; gerçek çalışma ve plan
          burada yer almaz.
        </p>
      </details>
    </section>
  );
}

function ResourceTasks({
  kind,
  id,
  archived,
  report,
}: {
  kind: ResourceKind;
  id: string;
  archived: boolean;
  report: Report;
}) {
  const meta = resourceKinds[kind];
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPending, setPickerPending] = useState(false);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const reportPending = useCallback(
    (pending: boolean) => {
      setPickerPending(pending);
      report({ pending });
    },
    [report],
  );
  const tasks = useCollectionTasks(kind, id, offset, resourceTaskPageSize);
  const data = tasks.data;
  const count = data?.items.length ?? 0;
  const parentIds = new Set(data?.nodes.map(task => task.parentTaskId));
  const taskCount =
    data?.taskCount ??
    (kind === "tags" ? data?.nodes.length : data?.nodes.filter(task => !parentIds.has(task.id)).length);
  const [plan, setPlan] = useState<{
    task: { id: string; title: string; scope?: "Single" | "Subtree" };
    trigger: HTMLElement;
  } | null>(null);
  return (
    <section className="resource-block" aria-labelledby={`${kind}-tasks-heading`}>
      <div className="resource-section-heading">
        <h3 id={`${kind}-tasks-heading`} tabIndex={-1}>
          Görevler {data && <span className="resource-task-count">{taskCount}</span>}
        </h3>
        {!archived && (kind === "projects" || kind === "pools") && (
          <button
            ref={pickerTrigger}
            type="button"
            className={pickerOpen ? "ghost" : "primary"}
            disabled={pickerPending}
            aria-expanded={pickerOpen}
            aria-controls={`${kind}-task-picker`}
            onClick={() => {
              setPickerOpen(value => !value);
              if (pickerOpen) requestAnimationFrame(() => pickerTrigger.current?.focus());
            }}
          >
            {pickerOpen ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            <span>{pickerOpen ? "Görev seçimini kapat" : "Görev ekle"}</span>
          </button>
        )}
      </div>
      {!archived && pickerOpen && (kind === "projects" || kind === "pools") && (
        <div id={`${kind}-task-picker`}>
          <Suspense fallback={<p role="status">Görev seçimi açılıyor…</p>}>
            <ResourceTaskPicker kind={kind} id={id} reportPending={reportPending} />
          </Suspense>
        </div>
      )}
      {tasks.isError && (
        <div role="alert" className="form-error">
          <p>Görevler alınamadı. Bağlantını kontrol edip yeniden yükle.</p>
          <button type="button" onClick={() => void tasks.refetch()}>
            Görevleri yeniden yükle
          </button>
        </div>
      )}
      {!data && !tasks.isError && <p role="status">Görevler okunuyor…</p>}
      {data && (
        <>
          <p className="muted relation-count">{data.total} ana / tekil görev grubu</p>
          {count ? (
            <ResourceTaskTree
              kind={kind}
              id={id}
              contextTaskIds={data.contextTaskIds ?? []}
              roots={data.roots}
              nodes={data.nodes}
              parents={data.parents}
              archived={archived}
              onPlan={(task, trigger, subtree) =>
                setPlan({ task: { ...task, scope: subtree ? "Subtree" : "Single" }, trigger })
              }
            />
          ) : (
            <p className="relation-empty">
              Bu {meta.locative} arşivlenmemiş görev yok. Arşivlenmiş görevler bu listede ve iş yükünde sayılmaz.
            </p>
          )}
          {(offset > 0 || Number(data.total) > resourceTaskPageSize) && (
            <nav className="task-pagination" aria-label={`${meta.singular} görev sayfaları`}>
              <button
                type="button"
                disabled={offset === 0 || tasks.isPending}
                onClick={() => setOffset(value => Math.max(0, value - resourceTaskPageSize))}
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={offset + count >= Number(data.total) || offset >= 100000 || tasks.isPending}
                onClick={() => setOffset(value => value + resourceTaskPageSize)}
              >
                Sonraki
              </button>
            </nav>
          )}
        </>
      )}
      {plan && (
        <Suspense fallback={<p role="status">Gün seçimi açılıyor…</p>}>
          <PlanTask task={plan.task} trigger={plan.trigger} close={() => setPlan(null)} report={report} />
        </Suspense>
      )}
    </section>
  );
}

function ResourceEditor({ kind, initial, report }: { kind: ResourceKind; initial: Resource; report: Report }) {
  const meta = resourceKinds[kind];
  const { session } = useSession();
  const cache = useCollectionCache(kind);
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => resourceDraft(initial));
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [latest, setLatest] = useState<Resource | null>(null);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(resourceDraft(base));
  // Sunucunun yeni kopyası yalnız dokunulmamış formu yeniliyor. Taslağın üstüne yazmıyoruz.
  const [seen, setSeen] = useState(initial.version);
  const [editOpen, setEditOpen] = useState(false);
  const opened = useRef(false);
  // Bölüm açılınca düğmeyle birlikte odak kaybolmasın, ilk alana geçsin.
  useLayoutEffect(() => {
    if (editOpen && opened.current) {
      opened.current = false;
      document.getElementById(`${kind}-edit-name`)?.focus();
    }
  }, [editOpen, kind]);
  if (seen !== initial.version) {
    setSeen(initial.version);
    if (!dirty && !pending) {
      setBase(initial);
      setDraft(resourceDraft(initial));
    }
  }
  useLayoutEffect(() => {
    report({ dirty, pending });
  }, [dirty, pending, report]);
  useEffect(() => () => report({ dirty: false, pending: false }), [report]);
  useLayoutEffect(() => {
    if (failure && !pending) errorBox.current?.focus();
  }, [failure, pending]);
  async function command(archive: boolean) {
    if (busy.current || blocked) return;
    let fields;
    try {
      fields = archive ? undefined : resourceFields(draft);
    } catch (error) {
      setFailure(resourceFailure(error));
      return;
    }
    if (
      archive &&
      !window.confirm(
        `${base.name} arşivlenecek. Bu sürümde arşivden geri açma yok. Görevler silinmez ve bağları korunur; kaydedilmemiş değişiklikler uygulanmaz. Devam edilsin mi?`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setFailure("");
    setDone("");
    try {
      const raw = archive
        ? await resourceApi.archive(session.api, kind, base.id, base.version)
        : await resourceApi.update(session.api, kind, base.id, { version: base.version, ...fields! });
      let result;
      try {
        result = readResource(raw);
        if (result.id !== base.id) throw new Error();
      } catch {
        throw new ApiError("protocol", "Yanıt eksik.", 200, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      setBase(result);
      setDraft(resourceDraft(result));
      setLatest(null);
      setDone(archive ? `${meta.singular} arşivlendi. Görevler ve geçmiş korunur.` : `${meta.singular} kaydedildi.`);
      report({ dirty: false });
      void cache.update(result);
    } catch (error) {
      if (cache.current()) {
        setBlocked(blocksWrite(error));
        setFailure(resourceFailure(error));
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const value = readResource(await resourceApi.get(session.api, kind, base.id));
      if (cache.current()) setLatest(value);
    } catch (error) {
      if (cache.current()) setFailure(resourceFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function reconcile(keep: boolean) {
    if (!latest) return;
    setDraft(keep ? rebaseResourceDraft(base, draft, latest) : resourceDraft(latest));
    setBase(latest);
    setLatest(null);
    setBlocked(false);
    setFailure("");
    setDone(keep ? "Taslağın güncel kayıt üzerinden açıldı. Kontrol edip kaydet." : "Sunucudaki kayıt yüklendi.");
    void cache.update(latest);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void command(false);
  }
  const label = `${meta.accusative.charAt(0).toLocaleUpperCase("tr") + meta.accusative.slice(1)} düzenle`;
  const pinned = dirty || !!failure || !!latest || pending || !!done;
  if (!base.archivedAt && !pinned && !editOpen)
    return (
      <section className="resource-block resource-edit-closed" aria-label={label}>
        <button
          type="button"
          className="ghost disclosure"
          aria-expanded="false"
          onClick={() => {
            opened.current = true;
            setEditOpen(true);
          }}
        >
          {label}
        </button>
      </section>
    );
  return (
    <section className="resource-block" aria-labelledby={`${kind}-edit-heading`}>
      <h3 id={`${kind}-edit-heading`}>{base.archivedAt ? "Arşivlenmiş kayıt" : "Düzenle"}</h3>
      {base.archivedAt && (
        <p className="muted form-hint">Arşivlenmiş kayıt düzenlenemez. Görevler ve geçmiş kayıtlar korunur.</p>
      )}
      {!base.archivedAt && (
        <form onSubmit={save} noValidate aria-label={`${meta.singular} bilgilerini düzenle`}>
          <fieldset disabled={pending || !!base.archivedAt}>
            <div className="hours-field">
              <label htmlFor={`${kind}-edit-name`}>{meta.singular} adı</label>
              <input
                id={`${kind}-edit-name`}
                maxLength={nameLimit}
                value={draft.name}
                onChange={event => {
                  setDraft({ ...draft, name: event.target.value });
                  setDone("");
                }}
              />
            </div>
            <div className="hours-field">
              <label htmlFor={`${kind}-edit-description`}>Açıklama</label>
              <textarea
                id={`${kind}-edit-description`}
                rows={4}
                maxLength={descriptionLimit}
                value={draft.description}
                onChange={event => {
                  setDraft({ ...draft, description: event.target.value });
                  setDone("");
                }}
              />
            </div>
            {!base.archivedAt && (
              <div className="actions">
                <button className="primary" disabled={!dirty || blocked}>
                  {pending ? "Kaydediliyor…" : `${meta.singular} bilgilerini kaydet`}
                </button>
              </div>
            )}
          </fieldset>
        </form>
      )}
      {failure && (
        <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
          <p>{failure}</p>
          {blocked && (
            <button type="button" disabled={pending} onClick={() => void check()}>
              Sunucudaki kaydı kontrol et
            </button>
          )}
        </div>
      )}
      {latest && (
        <section aria-label="Sunucudaki güncel kayıt" className="reconcile-panel">
          <h3>Sunucudaki güncel kayıt</h3>
          <p className="resource-name">{latest.name}</p>
          <p className="task-description">{latest.description || "Açıklama yok"}</p>
          {latest.archivedAt && <p>Arşivlendi</p>}
          <p className="muted">Önceki istek kaydedilmiş olabilir; hiçbir işlem otomatik tekrarlanmaz.</p>
          <div className="actions">
            <button type="button" disabled={pending} onClick={() => reconcile(false)}>
              Sunucudaki kaydı kullan
            </button>
            {!latest.archivedAt && (
              <button type="button" disabled={pending} onClick={() => reconcile(true)}>
                Taslağımı güncel kayıtla düzenle
              </button>
            )}
          </div>
        </section>
      )}
      <p role="status" className="task-feedback">
        {done}
      </p>
      {!base.archivedAt && (
        <div className="task-archive">
          <button type="button" disabled={pending || blocked} onClick={() => void command(true)}>
            {meta.accusative.charAt(0).toLocaleUpperCase("tr") + meta.accusative.slice(1)} arşivle
          </button>
          <p className="muted form-hint">
            Arşivlenen {meta.lower} listede gizlenir; görevler ve geçmiş kayıtlar silinmez. Bu sürümde geri açma yok.
          </p>
        </div>
      )}
    </section>
  );
}

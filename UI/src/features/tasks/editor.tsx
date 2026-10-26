"use client";
import { lazy, Suspense, useId, useRef, useState } from "react";
import { Check, ChevronRight, Flag } from "lucide-react";
import { useSession } from "../auth/provider";
import { TaskEnergy } from "../support/energy";
import { TaskNotesSection } from "../notes/task-section";
import { useCloseTaskPanel, useTaskDraftGuard, useTaskPanel } from "../../components/layout/task-panel";
import { Menu } from "../../components/ui/menu";
import { ApiError } from "../../lib/api/errors";
import { isOffline, offlineWrite, priorities, readTask, taskFailure, titleIssue, type Task } from "./model";
import { taskDraft, taskUpdate, type TaskDraft } from "./editor-model";
import { useTaskRead } from "./read-context";
import { useTask, useTaskCache } from "./queries";
import { WorkStartControl } from "./work/start";
import { EstimateSection } from "./work/estimate";
import { RangeSection } from "./range";
import { TaskRangeDrafts } from "./range-drafts";
import { TaskRelationsSection } from "./relations/section";
import type { RelationKind } from "./relations/model";
import { TaskClassificationSection } from "./classification/section";
import { SubtasksSection } from "./subtasks";
import { useClassificationState, type ClassificationField } from "./classification/model";
import { useTaskSummary } from "./tree/queries";
import { useTreeActions } from "./tree/actions";
import "./styles.css";
const ClassificationPicker = lazy(() =>
  import("./classification/picker").then(module => ({ default: module.ClassificationPicker })),
);
const AddRelationDialog = lazy(() =>
  import("./relations/add-dialog").then(module => ({ default: module.AddRelationDialog })),
);
const ManualWorkDialog = lazy(() =>
  import("../work/manual-dialog").then(module => ({ default: module.ManualWorkDialog })),
);

const same = (a: TaskDraft, b: TaskDraft) =>
  a.title === b.title && a.description === b.description && a.priority === b.priority && a.deadline === b.deadline;

/** Görev panelinde Başlat ve bitir önce. Ad, açıklama ve öncelik çıkışta/seçimde kaydolur. Tahmin, gün aralığı, enerji, gruplama, otomatik bitirme ve notlar altta. Taslak responsive Surface'ın üstünde tutulur. */
export function TaskEditor({
  initial,
  zone: currentZone,
  surface,
}: {
  initial: Task;
  zone: string;
  surface: (content: React.ReactNode) => React.ReactNode;
}) {
  const [zone] = useState(currentZone);
  const id = useId();
  const { session } = useSession();
  const cache = useTaskCache();
  const actions = useTreeActions();
  const open = useTaskPanel();
  const close = useCloseTaskPanel();
  const summary = useTaskSummary(initial.id);
  const hasChildren = Number(summary.data?.childCount ?? 0) > 0;
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => taskDraft(initial, zone));
  const [manualTrigger, setManualTrigger] = useState<HTMLElement | null>(null);
  const [relationAdd, setRelationAdd] = useState<{ kind: RelationKind; trigger: HTMLElement } | null>(null);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const classification = useClassificationState();
  const [classificationPick, setClassificationPick] = useState<{
    field: ClassificationField;
    trigger: HTMLElement;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [latest, setLatest] = useState<Task | null>(null);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const dirty = !same(draft, taskDraft(base, zone));
  const [seen, setSeen] = useState(initial.version);
  if (seen !== initial.version) {
    setSeen(initial.version);
    if (!dirty && !pending) {
      setBase(initial);
      setDraft(taskDraft(initial, zone));
    }
  }
  useTaskDraftGuard(dirty || pending || classification.dirty || classification.pending);
  const archived = base.archivedAt !== null;
  const done = initial.state === "Completed";
  const titleError = titleIssue(draft.title);
  function fail(text: string) {
    setFailure(text);
    requestAnimationFrame(() => errorBox.current?.focus());
  }
  /** Biten düzenleme başına tek PUT. Diğer alanlar değişmeden gider; canSplit UI-R2'de hep true. */
  async function commit(next: TaskDraft) {
    if (busy.current || blocked || archived || same(next, taskDraft(base, zone)) || titleIssue(next.title)) return;
    let body;
    try {
      body = taskUpdate(base, { ...next, canSplit: true }, zone);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Alanları kontrol et.");
      return;
    }
    busy.current = true;
    setPending(true);
    setFailure("");
    setMessage("");
    try {
      let result;
      try {
        result = readTask(
          await session.api.mutation("/api/tasks/{id}", "put", { path: { id: base.id }, body }).execute(),
        );
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("protocol", "Yanıt eksik.", 200, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      setBase(result);
      setDraft(current => (same(current, next) ? taskDraft(result, zone) : current));
      setLatest(null);
      setMessage("Kaydedildi");
      void cache.update(result);
    } catch (error) {
      if (!cache.current()) return;
      setBlocked(error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status === 404));
      fail(taskFailure(error));
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
      const value = readTask(await session.api.read("/api/tasks/{id}", { path: { id: base.id } }));
      if (cache.current()) setLatest(value);
    } catch (error) {
      if (cache.current()) fail(taskFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function reconcile(keep: boolean) {
    if (!latest) return;
    // Yalnız yerelde değişen alanı tutuyoruz. Sunucunun diğer değişiklikleri uzlaştırmada kaybolmasın.
    const original = taskDraft(base, zone);
    const remote = taskDraft(latest, zone);
    const next = keep
      ? (Object.fromEntries(
          Object.entries(remote).map(([key, value]) => [
            key,
            draft[key as keyof TaskDraft] === original[key as keyof TaskDraft] ? value : draft[key as keyof TaskDraft],
          ]),
        ) as TaskDraft)
      : remote;
    setDraft(next);
    setBase(latest);
    void cache.update(latest);
    setLatest(null);
    setBlocked(false);
    setFailure("");
    setMessage(
      keep ? "Değişikliğin güncel kayıt üzerine taşındı. Kaydetmek için alandan çık." : "Güncel kayıt yüklendi.",
    );
  }
  function set(next: TaskDraft, now = false) {
    setDraft(next);
    setMessage("");
    if (now) void commit(next);
  }
  return (
    <TaskRangeDrafts>
      {surface(
        <div className="r2-panel">
          <div className="r2-panel-top">
            <WorkStartControl task={initial} />
            {!archived && (
              <button
                type="button"
                className="r2-finish"
                disabled={actions.pending === initial.id}
                onClick={() => void (done ? actions.reopen(initial) : actions.complete(initial))}
              >
                <Check aria-hidden="true" size={14} />
                {done ? "Yeniden aç" : "Görevi bitir"}
              </button>
            )}
            <span className="r2-spacer" />
            <Menu
              label="Görev menüsü"
              items={[
                {
                  label: "Geçmiş çalışma ekle",
                  disabled: archived || !initial.hasDirectWork,
                  onSelect: trigger => setManualTrigger(trigger),
                },
                {
                  label: relationsOpen ? "Ön koşulları gizle" : "Ön koşullar ve sıra",
                  onSelect: () => setRelationsOpen(value => !value),
                },
                !archived && {
                  label: "Görevi sil",
                  danger: true,
                  onSelect: () =>
                    void actions.remove(initial).then(deleted => {
                      if (deleted) close();
                    }),
                },
              ]}
            />
          </div>
          {initial.parentTaskId && <ParentLink id={initial.parentTaskId} open={open} />}
          <fieldset className="r2-fields" disabled={archived}>
            <div className="r2-title-row">
              {done && <Check className="r2-check" aria-hidden="true" size={16} />}
              <textarea
                id={`${id}-title`}
                className={`r2-title-input${done ? " done" : ""}`}
                rows={1}
                maxLength={300}
                aria-label="Görev başlığı"
                value={draft.title}
                aria-invalid={!!titleError || undefined}
                aria-describedby={titleError ? `${id}-title-error` : undefined}
                onChange={event => set({ ...draft, title: event.target.value.replace(/\n/g, " ") })}
                onBlur={() => void commit(draft)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
            {titleError && (
              <p id={`${id}-title-error`} role="alert" className="field-error">
                {titleError}
              </p>
            )}
            <textarea
              className="r2-description"
              rows={2}
              maxLength={10000}
              aria-label="Açıklama"
              placeholder="Açıklama ekle"
              value={draft.description}
              onChange={event => set({ ...draft, description: event.target.value })}
              onBlur={() => void commit(draft)}
            />
            <div className="r2-prop">
              <Flag aria-hidden="true" size={14} />
              <label htmlFor={`${id}-priority`}>Öncelik</label>
              <select
                id={`${id}-priority`}
                value={draft.priority}
                onChange={event => set({ ...draft, priority: event.target.value as Task["priority"] }, true)}
              >
                {Object.entries(priorities).map(([value, text]) => (
                  <option value={value} key={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <p role="status" className="r2-saved">
            {pending ? "Kaydediliyor…" : message}
          </p>
          {failure && (
            <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
              <p>{failure}</p>
              {blocked && (
                <button disabled={pending} onClick={() => void check()}>
                  Güncel görevi kontrol et
                </button>
              )}
            </div>
          )}
          {latest && (
            <section aria-label="Güncel görev" className="reconcile-panel">
              <h3>Sunucudaki güncel görev</h3>
              <p>{latest.title}</p>
              <p className="task-description">{latest.description || "Açıklama yok"}</p>
              <p>{priorities[latest.priority]} öncelik</p>
              {latest.archivedAt && <p>Arşivlendi</p>}
              <div className="actions">
                <button disabled={pending} onClick={() => reconcile(false)}>
                  Sunucudaki görevi kullan
                </button>
                {!latest.archivedAt && (
                  <button disabled={pending} onClick={() => reconcile(true)}>
                    Taslağımı güncel görevle düzenle
                  </button>
                )}
              </div>
            </section>
          )}
          <SubtasksSection key={`subtasks-${initial.id}`} task={initial} />
          <EstimateSection key={`estimate-${initial.id}`} task={initial} hasChildren={hasChildren} />
          <RangeSection key={`range-${initial.id}`} task={initial} />
          <TaskEnergy key={`energy-${initial.id}`} task={initial} />
          <TaskClassificationSection
            task={initial}
            state={classification}
            pick={(field, trigger) => setClassificationPick({ field, trigger })}
            open
            setOpen={() => {}}
          />
          {hasChildren && <AutoComplete key={`auto-${initial.id}`} task={initial} />}
          <TaskNotesSection key={`notes-${initial.id}`} taskId={initial.id} taskTitle={initial.title} zone={zone} />
          {relationsOpen && (
            <TaskRelationsSection
              task={initial}
              add={(kind, trigger) => setRelationAdd({ kind, trigger })}
              open
              setOpen={setRelationsOpen}
            />
          )}
        </div>,
      )}
      {manualTrigger && (
        <Suspense fallback={<p role="status">Geçmiş çalışma formu açılıyor…</p>}>
          <ManualWorkDialog task={initial} zone={zone} trigger={manualTrigger} close={() => setManualTrigger(null)} />
        </Suspense>
      )}
      {relationAdd && (
        <Suspense fallback={<p role="status">Görev seçici açılıyor…</p>}>
          <AddRelationDialog
            kind={relationAdd.kind}
            task={initial}
            trigger={relationAdd.trigger}
            close={() => setRelationAdd(null)}
          />
        </Suspense>
      )}
      {classificationPick && classification.draft && (
        <Suspense fallback={<p role="status">Seçici açılıyor…</p>}>
          <ClassificationPicker
            field={classificationPick.field}
            draft={classification.draft}
            trigger={classificationPick.trigger}
            apply={next => classification.setDraft(next)}
            close={() => setClassificationPick(null)}
          />
        </Suspense>
      )}
    </TaskRangeDrafts>
  );
}

function ParentLink({ id, open }: { id: string; open: (id: string, trigger: HTMLElement) => void }) {
  const context = useTaskRead();
  const label = context?.view.parent?.id === id ? context.view.parent : null;
  const parent = useTask(id, !label);
  return (
    <button type="button" className="r2-parent" onClick={event => open(id, event.currentTarget)}>
      {label?.title ?? parent.data?.title ?? "Üst görev"}
      <ChevronRight aria-hidden="true" size={12} />
    </button>
  );
}

/** Görevin anahtarı açıkken bütün alt görevler bitince üst görev de biter. Varsayılan açık. */
function AutoComplete({ task }: { task: Task }) {
  const { session } = useSession();
  const cache = useTaskCache();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  // Kutu tıklamayı hemen izler, bekleyen iş bitince sunucu değeri geçer.
  const server = task.autoCompleteFromChildren !== false;
  const [value, setValue] = useState(server);
  const [seen, setSeen] = useState(server);
  if (seen !== server && !busy) {
    setSeen(server);
    setValue(server);
  }
  async function change(enabled: boolean) {
    if (busy) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    setValue(enabled);
    setBusy(true);
    setFailure("");
    try {
      const fresh = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
      const result = readTask(
        await session.api
          .mutation("/api/tasks/{id}/auto-complete", "put", {
            path: { id: task.id },
            body: { version: fresh.version, autoCompleteFromChildren: enabled },
          })
          .execute(),
      );
      if (cache.current()) void cache.manyChanged().then(() => cache.update(result));
    } catch (error) {
      if (cache.current()) {
        setValue(server);
        setFailure(taskFailure(error));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="r2-section">
      <label className="r2-check-row">
        <input
          type="checkbox"
          checked={value}
          disabled={busy || !!task.archivedAt}
          aria-describedby={failure ? `${id}-error` : undefined}
          onChange={event => void change(event.target.checked)}
        />
        Alt görevler bitince bu görevi otomatik tamamla
      </label>
      {failure && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {failure}
        </p>
      )}
    </section>
  );
}

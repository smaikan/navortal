"use client";
import { useId, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Menu, openRowMenu } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useDonePop } from "../../lib/done-pop";
import { energies } from "../support/model";
import type { Task } from "./model";
import { useTreeActions } from "./tree/actions";
import { rowFacts, type RowSummary } from "./tree/model";
import { useBranch, useTaskSummary } from "./tree/queries";

type Actions = ReturnType<typeof useTreeActions>;

/** Görev ayrıntısında alt görevler. İlerleme sunucu sayımıdır; kendi alt görevi olan satır onay kutusu yerine aç/kapat oku gösterir. Komutlar ağaçla aynı tek gönderimli eylemleri kullanır. */
export function SubtasksSection({ task }: { task: Task }) {
  const id = useId();
  const summary = useTaskSummary(task.id);
  const actions = useTreeActions();
  const [adding, setAdding] = useState<string | null>(null);
  const facts = rowFacts(task, summary.data ?? undefined);
  const archived = !!task.archivedAt;
  return (
    <section className="r2-section r2-subtasks" aria-labelledby={`${id}-title`}>
      <div className="r2-subtasks-head">
        <h3 id={`${id}-title`}>Alt görevler</h3>
        {facts.children > 0 && (
          <>
            <span className="r2-subtasks-count" aria-hidden="true">
              {facts.progress}
            </span>
            <span className="sr-only">{facts.progressLabel}</span>
            <span className="r2-progress-bar r2-subtasks-bar" aria-hidden="true">
              <span style={{ width: `${facts.percent}%` }} />
            </span>
          </>
        )}
      </div>
      {facts.children > 0 && (
        <SubtaskList parentId={task.id} actions={actions} adding={adding} setAdding={setAdding} depth={0} />
      )}
      {!archived && <SubtaskAdd parentId={task.id} actions={actions} label="Alt görev ekle" />}
    </section>
  );
}

function SubtaskList({
  parentId,
  actions,
  adding,
  setAdding,
  depth,
}: {
  parentId: string;
  actions: Actions;
  adding: string | null;
  setAdding: (id: string | null) => void;
  depth: number;
}) {
  const branch = useBranch(parentId);
  const pages = branch.data?.pages ?? [];
  const items = pages.flatMap(page => page.items);
  const summaries = new Map(pages.flatMap(page => [...page.summaries]));
  if (branch.isPending) return <p role="status">Alt görevler okunuyor…</p>;
  if (branch.isError && !items.length)
    return (
      <div role="alert" className="form-error">
        <p>Alt görevler alınamadı.</p>
        <button type="button" onClick={() => void branch.refetch()}>
          Yeniden dene
        </button>
      </div>
    );
  return (
    <>
      <ul className={`r2-subtask-list${depth ? " nested" : ""}`}>
        {items.map(child => (
          <SubtaskRow
            key={child.id}
            task={child}
            summary={summaries.get(child.id)}
            actions={actions}
            adding={adding}
            setAdding={setAdding}
            depth={depth}
          />
        ))}
      </ul>
      {branch.hasNextPage && (
        <button
          type="button"
          className="r2-quiet"
          disabled={branch.isFetchingNextPage}
          onClick={() => void branch.fetchNextPage()}
        >
          Daha fazla alt görev
        </button>
      )}
    </>
  );
}

function SubtaskRow({
  task,
  summary,
  actions,
  adding,
  setAdding,
  depth,
}: {
  task: Task;
  summary: RowSummary | undefined;
  actions: Actions;
  adding: string | null;
  setAdding: (id: string | null) => void;
  depth: number;
}) {
  const open = useTaskPanel();
  const facts = rowFacts(task, summary);
  // İşaret tıklamada hemen görünür, yazı bitince sunucu durumuna döner (Gün Planlama ile aynı).
  const [shown, setShown] = useState<boolean | null>(null);
  const done = shown ?? task.state === "Completed";
  const pop = useDonePop(done);
  const [expanded, setExpanded] = useState(false);
  const busy = actions.pending === task.id;
  const kids = facts.children > 0 || adding === task.id;
  const show = expanded || adding === task.id;
  const meta = facts.progress || facts.estimate || (task.energyDemand ? `Efor: ${energies[task.energyDemand]}` : "");
  return (
    <li className={`r2-subtask${done ? " done" : ""}${pop ? " r2-done-pop" : ""}`} aria-busy={busy || undefined}>
      <div className="r2-subtask-line" onContextMenu={openRowMenu}>
        {kids ? (
          <button
            type="button"
            className="r2-toggle"
            aria-expanded={show}
            aria-label={`${task.title} alt görevlerini ${show ? "gizle" : "göster"}`}
            onClick={() => {
              setExpanded(!show);
              if (show && adding === task.id) setAdding(null);
            }}
          >
            <ChevronRight aria-hidden="true" size={14} />
          </button>
        ) : (
          <label className="r2-square-hit">
            <input
              type="checkbox"
              className="r2-square"
              checked={done}
              disabled={busy || !!task.archivedAt}
              aria-label={`${task.title} tamamlandı`}
              onChange={() => {
                setShown(!done);
                void (done ? actions.reopen(task) : actions.complete(task)).finally(() => setShown(null));
              }}
            />
          </label>
        )}
        <button
          type="button"
          className="r2-subtask-title"
          onClick={event => open(task.id, event.currentTarget)}
          aria-label={`${task.title} ayrıntısını aç`}
        >
          <span className="r2-text">{task.title}</span>
        </button>
        {meta && <span className="r2-subtask-meta">{meta}</span>}
        <Menu
          className="r2-menu"
          label={`${task.title} alt görev işlemleri`}
          items={[
            { label: "Ayrıntıyı aç", onSelect: trigger => open(task.id, trigger) },
            !task.archivedAt && {
              label: "Alt görev ekle",
              onSelect: () => {
                setExpanded(true);
                setAdding(task.id);
              },
            },
            { label: "Görevi sil", danger: true, disabled: busy, onSelect: () => void actions.remove(task) },
          ]}
        />
      </div>
      {show && (
        <div className="r2-subtask-children">
          {facts.children > 0 && (
            <SubtaskList parentId={task.id} actions={actions} adding={adding} setAdding={setAdding} depth={depth + 1} />
          )}
          {adding === task.id && (
            <SubtaskAdd
              parentId={task.id}
              actions={actions}
              label={`${task.title} için alt görev ekle`}
              autoFocus
              onDone={() => setAdding(null)}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** Enter kaydeder ve sonraki alt görev için boş kalır. Hata olursa yazılan metin korunur, otomatik tekrar yok. */
function SubtaskAdd({
  parentId,
  actions,
  label,
  autoFocus = false,
  onDone,
}: {
  parentId: string;
  actions: Actions;
  label: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      await actions.add(parentId, text);
      setText("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Alt görev eklenemedi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="r2-subtask-add">
      <Plus aria-hidden="true" size={14} />
      <input
        value={text}
        maxLength={300}
        readOnly={busy}
        autoFocus={autoFocus}
        aria-busy={busy || undefined}
        aria-label={label}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="Alt görev ekle, Enter ile kaydet"
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape" && onDone) {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
        onBlur={() => {
          if (!text.trim() && !busy) onDone?.();
        }}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

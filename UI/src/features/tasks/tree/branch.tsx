"use client";
import { useRunningTaskId } from "../../work/running";
import { lazy, Suspense, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Calendar, Check, ChevronRight, Clock, Plus } from "lucide-react";
import { Menu, openRowMenu } from "../../../components/ui/menu";
import { useDonePop } from "../../../lib/done-pop";
import { useFirstData } from "../../../lib/first-data";
import { ListSkeleton } from "../../../components/ui/skeleton";
import type { Task } from "../model";
import { RowLevels } from "../row-levels";
import { rowFacts, treeMessage, type RowSummary } from "./model";
import { useBranch } from "./queries";
import { useTree } from "./view";
import "./styles.css";
import "../styles.css";

// Alt görevli ekleme taslağı yalnız "Görev ekle" açılınca yüklenir; düğmeye yaklaşınca önceden istenir.
const loadDraft = () => import("./add-draft");
const NewTaskDraft = lazy(() => loadDraft().then(m => ({ default: m.NewTaskDraft })));

/** Üstün çocukları veya açık kökler sayfa sayfa, sonra yerinde ekleme satırı. */
export function Branch({
  parent,
  depth,
  parentNext,
}: {
  parent: Task | null;
  depth: number;
  parentNext?: string | null;
}) {
  const tree = useTree();
  const page = useBranch(parent?.id ?? null, parent ? undefined : false, true, true);
  // Yalnız ilk kök liste parça parça çizilir. Kullanıcının veya klavyenin açtığı dal
  // hemen görünür; odak ve sonraki hareket onu beklemeden bulsun.
  const first = useFirstData(page.data);
  const data = parent ? page.data : first;
  const loaded = data?.pages.flatMap(p => p.items) ?? [];
  const summaries = new Map<string, RowSummary>();
  data?.pages.forEach(p => p.summaries.forEach((value, key) => summaries.set(key, value)));
  const items = [...loaded];
  if (!parent)
    for (const [id, { task, index }] of tree.lingering)
      if (!items.some(item => item.id === id)) items.splice(Math.min(index, items.length), 0, task);
  const style = depth ? ({ "--indent": depth > 6 ? "0px" : "19px" } as CSSProperties) : undefined;
  return (
    <ul
      className={`r2-list${depth ? " r2-children" : ""}`}
      style={style}
      aria-label={parent ? `${parent.title} alt görevleri` : "Görevler"}
    >
      {page.isError && (
        <li className="r2-state">
          <span role="alert">{treeMessage(page.error)}</span>{" "}
          <button type="button" onClick={() => void page.refetch()}>
            Yeniden yükle
          </button>
        </li>
      )}
      {!data &&
        !page.isError &&
        (parent ? (
          <li className="r2-state">
            <span role="status">Görevler okunuyor…</span>
          </li>
        ) : (
          // Kökler iskelet yüksekliğini korur. Liste önce daralıp sonra satırları aşağı itmesin.
          <li className="r2-state r2-loading">
            <ListSkeleton label="Görevler okunuyor…" rows={6} />
          </li>
        ))}
      {!parent && !!data && !items.length && <li className="r2-empty">Henüz görev yok. İlk işini aşağıya yaz.</li>}
      {items.map((task, index) => (
        <Node
          key={task.id}
          task={task}
          summary={summaries.get(task.id)}
          depth={depth}
          index={index}
          parent={parent}
          prevId={items[index - 1]?.id ?? null}
          nextId={index + 1 < items.length ? items[index + 1].id : page.hasNextPage ? undefined : null}
          nextNextId={index + 2 < items.length ? items[index + 2].id : page.hasNextPage ? undefined : null}
          parentNext={parentNext}
        />
      ))}
      {/* Ardından geldiği satırlarla gösterilir. Yükleme satırlarının altında tek başına olursa ekran dışına itilip kayma yapardı. */}
      {data && page.hasNextPage && (
        <li>
          <button
            type="button"
            className="r2-more"
            disabled={page.isFetchingNextPage}
            onClick={() => void page.fetchNextPage()}
          >
            {page.isFetchingNextPage ? "Okunuyor…" : "Daha fazla göster"}
          </button>
        </li>
      )}
      {/* Kök ekleme satırı liste veya hata görünürken gelir, sonradan aşağı itilmez. */}
      {(parent ? page.isSuccess : !!data || page.isError) && <AddRow parentId={parent?.id ?? null} />}
    </ul>
  );
}

type NodeProps = {
  task: Task;
  summary?: RowSummary;
  depth: number;
  index: number;
  parent: Task | null;
  prevId: string | null;
  nextId: string | null | undefined;
  nextNextId: string | null | undefined;
  parentNext?: string | null;
};
function Node({ task, summary, depth, index, parent, prevId, nextId, nextNextId, parentNext }: NodeProps) {
  const tree = useTree();
  const facts = rowFacts(task, summary);
  // Yeni biten kökün çizgisi hemen görünür, sonra Tamamlananlar'a gider.
  const done = task.state === "Completed" || tree.lingering.has(task.id);
  const adding = tree.adding === task.id;
  const hasKids = facts.children > 0 || adding;
  const expanded = hasKids && tree.expanded.has(task.id);
  const drag = useDraggable({ id: task.id, data: { task }, disabled: !!task.archivedAt });
  const drop = useDroppable({
    id: `row:${task.id}`,
    data: { kind: "row", task, nextId },
    disabled: tree.dragging === task.id,
  });
  const over = tree.over?.id === task.id && tree.dragging && tree.dragging !== task.id ? tree.over.placement : null;
  const busy = tree.actions.pending === task.id;
  function moveTo(target: { parentId: string | null; before: string | null } | null) {
    if (!target) return;
    if (target.parentId) tree.toggle(target.parentId, true);
    void tree.actions.move(task, target).then(saved => {
      if (saved) tree.focusRow(saved.id);
    });
  }
  function keys(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey && event.key.startsWith("Arrow")) {
      event.preventDefault();
      if (event.key === "ArrowUp" && prevId) moveTo({ parentId: task.parentTaskId, before: prevId });
      else if (event.key === "ArrowDown" && nextId)
        moveTo(nextNextId === undefined ? null : { parentId: task.parentTaskId, before: nextNextId });
      else if (event.key === "ArrowRight" && prevId) moveTo({ parentId: prevId, before: null });
      else if (event.key === "ArrowLeft" && parent)
        moveTo(parentNext === undefined ? null : { parentId: parent.parentTaskId, before: parentNext ?? null });
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const titles = [
        ...(event.currentTarget.closest("[data-task-tree]")?.querySelectorAll<HTMLButtonElement>(".r2-title") ?? []),
      ];
      titles[
        Math.max(
          0,
          Math.min(titles.length - 1, titles.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)),
        )
      ]?.focus();
    } else if (event.key === "ArrowRight" && hasKids && !expanded) {
      event.preventDefault();
      tree.toggle(task.id, true);
    } else if (event.key === "ArrowLeft" && expanded) {
      event.preventDefault();
      tree.toggle(task.id, false);
    }
  }
  async function complete() {
    if (!parent && !done) tree.linger({ ...task, state: "Completed" }, index);
    const saved = done ? await tree.actions.reopen(task) : await tree.actions.complete(task);
    if (!saved) tree.unlinger(task.id);
  }
  const pop = useDonePop(done);
  const running = useRunningTaskId() === task.id && !done;
  const classes = [
    "r2-row",
    done && "done",
    pop && "r2-done-pop",
    busy && "busy",
    running && "running",
    tree.dragging === task.id && "lifted",
    over && `over-${over}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li className="r2-node">
      <div
        ref={node => {
          drag.setNodeRef(node);
          drop.setNodeRef(node);
        }}
        {...drag.listeners}
        className={classes}
        data-task-row={task.id}
        data-task-panel-target
        onContextMenu={openRowMenu}
        aria-busy={busy || undefined}
      >
        {hasKids ? (
          <button
            type="button"
            data-tree-toggle
            className="r2-toggle"
            aria-expanded={expanded}
            aria-label={`${task.title} alt görevlerini ${expanded ? "gizle" : "göster"}`}
            onClick={() => tree.toggle(task.id)}
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        ) : (
          <span className="r2-leaf" aria-hidden="true">
            {done ? <Check size={14} /> : <span className="r2-dot" />}
          </span>
        )}
        <button
          type="button"
          className="r2-title"
          data-task-title={task.id}
          onClick={event => tree.open(task.id, event.currentTarget)}
          onKeyDown={keys}
          aria-label={`${task.title} ayrıntısını aç`}
          aria-current={tree.currentTaskId === task.id || undefined}
          aria-describedby={tree.helpId}
        >
          {hasKids && done && <Check className="r2-check" aria-hidden="true" size={14} />}
          <span className="r2-text">{task.title}</span>
          {running && (
            <span className="r2-chip running-chip">
              <span className="running-dot" aria-hidden="true" />
              Sürüyor
            </span>
          )}
          {done && <span className="sr-only"> (tamamlandı)</span>}
        </button>
        <span className="r2-meta">
          {/* Alt görev ilerlemesi her zaman ilk balon. */}
          <span className="r2-progress">
            {facts.progress && (
              <>
                <span className="r2-progress-bar" aria-hidden="true">
                  <span style={{ width: `${facts.percent}%` }} />
                </span>
                <span aria-hidden="true">{facts.progress}</span>
                <span className="sr-only">{facts.progressLabel}</span>
              </>
            )}
          </span>
          {summary?.urgentPlanDate && (
            <span className="r2-chip" title={`Acil plan günü: ${summary.urgentPlanDate}`}>
              Acil iş
            </span>
          )}
          <RowLevels priority={facts.priority} effort={task.energyDemand} />
          <span className="r2-range">
            {facts.range && !done && (
              <>
                <Calendar aria-hidden="true" size={12} />
                <span className="sr-only">Tarih: </span>
                {facts.range}
              </>
            )}
          </span>
          <span className="r2-estimate">
            {facts.estimate && !done && (
              <>
                <Clock aria-hidden="true" size={12} />
                <span className="sr-only">Tahmini süre: </span>
                {facts.estimate}
              </>
            )}
          </span>
        </span>
        <Menu
          className="r2-menu"
          label={`${task.title} işlemleri`}
          items={[
            {
              label: done ? "Yeniden aç" : "Görevi bitir",
              disabled: busy || !!task.archivedAt,
              onSelect: () => void complete(),
            },
            {
              label: "Alt görev ekle",
              disabled: !!task.archivedAt,
              onSelect: () => {
                tree.toggle(task.id, true);
                tree.setAdding(task.id);
              },
            },
            { label: "Görevi sil", danger: true, disabled: busy, onSelect: () => void tree.actions.remove(task) },
          ]}
        />
      </div>
      {expanded && <Branch parent={task} depth={depth + 1} parentNext={nextId} />}
    </li>
  );
}

function AddRow({ parentId }: { parentId: string | null }) {
  const tree = useTree();
  const key = parentId ?? "root";
  const active = tree.adding === key;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (active && !parentId)
    return (
      <Suspense
        fallback={
          <li className="r2-add active" aria-busy="true">
            <Plus aria-hidden="true" size={14} />
          </li>
        }
      >
        <NewTaskDraft />
      </Suspense>
    );
  const label = parentId ? "Alt görev ekle" : "Görev ekle";
  if (!active)
    return (
      <li className="r2-add">
        <button
          type="button"
          onPointerEnter={parentId ? undefined : () => void loadDraft()}
          onFocus={parentId ? undefined : () => void loadDraft()}
          onClick={() => {
            setError("");
            tree.setAdding(key);
          }}
        >
          <Plus aria-hidden="true" size={14} />
          {label}
        </button>
      </li>
    );
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await tree.actions.add(parentId, text);
      setText("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Görev eklenemedi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="r2-add active">
      <Plus aria-hidden="true" size={14} />
      <input
        autoFocus
        value={text}
        maxLength={300}
        readOnly={busy}
        aria-busy={busy || undefined}
        aria-label={parentId ? "Yeni alt görev adı" : "Yeni görev adı"}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${key}-add-error` : undefined}
        placeholder={parentId ? "Alt görev adı yaz, Enter ile ekle" : "Görev adı yaz, Enter ile ekle"}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            tree.setAdding(null);
          }
        }}
        onBlur={() => {
          if (!text.trim() && !busy) tree.setAdding(null);
        }}
      />
      {error && (
        <p id={`${key}-add-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
    </li>
  );
}

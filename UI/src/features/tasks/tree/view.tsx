"use client";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { Check, ChevronRight } from "lucide-react";
import { useCurrentTask, useTaskPanel } from "../../../components/layout/task-panel";
import type { Task } from "../model";
import { moveTarget, placementAt, type Placement } from "./model";
import { useBranch } from "./queries";
import { useTreeActions } from "./actions";
import { Branch } from "./branch";
import "./styles.css";

type Over = { id: string; placement: Placement | "root-end" } | null;
type RowData = { kind: "row"; task: Task; nextId: string | null | undefined } | { kind: "root-end" };
type TreeState = {
  actions: ReturnType<typeof useTreeActions>;
  open: (id: string, trigger: HTMLElement) => void;
  currentTaskId: string | null;
  helpId: string;
  expanded: ReadonlySet<string>;
  toggle: (id: string, value?: boolean) => void;
  adding: string | null;
  setAdding: (id: string | null) => void;
  dragging: string | null;
  over: Over;
  lingering: ReadonlyMap<string, { task: Task; index: number }>;
  linger: (task: Task, index: number) => void;
  unlinger: (id: string) => void;
  focusRow: (id: string) => void;
};
const TreeContext = createContext<TreeState | null>(null);
export function useTree() {
  return useContext(TreeContext)!;
}

/** Tek görev ağacı, yerinde alt görev girişi, anında taşıma ve kapalı Tamamlananlar bölümü. */
export function TaskTree() {
  const actions = useTreeActions();
  const panel = useTaskPanel();
  const currentTaskId = useCurrentTask();
  const helpId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<Over>(null);
  const [lingering, setLingering] = useState<ReadonlyMap<string, { task: Task; index: number }>>(() => new Map());
  /** Sürüklerken işaretçinin görünüm alanındaki son Y noktası. */
  const pointerY = useRef(0);
  const toggle = useCallback(
    (id: string, value?: boolean) =>
      setExpanded(current => {
        const next = new Set(current);
        if (value ?? !next.has(id)) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const unlinger = useCallback(
    (id: string) =>
      setLingering(current => {
        const next = new Map(current);
        next.delete(id);
        return next;
      }),
    [],
  );
  const linger = useCallback(
    (task: Task, index: number) => {
      setLingering(current => new Map(current).set(task.id, { task, index }));
      setTimeout(() => unlinger(task.id), 1500);
    },
    [unlinger],
  );
  // Taşıma yüklenen dalı açabilir, eski satır odak aldıktan sonra sökülebilir; Firefox'ta oluyor.
  // İki saniyeye kadar odak sayfaya düştüyse taşınan satıra geri döner. Kullanıcı başka yere taşıdıysa dokunmuyoruz.
  const focusRow = useCallback((id: string) => {
    let tries = 0;
    const look = () => {
      const row = document.querySelector<HTMLElement>(`[data-task-title="${id}"]`),
        active = document.activeElement;
      if (
        row &&
        active !== row &&
        (!active || active === document.body || !active.isConnected || (active as HTMLElement).dataset.taskTitle === id)
      )
        row.focus();
      if (++tries < 20) setTimeout(look, 100);
    };
    requestAnimationFrame(look);
  }, []);
  // Fare 6px sonra sürükler. Dokunmada kısa basma gerekir, liste kaydırılabilsin.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  useEffect(() => {
    if (!dragging) return;
    // Escape yalnız sürüklemeyi iptal etsin, alttaki görev panelini de kapatmasın.
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    // İşaretçinin gerçek yeri. dnd-kit delta'sı sayfa kaymasını da içeriyor.
    const mouse = (event: MouseEvent) => {
      pointerY.current = event.clientY;
    };
    const touch = (event: TouchEvent) => {
      if (event.touches[0]) pointerY.current = event.touches[0].clientY;
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("mousemove", mouse, true);
    window.addEventListener("touchmove", touch, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("mousemove", mouse, true);
      window.removeEventListener("touchmove", touch, true);
    };
  }, [dragging]);
  /** dnd-kit over bir hareket geride kalabilir. Güncel çarpışmayı okuyup satırı o anda ölçüyoruz. */
  function locate(data: RowData | undefined): Over {
    if (!data) return null;
    if (data.kind === "root-end") return { id: "root-end", placement: "root-end" };
    const rect = document.querySelector(`[data-task-row="${data.task.id}"]`)?.getBoundingClientRect();
    if (!rect) return null;
    let placement = placementAt(pointerY.current, rect.top, rect.height);
    if (placement === "after" && data.nextId === undefined) placement = "before";
    return { id: data.task.id, placement };
  }
  const hit = (collisions: DragMoveEvent["collisions"]) =>
    collisions?.[0]?.data?.droppableContainer?.data.current as RowData | undefined;
  function moved(event: DragMoveEvent) {
    const next = locate(hit(event.collisions));
    if (next?.id !== over?.id || next?.placement !== over?.placement) setOver(next);
  }
  function dropped(event: DragEndEvent) {
    const source = event.active.data.current?.task as Task | undefined;
    const data = hit(event.collisions) ?? (event.over?.data.current as RowData | undefined);
    const at = locate(data);
    setDragging(null);
    setOver(null);
    if (!source || !data || !at) return;
    const target =
      data.kind === "root-end"
        ? moveTarget(source, "root-end", null)
        : moveTarget(source, at.placement as Placement, {
            id: data.task.id,
            parentTaskId: data.task.parentTaskId,
            nextId: data.nextId ?? null,
          });
    if (!target) return;
    if (target.parentId) toggle(target.parentId, true);
    void actions.move(source, target).then(saved => {
      if (saved) focusRow(saved.id);
    });
  }
  const state = useMemo<TreeState>(
    () => ({
      actions,
      open: panel,
      currentTaskId,
      helpId,
      expanded,
      toggle,
      adding,
      setAdding,
      dragging: dragging?.id ?? null,
      over,
      lingering,
      linger,
      unlinger,
      focusRow,
    }),
    [
      actions,
      panel,
      currentTaskId,
      helpId,
      expanded,
      toggle,
      adding,
      dragging,
      over,
      lingering,
      linger,
      unlinger,
      focusRow,
    ],
  );
  return (
    <TreeContext value={state}>
      <DndContext
        id="task-tree-drag"
        sensors={sensors}
        collisionDetection={pointerWithin}
        autoScroll
        measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
        accessibility={{
          restoreFocus: false,
          screenReaderInstructions: {
            draggable: "Fareyle sürükle veya dokunup basılı tut. Klavyede Alt ve ok tuşlarıyla taşı.",
          },
          announcements: {
            onDragStart: () => "Taşıma başladı.",
            onDragOver: () => undefined,
            onDragEnd: () => "Bırakıldı.",
            onDragCancel: () => "Taşıma iptal edildi; konum değişmedi.",
          },
        }}
        onDragStart={event => {
          const e = event.activatorEvent as MouseEvent | TouchEvent;
          pointerY.current = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
          setDragging(event.active.data.current?.task as Task);
        }}
        onDragMove={moved}
        onDragEnd={dropped}
        onDragCancel={() => {
          setDragging(null);
          setOver(null);
        }}
      >
        <p id={helpId} className="sr-only">
          Görevi açmak için Enter. Taşımak için Alt ile yukarı ve aşağı ok; alt görev yapmak için Alt ile sağ ok, bir
          üst düzeye çıkarmak için Alt ile sol ok.
        </p>
        <section data-task-tree aria-label="Görev ağacı" className="r2-tree">
          <Branch parent={null} depth={0} />
          {dragging && <RootEnd />}
        </section>
        <DragOverlay dropAnimation={null}>{dragging && <div className="r2-ghost">{dragging.title}</div>}</DragOverlay>
      </DndContext>
      <CompletedRoots />
    </TreeContext>
  );
}
function RootEnd() {
  const { over } = useTree();
  const { setNodeRef } = useDroppable({ id: "tree-root-end", data: { kind: "root-end" } satisfies RowData });
  return (
    <div ref={setNodeRef} className={`r2-root-end${over?.placement === "root-end" ? " over" : ""}`}>
      En üst düzeye, sona bırak
    </div>
  );
}
/** Bitmiş kökler iş listesinin dışında. Alt görevleri açık üstün içinde görünür kalır. */
function CompletedRoots() {
  const tree = useTree();
  const [open, setOpen] = useState(false);
  const page = useBranch(null, true, true, true);
  const items = page.data?.pages.flatMap(p => p.items) ?? [];
  if (!items.length) return null;
  return (
    <section className="r2-completed" aria-label="Tamamlanan görevler">
      <button type="button" className="r2-completed-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight aria-hidden="true" size={15} />
        Tamamlananlar
        <span className="r2-count">
          {items.length}
          {page.hasNextPage ? "+" : ""}
        </span>
      </button>
      {open && (
        <ul className="r2-list">
          {items.map(task => (
            <li key={task.id} className="r2-node">
              <div className="r2-row done" data-task-panel-target>
                <span className="r2-leaf" aria-hidden="true">
                  <Check size={14} />
                </span>
                <button
                  type="button"
                  className="r2-title"
                  data-task-title={task.id}
                  onClick={event => tree.open(task.id, event.currentTarget)}
                  aria-label={`${task.title} ayrıntısını aç`}
                  aria-current={tree.currentTaskId === task.id || undefined}
                >
                  <span className="r2-text">{task.title}</span>
                </button>
                <button
                  type="button"
                  className="r2-reopen"
                  disabled={tree.actions.pending === task.id}
                  onClick={() => void tree.actions.reopen(task)}
                  aria-label={`Yeniden aç: ${task.title}`}
                >
                  Yeniden aç
                </button>
              </div>
            </li>
          ))}
          {page.hasNextPage && (
            <li>
              <button
                type="button"
                className="r2-more"
                disabled={page.isFetchingNextPage}
                onClick={() => void page.fetchNextPage()}
              >
                Daha fazla göster
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

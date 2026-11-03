"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { CalendarDays, GripVertical, Inbox, Leaf, Plus, Users, Zap, type LucideIcon } from "lucide-react";
import { FeatureInfo } from "../../components/ui/feature-info";
import { Menu, openRowMenu } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { priorities, estimateText } from "../tasks/model";
import { energies } from "../support/model";
import { areas, type Column, type Quadrant, type Row } from "./model";
import { useMatrix, type Offsets } from "./queries";
import { addSelection } from "./selection";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";
const Picker = lazy(() => import("./picker").then(m => ({ default: m.MatrixPicker })));
const icons: Record<Quadrant, LucideIcon> = {
  Inbox,
  Do: Zap,
  Schedule: CalendarDays,
  Delegate: Users,
  Eliminate: Leaf,
};
type Target = { quadrant: Quadrant; beforeTaskId?: string };
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  const cards = hits.filter(x => String(x.id).startsWith("card:"));
  return cards.length ? cards : hits;
};
export function MatrixPage() {
  const [offsets, setOffsets] = useState<Offsets>({ Inbox: 0, Do: 0, Schedule: 0, Delegate: 0, Eliminate: 0 });
  const matrix = useMatrix(offsets);
  const openTask = useTaskPanel();
  const [picker, setPicker] = useState<{ area: Quadrant; trigger: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<Row | null>(null),
    [over, setOver] = useState<Target | null>(null);
  const dragVersion = useRef<number | string | undefined>(undefined);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // Özellikle WebKit'te çarpışma hesabı bırakmayı bir kare geriden izleyebiliyor. Gerçek bırakma noktasını tutuyoruz.
    const record = (e: MouseEvent | TouchEvent) => {
      const point = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e;
      if (point) pointer.current = { x: point.clientX, y: point.clientY };
    };
    window.addEventListener("mousemove", record, true);
    window.addEventListener("mouseup", record, true);
    window.addEventListener("touchmove", record, { capture: true, passive: true });
    window.addEventListener("touchend", record, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousemove", record, true);
      window.removeEventListener("mouseup", record, true);
      window.removeEventListener("touchmove", record, true);
      window.removeEventListener("touchend", record, true);
    };
  }, []);
  function pointedTarget(): Target | null {
    if (!pointer.current) return null;
    const element = document.elementFromPoint(pointer.current.x, pointer.current.y);
    const area = element?.closest<HTMLElement>("[data-matrix-area]")?.dataset.matrixArea;
    if (!area || !areas.some(a => a.id === area)) return null;
    const beforeTaskId = element?.closest<HTMLElement>("[data-matrix-task]")?.dataset.matrixTask;
    return { quadrant: area as Quadrant, beforeTaskId };
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const busy = matrix.pending || matrix.blocked;
  async function move(
    id: string,
    area: Quadrant,
    before: string | null = null,
    version = matrix.q.data?.version,
    remove = false,
  ) {
    const ok = await matrix.write(remove ? "remove" : "move", id, area, before, version);
    if (ok)
      requestAnimationFrame(() => {
        const element =
          document.querySelector<HTMLElement>(`[data-matrix-task="${id}"] [data-matrix-grip]`) ??
          document.querySelector<HTMLElement>(`[data-matrix-heading="${area}"]`);
        element?.focus({ preventScroll: true });
      });
  }
  function dropped(event: DragEndEvent) {
    const to = pointedTarget(),
      row = event.active.data.current?.task as Row | undefined;
    setDrag(null);
    setOver(null);
    if (to && row && to.beforeTaskId !== row.id)
      void move(row.id, to.quadrant, to.beforeTaskId ?? null, dragVersion.current);
  }
  return (
    <main id="main" className="workspace-main matrix-page" tabIndex={-1}>
      <header className="matrix-page-header">
        <div>
          <h1 tabIndex={-1}>Eisenhower Matrisi</h1>
          <p>İşlerini önem ve aciliyete göre ayır.</p>
        </div>
        <div className="matrix-header-actions">
          <FeatureInfo title="Eisenhower Matrisi nedir?">
            <p>
              Eisenhower Matrisi, işleri önem ve aciliyet açısından ayırarak neye zaman ayıracağına karar vermeni
              kolaylaştırır.
            </p>
            <h3>Önem ve aciliyet</h3>
            <p>
              Önemli işler senin için değerli bir sonuca katkı sağlar. Acil işler ise yakın zamanda ilgilenilmesi
              gereken işlerdir; her acil iş önemli olmayabilir.
            </p>
            <ul>
              <li>Önemli ve acil: Şimdi yap.</li>
              <li>Önemli, acil değil: Planla.</li>
              <li>Acil, önemli değil: Devret veya yeniden değerlendir.</li>
              <li>Önemli değil, acil değil: Ele veya azalt.</li>
            </ul>
            <p>
              Görevleri seçip alanlara sürükleyebilir veya kart menüsünden taşıyabilirsin. Matristen çıkarmak görevi
              silmez; buradaki seçimler gün planını ya da sayacı kendiliğinden değiştirmez.
            </p>
          </FeatureInfo>
          <button
            className="primary"
            disabled={busy || matrix.q.isPending}
            onClick={e => setPicker({ area: "Inbox", trigger: e.currentTarget })}
          >
            <Plus size={18} aria-hidden="true" />
            Görev seç
          </button>
        </div>
      </header>
      {matrix.q.isPending && <ListSkeleton label="Matris hazırlanıyor…" rows={4} />}
      {matrix.q.isError && (
        <p role="alert">
          Matris okunamadı. <button onClick={() => void matrix.refresh()}>Yeniden yükle</button>
        </p>
      )}
      {matrix.failure && (
        <p className="form-error" role="alert">
          {matrix.failure} <button onClick={() => void matrix.refresh()}>Listeyi kontrol et</button>
        </p>
      )}
      <p className="sr-only" role="status">
        {matrix.pending ? "Matris değişikliği kaydediliyor…" : ""}
      </p>
      {matrix.q.data && (
        <DndContext
          id="eisenhower-matrix"
          sensors={sensors}
          collisionDetection={collision}
          autoScroll
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Fareyle sürükle veya dokunup basılı tut. Klavyede Alt ile yukarı/aşağı oklarla sırala; kart menüsünden alan değiştir.",
            },
            announcements: {
              onDragStart: () => "Görev taşıma başladı.",
              onDragOver: ({ over }) => (over ? "Bırakılacak konum seçildi." : undefined),
              onDragEnd: () => "Sürükleme bitti.",
              onDragCancel: () => "Taşıma iptal edildi; konum değişmedi.",
            },
          }}
          onDragStart={e => {
            setDrag(e.active.data.current?.task as Row);
            dragVersion.current = matrix.q.data?.version;
          }}
          onDragMove={() => {
            const next = pointedTarget();
            setOver(old => (old?.quadrant === next?.quadrant && old?.beforeTaskId === next?.beforeTaskId ? old : next));
          }}
          onDragEnd={dropped}
          onDragCancel={() => {
            setDrag(null);
            setOver(null);
          }}
        >
          <div className="matrix-grid">
            {areas.map(area => {
              const col = matrix.q.data!.columns.find(x => x.quadrant === area.id)!;
              return (
                <Lane
                  key={area.id}
                  col={col}
                  busy={busy}
                  dragging={!!drag}
                  over={over}
                  pick={trigger => setPicker({ area: area.id, trigger })}
                  page={offset => setOffsets(old => ({ ...old, [area.id]: offset }))}
                >
                  {col.items.map(({ task }, index) => (
                    <Card
                      key={task.id}
                      row={task}
                      area={area.id}
                      busy={busy}
                      over={over?.beforeTaskId === task.id && drag?.id !== task.id}
                      open={trigger => openTask(task.id, trigger)}
                      previous={index > 0 ? col.items[index - 1].task.id : undefined}
                      next={
                        index + 1 < col.items.length
                          ? (col.items[index + 2]?.task.id ??
                            (Number(col.offset) + col.items.length >= Number(col.total) ? null : undefined))
                          : undefined
                      }
                      move={(where, before) => void move(task.id, where, before)}
                      remove={() => void move(task.id, area.id, null, undefined, true)}
                    />
                  ))}
                </Lane>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
            {drag && (
              <div className="matrix-card matrix-ghost">
                <CardText row={drag} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      {picker && (
        <Suspense fallback={<p role="status">Görev seçimi açılıyor…</p>}>
          <Picker
            {...picker}
            pending={matrix.pending}
            blocked={matrix.blocked}
            failure={matrix.failure}
            add={ids =>
              addSelection(ids, matrix.q.data?.version, (id, version) =>
                matrix.write("add", id, picker.area, null, version),
              )
            }
            refresh={matrix.refresh}
            close={() => setPicker(null)}
          />
        </Suspense>
      )}
    </main>
  );
}
function Lane({
  col,
  busy,
  dragging,
  over,
  pick,
  page,
  children,
}: {
  col: Column;
  busy: boolean;
  dragging: boolean;
  over: Target | null;
  pick: (el: HTMLElement) => void;
  page: (n: number) => void;
  children: React.ReactNode;
}) {
  const area = areas.find(x => x.id === col.quadrant)!,
    Icon = icons[area.id];
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${area.id}`, data: { quadrant: area.id } satisfies Target });
  const selected = dragging && isOver && over?.quadrant === area.id && !over.beforeTaskId;
  return (
    <section
      ref={setNodeRef}
      data-matrix-area={area.id}
      aria-labelledby={`matrix-${area.id}`}
      className={`matrix-lane${area.id === "Inbox" ? " matrix-inbox" : ""}${selected ? " matrix-lane-over" : ""}`}
    >
      <header>
        <div className="matrix-lane-heading">
          <Icon size={19} aria-hidden="true" />
          <h2 id={`matrix-${area.id}`} data-matrix-heading={area.id} tabIndex={-1}>
            {area.id === "Inbox" ? area.title : area.meaning}
          </h2>
          <span className="matrix-count">
            {col.total}
            <span className="sr-only"> görev</span>
          </span>
        </div>
        <button
          className="ghost"
          aria-label={`${area.title} alanına görev seç`}
          disabled={busy}
          onClick={e => pick(e.currentTarget)}
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </header>
      {area.id !== "Inbox" && <p className="matrix-meaning">{area.title}</p>}
      <ul className="matrix-cards" aria-label={`${area.title} görevleri`}>
        {children}
      </ul>
      {!col.items.length && (
        <div className="matrix-lane-empty">
          <p>{area.hint}</p>
          <span className="matrix-drag-hint">{dragging ? "Buraya bırak" : "Bir görev seç veya buraya sürükle"}</span>
        </div>
      )}
      {Number(col.total) > Number(col.limit) && (
        <div className="matrix-paging">
          <button
            disabled={busy || !Number(col.offset)}
            onClick={() => page(Math.max(0, Number(col.offset) - Number(col.limit)))}
          >
            Önceki
          </button>
          <span>
            {Number(col.offset) + col.items.length} / {col.total}
          </span>
          <button
            disabled={busy || Number(col.offset) + col.items.length >= Number(col.total)}
            onClick={() => page(Number(col.offset) + Number(col.limit))}
          >
            Sonraki
          </button>
        </div>
      )}
    </section>
  );
}
function CardText({ row }: { row: Row }) {
  return (
    <span className="matrix-card-text">
      {row.parentTitle && <small>{row.parentTitle}</small>}
      <strong>{row.title}</strong>
    </span>
  );
}
function Card({
  row,
  area,
  busy,
  over,
  open,
  move,
  remove,
  previous,
  next,
}: {
  row: Row;
  area: Quadrant;
  busy: boolean;
  over: boolean;
  open: (el: HTMLElement) => void;
  move: (area: Quadrant, before: string | null) => void;
  remove: () => void;
  previous?: string;
  next?: string | null;
}) {
  const draggable = useDraggable({ id: `card:${row.id}`, disabled: busy, data: { task: row } });
  const droppable = useDroppable({
    id: `card:${row.id}`,
    data: { quadrant: area, beforeTaskId: row.id } satisfies Target,
  });
  return (
    <li
      ref={node => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      data-matrix-task={row.id}
      onContextMenu={openRowMenu}
      className={`matrix-card${over ? " matrix-card-over" : ""}${draggable.isDragging ? " matrix-card-dragging" : ""}`}
    >
      <button
        type="button"
        className="matrix-grip"
        data-matrix-grip
        aria-label={`${row.title} görevini taşı`}
        disabled={busy}
        {...draggable.attributes}
        {...draggable.listeners}
        onKeyDown={e => {
          if (e.altKey && !busy && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            if (e.key === "ArrowUp" && previous) move(area, previous);
            if (e.key === "ArrowDown" && next !== undefined) move(area, next);
          }
        }}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button type="button" className="matrix-task-title" title={row.title} onClick={e => open(e.currentTarget)}>
        <CardText row={row} />
      </button>
      <Menu
        label={`${row.title} matris seçenekleri`}
        items={[
          { label: "Görev ayrıntısı", onSelect: open },
          ...areas
            .filter(x => x.id !== area)
            .map(x => ({ label: `${x.title} alanına taşı`, disabled: busy, onSelect: () => move(x.id, null) })),
          {
            label: "Yukarı taşı",
            disabled: busy || !previous,
            onSelect: () => {
              if (previous) move(area, previous);
            },
          },
          {
            label: "Aşağı taşı",
            disabled: busy || next === undefined,
            onSelect: () => {
              if (next !== undefined) move(area, next);
            },
          },
          { label: "Matristen çıkar", disabled: busy, separator: true, onSelect: remove },
        ]}
      />
      <div className="matrix-card-facts">
        <span>{priorities[row.priority]}</span>
        <span>{row.energyDemand ? `Efor: ${energies[row.energyDemand]}` : "Efor belirtilmedi"}</span>
        <span title="Görevin doğrudan tahmini">
          {row.directEstimatedSeconds === null ? "Tahmin yok" : estimateText(row.directEstimatedSeconds)}
        </span>
      </div>
    </li>
  );
}

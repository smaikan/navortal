"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Temporal } from "temporal-polyfill";
import { CalendarDays, ChevronDown, Link2, Plus, X } from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useTasks } from "../tasks/queries";
import { dueAt, dueLabel, dueParts, noteFailure, type Category } from "./model";

/** Kategori noktayla ve adla gösteriliyor. Tek işaret renk değil. */
export function CategoryDot({ category }: { category: Pick<Category, "color"> | null }) {
  return <span className="note-dot" data-note-color={category?.color ?? "Gray"} aria-hidden="true" />;
}

export function CategoryPicker({
  value,
  categories,
  removed,
  disabled,
  onChange,
  onManage,
}: {
  value: string | null;
  categories: Category[];
  /** Silinen kategori notta seçili görünüyor ama tekrar yeni seçenek olmuyor. */
  removed?: Category | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  onManage?: (trigger: HTMLButtonElement) => void;
}) {
  const current = categories.find(c => c.id === value) ?? (removed?.id === value ? removed : null);
  const name = current ? current.name : "Kategorisiz";
  if (disabled)
    return (
      <span className="note-category-picker" aria-label={`Kategori: ${name}`}>
        <CategoryDot category={current} />
        {name}
      </span>
    );
  return (
    <Menu
      label={`Kategori: ${name}`}
      className="note-category-menu"
      floating
      items={[
        {
          label: "Kategorisiz",
          content: (
            <>
              <CategoryDot category={null} />
              Kategorisiz
            </>
          ),
          onSelect: () => onChange(null),
        },
        ...categories.map(c => ({
          label: c.name,
          content: (
            <>
              <CategoryDot category={c} />
              {c.name}
            </>
          ),
          onSelect: () => onChange(c.id),
        })),
        !!onManage && {
          label: "Yeni kategori",
          separator: true,
          content: (
            <>
              <Plus aria-hidden="true" size={14} />
              Yeni kategori
            </>
          ),
          onSelect: onManage,
        },
      ]}
    >
      <span className="note-category-picker">
        <CategoryDot category={current} />
        <span>{name}</span>
        <ChevronDown aria-hidden="true" size={14} />
      </span>
    </Menu>
  );
}

/** Etiket yerinde küçük panel açıyor. Escape veya dışarı tıklama kapatıp odağı etikete veriyor. */
function AttachChip({
  label,
  value,
  icon,
  disabled,
  clearLabel,
  onClear,
  children,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  disabled?: boolean;
  clearLabel: string;
  onClear?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [returns, setReturns] = useState(0);
  const chip = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    id = useId();
  /** Panel içinden kapatınca panel kalktıktan sonra odak etikete dönüyor. */
  const close = () => {
    setOpen(false);
    setReturns(n => n + 1);
  };
  useEffect(() => {
    if (returns) chip.current?.focus();
  }, [returns]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !chip.current?.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <span className={`note-attach${value ? " set" : ""}`}>
      <button
        ref={chip}
        type="button"
        className="note-attach-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span>{value || label}</span>
      </button>
      {value && onClear && !disabled && (
        <button type="button" className="note-attach-clear" aria-label={clearLabel} onClick={onClear}>
          <X aria-hidden="true" size={12} />
        </button>
      )}
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          className="note-attach-panel"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          {children(close)}
        </div>
      )}
    </span>
  );
}

export function TaskAttach({
  taskId,
  title,
  fixed,
  onChange,
}: {
  taskId: string | null;
  title: string;
  fixed?: boolean;
  onChange: (task: { id: string; title: string } | null) => void;
}) {
  return (
    <AttachChip
      label="Göreve bağla"
      value={taskId ? title || "Bağlı görev" : ""}
      icon={<Link2 aria-hidden="true" size={14} />}
      disabled={fixed}
      clearLabel="Görev bağını kaldır"
      onClear={() => onChange(null)}
    >
      {close => (
        <TaskSearch
          select={task => {
            onChange(task);
            close();
          }}
        />
      )}
    </AttachChip>
  );
}

function TaskSearch({ select }: { select: (task: { id: string; title: string }) => void }) {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(10);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  const q = useTasks({ offset: 0, limit, search: search || undefined, includeArchived: false, orderBy: "Title" });
  const items = q.data?.items ?? [];
  return (
    <div className="note-task-search">
      <label className="sr-only" htmlFor="note-task-search">
        Görev ara
      </label>
      <input
        ref={field}
        id="note-task-search"
        type="search"
        placeholder="Görev ara"
        maxLength={200}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setLimit(10);
        }}
      />
      {q.isPending && <p className="r2-hint">Görevler okunuyor…</p>}
      {q.isError && (
        <p role="alert" className="field-error">
          {noteFailure(q.error)}
        </p>
      )}
      {q.data && !items.length && <p className="r2-hint">Eşleşen görev yok.</p>}
      {items.length > 0 && (
        <ul aria-label="Görevler">
          {items.map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => select({ id: t.id, title: t.title })}>
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {Number(q.data?.total ?? 0) > items.length && (
        <button type="button" className="r2-quiet-link" disabled={q.isFetching} onClick={() => setLimit(limit + 10)}>
          Daha fazla göster
        </button>
      )}
    </div>
  );
}

export function DateAttach({
  value,
  zone,
  onChange,
}: {
  value: string | null;
  zone: string;
  onChange: (dueAt: string | null) => void;
}) {
  const today = Temporal.Now.plainDateISO(zone);
  return (
    <AttachChip
      label="Tarih"
      value={dueLabel(value, zone, today.toString())}
      icon={<CalendarDays aria-hidden="true" size={14} />}
      clearLabel="Tarihi kaldır"
      onClear={() => onChange(null)}
    >
      {close => (
        <DatePanel
          value={value}
          zone={zone}
          today={today}
          apply={next => {
            onChange(next);
            close();
          }}
        />
      )}
    </AttachChip>
  );
}

function DatePanel({
  value,
  zone,
  today,
  apply,
}: {
  value: string | null;
  zone: string;
  today: Temporal.PlainDate;
  apply: (dueAt: string | null) => void;
}) {
  const initial = dueParts(value, zone);
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time),
    [failure, setFailure] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const nextMonday = today.add({ days: (8 - today.dayOfWeek) % 7 || 7 });
  const quick: [string, Temporal.PlainDate][] = [
    ["Bugün", today],
    ["Yarın", today.add({ days: 1 })],
    ["Gelecek hafta", nextMonday],
  ];
  const label = (d: Temporal.PlainDate) =>
    new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
      new Date(`${d.toString()}T12:00:00Z`),
    );
  const pick = (d: string, t: string) => {
    try {
      apply(dueAt(d, t, zone));
    } catch (error) {
      setFailure(noteFailure(error));
    }
  };
  return (
    <div className="note-date-panel">
      {quick.map(([name, d], index) => (
        <button
          key={name}
          ref={index === 0 ? first : undefined}
          type="button"
          className="note-date-quick"
          aria-pressed={initial.date === d.toString() && !initial.time}
          onClick={() => pick(d.toString(), "")}
        >
          <span>{name}</span>
          <span className="r2-hint">{label(d)}</span>
        </button>
      ))}
      <div className="note-date-custom">
        <label>
          Gün
          <TemporalInput type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label>
          Saat (isteğe bağlı)
          <TemporalInput type="time" value={time} onChange={e => setTime(e.target.value)} />
        </label>
      </div>
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      <button type="button" className="r2-soft" disabled={!date} onClick={() => pick(date, time)}>
        Uygula
      </button>
    </div>
  );
}

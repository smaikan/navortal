"use client";
import { useId, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { CalendarDays, ChevronRight, FileText, Link2 } from "lucide-react";
import { Menu, type MenuItem } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { CategoryDot } from "./attach";
import { dueLabel, type Category, type Note } from "./model";

const longText = (text: string) => text.length > 420 || text.split(/\r?\n/).length > 6;
export function noteWhen(note: Note, zone: string, now = Date.now()) {
  const day = (value: number | string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(value),
    );
  const key = day(note.updatedAt);
  const time = new Intl.DateTimeFormat("tr-TR", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(note.updatedAt),
  );
  if (key === day(now)) return `Bugün ${time}`;
  if (key === day(now - 86400000)) return `Dün ${time}`;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: zone, day: "numeric", month: "long" }).format(
    new Date(note.updatedAt),
  );
}

/** Kategori rozeti nokta ve addan oluşuyor. Renk kategori tokenından; Kategorisiz nötr kalıyor. */
export function CategoryBadge({ category }: { category: Category | null }) {
  if (!category) return null;
  return (
    <span className="note-badge" data-note-color={category?.color ?? "Gray"}>
      <CategoryDot category={category} />
      {category?.name ?? "Kategorisiz"}
    </span>
  );
}

/** Kısa not metni, ayrıntılı not yalnız başlığı gösteriyor ve pencere açıyor. Toggle içeriği yerinde açılıyor. Sabit kategorinin yumuşak dolgusu uyarıyı ayırıyor. */
export function NoteCard({
  note,
  category,
  zone,
  compact = false,
  showTask = true,
  menu,
  onOpen,
}: {
  note: Note;
  category: Category | null;
  zone: string;
  compact?: boolean;
  showTask?: boolean;
  menu: MenuItem[];
  onOpen: (note: Note, trigger: HTMLElement) => void;
}) {
  const openTask = useTaskPanel();
  const id = useId();
  const [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(false);
  const today = Temporal.Now.plainDateISO(zone).toString();
  const due = dueLabel(note.dueAt, zone, today);
  const label = note.title ?? note.text.slice(0, 40);
  const meta = (
    <span className="note-meta">
      <CategoryBadge category={category} />
      {showTask && note.taskId && (
        <button
          type="button"
          className="note-task-link"
          onClick={e => openTask(note.taskId!, e.currentTarget)}
          aria-label={`İlgili görevi aç: ${note.taskTitle ?? "görev"}`}
        >
          <Link2 aria-hidden="true" size={12} />
          <span>{note.taskTitle ?? "Bağlı görev"}</span>
        </button>
      )}
      {due && (
        <span className="note-due">
          <CalendarDays aria-hidden="true" size={12} />
          {due}
        </span>
      )}
      <time dateTime={note.updatedAt}>{noteWhen(note, zone)}</time>
    </span>
  );
  const actions = <Menu label={`Not işlemleri: ${label}`} items={menu} floating />;
  return (
    <article
      className={`note-card note-${note.display.toLowerCase()}${compact ? " compact" : ""}`}
      data-note-color={category?.pinInAll && !category.removedAt ? category.color : undefined}
      data-tone={category?.pinInAll && !category.removedAt ? "soft" : undefined}
      aria-labelledby={`${id}-label`}
    >
      {note.display === "Short" && (
        <div className="note-card-row">
          <div className="note-card-main">
            <p id={`${id}-label`} className={`note-text${longText(note.text) && !expanded ? " clamped" : ""}`}>
              {note.text}
            </p>
            {longText(note.text) && (
              <button
                type="button"
                className="r2-quiet-link"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Daha az göster" : "Devamı"}
              </button>
            )}
            {meta}
          </div>
          {actions}
        </div>
      )}
      {note.display === "Detailed" && (
        <div className="note-card-row">
          <button
            type="button"
            className="note-open"
            aria-haspopup="dialog"
            onClick={e => onOpen(note, e.currentTarget)}
          >
            <span className="note-icon" data-note-color={category?.color ?? "Gray"} aria-hidden="true">
              <FileText size={16} />
            </span>
            <span className="note-card-main">
              <span id={`${id}-label`} className="note-title">
                {note.title}
              </span>
            </span>
            <ChevronRight aria-hidden="true" size={16} className="note-chevron" />
          </button>
          {actions}
          <div className="note-card-meta">{meta}</div>
        </div>
      )}
      {note.display === "Toggle" && (
        <>
          <div className="note-card-row">
            <button
              type="button"
              className="note-open"
              aria-expanded={open}
              aria-controls={`${id}-body`}
              onClick={() => setOpen(!open)}
            >
              <ChevronRight aria-hidden="true" size={16} className={`note-toggle-icon${open ? " open" : ""}`} />
              <span className="note-card-main">
                <span id={`${id}-label`} className="note-title">
                  {note.title}
                </span>
              </span>
            </button>
            {actions}
            <div className="note-card-meta">{meta}</div>
          </div>
          <div id={`${id}-body`} className="note-toggle-body" hidden={!open}>
            <p className="note-text">{note.text}</p>
          </div>
        </>
      )}
    </article>
  );
}

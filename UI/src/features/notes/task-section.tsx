"use client";
import { lazy, Suspense, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import type { MenuItem } from "../../components/ui/menu";
import { NoteComposer } from "./composer";
import { NoteCard } from "./note-card";
import { useNoteRemoval } from "./actions";
import { activeCategories, noteFailure, type Note } from "./model";
import { useNoteCategories, useNotes } from "./queries";
import "./styles.css";
const Detail = lazy(() => import("./detail").then(m => ({ default: m.NoteDetail })));

/** Görev panelindeki Notlar kapalı başlıyor. Açılınca bu görevin kartları ve görev bağı sabit form görünüyor. Sıkıştım NextStep notlarını sunucu dışarıda bırakıyor. */
export function TaskNotesSection({ taskId, taskTitle, zone }: { taskId: string; taskTitle: string; zone: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const notes = useNotes(taskId);
  const total = Number(notes.data?.total ?? 0);
  return (
    <section className="r2-section r2-notes">
      <button
        type="button"
        className="r2-notes-toggle"
        aria-expanded={open}
        aria-controls={`${id}-notes`}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight aria-hidden="true" size={14} />
        Notlar{total > 0 && <span className="r2-count">{total}</span>}
      </button>
      {open && (
        <div id={`${id}-notes`} className="task-notes">
          <NoteList taskId={taskId} taskTitle={taskTitle} zone={zone} notes={notes} />
        </div>
      )}
    </section>
  );
}

function NoteList({
  taskId,
  taskTitle,
  zone,
  notes,
}: {
  taskId: string;
  taskTitle: string;
  zone: string;
  notes: ReturnType<typeof useNotes>;
}) {
  const categories = useNoteCategories();
  const remove = useNoteRemoval();
  const [adding, setAdding] = useState(false),
    [detail, setDetail] = useState<{ note: Note; trigger: HTMLElement; editing: boolean } | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const items = notes.data?.items ?? [];
  const menu = (note: Note): MenuItem[] => [
    { label: "Düzenle", onSelect: t => setDetail({ note, trigger: t, editing: true }) },
    { label: "Sil", danger: true, separator: true, onSelect: () => void remove(note) },
  ];
  return (
    <>
      {notes.isPending && (
        <p role="status" className="r2-hint">
          Notlar okunuyor…
        </p>
      )}
      {notes.isError && (
        <p role="alert" className="field-error">
          {noteFailure(notes.error)}
          <button type="button" onClick={() => void notes.refetch()}>
            Yeniden dene
          </button>
        </p>
      )}
      {items.length > 0 && (
        <ul className="notes-grid list task-notes-list">
          {items.map(note => (
            <li key={note.id}>
              <NoteCard
                note={note}
                category={categories.data?.items.find(c => c.id === note.categoryId) ?? null}
                zone={zone}
                compact
                showTask={false}
                menu={menu(note)}
                onOpen={(n, trigger) => setDetail({ note: n, trigger, editing: false })}
              />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <NoteComposer
          zone={zone}
          compact
          categories={activeCategories(categories.data)}
          fixedTask={{ id: taskId, title: taskTitle }}
          onDone={() => {
            setAdding(false);
            add.current?.focus();
          }}
          onCancel={() => {
            setAdding(false);
            requestAnimationFrame(() => add.current?.focus());
          }}
        />
      ) : (
        <button ref={add} type="button" className="r2-add-text" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={13} />
          Not ekle
        </button>
      )}
      <Link className="r2-quiet-link" href="/notes?view=tasks" prefetch={false}>
        Bu görevin bütün notları
      </Link>
      {detail && (
        <Suspense fallback={<p role="status">Not açılıyor…</p>}>
          <Detail
            key={detail.note.id}
            note={detail.note}
            categories={categories.data}
            zone={zone}
            trigger={detail.trigger}
            editing={detail.editing}
            close={() => setDetail(null)}
          />
        </Suspense>
      )}
    </>
  );
}

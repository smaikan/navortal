"use client";
import { lazy, Suspense, useId, useRef } from "react";
import { Plus } from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { useNoteRemoval } from "./actions";
import { noteFailure, type Note } from "./model";
import { useNoteFeed, useNotesCache } from "./queries";
import styles from "./day-section.module.css";

const Composer = lazy(() => import("./composer").then(module => ({ default: module.NoteComposer })));
export type DayNoteEditor = { note?: Note; trigger: HTMLElement };

export function DayNotes({
  date,
  zone,
  editor,
  setEditor,
  onDirty,
  inDialog = false,
}: {
  date: string;
  zone: string;
  editor: DayNoteEditor | null;
  setEditor: (editor: DayNoteEditor | null) => void;
  onDirty: (dirty: boolean) => void;
  inDialog?: boolean;
}) {
  const heading = useId();
  const Heading = inDialog ? "h3" : "h2";
  const add = useRef<HTMLButtonElement>(null);
  const feed = useNoteFeed({ kind: "Daily", date });
  useNotesCache(true);
  const remove = useNoteRemoval();
  const notes = feed.data?.pages.flatMap(page => page.items) ?? [];
  if (!inDialog && !editor && !notes.length && !feed.isError) return null;
  function closeEditor() {
    const trigger = editor?.trigger;
    setEditor(null);
    onDirty(false);
    requestAnimationFrame(() => (trigger?.isConnected ? trigger : add.current)?.focus());
  }
  return (
    <section className={styles.section} aria-labelledby={heading}>
      <div className={styles.head}>
        <Heading id={heading}>Gün notları</Heading>
        <button
          ref={add}
          className="r2-add-text"
          type="button"
          disabled={!!editor}
          onClick={event => setEditor({ trigger: event.currentTarget })}
        >
          <Plus aria-hidden="true" size={15} />
          Not ekle
        </button>
      </div>
      {editor && (
        <Suspense fallback={<p role="status">Not düzenleyicisi açılıyor…</p>}>
          <Composer
            zone={zone}
            dayDate={date}
            note={editor.note}
            categories={[]}
            compact
            onDirty={onDirty}
            onDone={closeEditor}
            onCancel={closeEditor}
          />
        </Suspense>
      )}
      {feed.isPending && (
        <p role="status" className="r2-hint">
          Gün notları okunuyor…
        </p>
      )}
      {feed.isError && (
        <div role="alert" className="form-error">
          <p>{noteFailure(feed.error)}</p>
          <button type="button" onClick={() => void feed.refetch()}>
            Gün notlarını yeniden oku
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map(note => (
            <li key={note.id} className={styles.note}>
              <div>
                {note.title && <strong>{note.title}</strong>}
                <p>{note.text}</p>
              </div>
              {!editor && (
                <Menu
                  label={`Gün notu işlemleri: ${note.title ?? note.text.slice(0, 40)}`}
                  floating
                  items={[
                    { label: "Düzenle", onSelect: trigger => setEditor({ note, trigger }) },
                    { label: "Sil", danger: true, separator: true, onSelect: () => void remove(note) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {feed.hasNextPage && (
        <button
          type="button"
          className="r2-quiet-link"
          disabled={feed.isFetching}
          onClick={() => void feed.fetchNextPage()}
        >
          {feed.isFetchingNextPage ? "Notlar okunuyor…" : "Daha fazla not göster"}
        </button>
      )}
    </section>
  );
}

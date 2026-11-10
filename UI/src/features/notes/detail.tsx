"use client";
import { lazy, Suspense, useState } from "react";
import { Link2 } from "lucide-react";
import { Surface } from "../../components/ui/surface";
import { Menu } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { NoteComposer } from "./composer";
import { CategoryBadge } from "./note-card";
import { useNoteRemoval } from "./actions";
import { activeCategories, dueLabel, type CategoryList, type Note } from "./model";
import { Temporal } from "temporal-polyfill";
const Convert = lazy(() => import("./dialog").then(m => ({ default: m.ConvertDialog })));

const stamp = (value: string, zone: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

/** Tam not ve yerinde düzenleme bu pencerede. Diğer işlemler üç nokta menüsünde. */
export function NoteDetail({
  note: initial,
  categories,
  zone,
  trigger,
  editing: startEditing = false,
  close,
  onManageCategories,
}: {
  note: Note;
  categories: CategoryList | undefined;
  zone: string;
  trigger: HTMLElement;
  editing?: boolean;
  close: () => void;
  onManageCategories?: (trigger: HTMLButtonElement) => void;
}) {
  const openTask = useTaskPanel();
  const remove = useNoteRemoval();
  const [note, setNote] = useState(initial),
    [editing, setEditing] = useState(startEditing),
    [convert, setConvert] = useState<HTMLElement | null>(null),
    [dirty, setDirty] = useState(false);
  const category = categories?.items.find(c => c.id === note.categoryId) ?? null;
  const due = dueLabel(note.dueAt, zone, Temporal.Now.plainDateISO(zone).toString());
  return (
    <Surface
      title={note.title ?? (editing ? "Notu düzenle" : "Not")}
      modal
      placement="center"
      returnTo={trigger}
      initialFocus={editing ? "field" : "heading"}
      onClose={() => {
        if (editing && dirty && !window.confirm("Kaydedilmemiş notu bırakmak istiyor musun?")) return false;
        close();
      }}
    >
      {editing ? (
        <NoteComposer
          zone={zone}
          note={note}
          categories={activeCategories(categories)}
          removedCategory={category?.removedAt ? category : null}
          onManageCategories={onManageCategories}
          onDirty={setDirty}
          onDone={saved => {
            setNote(saved);
            setDirty(false);
            setEditing(false);
          }}
          onCancel={() => {
            setDirty(false);
            if (startEditing) close();
            else setEditing(false);
          }}
        />
      ) : (
        <div className="note-detail">
          <div className="note-detail-head">
            <span className="note-meta">
              <CategoryBadge category={category} />
              {note.display === "Short" && <span>Kısa not</span>}
            </span>
            <Menu
              label="Not işlemleri"
              floating
              items={[
                { label: "Düzenle", onSelect: () => setEditing(true) },
                note.convertedTaskId
                  ? { label: "Dönüştürülen görevi aç", onSelect: t => openTask(note.convertedTaskId!, t) }
                  : { label: "Göreve dönüştür", onSelect: t => setConvert(t) },
                {
                  label: "Sil",
                  danger: true,
                  separator: true,
                  onSelect: () => {
                    close();
                    void remove(note);
                  },
                },
              ]}
            />
          </div>
          <p className="note-detail-dates">
            Güncellendi: {stamp(note.updatedAt, zone)} · Oluşturuldu: {stamp(note.createdAt, zone)}
            {due && ` · Tarih: ${due}`}
          </p>
          {note.taskId && (
            <button type="button" className="note-task-link" onClick={e => openTask(note.taskId!, e.currentTarget)}>
              <Link2 aria-hidden="true" size={12} />
              <span>{note.taskTitle ?? "Bağlı görev"}</span>
            </button>
          )}
          {/* Pencere sabit, yalnız not metni kayıyor. Tek kaydırma çubuğu var ve klavyeyle kullanılabiliyor. */}
          <div
            className="note-text note-detail-body note-detail-scroll"
            tabIndex={0}
            role="region"
            aria-label="Not içeriği"
          >
            {note.text}
          </div>
        </div>
      )}
      {convert && (
        <Suspense fallback={<p role="status">Dönüştürme açılıyor…</p>}>
          <Convert note={note} trigger={convert} close={() => setConvert(null)} />
        </Suspense>
      )}
    </Surface>
  );
}

"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite } from "../tasks/model";
import { CategoryPicker, TaskAttach } from "./attach";
import {
  draftFields,
  draftIssues,
  editFields,
  noteDraft,
  noteFailure,
  readNote,
  textLimit,
  titleLimit,
  type Category,
  type Draft,
  type Note,
} from "./model";
import { useNotesCache } from "./queries";
import "./styles.css";

const leaveMessage = "Kaydedilmemiş notu bırakmak istiyor musun?";

/** Ekleme ve düzenleme aynı formda. Kısa metin ve ayrıntılı açıklama aynı alan olduğu için anahtarı değiştirince yazı kaybolmuyor. Çevrimdışı kuyruk yok, belirsiz sonuç bildirilir ama tekrar gönderilmez. */
export function NoteComposer({
  categories,
  removedCategory,
  note,
  initialCategoryId = null,
  fixedTask,
  dayDate,
  compact = false,
  onDone,
  onCancel,
  onManageCategories,
  onDirty,
  autoFocus = true,
}: {
  zone: string;
  /** Seçicide sunulan aktif kategoriler. */
  categories: Category[];
  /** Düzenlenen notun kaldırılmış kategorisi, kullanıcı değiştirmedikçe korunuyor. */
  removedCategory?: Category | null;
  note?: Note;
  initialCategoryId?: string | null;
  fixedTask?: { id: string; title: string };
  dayDate?: string;
  compact?: boolean;
  onDone: (note: Note) => void;
  onCancel: () => void;
  onManageCategories?: (trigger: HTMLButtonElement) => void;
  onDirty?: (dirty: boolean) => void;
  autoFocus?: boolean;
}) {
  const { session } = useSession();
  const cache = useNotesCache();
  const fieldId = useId();
  const [initial] = useState<Draft>(() =>
    note
      ? noteDraft(note)
      : {
          text: "",
          title: "",
          detailed: false,
          toggle: false,
          categoryId: initialCategoryId,
          taskId: fixedTask?.id ?? null,
          dueAt: null,
        },
  );
  const [draft, setDraft] = useState(initial),
    [taskTitle, setTaskTitle] = useState(fixedTask?.title ?? note?.taskTitle ?? ""),
    [busy, setBusy] = useState(false),
    [tried, setTried] = useState(false),
    [failure, setFailure] = useState(""),
    [base, setBase] = useState(note),
    [blocked, setBlocked] = useState<"" | "unknown" | "conflict">(""),
    [checked, setChecked] = useState(false),
    [latest, setLatest] = useState<Note | null>(null),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const first = useRef<HTMLTextAreaElement & HTMLInputElement>(null),
    titleField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus, draft.detailed]);
  // Yalnız içerik kaybolabilir. Ayrıntılı/Toggle anahtarını tek başına değiştirmek korunacak taslak sayılmıyor.
  const dirty = (["text", "title", "categoryId", "taskId", "dueAt"] as const).some(k => draft[k] !== initial[k]);
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  const issues = tried ? draftIssues(draft) : {};
  const nextStep = note?.kind === "NextStep";
  const set = (patch: Partial<Draft>) => {
    setDraft(current => ({ ...current, ...patch }));
    setFailure("");
  };
  function cancel() {
    if (pending.current || (blocked === "unknown" && !checked)) return;
    if (dirty && !window.confirm(leaveMessage)) return;
    onCancel();
  }
  const form = useRef<HTMLFormElement>(null),
    latestCancel = useRef(cancel);
  useEffect(() => {
    latestCancel.current = cancel;
  });
  // Odak formun dışına çıksa da Escape formu kapatıyor;
  // üstteki modal veya formun kendi modalı ise Escape'i kendisi yönetiyor.
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]") || form.current?.contains(event.target as Node)) return;
      event.preventDefault();
      latestCancel.current();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (pending.current || blocked) return;
    setTried(true);
    // Alan hatası bir kere kendi altında gösteriliyor. Odak ilk hataya gidiyor.
    const found = draftIssues(draft);
    if (found.title || found.text) {
      setFailure("");
      (found.title ? titleField.current : first.current)?.focus();
      return;
    }
    let edit, create;
    try {
      if (base) edit = editFields(base, draft);
      else create = draftFields(draft, dayDate);
    } catch (error) {
      setFailure(noteFailure(error));
      return;
    }
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    pending.current = true;
    setBusy(true);
    setFailure("");
    try {
      const raw =
        base && edit
          ? await session.api.mutation("/api/notes/{id}", "put", { path: { id: base.id }, body: edit }).execute()
          : await session.api.mutation("/api/notes", "post", { body: create! }).execute();
      const saved = readNote(raw);
      if ((note && saved.id !== note.id) || (dayDate && (saved.kind !== "Daily" || saved.localDate !== dayDate)))
        throw new ApiError("protocol", "Not kimliği uyuşmuyor. Güncel notları kontrol et.");
      if (!cache.current()) return;
      cache.changed();
      onDone(saved);
    } catch (error) {
      if (!cache.current()) return;
      setFailure(noteFailure(error));
      setNotice("");
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) {
        setBlocked("unknown");
        setChecked(false);
      } else if (error instanceof ApiError && error.status === 409 && base) {
        setBlocked("conflict");
        setChecked(false);
      }
      if (error instanceof ApiError && error.status === 404) cache.invalidate();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  /** Kilitli yazıyı yalnız okuyarak uzlaştırıyoruz. Yeni kullanıcı isteği olmadan tekrar göndermiyoruz. */
  async function check() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      cache.invalidate();
      let found: Note | null = null;
      if (base) {
        const page = await session.api.read("/api/notes", {
          query: {
            taskId: base.taskId ?? undefined,
            categoryId: base.categoryId ?? undefined,
            kind: base.kind === "NextStep" || base.kind === "Daily" ? base.kind : undefined,
            date: base.localDate ?? undefined,
            offset: 0,
            limit: 100,
          },
        });
        const row = page.items.find(n => n.id === base.id);
        found = row ? readNote(row) : null;
      }
      if (!cache.current()) return;
      setLatest(found);
      setChecked(true);
      setFailure("");
      if (!base) {
        setBlocked("");
        setNotice(
          "Notlar yeniden okundu. Not listede görünüyorsa bu taslağı kapat; görünmüyorsa yeniden kaydedebilirsin.",
        );
      } else if (!found)
        setNotice("İlk 100 not yeniden okundu; not bulunamadı. Silinmiş olabilir. Eski komut tekrar gönderilmedi.");
      else setNotice("Eski komut tekrar gönderilmedi.");
    } catch (error) {
      if (cache.current()) setFailure(noteFailure(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function rebase() {
    if (!latest) return;
    // Kullanıcı tarihi değiştirmediyse sunucudaki tarih alınır, değiştirdiyse kendi seçimi kalır.
    if (draft.dueAt === base?.dueAt) set({ dueAt: latest.dueAt });
    setBase(latest);
    setLatest(null);
    setBlocked("");
    setChecked(false);
    setNotice("Taslağın korundu; kaydedince güncel notun üzerine yazılır.");
  }
  function keys(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }
  const textField = (
    <textarea
      ref={first}
      id={`${fieldId}-text`}
      rows={draft.detailed ? (compact ? 6 : 9) : 3}
      maxLength={textLimit}
      readOnly={busy}
      placeholder={
        dayDate
          ? "Bu gün için bir not yaz…"
          : draft.detailed
            ? "Ders notunu, ayrıntıları veya hatırlamak istediklerini yaz"
            : "Aklındakini yaz"
      }
      value={draft.text}
      aria-invalid={!!issues.text || undefined}
      aria-describedby={issues.text ? `${fieldId}-text-issue` : undefined}
      onChange={e => set({ text: e.target.value })}
    />
  );
  return (
    <form
      ref={form}
      className={`note-composer${compact ? " compact" : ""}`}
      aria-label={note ? "Notu düzenle" : "Yeni not"}
      aria-busy={busy || undefined}
      onSubmit={save}
      onKeyDown={keys}
      noValidate
    >
      {!dayDate && (
        <div className="note-composer-head">
          <CategoryPicker
            value={draft.categoryId}
            categories={categories}
            removed={removedCategory}
            disabled={busy || nextStep}
            onChange={categoryId => set({ categoryId })}
            onManage={onManageCategories}
          />
          <div className="note-switches">
            <button
              type="button"
              role="switch"
              className="note-switch"
              aria-checked={draft.detailed}
              disabled={busy || nextStep}
              onClick={() => set({ detailed: !draft.detailed })}
            >
              <span>Ayrıntılı not</span>
              <span className="note-switch-track" aria-hidden="true" />
            </button>
            {draft.detailed && (
              <div className="note-subswitch">
                <ChevronRight aria-hidden="true" size={14} className={draft.toggle ? "open" : undefined} />
                <button
                  type="button"
                  role="switch"
                  className="note-switch"
                  aria-checked={draft.toggle}
                  disabled={busy}
                  onClick={() => set({ toggle: !draft.toggle })}
                >
                  <span>Toggle olarak göster</span>
                  <span className="note-switch-track" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {draft.detailed && !dayDate ? (
        <>
          <div className="note-field">
            <label htmlFor={`${fieldId}-title`}>Başlık</label>
            <input
              ref={titleField}
              id={`${fieldId}-title`}
              maxLength={titleLimit}
              readOnly={busy}
              placeholder="Örneğin: İstatistik 3. hafta — Hipotez testleri"
              value={draft.title}
              aria-invalid={!!issues.title || undefined}
              aria-describedby={issues.title ? `${fieldId}-title-issue` : undefined}
              onChange={e => set({ title: e.target.value })}
            />
            {issues.title && (
              <p id={`${fieldId}-title-issue`} className="field-error">
                {issues.title}
              </p>
            )}
          </div>
          <div className="note-field">
            <label htmlFor={`${fieldId}-text`}>Açıklama</label>
            {textField}
            {issues.text && (
              <p id={`${fieldId}-text-issue`} className="field-error">
                {issues.text}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="note-field">
          <label htmlFor={`${fieldId}-text`} className="sr-only">
            {dayDate ? "Gün notu" : "Not"}
          </label>
          {textField}
          {issues.text && (
            <p id={`${fieldId}-text-issue`} className="field-error">
              {issues.text}
            </p>
          )}
        </div>
      )}
      {!dayDate && (
        <div className="note-attachments">
          <TaskAttach
            taskId={draft.taskId}
            title={taskTitle}
            fixed={!!fixedTask || nextStep || busy}
            onChange={task => {
              set({ taskId: task?.id ?? null });
              setTaskTitle(task?.title ?? "");
            }}
          />
        </div>
      )}
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
      {blocked && !checked && (
        <button type="button" disabled={busy} onClick={() => void check()}>
          Güncel notları kontrol et
        </button>
      )}
      {checked && latest && blocked && (
        <section aria-label="Sunucudaki not" className="reconcile-panel">
          <h3>Sunucudaki güncel not</h3>
          {latest.title && <p className="note-title">{latest.title}</p>}
          <p className="note-text">{latest.text}</p>
          <button type="button" onClick={rebase}>
            Taslağımı güncel nota göre hazırla
          </button>
        </section>
      )}
      {notice && (
        <p role="status" className="r2-hint">
          {notice}
        </p>
      )}
      <div className="note-composer-actions">
        <button type="submit" className="primary" aria-keyshortcuts="Control+Enter" disabled={busy || !!blocked}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button
          type="button"
          className="r2-quiet"
          aria-keyshortcuts="Escape"
          disabled={busy || (blocked === "unknown" && !checked)}
          onClick={cancel}
        >
          Vazgeç
        </button>
        <span className="note-keys" aria-hidden="true">
          <span>
            <kbd>Ctrl</kbd>
            <kbd>Enter</kbd> kaydet
          </span>
          <span>
            <kbd>Esc</kbd> kapat
          </span>
        </span>
      </div>
    </form>
  );
}

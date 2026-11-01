"use client";
import { useRef, useState } from "react";
import { Surface } from "../../components/ui/surface";
import { TemporalInput } from "../../components/ui/temporal-input";
import { ApiError } from "../../lib/api/errors";
import type { WallChoice } from "../../lib/time/wall-time";
import { useSession } from "../auth/provider";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useDialogGuard } from "../work/draft-guard";
import { NotePoolChoice } from "./choices";
import { useNotesCache } from "./queries";
import { dueInput, noteFailure, readConversion, readNote, resolveDue, type Note } from "./model";

/** Göreve dönüştürmede not kalır ve yeni göreve bağlanır. Komut anahtarlı; yalnız belirsiz sonuçta, kullanıcının açık isteğiyle aynı hazırlanmış komut tekrar denenebilir. */
export function ConvertDialog({
  note,
  zone,
  trigger,
  close,
}: {
  note: Note;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session } = useSession();
  const cache = useNotesCache();
  const openTask = useTaskPanel();
  const [base, setBase] = useState(note);
  const effectiveZone = base.timeZoneId || zone;
  const initialTitle = (note.title ?? note.text.split(/\r?\n/)[0]).slice(0, 300);
  const [title, setTitle] = useState(initialTitle),
    [pool, setPool] = useState(""),
    [due, setDue] = useState(() => dueInput(note.dueAt, effectiveZone)),
    [choice, setChoice] = useState<WallChoice>(""),
    [dueEdited, setDueEdited] = useState(false);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [unknown, setUnknown] = useState(false),
    [checked, setChecked] = useState(false),
    [latest, setLatest] = useState<Note | null>(null),
    [convertedId, setConvertedId] = useState<string | null>(null),
    [failure, setFailure] = useState("");
  const busy = useRef(false);
  const prepared = useRef<ReturnType<typeof session.api.mutation<"/api/notes/{id}/convert", "post">> | null>(null);
  const saved = !!convertedId;
  const dirty = !saved && (title !== initialTitle || !!pool || dueEdited);
  const guard = useDialogGuard({
    dirty,
    pending: pending || (unknown && !checked),
    close,
    trigger,
    message: "Kaydedilmemiş dönüşüm taslağını bırakmak istiyor musun?",
  });
  const locked = pending || blocked || saved;
  async function save(retry = false) {
    if (busy.current || saved || (blocked && !retry)) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      const dueAt = resolveDue(due, effectiveZone, choice, base.dueAt, dueEdited);
      if (!title.trim() || title.trim().length > 300) throw new RangeError("Görev başlığı 1–300 karakter olmalı.");
      prepared.current ??= session.api.mutation("/api/notes/{id}/convert", "post", {
        path: { id: base.id },
        body: { version: base.version, title: title.trim(), poolId: pool || null, deadlineAt: dueAt },
      });
      const result = readConversion(await prepared.current.execute({ retryUnknownResult: retry }), base.id);
      if (!cache.current()) return;
      setConvertedId(result.taskId);
      setBlocked(false);
      setUnknown(false);
      guard.markSaved();
      cache.changed(true);
    } catch (e) {
      if (!cache.current()) return;
      if (e instanceof ApiError && (e.outcomeUnknown || e.kind === "protocol")) {
        setUnknown(true);
        setBlocked(true);
        setChecked(false);
      }
      if (e instanceof ApiError && [404, 409].includes(e.status)) {
        setBlocked(true);
        setChecked(false);
      }
      setFailure(noteFailure(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const page = await session.api.read("/api/notes", {
        query: {
          taskId: base.taskId ?? undefined,
          categoryId: base.categoryId ?? undefined,
          kind: base.kind === "NextStep" ? "NextStep" : undefined,
          offset: 0,
          limit: 100,
        },
      });
      const found = page.items.find(n => n.id === base.id);
      if (!cache.current()) return;
      setLatest(found ? readNote(found) : null);
      setChecked(true);
      cache.invalidate();
    } catch (e) {
      if (cache.current()) setFailure(noteFailure(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function rebase() {
    if (!latest || unknown || latest.convertedTaskId) return;
    if (!dueEdited) setDue(dueInput(latest.dueAt, latest.timeZoneId));
    setBase(latest);
    setLatest(null);
    setBlocked(false);
    setChecked(false);
    setFailure("");
    prepared.current = null;
  }
  return (
    <Surface
      title="Notu göreve dönüştür"
      modal
      returnTo={trigger}
      closeDisabled={pending || (unknown && !checked)}
      onClose={guard.requestClose}
    >
      <form
        className="notes-form"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked}>
          <legend>Yeni görevin bilgileri</legend>
          <p className="note-text">{note.title ? `${note.title}\n${note.text}` : note.text}</p>
          <label>
            Yeni görev başlığı
            <input maxLength={300} required value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <NotePoolChoice id={pool} select={setPool} />
          <label>
            Görev son teslimi
            <TemporalInput
              type="datetime-local"
              step="any"
              value={due}
              onChange={e => {
                setDue(e.target.value);
                setChoice("");
                setDueEdited(true);
              }}
            />
          </label>
          {dueEdited && due && (
            <label>
              Saat iki kez yaşanıyorsa
              <select value={choice} onChange={e => setChoice(e.target.value as WallChoice)}>
                <option value="">Önce saati kontrol et</option>
                <option value="earlier">İlk oluşum</option>
                <option value="later">İkinci oluşum</option>
              </select>
            </label>
          )}
          <p>Not korunur ve oluşturulan göreve bağlanır. Tarihi boş bırakırsan notun mevcut tarihi kullanılır.</p>
        </fieldset>
        {failure && (
          <p role="alert" className="form-error">
            {failure}
          </p>
        )}
        {blocked && !saved && (
          <>
            <button type="button" disabled={pending} onClick={() => void check()}>
              Güncel notları kontrol et
            </button>
            {unknown && (
              <button type="button" disabled={pending} onClick={() => void save(true)}>
                Aynı dönüşümü güvenle yeniden dene
              </button>
            )}
          </>
        )}
        {checked && (
          <section aria-label="Sunucudaki not" className="reconcile-panel">
            {latest ? (
              <>
                <h3>Sunucudaki güncel not</h3>
                <p className="note-text">{latest.text}</p>
                {latest.convertedTaskId && <p>Göreve dönüştürülmüş.</p>}
                {!unknown && !latest.convertedTaskId && (
                  <button type="button" onClick={rebase}>
                    Taslağımı güncel nota göre hazırla
                  </button>
                )}
              </>
            ) : (
              <p>
                İlk 100 not yeniden okundu. Bu okuma aralığında nota ulaşılamadı; silinmiş veya sonraki sayfalarda
                olabilir.
              </p>
            )}
            <p>Eski komut tekrar gönderilmedi.</p>
          </section>
        )}
        {saved && <p role="status">Göreve dönüşüm kaydedildi.</p>}
        {convertedId && (
          <button
            type="button"
            onClick={e => {
              guard.markSaved();
              close();
              openTask(convertedId, e.currentTarget);
            }}
          >
            Oluşturulan görevi aç
          </button>
        )}
        <div className="actions">
          <button className="primary" disabled={locked}>
            {pending ? "Kaydediliyor…" : "Göreve dönüştür"}
          </button>
          <button type="button" disabled={pending || (unknown && !checked)} onClick={guard.requestClose}>
            {saved || checked ? "Kapat" : "Vazgeç"}
          </button>
        </div>
      </form>
    </Surface>
  );
}

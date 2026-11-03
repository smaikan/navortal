"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Surface } from "../../components/ui/surface";
import { areas, type Quadrant } from "./model";
import { useCandidates } from "./queries";
export function MatrixPicker({
  area,
  trigger,
  pending,
  blocked,
  failure,
  add,
  refresh,
  close,
}: {
  area: Quadrant;
  trigger: HTMLElement;
  pending: boolean;
  blocked: boolean;
  failure: string;
  add: (ids: string[]) => Promise<string[]>;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const locked = pending || saving;
  async function submit() {
    if (submitting.current || locked || blocked || !selected.length) return;
    submitting.current = true;
    setSaving(true);
    try {
      const added = await add(selected);
      setSelected(current => current.filter(id => !added.includes(id)));
      if (added.length === selected.length) close();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(text.trim());
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [text]);
  const q = useCandidates(search, offset);
  return (
    <Surface
      title="Matrise görev seç"
      modal
      onClose={close}
      closeDisabled={locked}
      returnTo={trigger}
      initialFocus="field"
    >
      <div className="matrix-picker">
        <p className="muted">{areas.find(x => x.id === area)!.title} alanına ekle</p>
        <label htmlFor="matrix-task-search" className="sr-only">
          Görevlerde ara
        </label>
        <div className="matrix-search">
          <Search size={18} aria-hidden="true" />
          <input
            id="matrix-task-search"
            type="search"
            value={text}
            maxLength={200}
            placeholder="Görev adıyla ara…"
            onChange={e => setText(e.target.value)}
            autoComplete="off"
            disabled={locked}
          />
        </div>
        {q.isPending && <p role="status">Görevler okunuyor…</p>}
        {q.isError && (
          <p role="alert">
            Görevler okunamadı.{" "}
            <button type="button" onClick={() => void q.refetch()}>
              Yeniden yükle
            </button>
          </p>
        )}
        {failure && (
          <p role="alert">
            {failure}{" "}
            {blocked && (
              <button type="button" onClick={() => void refresh().then(() => setSelected([]))}>
                Listeyi kontrol et
              </button>
            )}
          </p>
        )}
        <ul className="matrix-candidates" aria-label="Seçilebilir görevler">
          {q.data?.items.map(task => (
            <li key={task.id}>
              <label>
                <input
                  type="checkbox"
                  value={task.id}
                  checked={selected.includes(task.id)}
                  disabled={locked || blocked || search !== text.trim()}
                  onChange={e =>
                    setSelected(current =>
                      e.target.checked ? [...current, task.id] : current.filter(id => id !== task.id),
                    )
                  }
                />
                <span>
                  {task.parentTitle && <small>{task.parentTitle}</small>}
                  <strong>{task.title}</strong>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {q.isSuccess && !q.data.items.length && (
          <p className="muted">
            {search
              ? "Bu aramada seçilebilir görev yok."
              : "Ekleyebileceğin açık görev yok. Görevler sayfasından yeni bir görev oluşturabilirsin."}
          </p>
        )}
        {q.data && Number(q.data.total) > 25 && (
          <div className="matrix-paging">
            <button disabled={!offset || q.isPending || locked} onClick={() => setOffset(n => Math.max(0, n - 25))}>
              Önceki
            </button>
            <span>
              {offset + q.data.items.length} / {q.data.total}
            </span>
            <button
              disabled={offset + 25 >= Number(q.data.total) || q.isPending || locked}
              onClick={() => setOffset(n => n + 25)}
            >
              Sonraki
            </button>
          </div>
        )}
        <div className="matrix-selection-actions">
          <p role="status">{saving ? "Seçilen görevler ekleniyor…" : `${selected.length} görev seçildi`}</p>
          <button className="ghost" disabled={locked || !selected.length} onClick={() => setSelected([])}>
            Seçimi temizle
          </button>
          <button className="primary" disabled={locked || blocked || !selected.length} onClick={() => void submit()}>
            Seçilenleri ekle
          </button>
        </div>
      </div>
    </Surface>
  );
}

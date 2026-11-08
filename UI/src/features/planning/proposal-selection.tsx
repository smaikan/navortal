"use client";
import { useState } from "react";
import { useTasks } from "../tasks/queries";
import { proposalPageSize } from "./proposal-model";

export function ProposalSelection({
  selected,
  change,
  disabled,
}: {
  selected: ReadonlyMap<string, string>;
  change: (v: Map<string, string>) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const tasks = useTasks({
    search: search || undefined,
    offset,
    limit: proposalPageSize,
    includeCompleted: false,
    includeArchived: false,
    orderBy: "Title",
  });
  return (
    <section aria-label="Otomatik plan iş seçimi">
      <h3>Planlanacak işler</h3>
      <p className="muted">
        1–1000 farklı görev seçebilirsin. Üst görev seçtiğinde kendi işi ve alt işleri de planlamaya dahil edilir.
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          setSearch(text.trim());
          setOffset(0);
        }}
      >
        <label htmlFor="proposal-search">Planlanacak görev ara</label>
        <div className="quick-add-controls">
          <input
            id="proposal-search"
            maxLength={200}
            value={text}
            disabled={disabled}
            onChange={e => setText(e.target.value)}
          />
          <button disabled={disabled}>Ara</button>
        </div>
      </form>
      {tasks.isPending && <p role="status">Görevler okunuyor…</p>}
      {tasks.isError && (
        <div role="alert">
          Görevler alınamadı.
          <button disabled={disabled} onClick={() => void tasks.refetch()}>
            Görevleri yeniden yükle
          </button>
        </div>
      )}
      {tasks.data && (
        <>
          <ul className="proposal-choices">
            {tasks.data.items.map(task => (
              <li key={task.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    disabled={disabled || (!selected.has(task.id) && selected.size >= 1000)}
                    onChange={e => {
                      const next = new Map(selected);
                      if (e.target.checked) next.set(task.id, task.title);
                      else next.delete(task.id);
                      change(next);
                    }}
                  />
                  {task.title}
                  {!task.hasDirectWork && " (alt işleriyle)"}
                </label>
              </li>
            ))}
          </ul>
          {!tasks.data.items.length && <p>Bu aramada görev yok.</p>}
          <nav className="task-pagination" aria-label="Otomatik plan görev sayfaları">
            <button
              disabled={disabled || !offset || tasks.isFetching}
              onClick={() => setOffset(Math.max(0, offset - proposalPageSize))}
            >
              Önceki
            </button>
            <span>
              {tasks.data.items.length ? `${offset + tasks.data.items.length} / ${tasks.data.total}` : "Görev yok"}
            </span>
            <button
              disabled={
                disabled ||
                tasks.isFetching ||
                offset + tasks.data.items.length >= Number(tasks.data.total) ||
                offset >= 100000
              }
              onClick={() => setOffset(offset + proposalPageSize)}
            >
              Sonraki
            </button>
          </nav>
        </>
      )}
      <p role="status">{selected.size} iş seçildi.</p>
      {!!selected.size && (
        <details>
          <summary>Seçilen işleri göster</summary>
          <ul className="proposal-list">
            {[...selected].map(([id, title]) => (
              <li key={id}>
                {title}
                <button
                  disabled={disabled}
                  aria-label={`${title} seçimini kaldır`}
                  onClick={() => {
                    const next = new Map(selected);
                    next.delete(id);
                    change(next);
                  }}
                >
                  Seçimi kaldır
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

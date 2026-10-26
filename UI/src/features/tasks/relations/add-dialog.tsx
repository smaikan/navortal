"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Surface } from "../../../components/ui/surface";
import { subscribeTraversal } from "../../../lib/navigation/traversal";
import { states, type Task } from "../model";
import { useTask, useTasks } from "../queries";
import { treeMessage } from "../tree/model";
import { AncestorPath } from "./ancestor-path";
import { useRelationCommand } from "./command";
import { relationKinds, relationPageSize, type RelationKind } from "./model";
import { useRelations } from "./queries";
import { KindIcon, RelationFeedback } from "./content";

export function AddRelationDialog({
  kind,
  task,
  trigger,
  close,
}: {
  kind: RelationKind;
  task: Task;
  trigger: HTMLElement;
  close: () => void;
}) {
  const meta = relationKinds[kind];
  const command = useRelationCommand(task.id);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Task | null>(null);
  const page = useTasks({
    search: search || undefined,
    offset,
    limit: relationPageSize,
    includeCompleted: true,
    includeArchived: false,
    orderBy: "Title",
  });
  const choice = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  useLayoutEffect(() => {
    pending.current = command.pending;
  }, [command.pending]);
  useLayoutEffect(() => {
    if (command.failure && !command.pending) errorBox.current?.focus();
  }, [command.failure, command.pending]);
  function requestClose() {
    if (pending.current) return false;
    close();
    requestAnimationFrame(() => {
      const target =
        trigger.isConnected && trigger.getClientRects().length
          ? trigger
          : document.querySelector<HTMLElement>("[data-workspace-surface] h2");
      target?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    const href = location.href;
    // Geri önce bu seçiciyi kapatır. Yazı sürüyorsa seçici açık kalır.
    const unsubscribe = subscribeTraversal(event => {
      if (location.href === href) return;
      if (pending.current) {
        event.stopImmediatePropagation();
        history.pushState({}, "", href);
      } else close();
    }, 100);
    return unsubscribe;
  }, [close]);
  function choose(candidate: Task) {
    command.clear();
    setSelected(candidate);
    requestAnimationFrame(() => choice.current?.focus());
  }
  async function submit() {
    if (selected) await command.run(kind, "add", { id: selected.id, title: selected.title });
  }
  const finished = !!command.done && !command.failure;
  return (
    <Surface title={meta.add} modal returnTo={trigger} onClose={requestClose} closeDisabled={command.pending}>
      <div className="relation-dialog">
        <p className="relation-heading">
          <KindIcon kind={kind} />
          <span className="relation-badge">{meta.badge}</span>
        </p>
        <p className="muted form-hint">{meta.help}</p>
        <p className="relation-target">
          Bu görev: <strong>{task.title}</strong>
        </p>
        <fieldset disabled={command.locked || finished}>
          <form
            onSubmit={event => {
              event.preventDefault();
              setSearch(text.trim());
              setOffset(0);
            }}
            className="relation-search"
          >
            <label htmlFor="relation-search">Görev ara</label>
            <div className="quick-add-controls">
              <input
                id="relation-search"
                maxLength={200}
                value={text}
                onChange={event => setText(event.target.value)}
              />
              <button>Ara</button>
            </div>
          </form>
          {page.isError && (
            <div role="alert" className="form-error">
              <p>{treeMessage(page.error)}</p>
              <button type="button" onClick={() => void page.refetch()}>
                Görevleri yeniden yükle
              </button>
            </div>
          )}
          {!page.data && page.isPending && <p role="status">Görevler okunuyor…</p>}
          {page.data && (
            <>
              <p className="muted relation-count" role="status">
                {page.data.items.length
                  ? `${offset + page.data.items.length} / ${page.data.total} görev`
                  : search
                    ? "Bu aramada görev bulunamadı."
                    : "Seçilebilecek görev yok."}
              </p>
              {/* Yeni arama/sayfa henüz verisizse liste gizlenir. Görünen satırın canlı yenilemesi seçimi yutmamalı. */}
              <ul className="tree-picker-list relation-candidates" aria-label="Seçilebilecek görevler">
                {page.data.items.map(candidate => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={candidate.id === task.id}
                      aria-pressed={selected?.id === candidate.id}
                      onClick={() => choose(candidate)}
                    >
                      <span className="relation-candidate-title">{candidate.title}</span>
                      <span className="muted relation-candidate-meta">
                        {candidate.id === task.id
                          ? "Bu görev; kendisine bağlanamaz"
                          : `${states[candidate.state]}${candidate.parentTaskId ? " · alt görev" : ""}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {Number(page.data.total) > relationPageSize && (
                <nav className="task-pagination relation-pagination" aria-label="Görev sayfaları">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => setOffset(value => Math.max(0, value - relationPageSize))}
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled={offset + page.data.items.length >= Number(page.data.total) || offset >= 100000}
                    onClick={() => setOffset(value => value + relationPageSize)}
                  >
                    Sonraki
                  </button>
                </nav>
              )}
            </>
          )}
        </fieldset>
        {selected && (
          <section className="relation-choice" aria-labelledby="relation-choice-heading">
            <h3 id="relation-choice-heading" ref={choice} tabIndex={-1}>
              Seçilen görev
            </h3>
            <p className="relation-title">{selected.title}</p>
            <p className="muted">{states[selected.state]}</p>
            <AncestorPath key={selected.id} task={selected} initiallyOpen={selected.parentTaskId !== null} />
            <p className="relation-meaning">{meta.meaning(selected.title, task.title)}</p>
            {kind === "dependencies" && selected.state !== "Completed" && (
              <p className="muted form-hint">
                Seçilen görev henüz tamamlanmadı; eklersen bu görev şimdilik başlatılamaz.
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={command.locked || finished}
                onClick={() => void submit()}
              >
                {command.done ? "Kaydedildi" : command.pending ? "Ekleniyor…" : meta.submit}
              </button>
            </div>
          </section>
        )}
        <RelationFeedback command={command} errorBox={errorBox} />
        {command.done && command.pending && (
          <p className="muted form-hint">
            Güncel sürüm okunduğunda pencereyi kapatabilir veya başka bir görev seçebilirsin.
          </p>
        )}
        {command.unknown && command.checked && <CurrentRelations kind={kind} id={task.id} />}
        {finished && (
          <div className="actions">
            <button
              type="button"
              disabled={command.pending}
              onClick={() => {
                command.clear();
                setSelected(null);
              }}
            >
              Başka bir görev seç
            </button>
            <button type="button" disabled={command.pending} onClick={() => requestClose()}>
              Kapat
            </button>
          </div>
        )}
      </div>
    </Surface>
  );
}
/** Yalnız ilk sayfa okunur. Burada görünmemesi belirsiz yazının başarısız olduğunu kanıtlamaz. */
function CurrentRelations({ kind, id }: { kind: RelationKind; id: string }) {
  const page = useRelations(kind, id, 0);
  const meta = relationKinds[kind];
  return (
    <section aria-label={`Güncel ${meta.title.toLocaleLowerCase("tr")}`} className="relation-current">
      <h3>Güncel {meta.title.toLocaleLowerCase("tr")}</h3>
      {page.data ? (
        page.data.total === 0 ? (
          <p>{meta.empty}</p>
        ) : (
          <>
            <p className="muted">
              İlk {page.data.items.length} / {page.data.total} kayıt. Burada görünmemesi işlemin uygulanmadığını
              kanıtlamaz.
            </p>
            <ul className="relation-current-list">
              {page.data.items.map(item => (
                <CurrentTitle key={item.id} id={item.sourceTaskId} />
              ))}
            </ul>
          </>
        )
      ) : page.isError ? (
        <p role="alert">Güncel liste alınamadı.</p>
      ) : (
        <p role="status">Güncel liste okunuyor…</p>
      )}
    </section>
  );
}
function CurrentTitle({ id }: { id: string }) {
  const task = useTask(id);
  return <li>{task.data?.title ?? (task.isError ? "Erişilemeyen görev" : "Görev okunuyor…")}</li>;
}

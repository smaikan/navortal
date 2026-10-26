"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, ListOrdered, Lock } from "lucide-react";
import { useTaskPanel } from "../../../components/layout/task-panel";
import { states, type Task } from "../model";
import { useTask } from "../queries";
import { AncestorPath } from "./ancestor-path";
import { useRelationCommand } from "./command";
import {
  predecessorNote,
  reasonText,
  relationFailure,
  relationKinds,
  relationPageSize,
  type Relation,
  type RelationKind,
} from "./model";
import { useRelations, useStartDecision } from "./queries";

type Command = ReturnType<typeof useRelationCommand>;
export function KindIcon({ kind }: { kind: RelationKind }) {
  return kind === "dependencies" ? <Lock size={16} aria-hidden="true" /> : <ListOrdered size={16} aria-hidden="true" />;
}

export function RelationsContent({
  task,
  add,
}: {
  task: Task;
  add: (kind: RelationKind, trigger: HTMLElement) => void;
}) {
  const command = useRelationCommand(task.id);
  const errorBox = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (command.failure && !command.pending) errorBox.current?.focus();
  }, [command.failure, command.pending]);
  return (
    <div className="task-relations-content">
      <StartEligibility id={task.id} />
      {(["dependencies", "ordering"] as const).map(kind => (
        <RelationList key={kind} kind={kind} task={task} command={command} add={add} />
      ))}
      <RelationFeedback command={command} errorBox={errorBox} />
    </div>
  );
}
export function RelationFeedback({
  command,
  errorBox,
}: {
  command: Command;
  errorBox: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {command.failure && (
        <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
          <p>{command.failure}</p>
          {command.unknown && !command.checked && (
            <button type="button" disabled={command.pending} onClick={() => void command.inspect()}>
              Güncel ilişkileri kontrol et
            </button>
          )}
          {command.stale && !command.unknown && (
            <button type="button" disabled={command.pending} onClick={() => void command.reload()}>
              Görevi yeniden yükle
            </button>
          )}
        </div>
      )}
      {command.stale && !command.failure && (
        <div role="status" className="form-notice">
          <p>İşlem kaydedildi fakat görevin güncel sürümü alınamadı. Yeni ilişki işlemi için görevi yeniden yükle.</p>
          <button type="button" disabled={command.pending} onClick={() => void command.reload()}>
            Görevi yeniden yükle
          </button>
        </div>
      )}
      {command.unknown && command.checked && (
        <section aria-label="Belirsiz ilişki işlemini kontrol et" className="reconcile-panel">
          <h3>Güncel ilişkiler yüklendi</h3>
          <p>
            Listeleri kontrol et. Önceki istek kaydedilmiş olabilir; tekrar göndermek gerekirse yeni işlem olarak seç.
          </p>
          <button type="button" onClick={command.acknowledge}>
            Kontrol ettim, yeni işlem hazırla
          </button>
        </section>
      )}
      <p role="status" className="task-feedback">
        {command.done || (command.pending ? "İlişki işleniyor…" : "")}
      </p>
      {command.done && command.pending && (
        <p className="muted form-hint">İşlem kaydedildi. Güncel görev sürümü okunuyor; yeni işlem için bekle.</p>
      )}
    </>
  );
}

function StartEligibility({ id }: { id: string }) {
  const decision = useStartDecision(id);
  const heading = useId();
  const data = decision.data;
  return (
    <section className="relation-group" aria-labelledby={heading}>
      <h3 id={heading}>Başlatılabilirlik</h3>
      {decision.isError && (
        <div role="alert" className="form-error">
          <p>
            {relationFailure(decision.error)}
            {data && " Gösterilen sonuç güncel olmayabilir."}
          </p>
          <button type="button" onClick={() => void decision.refetch()}>
            Başlatılabilirliği yeniden yükle
          </button>
        </div>
      )}
      {!data && !decision.isError && <p role="status">Başlatılabilirlik denetleniyor…</p>}
      {data && (
        <>
          <p className={`start-status ${data.canStart ? "ready" : "blocked"}`}>
            {data.canStart ? (
              <CircleCheck size={18} aria-hidden="true" />
            ) : (
              <CircleAlert size={18} aria-hidden="true" />
            )}
            <span>{data.canStart ? "Şu an başlatılabilir." : "Şu an başlatılamaz."}</span>
          </p>
          {!data.canStart && (
            <ul className="start-reasons">
              {data.reasons.map(reason => (
                <li key={reason}>{reasonText(reason)}</li>
              ))}
            </ul>
          )}
          {data.blockingPredecessorIds.length > 0 && (
            <>
              <p className="relation-subheading">Bekleyen ön koşullar</p>
              <ul className="relation-list">
                {data.blockingPredecessorIds.slice(0, relationPageSize).map(item => (
                  <BlockingRow key={item} id={item} />
                ))}
              </ul>
              {data.blockingPredecessorIds.length > relationPageSize && (
                <p className="muted">ve {data.blockingPredecessorIds.length - relationPageSize} ön koşul daha</p>
              )}
            </>
          )}
        </>
      )}
      <p className="muted form-hint">
        Bu bir ön kontroldür; çalışma başlatılırken sunucu yeniden denetler. Sıra tercihleri bu sonucu etkilemez.
      </p>
      <button type="button" disabled={decision.isFetching} onClick={() => void decision.refetch()}>
        {decision.isFetching && data ? "Denetleniyor…" : "Yeniden denetle"}
      </button>
    </section>
  );
}
function BlockingRow({ id }: { id: string }) {
  const task = useTask(id);
  const open = useTaskPanel();
  const title = task.data?.title ?? (task.isError ? "Erişilemeyen görev" : "Görev okunuyor…");
  return (
    <li className="relation-row">
      <p className="relation-title">{title}</p>
      <p className="relation-meta">
        <Lock size={16} aria-hidden="true" />
        <span>{task.data ? states[task.data.state] : "Durum bilinmiyor"}</span>
      </p>
      {task.data && (
        <div className="relation-actions">
          <button type="button" aria-label={`${title} ayrıntısını aç`} onClick={event => open(id, event.currentTarget)}>
            Ayrıntıyı aç
          </button>
        </div>
      )}
    </li>
  );
}

function RelationList({
  kind,
  task,
  command,
  add,
}: {
  kind: RelationKind;
  task: Task;
  command: Command;
  add: (kind: RelationKind, trigger: HTMLElement) => void;
}) {
  const [offset, setOffset] = useState(0);
  const page = useRelations(kind, task.id, offset);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const meta = relationKinds[kind];
  const data = page.data;
  // Silme sonraki sayfayı boşaltırsa boş sayfada kalmayıp öncekine dönüyoruz.
  if (data && data.items.length === 0 && offset > 0 && !page.isFetching)
    setOffset(Math.max(0, offset - relationPageSize));
  async function remove(relation: Relation, title: string) {
    if (await command.run(kind, "remove", { id: relation.sourceTaskId, title }))
      requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <section className="relation-group" aria-labelledby={headingId}>
      <h3 id={headingId} ref={heading} tabIndex={-1} className="relation-heading">
        <KindIcon kind={kind} />
        <span>{meta.title}</span>
        <span className="relation-badge">{meta.badge}</span>
      </h3>
      <p className="muted form-hint">{meta.help}</p>
      {page.isError && (
        <div role="alert" className="form-error">
          <p>
            {relationFailure(page.error)}
            {data && " Liste güncel olmayabilir."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (offset) setOffset(0);
              else void page.refetch();
            }}
          >
            {offset ? "İlk sayfaya dön" : `${meta.title} listesini yeniden yükle`}
          </button>
        </div>
      )}
      {!data && !page.isError && <p role="status">{meta.title} okunuyor…</p>}
      {data &&
        (data.total === 0 ? (
          <p className="relation-empty">{meta.empty}</p>
        ) : (
          <>
            <p className="muted relation-count">
              {offset + data.items.length} / {data.total}
            </p>
            <ul className="relation-list">
              {data.items.map(relation => (
                <RelationRow
                  key={relation.id}
                  kind={kind}
                  relation={relation}
                  disabled={command.locked || !!task.archivedAt}
                  remove={remove}
                />
              ))}
            </ul>
            {data.total > relationPageSize && (
              <nav className="task-pagination relation-pagination" aria-label={`${meta.title} sayfaları`}>
                <button
                  type="button"
                  disabled={offset === 0 || page.isFetching}
                  onClick={() => setOffset(value => Math.max(0, value - relationPageSize))}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  disabled={offset + data.items.length >= data.total || page.isFetching}
                  onClick={() => setOffset(value => value + relationPageSize)}
                >
                  Sonraki
                </button>
              </nav>
            )}
          </>
        ))}
      {!task.archivedAt && (
        <button
          type="button"
          className="relation-add"
          disabled={command.locked}
          onClick={event => {
            command.clear();
            add(kind, event.currentTarget);
          }}
        >
          {meta.add}
        </button>
      )}
    </section>
  );
}
function RelationRow({
  kind,
  relation,
  disabled,
  remove,
}: {
  kind: RelationKind;
  relation: Relation;
  disabled: boolean;
  remove: (relation: Relation, title: string) => void;
}) {
  const source = useTask(relation.sourceTaskId);
  const open = useTaskPanel();
  const meta = relationKinds[kind];
  const title = source.data?.title ?? (source.isError ? "Erişilemeyen görev" : "Görev okunuyor…");
  return (
    <li className="relation-row">
      <p className="relation-title">{title}</p>
      <p className="relation-meta">
        <KindIcon kind={kind} />
        <span>{meta.badge}</span>
        <span aria-hidden="true">·</span>
        <span>
          {source.data ? states[source.data.state] : "Durum bilinmiyor"}
          {source.data?.archivedAt && ", arşivlendi"}
        </span>
      </p>
      <p className="muted form-hint">
        {kind === "dependencies"
          ? predecessorNote(source.data)
          : "Başlatmayı engellemez; yalnız planlama sırasını etkiler."}
      </p>
      {source.data && <AncestorPath task={source.data} />}
      <div className="relation-actions">
        {source.data && (
          <button
            type="button"
            aria-label={`${title} ayrıntısını aç`}
            onClick={event => open(relation.sourceTaskId, event.currentTarget)}
          >
            Ayrıntıyı aç
          </button>
        )}
        <button
          type="button"
          className="ghost danger"
          disabled={disabled}
          aria-label={`${title} ${meta.remove}`}
          onClick={() => remove(relation, title)}
        >
          Kaldır
        </button>
      </div>
    </li>
  );
}

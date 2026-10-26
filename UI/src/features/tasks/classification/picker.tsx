"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Surface } from "../../../components/ui/surface";
import { subscribeTraversal } from "../../../lib/navigation/traversal";
import { resourceFailure, resourceKinds, resourcePageSize } from "../../collections/model";
import { useTaskRead } from "../read-context";
import { useResource, useResources } from "../../collections/queries";
import { fieldKinds, fieldLabels, maxTags, type ClassificationDraft, type ClassificationField } from "./model";

/** Uygula denene kadar seçim yerelde. Kapat veya Vazgeç görev taslağını değiştirmez. */
export function ClassificationPicker({
  field,
  draft,
  trigger,
  apply,
  close,
}: {
  field: ClassificationField;
  draft: ClassificationDraft;
  trigger: HTMLElement;
  apply: (draft: ClassificationDraft) => void;
  close: () => void;
}) {
  const kind = fieldKinds[field];
  const meta = resourceKinds[kind];
  const multi = field === "tagIds";
  const groupId = useId();
  const [single, setSingle] = useState<string | null>(field === "tagIds" ? null : draft[field]);
  const [tags, setTags] = useState<string[]>(draft.tagIds);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const page = useResources(kind, {
    offset,
    limit: resourcePageSize,
    includeArchived: false,
    search: search || undefined,
  });
  const full = tags.length >= maxTags;
  function done() {
    close();
    requestAnimationFrame(() => {
      const target =
        trigger.isConnected && trigger.getClientRects().length
          ? trigger
          : document.querySelector<HTMLElement>("[data-workspace-surface] h2");
      target?.focus({ preventScroll: true });
    });
  }
  useEffect(() => subscribeTraversal(() => close(), 90), [close]);
  function find(event: FormEvent) {
    event.preventDefault();
    setSearch(text.trim());
    setOffset(0);
  }
  function toggle(id: string, checked: boolean) {
    setTags(current =>
      checked
        ? current.includes(id) || current.length >= maxTags
          ? current
          : [...current, id]
        : current.filter(tag => tag !== id),
    );
  }
  function confirm() {
    apply(multi ? { ...draft, tagIds: [...tags].sort() } : { ...draft, [field]: single });
    done();
  }
  const title = multi ? "Etiketleri seç" : `${fieldLabels[field]} seç`;
  return (
    <Surface title={title} modal returnTo={trigger} onClose={done}>
      <div className="classification-picker">
        <p className="muted form-hint">
          {multi
            ? `En fazla ${maxTags} etiket seçebilirsin. Seçimler sayfalar ve aramalar arasında korunur.`
            : `Arşivlenmiş ${meta.plural} burada listelenmez. Mevcut bağ arşivlenmiş olsa da sen değiştirmedikçe korunur.`}{" "}
          Değişiklikler görevi kaydedene kadar yalnız taslaktır.
        </p>
        <CurrentChoice field={field} single={single} count={tags.length} />
        <form role="search" onSubmit={find} className="relation-search">
          <label htmlFor={`${groupId}-search`}>{meta.singular} ara</label>
          <div className="quick-add-controls">
            <input
              id={`${groupId}-search`}
              type="search"
              maxLength={200}
              value={text}
              onChange={event => setText(event.target.value)}
            />
            <button>Ara</button>
          </div>
        </form>
        {page.isError && (
          <div role="alert" className="form-error">
            <p>{resourceFailure(page.error)}</p>
            <button type="button" onClick={() => void page.refetch()}>
              Listeyi yeniden yükle
            </button>
          </div>
        )}
        {!page.data && !page.isError && <p role="status">{meta.title} okunuyor…</p>}
        {page.data && (
          <>
            <p className="muted relation-count" role="status">
              {page.data.items.length
                ? `${offset + page.data.items.length} / ${page.data.total} ${meta.lower}`
                : search
                  ? `Bu aramada ${meta.lower} yok.`
                  : meta.empty}
            </p>
            {multi && full && (
              <p className="form-notice" role="status">
                {maxTags} etiket seçildi. Başka etiket eklemek için önce birini kaldır.
              </p>
            )}
            <fieldset className="classification-options">
              <legend className="sr-only">{multi ? "Etiketler" : `${meta.singular} seçenekleri`}</legend>
              {!multi && (
                <label className="classification-option">
                  <input type="radio" name={groupId} checked={single === null} onChange={() => setSingle(null)} />
                  <span>{meta.singular} bağı yok</span>
                </label>
              )}
              {page.data.items.map(item =>
                multi ? (
                  <label key={item.id} className="classification-option">
                    <input
                      type="checkbox"
                      checked={tags.includes(item.id)}
                      disabled={!tags.includes(item.id) && full}
                      onChange={event => toggle(item.id, event.target.checked)}
                    />
                    <span>{item.name}</span>
                  </label>
                ) : (
                  <label key={item.id} className="classification-option">
                    <input
                      type="radio"
                      name={groupId}
                      checked={single === item.id}
                      onChange={() => setSingle(item.id)}
                    />
                    <span>{item.name}</span>
                  </label>
                ),
              )}
            </fieldset>
            {page.data.total > resourcePageSize && (
              <nav className="task-pagination relation-pagination" aria-label={`${meta.title} sayfaları`}>
                <button
                  type="button"
                  disabled={offset === 0 || page.isFetching}
                  onClick={() => setOffset(value => Math.max(0, value - resourcePageSize))}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  disabled={offset + page.data.items.length >= page.data.total || offset >= 100000 || page.isFetching}
                  onClick={() => setOffset(value => value + resourcePageSize)}
                >
                  Sonraki
                </button>
              </nav>
            )}
          </>
        )}
        <div className="actions">
          <button type="button" className="primary" onClick={confirm}>
            Seçimi uygula
          </button>
          {multi && tags.length > 0 && (
            <button type="button" onClick={() => setTags([])}>
              Tüm etiketleri kaldır
            </button>
          )}
          <button type="button" onClick={done}>
            Vazgeç
          </button>
        </div>
      </div>
    </Surface>
  );
}
function CurrentChoice({ field, single, count }: { field: ClassificationField; single: string | null; count: number }) {
  if (field === "tagIds")
    return (
      <p className="classification-current" role="status">
        Seçili etiket: {count} / {maxTags}
      </p>
    );
  return (
    <p className="classification-current">
      Seçili: {single ? <ResourceName kind={fieldKinds[field]} id={single} /> : "Bağ yok"}
    </p>
  );
}
export function ResourceName({ kind, id }: { kind: (typeof fieldKinds)[ClassificationField]; id: string }) {
  const context = useTaskRead();
  const label = context?.view.labels.find(x => x.kind === kind && x.id === id);
  const resource = useResource(kind, id, !label);
  if (label && (!resource.data || BigInt(label.version) >= BigInt(resource.data.version)))
    return (
      <>
        {label.name}
        {label.archivedAt && " (arşivlendi)"}
      </>
    );
  if (resource.data)
    return (
      <>
        {resource.data.name}
        {resource.data.archivedAt && " (arşivlendi)"}
      </>
    );
  return <>{resource.isError ? "Erişilemeyen kayıt" : "Okunuyor…"}</>;
}

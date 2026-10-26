"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { ApiError } from "../../../lib/api/errors";
import { queryKeys } from "../../../lib/api/query-client";
import type { Task } from "../model";
import { useTaskCache } from "../queries";
import {
  blocksClassification,
  classificationBody,
  classificationDraft,
  classificationFailure,
  fieldKinds,
  fieldLabels,
  readClassification,
  rebaseClassification,
  type Classification,
  type ClassificationField,
  type ClassificationState,
} from "./model";
import { ResourceName } from "./picker";
import { useClassification } from "./queries";
import "../styles.css";

type Pick = (field: ClassificationField, trigger: HTMLElement) => void;
export function ClassificationContent({ task, state, pick }: { task: Task; state: ClassificationState; pick: Pick }) {
  const { session } = useSession();
  const cache = useTaskCache();
  const client = useQueryClient();
  const owner = session.getSnapshot().user?.id;
  const query = useClassification(task.id);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [latest, setLatest] = useState<Classification | null>(null);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  // Sunucu kopyasını yalnız kaydedilmemiş seçim yoksa alıyoruz. Seçimlerin üstüne yazmayalım.
  const data = query.data;
  const { base: currentBase, dirty: isDirty, pending: isPending, reset } = state;
  useLayoutEffect(() => {
    if (
      data &&
      (!currentBase ||
        currentBase.taskId !== data.taskId ||
        (!isDirty && !isPending && String(data.version) !== String(currentBase.version)))
    )
      reset(data);
    // reset her çizimde yeniden oluşur, karar yalnız bu değerlere bağlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentBase, isDirty, isPending]);
  useLayoutEffect(() => {
    if (failure && !state.pending) errorBox.current?.focus();
  }, [failure, state.pending]);
  const archived = !!task.archivedAt;
  const base = state.base;
  const draft = state.draft;
  async function save() {
    if (busy.current || blocked || unknown || !base || !draft || archived || !state.dirty) return;
    let body;
    try {
      body = classificationBody(base, draft, false);
    } catch (error) {
      setFailure(classificationFailure(error));
      return;
    }
    if (
      body.applyToSubtree &&
      !window.confirm(
        "Bu görevin bütün alt görevlerindeki proje, havuz, kategori ve etiketler bu seçimle değiştirilecek. Alt görevlerdeki farklı seçimler korunmaz. Devam edilsin mi?",
      )
    )
      return;
    busy.current = true;
    state.setPending(true);
    setFailure("");
    setDone("");
    try {
      const raw = await session.api
        .mutation("/api/tasks/{id}/classification", "put", { path: { id: task.id }, body })
        .execute();
      let result;
      try {
        result = readClassification(raw, task.id);
      } catch {
        throw new ApiError("protocol", "Yanıt eksik.", 200, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      state.reset(result);
      setLatest(null);
      setDone(
        body.applyToSubtree ? "Sınıflandırma bu göreve ve alt görevlerine kaydedildi." : "Sınıflandırma kaydedildi.",
      );
      if (owner) client.setQueryData(queryKeys.resource(owner, "task-classification", { id: task.id }), result);
      // Yazı onaylandı. Görev, liste ve iş yükü okumaları arkada yenilenir.
      void cache.manyChanged();
    } catch (error) {
      if (!cache.current()) return;
      setUnknown(error instanceof ApiError && error.outcomeUnknown);
      setBlocked(blocksClassification(error));
      setFailure(classificationFailure(error));
    } finally {
      busy.current = false;
      state.setPending(false);
    }
  }
  // Seçicide seçim yapmak kayıt isteğidir. Ayrı Kaydet yok.
  useEffect(() => {
    if (!state.dirty || state.pending || blocked || unknown || failure) return;
    const timer = setTimeout(() => void save(), 0);
    return () => clearTimeout(timer);
  });
  async function inspect() {
    if (busy.current) return;
    busy.current = true;
    state.setPending(true);
    try {
      const value = readClassification(
        await session.api.read("/api/tasks/{id}/classification", { path: { id: task.id } }),
        task.id,
      );
      if (cache.current()) setLatest(value);
    } catch (error) {
      if (cache.current()) setFailure(classificationFailure(error));
    } finally {
      busy.current = false;
      state.setPending(false);
    }
  }
  function reconcile(keep: boolean) {
    if (!latest || !base || !draft) return;
    state.reset(latest, keep ? rebaseClassification(base, draft, latest) : classificationDraft(latest));
    setLatest(null);
    setBlocked(false);
    setUnknown(false);
    setFailure("");
    setDone(
      keep ? "Seçimlerin güncel sınıflandırma üzerine taşındı ve kaydediliyor." : "Sunucudaki sınıflandırma yüklendi.",
    );
  }
  if (query.isError && !data)
    return (
      <div role="alert" className="form-error">
        <p>{classificationFailure(query.error)}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Sınıflandırmayı yeniden yükle
        </button>
      </div>
    );
  if (!base || !draft) return <p role="status">Sınıflandırma okunuyor…</p>;
  const locked = state.pending || blocked || unknown || archived;
  return (
    <div className="classification-content">
      <dl className="classification-values" aria-label="Görev sınıflandırması">
        {(["projectId", "poolId", "categoryId"] as const).map(field => {
          const changed = draft[field] !== classificationDraft(base)[field];
          const value = draft[field] ? <ResourceName kind={fieldKinds[field]} id={draft[field]!} /> : null;
          return (
            <div key={field} className="classification-row">
              <dt>{fieldLabels[field]}</dt>
              <dd>
                {archived ? (
                  <span>{value ?? "Yok"}</span>
                ) : (
                  // Bütün satır seçiciyi açar; değer etiket, boş değer Seç olarak görünür.
                  <button
                    type="button"
                    className="classification-pick"
                    disabled={locked}
                    aria-label={`${fieldLabels[field]} seçimini değiştir`}
                    onClick={event => pick(field, event.currentTarget)}
                  >
                    {value ? (
                      <span className="classification-chip">{value}</span>
                    ) : (
                      <span className="classification-empty">Seç</span>
                    )}
                    <ChevronRight aria-hidden="true" size={14} />
                  </button>
                )}
                {changed && <span className="classification-changed"> · kaydedilmedi</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {archived && <p className="muted">Arşivlenmiş görevin sınıflandırması değiştirilemez.</p>}
      {failure && (
        <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
          <p>{failure}</p>
          {blocked ? (
            <button type="button" disabled={state.pending} onClick={() => void inspect()}>
              Güncel sınıflandırmayı kontrol et
            </button>
          ) : (
            state.dirty &&
            !archived && (
              <button type="button" disabled={state.pending} onClick={() => setFailure("")}>
                Yeniden dene
              </button>
            )
          )}
        </div>
      )}
      {latest && (
        <section aria-label="Sunucudaki güncel sınıflandırma" className="reconcile-panel">
          <h3>Sunucudaki güncel sınıflandırma</h3>
          <ul>
            {(["projectId", "poolId", "categoryId"] as const).map(field => (
              <li key={field}>
                {fieldLabels[field]}:{" "}
                {latest.values[field] ? <ResourceName kind={fieldKinds[field]} id={latest.values[field]!} /> : "Yok"}
              </li>
            ))}
          </ul>
          <p className="muted">Önceki istek kaydedilmiş olabilir; hiçbir işlem otomatik tekrarlanmaz.</p>
          <div className="actions">
            <button type="button" disabled={state.pending} onClick={() => reconcile(false)}>
              Sunucudakini kullan
            </button>
            <button type="button" disabled={state.pending} onClick={() => reconcile(true)}>
              Seçimlerimi güncel kayda uygula
            </button>
          </div>
        </section>
      )}
      <p role="status" className="task-feedback">
        {done}
      </p>
    </div>
  );
}

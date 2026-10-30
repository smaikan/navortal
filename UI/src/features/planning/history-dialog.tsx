"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import {
  historyPageSize,
  readRevision,
  readRevisions,
  triggerLabel,
  undoFailure,
  type Revision,
} from "./history-model";
import { HistoryPager, RevisionChanges, RevisionSnapshot } from "./history-snapshot";
import { type Day } from "./model";
import { UndoPanel } from "./undo-panel";
import { DayItemUndo } from "./day-item-undo";

export function HistoryDialog({
  day,
  format,
  trigger,
  close,
  onMultiUndo,
}: {
  day: Day;
  format: string;
  trigger: HTMLElement;
  close: () => void;
  onMultiUndo?: (source: string) => void;
}) {
  const { session, state } = useSession();
  const [offset, setOffset] = useState(0),
    [selectedId, setSelected] = useState<string | null>(() => day.currentRevisionId),
    [compare, setCompare] = useState(false),
    [locked, setLocked] = useState(false);
  // Seçilen revizyon sabit kalsın. Arka plandaki Current değişikliği bekleyen/belirsiz uygulamayı ekrandan düşürmesin.
  const revisions = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-revisions", { date: day.localDate, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readRevisions(
        await session.api.read("/api/daily-plans/{date}/revisions", {
          path: { date: day.localDate },
          query: { Offset: offset, Limit: historyPageSize },
          signal,
        }),
        offset,
        day.id,
      ),
  });
  const guard = useDialogGuard({
    dirty: false,
    pending: locked,
    close,
    trigger,
    message: "Geçmiş penceresi kapatılsın mı?",
  });
  return (
    <Surface
      title="Plan geçmişi"
      modal
      placement="center"
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={locked}
    >
      <div className="auto-planner history-dialog">
        <p className="relation-title">{day.localDate}</p>
        <p>
          Her revizyon planın o andaki kaydıdır. Bugünkü görev adı, durumu veya süresi eski kaydın üzerine yazılmaz.
          Gerçek çalışma ayrı tutulur.
        </p>
        <div className="actions">
          <button disabled={locked || !day.baselineRevisionId} onClick={() => setSelected(day.baselineRevisionId)}>
            İlk iş planını aç
          </button>
          <button disabled={locked || !day.currentRevisionId} onClick={() => setSelected(day.currentRevisionId)}>
            Güncel revizyonu aç
          </button>
          <button disabled={locked || revisions.isFetching} onClick={() => void revisions.refetch()}>
            Geçmiş listesini yeniden oku
          </button>
        </div>
        <p>
          İlk iş planı: {day.baselineRevisionId ? "saklanıyor" : "henüz yok"} · Güncel kabul:{" "}
          {day.currentRevisionId ? "revizyon kaydı var" : "henüz yok"}
        </p>
        {revisions.isPending && <p role="status">Revizyonlar okunuyor…</p>}
        {revisions.isError && <div role="alert">{undoFailure(revisions.error)}</div>}
        {revisions.data && (
          <section aria-label="Revizyon listesi">
            <h3>Revizyonlar</h3>
            {!revisions.data.total && <p>Bu gün için kabul edilmiş revizyon yok. Geçmişi okumak plan oluşturmaz.</p>}
            <div role="radiogroup" aria-label="Revizyon seçimi" className="history-revision-list">
              {revisions.data.items.map(r => (
                <label key={r.id}>
                  <input
                    type="radio"
                    name="history-revision"
                    checked={selectedId === r.id}
                    disabled={locked}
                    onChange={() => setSelected(r.id)}
                  />
                  Revizyon {String(r.number)} · {triggerLabel(r.trigger)}
                  {r.id === day.baselineRevisionId && " · İlk iş planı"}
                  {r.id === day.currentRevisionId && " · Güncel"}
                </label>
              ))}
            </div>
            <HistoryPager
              offset={offset}
              count={revisions.data.items.length}
              total={revisions.data.total}
              busy={locked || revisions.isFetching}
              change={setOffset}
              label="Revizyon listesi sayfaları"
            />
          </section>
        )}
        {selectedId && day.id && (
          <RevisionDetail
            key={selectedId}
            id={selectedId}
            day={day}
            format={format}
            locked={locked}
            lock={setLocked}
            select={setSelected}
            compare={compare}
            setCompare={setCompare}
            onMultiUndo={onMultiUndo}
          />
        )}
        <button disabled={locked} onClick={guard.requestClose}>
          Kapat
        </button>
      </div>
    </Surface>
  );
}
function RevisionDetail({
  id,
  day,
  format,
  locked,
  lock,
  select,
  compare,
  setCompare,
  onMultiUndo,
}: {
  id: string;
  day: Day;
  format: string;
  locked: boolean;
  lock: (v: boolean) => void;
  select: (v: string) => void;
  compare: boolean;
  setCompare: (v: boolean) => void;
  onMultiUndo?: (source: string) => void;
}) {
  const { session, state } = useSession();
  const query = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-revision", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readRevision(await session.api.read("/api/plan-revisions/{id}", { path: { id }, signal }), id, day.id),
  });
  if (!query.data)
    return query.isError ? (
      <div role="alert">
        {undoFailure(query.error)}
        <button disabled={locked} onClick={() => void query.refetch()}>
          Revizyonu yeniden oku
        </button>
      </div>
    ) : (
      <p role="status">Seçili revizyon okunuyor…</p>
    );
  const revision: Revision = query.data;
  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone: day.timeZoneId,
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: format === "12h",
  });
  return (
    <section aria-label="Seçili revizyon">
      <h3>
        Seçili: Revizyon {String(revision.number)}
        {id === day.baselineRevisionId && " · İlk iş planı"}
        {id === day.currentRevisionId && " · Güncel"}
      </h3>
      {query.isError && (
        <div role="alert">
          Revizyon yeniden okunamadı; son doğrulanan kayıt korunuyor.
          <button disabled={locked} onClick={() => void query.refetch()}>
            Revizyonu yeniden oku
          </button>
        </div>
      )}
      <p>
        {triggerLabel(revision.trigger)} · {revision.reason || "Neden kaydedilmemiş"}
      </p>
      <p>
        Oluşturuldu: <time dateTime={revision.createdAt}>{time.format(new Date(revision.createdAt))}</time> · Etkili an:{" "}
        <time dateTime={revision.effectiveAt}>{time.format(new Date(revision.effectiveAt))}</time>
      </p>
      <details>
        <summary>Kayıt bağlantıları</summary>
        <p>
          Değişiklik grubu: <code>{revision.changeSetId}</code>
        </p>
        {revision.reversesChangeSetId && (
          <p>
            Telafi edilen grup: <code>{revision.reversesChangeSetId}</code>
          </p>
        )}
        <p>
          Revizyon: <code>{revision.id}</code>
        </p>
      </details>
      {revision.previousRevisionId && (
        <button disabled={locked} onClick={() => select(revision.previousRevisionId!)}>
          Önceki revizyonu aç
        </button>
      )}
      {day.baselineRevisionId && id !== day.baselineRevisionId && (
        <button disabled={locked} aria-pressed={compare} onClick={() => setCompare(!compare)}>
          İlk iş planıyla karşılaştır
        </button>
      )}
      <div className={compare && day.baselineRevisionId !== id ? "history-snapshots" : undefined}>
        {compare && day.baselineRevisionId && id !== day.baselineRevisionId && (
          <RevisionSnapshot
            key={day.baselineRevisionId}
            id={day.baselineRevisionId}
            dayId={day.id!}
            zone={day.timeZoneId}
            format={format}
            label="İlk iş planının kayıtlı blokları"
          />
        )}
        <RevisionSnapshot
          key={id}
          id={id}
          dayId={day.id!}
          zone={day.timeZoneId}
          format={format}
          label="Seçili revizyonun kayıtlı blokları"
        />
      </div>
      <RevisionChanges key={`changes-${id}`} id={id} zone={day.timeZoneId} format={format} />
      {revision.trigger === "DayItem" || revision.trigger === "Pool" || revision.trigger === "Defer" ? (
        <DayItemUndo key={`undo-${revision.id}`} revision={revision} day={day} lock={lock} />
      ) : (
        <UndoPanel key={`undo-${revision.id}`} revision={revision} day={day} format={format} lock={lock} />
      )}
      {onMultiUndo && (
        <section aria-label="Günleri birlikte geri alma">
          <p>Birden fazla günü etkileyen taşıma ve dağıtım kararları için grubun bütün günlerini önizle.</p>
          <button disabled={locked} onClick={() => onMultiUndo(revision.changeSetId)}>
            Değişiklik grubunu günleriyle geri al
          </button>
        </section>
      )}
    </section>
  );
}

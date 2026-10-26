"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useEffect, useId, useRef } from "react";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { dayRange, isOffline, offlineWrite, readTask, taskFailure, type Task } from "./model";
import { useTaskCache } from "./queries";
import { useBranch, useTaskSummary } from "./tree/queries";
import { useTaskPanelSave } from "../../components/layout/task-panel";
import { rangeBody } from "./range-model";
import { useTaskRangeDraft } from "./range-drafts";
export { rangeBody } from "./range-model";
import "./styles.css";

/** Görev gün aralığı plan önerisidir. Aralıklı çocukları olan üst görev onları kapsar ve salt okunurdur. */
export function RangeSection({ task }: { task: Task }) {
  const id = useId();
  const summary = useTaskSummary(task.id);
  const children = useBranch(task.id, undefined, Number(summary.data?.childCount ?? 0) > 0);
  const kids = children.data?.pages.flatMap(page => page.items) ?? [];
  const derived = summary.data?.rangeFromChildren ?? false;
  return (
    <section className="r2-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Görevin zamanı</h3>
      {derived ? (
        <p className="r2-derived">
          <strong>{dayRange(summary.data?.effectiveFrom, summary.data?.effectiveTo)}</strong>
          <span>alt görevlerden</span>
        </p>
      ) : (
        <RangeFields task={task} label={task.title} own />
      )}
      {!derived && <p className="r2-hint">Tek bir tarih de girebilirsin. Panel kapanınca kaydedilir.</p>}
      {kids.length > 0 && (
        <ul className="r2-child-ranges" aria-label="Alt görevlerin günleri">
          {kids.map(child => (
            <li key={child.id}>
              <span className="r2-child-title">{child.title}</span>
              <RangeFields task={child} label={child.title} />
            </li>
          ))}
        </ul>
      )}
      {children.hasNextPage && (
        <button type="button" className="r2-quiet" onClick={() => void children.fetchNextPage()}>
          Daha fazla alt görev
        </button>
      )}
    </section>
  );
}

function RangeFields({ task, label, own = false }: { task: Task; label: string; own?: boolean }) {
  const { session } = useSession();
  const cache = useTaskCache();
  const id = useId();
  const { record, snapshot } = useTaskRangeDraft(task);
  const { draft, failure, busy, needsCheck, remote } = snapshot;
  const { draft: latestDraft, base, sending, blocked } = record;
  const setDraft = (value: typeof draft) => record.setDraft(value);
  const setFailure = (value: string) => record.patch({ failure: value });
  const setBusy = (value: boolean) => record.patch({ busy: value });
  const setNeedsCheck = (value: boolean) => record.patch({ needsCheck: value });
  const setRemote = (value: Task | null) => record.patch({ remote: value });
  const errorBox = useRef<HTMLParagraphElement>(null);
  function dirty() {
    return (
      sending.current ||
      blocked.current ||
      latestDraft.current.from !== (base.current.plannedFrom ?? "") ||
      latestDraft.current.to !== (base.current.plannedTo ?? "")
    );
  }
  useEffect(() => {
    if (
      sending.current ||
      blocked.current ||
      BigInt(task.version) < BigInt(base.current.version) ||
      latestDraft.current.from !== (base.current.plannedFrom ?? "") ||
      latestDraft.current.to !== (base.current.plannedTo ?? "")
    )
      return;
    record.setBase(task);
    const next = { from: task.plannedFrom ?? "", to: task.plannedTo ?? "" };
    record.setDraft(next);
  }, [task, record, base, blocked, latestDraft, sending]);
  function change(next: typeof draft) {
    setDraft(next);
    if (!blocked.current) setFailure("");
  }
  function fail(message: string) {
    setFailure(message);
    requestAnimationFrame(() => errorBox.current?.focus());
  }
  function accept(value: Task) {
    record.setBase(value);
    record.setBlocked(false);
    setNeedsCheck(false);
    setRemote(null);
    setFailure("");
    change({ from: value.plannedFrom ?? "", to: value.plannedTo ?? "" });
    void cache.update(value);
  }
  async function save(): Promise<boolean> {
    if (sending.current || blocked.current) return false;
    let body;
    try {
      body = rangeBody(latestDraft.current.from, latestDraft.current.to);
    } catch (error) {
      fail((error as Error).message);
      return false;
    }
    setFailure("");
    if (
      body.plannedFrom === (base.current.plannedFrom ?? null) &&
      body.plannedTo === (base.current.plannedTo ?? null)
    ) {
      change({ from: body.plannedFrom ?? "", to: body.plannedTo ?? "" });
      return true;
    }
    if (isOffline()) {
      fail(offlineWrite);
      return false;
    }
    record.setSending(true);
    setBusy(true);
    let sent = false;
    try {
      const fresh = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
      if (!cache.current()) return false;
      if (fresh.plannedFrom === body.plannedFrom && fresh.plannedTo === body.plannedTo) {
        accept(fresh);
        return true;
      }
      if (
        fresh.archivedAt ||
        fresh.plannedFrom !== base.current.plannedFrom ||
        fresh.plannedTo !== base.current.plannedTo
      ) {
        record.setBlocked(true);
        setNeedsCheck(true);
        setRemote(fresh);
        fail(
          fresh.archivedAt
            ? "Arşivlenen görevin tarihleri değiştirilemez."
            : "Görevin tarihleri değişmiş. Taslağın korundu; güncel tarihleri kontrol et.",
        );
        return false;
      }
      sent = true;
      const result = readTask(
        await session.api
          .mutation("/api/tasks/{id}/planned-range", "put", {
            path: { id: task.id },
            body: { version: fresh.version, ...body },
          })
          .execute(),
      );
      if (cache.current()) {
        accept(result);
        return true;
      }
      return false;
    } catch (error) {
      if (cache.current()) {
        const shouldBlock =
          error instanceof ApiError &&
          (error.outcomeUnknown || (sent && error.kind === "protocol") || error.status === 409 || error.status === 404);
        record.setBlocked(shouldBlock);
        setNeedsCheck(shouldBlock);
        fail(
          error instanceof ApiError && error.code === "planned_range_invalid"
            ? "Tarih aralığını kontrol et."
            : taskFailure(error),
        );
      }
      return false;
    } finally {
      record.setSending(false);
      setBusy(false);
    }
  }
  async function check() {
    if (sending.current) return;
    record.setSending(true);
    setBusy(true);
    try {
      const fresh = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
      if (!cache.current()) return;
      const body = rangeBody(latestDraft.current.from, latestDraft.current.to);
      if (fresh.plannedFrom === body.plannedFrom && fresh.plannedTo === body.plannedTo) accept(fresh);
      else {
        setRemote(fresh);
        fail("Sunucudaki tarihler taslağından farklı. Hangi tarihleri kullanacağını seç.");
      }
    } catch (error) {
      if (cache.current()) fail(error instanceof RangeError ? error.message : taskFailure(error));
    } finally {
      record.setSending(false);
      setBusy(false);
    }
  }
  useTaskPanelSave({ dirty, save });
  const { from, to } = draft;
  const prefix = own ? "" : `${label} `;
  return (
    <div className="r2-range-fields" aria-busy={busy || undefined}>
      <label className="temporal-range-label">
        <span>Başlangıç</span>
        <TemporalInput
          type="date"
          aria-label={`${prefix}başlangıç tarihi`}
          value={from}
          max={to || undefined}
          disabled={!!task.archivedAt || busy}
          onChange={event => {
            change({ ...draft, from: event.target.value });
          }}
        />
      </label>
      <span className="temporal-range-divider" aria-hidden="true">
        –
      </span>
      <label className="temporal-range-label">
        <span>Bitiş</span>
        <TemporalInput
          type="date"
          aria-label={`${prefix}bitiş tarihi`}
          value={to}
          min={from || undefined}
          disabled={!!task.archivedAt || busy}
          onChange={event => {
            change({ ...draft, to: event.target.value });
          }}
        />
      </label>
      {(from || to) && !task.archivedAt && (
        <button
          type="button"
          className="r2-quiet"
          disabled={busy}
          aria-label={`${prefix}tarih aralığını temizle`}
          onClick={() => {
            change({ from: "", to: "" });
          }}
        >
          Temizle
        </button>
      )}
      {busy && (
        <p role="status" className="r2-hint">
          Tarihler kaydediliyor…
        </p>
      )}
      {failure && (
        <p ref={errorBox} tabIndex={-1} id={`${id}-error`} role="alert" className="field-error">
          {failure}
        </p>
      )}
      {needsCheck && (
        <button type="button" disabled={busy} onClick={() => void check()}>
          Güncel tarihleri kontrol et
        </button>
      )}
      {failure && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            record.setBlocked(false);
            setNeedsCheck(false);
            setRemote(null);
            change({ from: base.current.plannedFrom ?? "", to: base.current.plannedTo ?? "" });
            void cache.manyChanged();
          }}
        >
          Tarih değişikliğinden vazgeç
        </button>
      )}
      {remote && (
        <div className="field-error">
          <p>Sunucudaki tarihler: {dayRange(remote.plannedFrom, remote.plannedTo) || "Tarih yok"}</p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => accept(remote)}>
              Sunucudaki tarihleri kullan
            </button>
            {!remote.archivedAt && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  record.setBase(remote);
                  record.setBlocked(false);
                  setRemote(null);
                  setNeedsCheck(false);
                  setFailure("");
                }}
              >
                Tarihlerimi koru
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

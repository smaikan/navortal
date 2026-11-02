"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "../../lib/api/generated/schema";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { mustReconcile, stamp } from "../notifications/model";
import { canRetry, jobStates, pageSize, readJob, reminderFailure, type Job, type JobState } from "./model";
import { useJobs, useReminderCache } from "./queries";
export function JobsPanel({ zone }: { zone: string }) {
  const [offset, setOffset] = useState(0),
    [filter, setFilter] = useState<JobState | "">("Failed"),
    [pending, setPending] = useState<string | null>(null),
    [blocked, setBlocked] = useState(false),
    [issue, setIssue] = useState(""),
    [message, setMessage] = useState("");
  const jobs = useJobs(offset, filter);
  const { session, state } = useSession();
  const cache = useReminderCache();
  const client = useQueryClient();
  const busy = useRef(false);
  async function retry(job: Job) {
    if (busy.current || blocked || !canRetry(job)) return;
    busy.current = true;
    setPending(job.id);
    setIssue("");
    setMessage("");
    try {
      const result = readJob(
        await session.api
          .mutation("/api/jobs/outbox/{id}/retry", "post", { path: { id: job.id }, body: { version: job.version } })
          .execute(),
        job.id,
      );
      if (!cache.current()) return;
      client.setQueriesData<components["schemas"]["OutboxPage"]>(
        { queryKey: queryKeys.resource(state.user!.id, "jobs-outbox").slice(0, 3) },
        p => (p ? { ...p, items: p.items.map(j => (j.id === result.id ? result : j)) } : p),
      );
      setMessage("İş yeniden denemeye alındı. Bu, bildirimin cihazına teslim edildiği anlamına gelmez.");
      cache.changed();
    } catch (e) {
      if (cache.current()) {
        setIssue(reminderFailure(e));
        setBlocked(mustReconcile(e));
      }
    } finally {
      busy.current = false;
      if (cache.current()) setPending(null);
    }
  }
  async function check() {
    const result = await jobs.refetch();
    if (!cache.current()) return;
    if (result.isError) setIssue(reminderFailure(result.error));
    else {
      setBlocked(false);
      setIssue("");
      setMessage("Güncel işler okundu. İşlem kendiliğinden tekrarlanmadı.");
    }
  }
  return (
    <section aria-label="Arka plan işlerinin durumu">
      <h2>Arka plan işlerinin durumu</h2>
      <p className="muted">
        Yalnız bu hesaba ait işler gösterilir. İşin işlenmesi, bildirimin hazır olması ve okunması ayrı durumlardır.
      </p>
      <div className="hours-field">
        <label htmlFor="job-filter">İş durumu</label>
        <select
          id="job-filter"
          value={filter}
          disabled={!!pending}
          onChange={e => {
            setFilter(e.target.value as JobState | "");
            setOffset(0);
          }}
        >
          <option value="">Tüm durumlar</option>
          {Object.entries(jobStates).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button disabled={!!pending} onClick={() => void check()}>
        Güncel işleri kontrol et
      </button>
      {jobs.isPending && <p role="status">İşler okunuyor…</p>}
      {jobs.isError && <p role="alert">{reminderFailure(jobs.error)}</p>}
      {jobs.data && (
        <>
          <ul className="task-list" aria-label="Arka plan işleri">
            {jobs.data.items.map(j => (
              <li key={j.id} data-job-id={j.id}>
                <h3>{jobStates[j.state]}</h3>
                <p>
                  {stamp(j.occurredAt, zone)} · Deneme sayısı: {j.attempts}
                </p>
                {j.lastErrorCode && <p>Bu iş tamamlanamadı; istersen yeniden deneyebilirsin.</p>}
                {canRetry(j) && (
                  <button disabled={!!pending || blocked} onClick={() => void retry(j)}>
                    İşi yeniden dene
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!jobs.data.items.length && <p>Bu durumda iş yok.</p>}
          <nav className="task-pagination" aria-label="İş sayfaları">
            <button disabled={!!pending || !offset} onClick={() => setOffset(offset - pageSize)}>
              Önceki işler
            </button>
            <span>{jobs.data.total} iş</span>
            <button
              disabled={!!pending || offset + pageSize >= Number(jobs.data.total) || offset + pageSize > 100000}
              onClick={() => setOffset(offset + pageSize)}
            >
              Sonraki işler
            </button>
          </nav>
        </>
      )}
      {pending && <p role="status">Yeniden deneme sonucu bekleniyor…</p>}
      {message && <p role="status">{message}</p>}
      {issue && <p role="alert">{issue}</p>}
    </section>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { readCalendarDay, calendarFailure, pageSize } from "../calendar/model";
import { shortTime } from "../planning/agenda-blocks";
import { useGlance } from "../planning/glance";
import { minutes } from "../planning/model";
import "../planning/day-tools.css";

/** Güne ait değişmez gerçek çalışma/tamamlama kayıtları. Ertesi gün komutu yok. */
export function EndPreparationDialog({
  date,
  format,
  trigger,
  close,
}: {
  date: string;
  format: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const [actual, setActual] = useState(0),
    [completions, setCompletions] = useState(0);
  const glance = useGlance(date, false);
  const q = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "calendar-day", { date, actual, completions, review: true }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readCalendarDay(
        await session.api.read("/api/calendar/days/{date}", {
          path: { date },
          query: {
            PlanOffset: 0,
            PlanLimit: pageSize,
            ActualOffset: actual,
            ActualLimit: pageSize,
            CompletionOffset: completions,
            CompletionLimit: pageSize,
          },
          signal,
        }),
        date,
        { plan: 0, actual, completions },
      ),
  });
  const d = q.data,
    summary = d?.summary;
  const same = summary && glance.data && String(summary.planningVersion) === String(glance.data.planningVersion);
  const dateLabel = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const refresh = () => {
    void q.refetch();
    void glance.refetch();
  };
  return (
    <Surface title="Gün sonu özeti" modal placement="center" returnTo={trigger} onClose={close}>
      <div className="day-review">
        <div className="day-review-date">
          <time dateTime={date}>{dateLabel}</time>
          <button type="button" className="ghost" onClick={refresh}>
            Yenile
          </button>
        </div>
        {q.isPending && <p role="status">Günün ayrıntıları okunuyor…</p>}
        {q.isError && (
          <p role="alert" className="field-error">
            {calendarFailure(q.error)}
          </p>
        )}
        {summary && d && (
          <>
            <dl className="day-review-metrics">
              <div>
                <dt>Çalışılan süre</dt>
                <dd>{minutes(summary.actualSeconds)}</dd>
              </div>
              <div>
                <dt>Tamamlanan görev</dt>
                <dd>{summary.completedTaskCount}</dd>
              </div>
              {same && (
                <>
                  <div>
                    <dt>Biten plan öğesi</dt>
                    <dd>{glance.data!.completedItemCount}</dd>
                  </div>
                  <div>
                    <dt>Açık plan öğesi</dt>
                    <dd>{glance.data!.openItemCount}</dd>
                  </div>
                </>
              )}
            </dl>
            {!same && (
              <p className="muted" role="status">
                Plan öğesi sayıları güncel veriyle eşleşince gösterilir.{" "}
                <button type="button" onClick={refresh}>
                  Yeniden oku
                </button>
              </p>
            )}
            <section aria-labelledby="day-review-plan">
              <h3 id="day-review-plan">Plan ve gerçekleşen</h3>
              <dl className="day-review-comparison">
                <div>
                  <dt>İlk çalışma planı</dt>
                  <dd>{minutes(summary.baselineWorkSeconds)}</dd>
                </div>
                <div>
                  <dt>Güncel çalışma planı</dt>
                  <dd>{minutes(summary.plannedWorkSeconds)}</dd>
                </div>
                <div>
                  <dt>Gerçek çalışma</dt>
                  <dd>{minutes(summary.actualSeconds)}</dd>
                </div>
              </dl>
              {same && Number(glance.data!.unknownEstimateCount) > 0 && (
                <p className="muted">{glance.data!.unknownEstimateCount} açık öğenin süre tahmini yok.</p>
              )}
              {summary.hasOpenWork && <p className="muted">Devam eden çalışma var; süre güncellenebilir.</p>}
            </section>
            <section aria-labelledby="day-review-actual">
              <h3 id="day-review-actual">
                Çalışma kayıtları <span className="muted">({d.actual.total})</span>
              </h3>
              {!Number(d.actual.total) && <p className="muted">Bu gün için çalışma kaydı yok.</p>}
              <ul className="day-review-records">
                {d.actual.items.map(item => (
                  <li key={item.segmentId}>
                    <div>
                      <strong>
                        {item.taskAtStart?.title ?? (item.taskId ? "Görev adı kaydedilmemiş" : "Görevsiz çalışma")}
                      </strong>
                      <span className="muted">
                        {shortTime(item.startsAt, item.timeZoneId, format)}–
                        {shortTime(item.endsAt, item.timeZoneId, format)}
                        {item.sessionStillRunning ? " · Devam ediyor" : ""}
                      </span>
                    </div>
                    <span>{minutes(item.activeSeconds)}</span>
                  </li>
                ))}
              </ul>
              <RecordPages name="Çalışma kayıtları" offset={actual} total={Number(d.actual.total)} change={setActual} />
            </section>
            <section aria-labelledby="day-review-completed">
              <h3 id="day-review-completed">
                Tamamlanan görevler <span className="muted">({d.completions.total})</span>
              </h3>
              {!Number(d.completions.total) && <p className="muted">Bu gün tamamlanan görev yok.</p>}
              <ul className="day-review-records">
                {d.completions.items.map(item => (
                  <li key={item.eventId}>
                    <strong>{item.title ?? "Görev adı kaydedilmemiş"}</strong>
                    <time dateTime={item.effectiveAt}>{shortTime(item.effectiveAt, item.timeZoneId, format)}</time>
                  </li>
                ))}
              </ul>
              <RecordPages
                name="Tamamlanan görevler"
                offset={completions}
                total={Number(d.completions.total)}
                change={setCompletions}
              />
            </section>
          </>
        )}
      </div>
    </Surface>
  );
}
function RecordPages({
  name,
  offset,
  total,
  change,
}: {
  name: string;
  offset: number;
  total: number;
  change: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav aria-label={`${name} sayfaları`} className="day-review-pages">
      <button type="button" disabled={!offset} onClick={() => change(Math.max(0, offset - pageSize))}>
        Önceki
      </button>
      <span>
        {Math.min(total, offset + pageSize)} / {total}
      </span>
      <button type="button" disabled={offset + pageSize >= total} onClick={() => change(offset + pageSize)}>
        Sonraki
      </button>
    </nav>
  );
}

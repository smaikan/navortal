"use client";
import type { Glance } from "./glance";
import { span } from "./glance";
import { useGlance } from "./glance";

export function LiveDayBar({ date, ...props }: { date: string } & Omit<Parameters<typeof DayBar>[0], "glance">) {
  const { data, isError, refetch } = useGlance(date, false);
  if (!data && isError)
    return (
      <p role="status">
        Gün özeti okunamadı.{" "}
        <button type="button" onClick={() => void refetch()}>
          Gün özetini yeniden oku
        </button>
      </p>
    );
  return data ? <DayBar {...props} glance={data} /> : <div className="day-bar pending" aria-hidden="true" />;
}

/** Gün kapasitesi sunucudan geliyor. Burada ek planlama eylemi yok. */
export function DayBar({
  glance,
  calm,
  isToday,
  energy,
}: {
  glance: Glance;
  calm: boolean;
  isToday: boolean;
  energy?: React.ReactNode;
}) {
  const working = Number(glance.workingRemainingSeconds),
    planned = Number(glance.plannedRemainingSeconds);
  const fill = working > 0 ? Math.min(100, Math.round((planned / working) * 100)) : planned > 0 ? 100 : 0;
  const unknown = Number(glance.unknownEstimateCount);
  return (
    <section className="day-bar" aria-label="Günün zamanı">
      <div className="day-bar-line">
        {!calm && (
          <>
            {isToday && (
              <span>
                <span className="muted">Günün kalanı</span> <strong>{span(working)}</strong>
              </span>
            )}
            <span>
              <span className="muted">Planın kalanı</span> <strong>{span(planned)}</strong>
              {unknown > 0 && <span className="muted"> + {unknown} tahminsiz iş</span>}
              {Number(glance.unboundedItemCount ?? 0) > 0 && (
                <span className="muted"> · {glance.unboundedItemCount} öğenin bitişi belirlenmedi</span>
              )}
            </span>
          </>
        )}
        {glance.overCapacity && Number(glance.openItemCount) > 0 && (
          <span className="day-bar-note">Plan bugüne sığmıyor.</span>
        )}
        <span className="day-bar-spacer" />
        {!calm && (
          <span>
            <span className="muted">Bugün biten</span>{" "}
            <strong className="day-bar-done">{Number(glance.completedItemCount)}</strong>
          </span>
        )}
        {energy}
      </div>
      {!calm && (
        <div className="day-bar-track" aria-hidden="true">
          <span style={{ width: `${fill}%` }} />
        </div>
      )}
    </section>
  );
}

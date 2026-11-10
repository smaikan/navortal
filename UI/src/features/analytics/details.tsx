"use client";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { duration, type Actual } from "./model";
import { usePlanReport } from "./plan-queries";
import { PlanComparison } from "./plan-metrics";
import { planFiltersOf } from "./plan-section";
import { RoutineTable } from "./routines";
import type { View } from "./period";
import styles from "./report.module.css";
const number = (value: number | string) => Number(value).toLocaleString("tr-TR");
const weekdays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
/** Eski raporlardaki tam ölçüler burada duruyor, başlangıçta kapalı. */
export function Details({ view, actual }: { view: View; actual: UseQueryResult<Actual> }) {
  const client = useQueryClient(),
    { state } = useSession(),
    plan = usePlanReport(planFiltersOf(view)).report.data,
    r = actual.data;
  return (
    <details className={styles.details}>
      <summary>Ayrıntılar</summary>
      <p className="muted">
        Kesin değerler. Manuel kayıt ve odak süreleri gerçek çalışmanın içindedir; toplama yeniden eklenmez.
      </p>
      {r && (
        <>
          <div role="region" aria-label="Dönem tablosu" tabIndex={0} className={styles.scroll}>
            <table>
              <caption>
                {r.bucket === "Day" ? "Günlük" : r.bucket === "Week" ? "Haftalık" : "Aylık"} dönemler · {r.fromDate} –{" "}
                {r.toDate}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dönem</th>
                  <th scope="col">Gerçek çalışma</th>
                  <th scope="col">Tahmini tamamlanan</th>
                  <th scope="col">Göreve bağlı</th>
                  <th scope="col">Bağımsız çalışma</th>
                  <th scope="col">Manuel kayıt</th>
                  <th scope="col">Odak</th>
                  <th scope="col">Oturum</th>
                </tr>
              </thead>
              <tbody>
                {r.buckets.map(b => (
                  <tr key={b.bucketStart}>
                    <th scope="row">{b.fromDate === b.toDate ? b.fromDate : `${b.fromDate} – ${b.toDate}`}</th>
                    <td>{duration(b.metrics.workSeconds)}</td>
                    <td>{duration(b.metrics.estimatedCompletedSeconds ?? 0)}</td>
                    <td>{duration(b.metrics.taskWorkSeconds)}</td>
                    <td>{duration(b.metrics.generalWorkSeconds)}</td>
                    <td>{duration(b.metrics.manualWorkSeconds)}</td>
                    <td>{duration(b.metrics.focus.activeSeconds)}</td>
                    <td>{number(b.metrics.sessionCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.bucket === "Week" && (
            <p className="muted">
              Hafta başlangıcı: {weekdays[Number(r.weekStartsOn)]}. İlk ve son hafta seçilen tarihlerde kesilir.
            </p>
          )}
          <dl className={styles.facts} aria-label="Çalışma ve odak toplamları">
            {(
              [
                ["Gerçek çalışma", duration(r.totals.workSeconds)],
                ["Tahmini tamamlanan iş", duration(r.totals.estimatedCompletedSeconds ?? 0)],
                ["Göreve bağlı", duration(r.totals.taskWorkSeconds)],
                ["Bağımsız çalışma", duration(r.totals.generalWorkSeconds)],
                ["Manuel kayıt", duration(r.totals.manualWorkSeconds)],
                ["Oturum", number(r.totals.sessionCount)],
                ["Çalışma aralığı", number(r.totals.segmentCount)],
                ["Geçmiş görev bağlamı bilinmeyen süre", duration(r.totals.missingSnapshotSeconds)],
                ["Odak çalışma süresi", duration(r.totals.focus.activeSeconds)],
                ["Hedef sonrası çalışma", duration(r.totals.focus.overtimeSeconds)],
                ["Başlayan odak döngüsü", number(r.totals.focus.startedCount)],
                ["Biten odak döngüsü", number(r.totals.focus.finishedCount)],
                ["Düzeltme sonrası hedefe ulaşan", number(r.totals.focus.effectiveTargetsReached)],
                ["Döngü başına ortalama odak", duration(r.totals.focus.averageActiveSeconds)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {plan && <PlanComparison baseline={plan.baseline} current={plan.current} />}
      {r && (
        <p className="muted">
          Rapor anı: <time dateTime={r.serverNow}>{new Date(r.serverNow).toLocaleString("tr-TR")}</time>. Açık
          çalışmanın süresi bu ana kadardır.{" "}
          <button
            className="ghost"
            onClick={() =>
              void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "analytics").slice(0, 3) })
            }
          >
            Raporu yenile
          </button>
        </p>
      )}
      <RoutineTable view={view} />
    </details>
  );
}

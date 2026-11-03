"use client";
import Link from "next/link";
import { triggerLabel } from "../planning/history-model";
import type { PlanFilters } from "./plan-model";
import { usePlanReport } from "./plan-queries";
import { accuracySentence, longDate, roughDuration, type View } from "./period";
import { Failure } from "./failure";
import styles from "./report.module.css";
/** Plan okumasındaki 60 saniyelik başlangıç toleransı korunuyor. Başlama farkı yalnız ayrıntıda listeleniyor. */
export const planFiltersOf = (view: View): PlanFilters => ({
  fromDate: view.fromDate,
  toDate: view.toDate,
  startToleranceSeconds: 60,
  reviewDate: null,
  suggestionTask: null,
});
const chartLimit = 31;
const count = (v: number | string) => Number(v).toLocaleString("tr-TR");
export function PlanSection({ view }: { view: View }) {
  const { report } = usePlanReport(planFiltersOf(view)),
    data = report.data,
    c = data?.current;
  const planned = !!c && (Number(c.plannedWorkSeconds) > 0 || Number(c.componentCount) > 0);
  const reasons = data?.days.filter(d => d.revisionReasons.length || d.deferReasons.length) ?? [];
  const max = data
    ? Math.max(0, ...data.days.flatMap(d => [Number(d.current.plannedWorkSeconds), Number(d.actualSeconds)]))
    : 0;
  return (
    <section aria-labelledby="plan-title" id="plan" className={styles.section}>
      <h2 id="plan-title">Planına uyum</h2>
      {report.isPending && <p role="status">Plan karşılaştırması okunuyor…</p>}
      <Failure query={report} what="Plan karşılaştırması" />
      {data && c && !planned && (
        <p className={styles.sub}>
          Bu dönemde kabul edilmiş plan yok. Gününü <Link href="/planning">Bugün</Link> ekranından planlayabilirsin.
          {Number(data.deferCount) > 0 && ` Bu dönemde ${count(data.deferCount)} erteleme kaydı var.`}
        </p>
      )}
      {data && c && planned && (
        <>
          <p className={styles.sub}>
            Günlere {roughDuration(c.quotaSeconds)} ayırmıştın; bunun {roughDuration(c.quotaFulfilledSeconds)} kadarı
            çalışmayla karşılandı.
            {Number(c.unplannedActualSeconds) > 0 &&
              ` Ayrıca plan dışında ${roughDuration(c.unplannedActualSeconds)} çalıştın.`}
          </p>
          <div className={styles.planGrid}>
            {data.days.length <= chartLimit ? (
              <div className={styles.card}>
                <div
                  className={styles.pairs}
                  role="img"
                  aria-label="Günlük planlanan ve yapılan süre. Kesin değerler Ayrıntılar tablosunda."
                >
                  {data.days.map(d => {
                    const p = Number(d.current.plannedWorkSeconds),
                      a = Number(d.actualSeconds);
                    return (
                      <div
                        key={d.date}
                        className={styles.pair}
                        title={`${longDate(d.date)}: plan ${roughDuration(p)}, yapılan ${roughDuration(a)}`}
                      >
                        <span className={styles.planned} style={{ height: max ? `${(p / max) * 100}%` : 0 }} />
                        <span className={styles.done} style={{ height: max ? `${(a / max) * 100}%` : 0 }} />
                      </div>
                    );
                  })}
                </div>
                <ul className={styles.legend}>
                  <li style={{ ["--key" as string]: "var(--analytics-task)" }}>Yaptığın</li>
                  <li className={styles.dashed}>Planladığın</li>
                </ul>
              </div>
            ) : (
              <p className={styles.note}>Günlük karşılaştırma en çok {chartLimit} gün için çizilir.</p>
            )}
            <div className={styles.card}>
              <dl className={styles.facts}>
                <div>
                  <dt>Planlanan</dt>
                  <dd>{roughDuration(c.plannedWorkSeconds)}</dd>
                </div>
                <div>
                  <dt>Karşılanan</dt>
                  <dd>
                    {roughDuration(c.quotaFulfilledSeconds)} / {roughDuration(c.quotaSeconds)}
                  </dd>
                </div>
                <div>
                  <dt>Tamamlanan iş</dt>
                  <dd>
                    {count(c.completedComponentCount)} / {count(c.componentCount)}
                  </dd>
                </div>
                <div>
                  <dt>Ertelenen iş</dt>
                  <dd>{count(data.deferCount)}</dd>
                </div>
                <div>
                  <dt>Yeniden düzenleme</dt>
                  <dd>{count(data.revisionCount)}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p className={styles.note}>Karşılanan süre görevin tamamlandığı anlamına gelmez.</p>
        </>
      )}
      {data &&
        (reasons.length ? (
          <details className={styles.more}>
            <summary>Erteleme ve düzenleme nedenleri ({reasons.length} gün)</summary>
            <ul className={styles.reasons}>
              {reasons.map(d => (
                <li key={d.date}>
                  <strong>{longDate(d.date)}</strong>
                  <ul>
                    {d.revisionReasons.map((r, i) => (
                      <li key={`r${i}`}>
                        Düzenleme · {triggerLabel(r.trigger)}
                        {r.reason ? ` · ${r.reason}` : ""} · {count(r.count)} kez
                      </li>
                    ))}
                    {d.deferReasons.map((r, i) => (
                      <li key={`d${i}`}>
                        Erteleme · {r.reasonAvailable ? r.reason : "neden bilinmiyor"} · {count(r.count)} kez
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          planned && <p className={styles.note}>Kayıtlı erteleme veya düzenleme nedeni yok.</p>
        ))}
    </section>
  );
}
export function AccuracySection({ view }: { view: View }) {
  const { report } = usePlanReport(planFiltersOf(view)),
    a = report.data?.current.accuracy;
  return (
    <section aria-labelledby="accuracy-title" className={styles.section}>
      <h2 id="accuracy-title">Tahmin isabeti</h2>
      {a && <p className={styles.sub}>{accuracySentence(a.sampleCount, a.meanErrorSeconds)}</p>}
      {report.isError && !a && <p className={styles.sub}>Plan karşılaştırması okunamadığı için gösterilemiyor.</p>}
    </section>
  );
}

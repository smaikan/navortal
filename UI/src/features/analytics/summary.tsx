"use client";
import type { UseQueryResult } from "@tanstack/react-query";
import { accountedSeconds, type Actual } from "./model";
import { bucketLabel, leadSentence, longDate, previousTitle, rangeText, roughDuration, type View } from "./period";
import { Failure } from "./failure";
import styles from "./report.module.css";
type Query = UseQueryResult<Actual>;
const count = (v: number | string) => Number(v).toLocaleString("tr-TR");
export function Summary({ view, actual, previous }: { view: View; actual: Query; previous: Query }) {
  const r = actual.data,
    p = previous.data,
    // Karşılaştırma okunamazsa yalnız karşılaştırma kalkar, ana sayı kalır.
    prior = view.previous && p ? accountedSeconds(p.totals) : null,
    // Kapalı sorgu TanStack Query içinde pending kalabiliyor. Gerçekten istenen karşılaştırmayı bekliyoruz.
    settled = !view.previous || !previous.isPending;
  return (
    <section aria-labelledby="summary-title" className={styles.section}>
      <h2 id="summary-title" className="sr-only">
        Özet
      </h2>
      <Failure query={actual} what="Çalışma özeti" />
      {actual.isPending && (
        <>
          <p role="status" className={styles.lead}>
            Çalışma özeti okunuyor…
          </p>
          {/* Kutular yüklenmiş haliyle aynı ölçüde, sonraki bölümler zıplamasın. */}
          <div className={styles.tiles} aria-hidden="true">
            {["Çalışma süresi", "Çalışılan gün", "Odak süresi"].map(label => (
              <div key={label} className={styles.tile}>
                <span className={styles.label}>{label}</span>
                <strong className={styles.value}>…</strong>
                <span className={styles.note}> </span>
              </div>
            ))}
          </div>
        </>
      )}
      {r && (
        <>
          <p className={styles.lead} role={settled ? undefined : "status"}>
            {settled
              ? Number(r.totals.estimatedCompletedSeconds ?? 0) > 0
                ? `Bu dönemde ${roughDuration(r.totals.workSeconds)} ölçülen çalışma ve ${roughDuration(r.totals.estimatedCompletedSeconds)} tahmini tamamlanan iş kaydedildi.`
                : leadSentence(view.period, accountedSeconds(r.totals), prior)
              : "Karşılaştırma okunuyor…"}
          </p>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.label}>
                {Number(r.totals.estimatedCompletedSeconds ?? 0) > 0 ? "Çalışma ve biten işler" : "Çalışma süresi"}
              </span>
              <strong className={styles.value}>{roughDuration(accountedSeconds(r.totals))}</strong>
              <span className={styles.note}>
                {Number(r.totals.estimatedCompletedSeconds ?? 0) > 0
                  ? `${roughDuration(r.totals.workSeconds)} ölçülen · ${roughDuration(r.totals.estimatedCompletedSeconds)} tahmini tamamlanan`
                  : prior !== null
                    ? `${previousTitle[view.period]}: ${roughDuration(prior)}`
                    : " "}
              </span>
            </div>
            {r.bucket === "Day" ? (
              <div className={styles.tile}>
                <span className={styles.label}>Çalışılan gün</span>
                <strong className={styles.value}>
                  {r.buckets.filter(b => accountedSeconds(b.metrics) > 0).length} / {r.buckets.length}
                </strong>
                <span className={styles.note}>Çalışma veya tamamlanan iş olan gün</span>
              </div>
            ) : (
              <div className={styles.tile}>
                <span className={styles.label}>Oturum</span>
                <strong className={styles.value}>{count(r.totals.sessionCount)}</strong>
                <span className={styles.note}>Bu aralıktaki çalışma oturumu</span>
              </div>
            )}
            <div className={styles.tile}>
              <span className={styles.label}>Odak süresi</span>
              <strong className={styles.value}>{roughDuration(r.totals.focus.activeSeconds)}</strong>
              <span className={styles.note}>{count(r.totals.focus.activeCycleCount)} odak döngüsü</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
const unit = { Day: "gün", Week: "hafta", Month: "ay" };
export function Rhythm({ view, actual }: { view: View; actual: Query }) {
  const r = actual.data;
  if (!r)
    return actual.isPending ? (
      <section aria-labelledby="rhythm-title" className={styles.section}>
        <h2 id="rhythm-title">Ritim</h2>
        <p className={styles.sub}>Çalışma süresi</p>
        <div className={styles.card} aria-hidden="true">
          <div className={styles.columns} />
          <p className={styles.note}> </p>
        </div>
      </section>
    ) : null;
  const rows = r.buckets,
    values = rows.map(b => accountedSeconds(b.metrics)),
    max = Math.max(0, ...values),
    peak = max > 0 ? values.indexOf(max) : -1,
    dense = rows.length > 14;
  const peakName =
    peak < 0
      ? ""
      : r.bucket === "Day"
        ? longDate(rows[peak].fromDate)
        : rangeText({ fromDate: rows[peak].fromDate, toDate: rows[peak].toDate });
  return (
    <section aria-labelledby="rhythm-title" className={styles.section}>
      <h2 id="rhythm-title">Ritim</h2>
      <p className={styles.sub}>
        {r.bucket === "Day" ? "Günlük" : r.bucket === "Week" ? "Haftalık" : "Aylık"} çalışma süresi
      </p>
      <div className={styles.card}>
        <div
          className={styles.columns}
          role="img"
          aria-label={`${rows.length} ${unit[r.bucket]} için çalışma süresi. ${
            peak < 0 ? "Kayıtlı çalışma yok." : `En yüksek: ${peakName}, ${roughDuration(max)}.`
          } Kesin değerler Ayrıntılar tablosunda.`}
        >
          {rows.map((b, i) => (
            <div key={b.bucketStart} className={styles.column} data-peak={i === peak || undefined}>
              <span className={styles.area}>
                <span
                  className={styles.bar}
                  data-empty={values[i] === 0 || undefined}
                  style={{ height: max ? `${Math.max(1.5, (values[i] / max) * 100)}%` : "2px" }}
                  title={`${b.fromDate === b.toDate ? b.fromDate : `${b.fromDate} – ${b.toDate}`}: ${roughDuration(values[i])}`}
                >
                  {!dense && values[i] > 0 && <span className={styles.columnValue}>{roughDuration(values[i])}</span>}
                </span>
              </span>
              <span className={styles.axis}>
                {!dense || i % 3 === 0 || i === rows.length - 1 ? bucketLabel(b, r.bucket, rows.length) : " "}
              </span>
            </div>
          ))}
        </div>
        <p className={styles.note}>
          {peak < 0
            ? "Bu dönemde kayıtlı çalışma yok."
            : `En yoğun ${unit[r.bucket]}: ${peakName} (${roughDuration(max)}).`}
          {view.ongoing && " Dönem henüz bitmedi."}
        </p>
      </div>
    </section>
  );
}

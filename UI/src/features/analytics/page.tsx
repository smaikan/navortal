"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDisplayPreferences } from "../workspace/queries";
import { localToday } from "../preferences/model";
import { periods, rangeText, readView, viewUrl, type Period, type View } from "./period";
import { useActual } from "./queries";
import { Summary, Rhythm } from "./summary";
import { Distribution } from "./distribution";
import { PlanSection, AccuracySection } from "./plan-section";
import { Details } from "./details";
import { RoutinesSection } from "./routines";
import { useFirstData } from "../../lib/first-data";
import styles from "./report.module.css";
export function AnalyticsPage() {
  const prefs = useDisplayPreferences(),
    search = useSearchParams();
  // Ayarlar ilk geldiğinde rapor ekrana parça parça ekleniyor.
  const values = useFirstData(prefs.data)?.values;
  let view: View | undefined,
    error = "";
  if (values) {
    try {
      view = readView(
        new URLSearchParams(search.toString()),
        localToday(values.timeZoneId),
        Number(values.weekStartsOn),
      );
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return (
    <main id="main" className={`workspace-main soft-scale ${styles.page}`} tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Analiz</h1>
      </header>
      {!values && !prefs.isError && <p role="status">Tercihler okunuyor…</p>}
      {prefs.isError && (
        <div role="alert">
          <p>Tercihler okunamadı.</p>
          <button onClick={() => void prefs.refetch()}>Yeniden dene</button>
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Link className="button" href="/analytics" prefetch={false}>
            Bu haftaya dön
          </Link>
        </div>
      )}
      {view && (
        <>
          <PeriodPicker view={view} />
          <Report key={`${view.period}|${view.fromDate}|${view.toDate}`} view={view} />
        </>
      )}
    </main>
  );
}
function PeriodPicker({ view }: { view: View }) {
  const link = (period: Period) => viewUrl({ ...view, period });
  return (
    <div className={styles.picker}>
      <nav aria-label="Dönem" className={styles.chips}>
        {(Object.keys(periods) as (keyof typeof periods)[]).map(p => (
          <Link
            key={p}
            className={styles.chip}
            href={link(p)}
            prefetch={false}
            scroll={false}
            aria-current={view.period === p ? "page" : undefined}
          >
            {periods[p]}
          </Link>
        ))}
        <Link
          className={styles.chip}
          href={link("custom")}
          prefetch={false}
          scroll={false}
          aria-current={view.period === "custom" ? "page" : undefined}
        >
          Özel aralık
        </Link>
      </nav>
      {view.period === "custom" && <CustomRangeForm key={`${view.fromDate}|${view.toDate}`} view={view} />}
      <p className={`muted ${styles.range}`}>
        {rangeText(view)}
        {view.ongoing && " · dönem sürüyor"}
      </p>
    </div>
  );
}
function CustomRangeForm({ view }: { view: View }) {
  const router = useRouter(),
    [error, setError] = useState("");
  return (
    <form
      className={styles.custom}
      aria-label="Özel tarih aralığı"
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget),
          next = { ...view, period: "custom" as const };
        next.fromDate = String(data.get("fromDate"));
        next.toDate = String(data.get("toDate"));
        try {
          readView(new URL(viewUrl(next), "https://local.invalid").searchParams, next.toDate, 1);
          setError("");
          router.push(viewUrl(next), { scroll: false });
        } catch (failure) {
          setError((failure as Error).message);
        }
      }}
    >
      <div className="hours-field">
        <label htmlFor="analytics-from">Başlangıç</label>
        <TemporalInput
          id="analytics-from"
          type="date"
          name="fromDate"
          required
          min="0002-01-01"
          max="9998-12-31"
          defaultValue={view.fromDate}
        />
      </div>
      <div className="hours-field">
        <label htmlFor="analytics-to">Bitiş</label>
        <TemporalInput
          id="analytics-to"
          type="date"
          name="toDate"
          required
          min="0002-01-01"
          max="9998-12-31"
          defaultValue={view.toDate}
        />
      </div>
      <button type="submit">Aralığı göster</button>
      <p className="muted">Başlangıç ve bitiş dahil en çok 366 gün.</p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
/** Özet altındaki bölümleri ayrı işlerde ekliyoruz, bütün çizim ve okumalar tek uzun iş olmasın. Her biri öncekilerin altına geliyor, ekrandakiler kaymıyor. */
function useSteps(count: number) {
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (step >= count) return;
    const timer = setTimeout(() => startTransition(() => setStep(step + 1)), 0);
    return () => clearTimeout(timer);
  }, [step, count]);
  return step;
}
function Report({ view }: { view: View }) {
  const actual = useActual(view, view.bucket),
    previous = useActual(view.previous, "Month");
  // Planı aynı rapordan okuyan plan, doğruluk ve ayrıntı bölümleri birlikte ekleniyor;
  // sonradan gelen okuyucu başarısız raporu kendi kendine tekrar istemesin.
  const step = useSteps(3);
  return (
    <>
      <Summary view={view} actual={actual} previous={previous} />
      <Rhythm view={view} actual={actual} />
      {step >= 2 && <Distribution key={view.dimension} view={view} actual={actual} />}
      {step >= 3 && (
        <>
          <PlanSection view={view} />
          <RoutinesSection view={view} />
          <AccuracySection view={view} />
          <Details view={view} actual={actual} />
        </>
      )}
    </>
  );
}

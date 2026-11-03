"use client";
import { useState } from "react";
import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { dimensions, pageSize, type Actual } from "./model";
import { roughDuration, viewUrl, type View } from "./period";
import { useBreakdown } from "./queries";
import { Failure } from "./failure";
import styles from "./report.module.css";
const preview = 5;
export function Distribution({ view, actual }: { view: View; actual: UseQueryResult<Actual> }) {
  const [offset, setOffset] = useState(0),
    [all, setAll] = useState(false),
    breakdown = useBreakdown(view, view.dimension, offset),
    page = breakdown.data,
    items = page ? (all ? page.items : page.items.slice(0, preview)) : [],
    max = Math.max(0, ...items.map(i => Number(i.workSeconds))),
    totals = actual.data?.totals;
  return (
    <section aria-labelledby="distribution-title" className={styles.section}>
      <h2 id="distribution-title">Zaman nereye gidiyor</h2>
      <p className={styles.sub}>Çalışmanın {dimensions[view.dimension].toLocaleLowerCase("tr-TR")} bazında dağılımı.</p>
      <div className={styles.card}>
        <nav aria-label="Kırılım" className={styles.chips}>
          {(["Project", "Category", "Task"] as const).map(d => (
            <Link
              key={d}
              className={styles.chip}
              href={viewUrl({ ...view, dimension: d })}
              prefetch={false}
              scroll={false}
              aria-current={view.dimension === d ? "page" : undefined}
            >
              {dimensions[d]}
            </Link>
          ))}
        </nav>
        {breakdown.isPending && <p role="status">Dağılım okunuyor…</p>}
        <Failure query={breakdown} what="Dağılım" />
        {page && Number(page.total) === 0 && (
          <p className={styles.note}>Çalışma kaydedildikçe dağılım burada görünür.</p>
        )}
        {page && Number(page.total) > 0 && (
          <>
            <ul className={styles.rows} aria-label={`${dimensions[view.dimension]} dağılımı`}>
              {items.map(item => (
                <li key={JSON.stringify([item.id, item.label, item.snapshotAvailable])} className={styles.row}>
                  <span className={styles.rowName}>
                    {item.label}
                    {!item.snapshotAvailable && <span className="muted"> · geçmiş bağlam bilinmiyor</span>}
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span style={{ width: `${max ? (Number(item.workSeconds) / max) * 100 : 0}%` }} />
                  </span>
                  <span className={styles.rowValue}>{roughDuration(item.workSeconds)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              En çok zaman alanlar önce. Aralığın toplamı {roughDuration(page.totalWorkSeconds)}.
            </p>
            {!all && Number(page.total) > preview && (
              <button className="ghost" onClick={() => setAll(true)}>
                Tümünü gör ({Number(page.total).toLocaleString("tr-TR")})
              </button>
            )}
            {all && Number(page.total) > pageSize && (
              <nav className="task-pagination" aria-label="Dağılım sayfaları">
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
                  Önceki
                </button>
                <span>
                  {offset + page.items.length} / {Number(page.total).toLocaleString("tr-TR")}
                </span>
                <button
                  disabled={offset + pageSize >= Number(page.total) || offset + pageSize > 100000}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  Sonraki
                </button>
              </nav>
            )}
          </>
        )}
        {totals && Number(totals.workSeconds) > 0 && (
          <div className={styles.split}>
            <div className={styles.stack} aria-hidden="true">
              <span style={{ flexGrow: Number(totals.taskWorkSeconds), background: "var(--analytics-task)" }} />
              <span style={{ flexGrow: Number(totals.generalWorkSeconds), background: "var(--analytics-general)" }} />
            </div>
            <ul className={styles.legend}>
              <li style={{ ["--key" as string]: "var(--analytics-task)" }}>
                Göreve bağlı {roughDuration(totals.taskWorkSeconds)}
              </li>
              <li style={{ ["--key" as string]: "var(--analytics-general)" }}>
                Bağımsız çalışma {roughDuration(totals.generalWorkSeconds)}
              </li>
              {Number(totals.manualWorkSeconds) > 0 && (
                <li className={styles.plain}>Bunun {roughDuration(totals.manualWorkSeconds)} kadarı elle eklendi</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

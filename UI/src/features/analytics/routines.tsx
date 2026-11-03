"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { validTaskId } from "../../components/layout/task-panel-url";
import { localToday } from "../preferences/model";
import { shortSummary, weekOrder } from "../recurrence/model";
import { WeekStrip } from "../recurrence/week-strip";
import { Failure } from "./failure";
import { periods, previousTitle, rangeText, roughDuration, subject, type View } from "./period";
import {
  allPage,
  firstPage,
  monthInRange,
  monthRows,
  rateText,
  ratePercent,
  shortDay,
  weekInRange,
  type RoutineCounts,
  type RoutineDetail,
  type RoutineItem,
  type RoutineReport,
} from "./routine-model";
import { useRoutineDetail, useRoutineReport } from "./routine-queries";
import styles from "./report.module.css";

const weekdayNames = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const fraction = (c: Pick<RoutineCounts, "completed" | "total">) => `${c.completed}/${c.total}`;
const periodLabel = (view: View) => (view.period === "custom" ? "Özel aralık" : periods[view.period]);

function lead(view: View, r: RoutineReport) {
  if (!Number(r.totals.total)) return `${subject[view.period]} sonucu belli olan rutin görevi yok.`;
  const head = `${subject[view.period]} ${r.activeCount} rutinde ${r.totals.total} görevden ${r.totals.completed} tanesi yapıldı.`;
  return r.compare && Number(r.compare.total) ? `${head} ${previousTitle[view.period]}: ${fraction(r.compare)}.` : head;
}

export function RoutinesSection({ view }: { view: View }) {
  const [limit, setLimit] = useState(firstPage);
  const report = useRoutineReport(view, limit),
    r = report.data;
  const requested = useSearchParams().get("routine");
  const [open, setOpen] = useState(() => (validTaskId(requested ?? "") ? requested : null));
  // Rutin sayfasından gelindiğinde bölüm sonradan eklendiği için tarayıcı adrese kaydıramaz.
  const arrived = !!r && !!requested;
  useEffect(() => {
    if (arrived) document.getElementById("routines")?.scrollIntoView();
  }, [arrived]);
  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("routine", next);
    else url.searchParams.delete("routine");
    window.history.replaceState(null, "", url);
  };
  const minimum = Number(r?.minimumSamples ?? 3),
    rate = r ? ratePercent(r.totals, minimum) : null,
    prior = r?.compare ? ratePercent(r.compare, minimum) : null;
  return (
    <section id="routines" aria-labelledby="routines-title" className={styles.section}>
      <h2 id="routines-title">Rutinler</h2>
      <Failure query={report} what="Rutin analizi" />
      {report.isPending && <p role="status">Rutin analizi okunuyor…</p>}
      {r && !Number(r.total) && (
        <>
          <p className={styles.routineNone}>Henüz rutinin yok. Rutin oluşturduğunda burada nasıl gittiğini görürsün.</p>
          <Link href="/recurrences" prefetch={false}>
            Rutinlere git
          </Link>
        </>
      )}
      {r && !!Number(r.total) && (
        <>
          <p className={styles.lead}>{lead(view, r)}</p>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.label}>Tutarlılık</span>
              <strong className={styles.value}>{rate === null ? fraction(r.totals) : `%${rate}`}</strong>
              <span className={styles.note}>{prior === null ? " " : `${previousTitle[view.period]}: %${prior}`}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.label}>Yapılan</span>
              <strong className={styles.value}>{fraction(r.totals)}</strong>
              <span className={styles.note}>{r.totals.late} tanesi sonradan</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.label}>Zamanında</span>
              <strong className={styles.value}>{r.totals.onTime}</strong>
              <span className={styles.note}>Gününde bitirilen</span>
            </div>
          </div>
          <div className={styles.routineBox}>
            <div className={styles.routineHead} aria-hidden="true">
              <span>Rutin</span>
              <span>Tutarlılık · {periodLabel(view)}</span>
              <span>Son 12 hafta · haftalık yüzde</span>
              <span />
            </div>
            <ul className={styles.routineList}>
              {r.items.map(item => (
                <li key={item.templateId}>
                  <RoutineRow
                    item={item}
                    view={view}
                    minimum={minimum}
                    open={open === item.templateId}
                    toggle={() => toggle(item.templateId)}
                  />
                  {open === item.templateId && <RoutineOpen id={item.templateId} view={view} />}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.routineLegend}>
            <span>
              <i data-kind="zero" aria-hidden="true" />
              Hiç yapılmadı
            </span>
            <span>
              <i data-kind="none" aria-hidden="true" />
              Görev yoktu
            </span>
            <span>
              <i data-kind="period" aria-hidden="true" />
              Seçili dönem
            </span>
          </div>
          {Number(r.total) > r.items.length && limit < allPage && (
            <button type="button" onClick={() => setLimit(allPage)}>
              Tümünü gör
            </button>
          )}
        </>
      )}
    </section>
  );
}

function RoutineRow({
  item,
  view,
  minimum,
  open,
  toggle,
}: {
  item: RoutineItem;
  view: View;
  minimum: number;
  open: boolean;
  toggle: () => void;
}) {
  const rule = item.rule,
    percent = ratePercent(item.counts, minimum),
    today = localToday(rule.timeZoneId!);
  const days =
    rule.frequency === "Daily" ? weekOrder : rule.frequency === "Weekly" ? (rule.weekDays ?? []).map(Number) : null;
  return (
    <button
      type="button"
      className={styles.routineRow}
      aria-expanded={open}
      // Ekran okuyucu grafiğin 12 değerini buton adı olarak okumasın. Kesin değerler açılan bölümde ve tabloda.
      aria-label={`${item.title}${item.enabled ? "" : " (Pasif)"}, ${shortSummary(rule)}, tutarlılık ${rateText(item.counts, minimum)}${percent === null ? "" : `, ${fraction(item.counts)}`}`}
      onClick={toggle}
    >
      <span className={styles.routineStrip}>{days && <WeekStrip days={days} />}</span>
      <span className={styles.routineText}>
        <strong>
          {item.title}
          {!item.enabled && " (Pasif)"}
        </strong>
        <span className="muted">{shortSummary(rule)}</span>
      </span>
      <span className={styles.routineMeter}>
        <span>
          <strong>{rateText(item.counts, minimum)}</strong>
          {percent !== null && <span className="muted">{fraction(item.counts)}</span>}
        </span>
        {percent !== null && (
          <span className={styles.routineTrack}>
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>
      <span
        className={styles.routineWeeks}
        role="img"
        aria-label={`${item.title}, son 12 hafta: ${item.weeks.map(w => (Number(w.total) ? fraction(w) : "görev yok")).join(", ")}`}
      >
        <span className={styles.routineWeeksCaption}>Son 12 hafta · haftalık yüzde</span>
        <span className={styles.routineBars}>
          {item.weeks.map(w => {
            const total = Number(w.total),
              share = total ? Math.round((Number(w.completed) / total) * 100) : null;
            return (
              <span
                key={w.weekStart}
                className={styles.routineBar}
                data-empty={share === null || undefined}
                data-period={weekInRange(w.weekStart, view, today) || undefined}
                title={`${shortDay(w.weekStart)} haftası · ${share === null ? "görev yoktu" : `%${share} (${fraction(w)})`}`}
              >
                <span data-zero={share === 0 || undefined} style={share ? { height: `${share}%` } : undefined} />
              </span>
            );
          })}
        </span>
        <span className={styles.routineAxis}>
          <span>{item.weeks[0] && shortDay(item.weeks[0].weekStart)}</span>
          <span>Bu hafta</span>
        </span>
      </span>
      <ChevronRight className={styles.routineChevron} size={16} aria-hidden="true" />
    </button>
  );
}

function RoutineOpen({ id, view }: { id: string; view: View }) {
  const detail = useRoutineDetail(id),
    d = detail.data;
  return (
    <div className={styles.routineOpen}>
      <Failure query={detail} what="Rutin ayrıntısı" />
      {detail.isPending && <p role="status">Rutin ayrıntısı okunuyor…</p>}
      {d && <RoutineFacts d={d} view={view} />}
    </div>
  );
}

function RoutineFacts({ d, view }: { d: RoutineDetail; view: View }) {
  const rows = monthRows(d.days);
  const weekdays = d.weekdays.map(w => ({
    day: Number(w.weekDay),
    total: Number(w.total),
    completed: Number(w.completed),
  }));
  const showDays = weekdays.length > 1 && weekdays.every(w => w.total >= 4);
  const w = d.work,
    seconds = Number(w.totalSeconds);
  const estimate = w.estimatedSeconds == null ? "" : ` · tahmin ${roughDuration(w.estimatedSeconds)}`;
  return (
    <>
      <p className={styles.routineTrend}>
        Son 4 hafta {fraction(d.recent)} · önceki 4 hafta {fraction(d.prior)}
      </p>
      <div className={styles.routineMonths}>
        <div className={styles.routineMonthsHead}>
          <h3>Aylara göre</h3>
          <span>
            <i data-kind="done" aria-hidden="true" />
            Yapıldı
          </span>
          <span>
            <i data-kind="missed" aria-hidden="true" />
            Yapılmadı
          </span>
        </div>
        {!rows.length && <p className="muted">Henüz sonucu belli görev yok.</p>}
        {rows.map(row => (
          <div
            key={row.month}
            className={styles.routineMonth}
            role="img"
            aria-label={`${row.label}: ${row.dots.length} görevden ${row.done} tanesi yapıldı`}
          >
            <span data-period={monthInRange(row.month, view, d.today) || undefined}>{row.label}</span>
            <span>
              {row.dots.map(dot => (
                <i
                  key={dot.date}
                  data-kind={dot.done ? "done" : "missed"}
                  title={`${shortDay(dot.date)} · ${dot.done ? "Yapıldı" : "Yapılmadı"}`}
                />
              ))}
            </span>
            <span className="muted">
              {row.done}/{row.dots.length}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.routineSide}>
        {showDays && (
          <div className={styles.routineDays}>
            <h3>Günlere göre</h3>
            {weekdays.map(x => (
              <div key={x.day}>
                <span>{weekdayNames[x.day]}</span>
                <span className={styles.routineTrack}>
                  <span style={{ width: `${Math.round((x.completed / x.total) * 100)}%` }} />
                </span>
                <span className="muted">
                  {x.completed}/{x.total}
                </span>
              </div>
            ))}
          </div>
        )}
        <dl className={styles.routineFacts}>
          <dt>En uzun seri</dt>
          <dd>{d.longestRun} görev</dd>
          <dt>Harcanan süre</dt>
          <dd>
            {seconds
              ? `${roughDuration(seconds)} · görev başına ${roughDuration(w.averageSeconds ?? 0)}${estimate}`
              : "Kayıtlı süre yok"}
          </dd>
        </dl>
      </div>
    </>
  );
}

const tableHeads = [
  "Rutin",
  "Tutarlılık",
  "Zamanında",
  "Sonradan",
  "Yapılmadı",
  "Bugün bekliyor",
  "Atlandı",
  "Görev oluşmadı",
];
/** Kesin sayılar Ayrıntılar içinde. Ana bölüm hafif kalır. */
export function RoutineTable({ view }: { view: View }) {
  const report = useRoutineReport(view, allPage),
    r = report.data;
  if (!r || !r.items.length) return null;
  const minimum = Number(r.minimumSamples);
  return (
    <div role="region" aria-label="Rutin tablosu" tabIndex={0} className={styles.scroll}>
      <table>
        <caption>Rutinler · {rangeText(view)}</caption>
        <thead>
          <tr>
            {tableHeads.map(text => (
              <th key={text} scope="col">
                {text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.items.map(({ templateId, title, counts: c }) => (
            <tr key={templateId}>
              <th scope="row">{title}</th>
              <td>{rateText(c, minimum)}</td>
              <td>{c.onTime}</td>
              <td>{c.late}</td>
              <td>{c.notDone}</td>
              <td>{c.todayPending}</td>
              <td>{c.skipped}</td>
              <td>{c.notGenerated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

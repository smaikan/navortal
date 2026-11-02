"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Minus, X } from "lucide-react";
import { Temporal } from "temporal-polyfill";
import { Menu } from "../../components/ui/menu";
import { useTreeActions } from "../tasks/tree/actions";
import type { Task } from "../tasks/model";
import { useRecurrenceCache } from "./queries";
import type { Intent } from "./dialog";
import { Paging } from "./paging";
import {
  dayLabel,
  historyWindow,
  occurrenceStatus,
  recurrenceFailure,
  routineState,
  shortSummary,
  type Occurrence,
  type Template,
} from "./model";
import { useDefinitions, useOccurrences, useTemplate } from "./queries";
import "./styles.css";

export function Detail({ id, open, locked }: { id: string; open: (i: Intent) => void; locked: boolean }) {
  const q = useTemplate(id);
  return (
    <section className="recurrence-detail" aria-label="Seçili seri">
      {q.isPending && <p role="status">Seri okunuyor…</p>}
      {q.isError && (
        <p role="alert">
          {recurrenceFailure(q.error)}
          <button onClick={() => void q.refetch()}>Seriyi yeniden oku</button>
        </p>
      )}
      {q.data && <TemplateDetail template={q.data} open={open} locked={locked} />}
    </section>
  );
}

function sinceText(date: string) {
  return new Intl.DateTimeFormat("tr", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function TemplateDetail({
  template: t,
  open,
  locked,
}: {
  template: Template;
  open: (i: Intent) => void;
  locked: boolean;
}) {
  const [today] = useState(() => Temporal.Now.zonedDateTimeISO(t.rule.timeZoneId).toPlainDate().toString());
  const [windows, setWindows] = useState(1);
  const actions = useTreeActions();
  const cache = useRecurrenceCache();
  // Yapıldı ⇄ yapılmadı: görev durumunu değiştirir, sonra rutin ve görev görünümleri yenilenir.
  const toggle = async (taskId: string, done: boolean) => {
    const task = { id: taskId } as Task;
    await (done ? actions.complete(task) : actions.reopen(task));
    cache.changed();
  };
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const floor = [t.rule.startDate, t.effectiveFrom, t.createdAt.slice(0, 10)].sort()[0]!;
  const hasOlder = historyWindow(today, windows - 1).from > floor;
  const first = useOccurrences(t.id, historyWindow(today, 0).from, today, 0);
  const noneYet = first.isSuccess && windows === 1 && !first.data.items.length && !hasOlder;
  return (
    <>
      <header className="recurrence-head">
        <div className="recurrence-head-line">
          <h2>{t.task.title}</h2>
          <span className={`recurrence-state${routineState(t, today) === "Etkin" ? "" : " off"}`}>
            {routineState(t, today)}
          </span>
        </div>
        <p>{shortSummary(t.rule)}</p>
        <p className="muted">{sinceText(t.effectiveFrom)}’den beri</p>
        <Link href={`/analytics?period=month&routine=${t.id}#routines`} prefetch={false}>
          Analizde gör
        </Link>
      </header>
      <div className="recurrence-head-actions">
        <button
          className="primary"
          disabled={locked}
          onClick={e => open({ action: "update", template: t, trigger: e.currentTarget })}
        >
          Düzenle
        </button>
        <Menu
          label="Rutin için diğer işlemler"
          items={[
            {
              label: t.enabled ? "Seriyi pasif yap" : "Seriyi etkinleştir",
              disabled: locked,
              onSelect: trigger => open({ action: "enable", template: t, trigger }),
            },
            ...(t.rule.autoAddToPlan
              ? []
              : [
                  {
                    label: "Önümüzdeki 14 gün için görev oluştur",
                    disabled: locked || !t.enabled,
                    onSelect: (trigger: HTMLElement) =>
                      open({
                        action: "materialize",
                        template: t,
                        from: today,
                        to: Temporal.PlainDate.from(today).add({ days: 13 }).toString(),
                        trigger,
                      }),
                  },
                ]),
            {
              label: "Bir günü atla…",
              separator: true,
              disabled: locked,
              onSelect: trigger => open({ action: "skip", template: t, date: today, trigger }),
            },
            {
              label: "Bir günü iptal et…",
              disabled: locked,
              onSelect: trigger => open({ action: "cancel", template: t, date: today, trigger }),
            },
            { label: "Tanım geçmişi", separator: true, onSelect: () => setDefinitionsOpen(!definitionsOpen) },
          ]}
        />
      </div>
      <section aria-labelledby={`${t.id}-history`} className="recurrence-history">
        <h3 id={`${t.id}-history`}>Görevler</h3>
        {first.isError && <p role="alert">{recurrenceFailure(first.error)}</p>}
        {noneYet ? (
          <p className="recurrence-none">Henüz görev oluşmadı.</p>
        ) : (
          <ul className="recurrence-history-list" aria-label="Oluşan görevler, en yeniden eskiye">
            {Array.from({ length: windows }, (_, k) => (
              <HistoryWindow
                key={k}
                template={t}
                k={k}
                today={today}
                locked={locked || !!actions.pending}
                toggle={toggle}
              />
            ))}
          </ul>
        )}
        {hasOlder && (
          <button type="button" className="recurrence-more" onClick={() => setWindows(windows + 1)}>
            Daha eski görevler
          </button>
        )}
      </section>
      {definitionsOpen && <Definitions id={t.id} locked={locked} />}
    </>
  );
}

function HistoryWindow({
  template: t,
  k,
  today,
  locked,
  toggle,
}: {
  template: Template;
  k: number;
  today: string;
  locked: boolean;
  toggle: (taskId: string, done: boolean) => Promise<void>;
}) {
  const w = historyWindow(today, k);
  const q = useOccurrences(t.id, w.from, k === 0 ? today : w.to, 0);
  if (q.isPending)
    return (
      <li className="recurrence-history-note" role="status">
        Görevler okunuyor…
      </li>
    );
  if (q.isError)
    return (
      <li className="recurrence-history-note" role="alert">
        {recurrenceFailure(q.error)}
        <button onClick={() => void q.refetch()}>Yeniden oku</button>
      </li>
    );
  return (
    <>
      {[...q.data.items]
        .sort((a, b) => (a.localDate < b.localDate ? 1 : -1))
        .map(o => (
          <Row key={o.id} o={o} today={today} locked={locked} toggle={toggle} />
        ))}
    </>
  );
}

function Row({
  o,
  today,
  locked,
  toggle,
}: {
  o: Occurrence;
  today: string;
  locked: boolean;
  toggle: (taskId: string, done: boolean) => Promise<void>;
}) {
  const label = dayLabel(o.localDate, today);
  // Kutu tıklamayı hemen izler; sunucu okuması bitince gerçek değer görünür.
  const [shown, setShown] = useState<boolean | null>(null);
  const [prev, setPrev] = useState(o.taskState);
  if (prev !== o.taskState) {
    setPrev(o.taskState);
    setShown(null); // Sunucu değeri geldi.
  }
  const done = shown ?? o.taskState === "Completed";
  const status =
    shown === null
      ? occurrenceStatus(o, today)
      : occurrenceStatus({ ...o, taskState: shown ? "Completed" : "Pending" }, today);
  const Icon =
    status.tone === "done"
      ? Check
      : status.tone === "missed"
        ? X
        : o.state !== "Materialized" || o.taskState === "Skipped" || o.taskState === "Canceled"
          ? Minus
          : Circle;
  const inner = (
    <>
      <span className="recurrence-mark" aria-hidden="true">
        <Icon size={16} strokeWidth={3} />
      </span>
      <span className="recurrence-history-day">{label}</span>
      <span className="recurrence-result">{status.text}</span>
    </>
  );
  const editable = !!o.taskId && o.state === "Materialized" && o.taskState !== "Skipped" && o.taskState !== "Canceled";
  return (
    <li data-tone={status.tone}>
      {editable ? (
        <label className="recurrence-history-row" data-pending={locked || undefined}>
          <input
            type="checkbox"
            className="sr-only"
            checked={done}
            disabled={locked}
            aria-label={`${label} görevi yapıldı`}
            onChange={() => {
              setShown(!done);
              void toggle(o.taskId!, !done).finally(() => setTimeout(() => setShown(null), 1500));
            }}
          />
          {inner}
        </label>
      ) : (
        <div className="recurrence-history-row">{inner}</div>
      )}
    </li>
  );
}

function Definitions({ id, locked }: { id: string; locked: boolean }) {
  const [offset, setOffset] = useState(0);
  const q = useDefinitions(id, offset, true);
  return (
    <section aria-label="Değişmez tanım geçmişi" className="recurrence-defs">
      <h3>Tanım geçmişi</h3>
      {q.isPending && <p role="status">Tanımlar okunuyor…</p>}
      {q.isError && (
        <p role="alert">
          {recurrenceFailure(q.error)}
          <button onClick={() => void q.refetch()}>Tanımları yeniden oku</button>
        </p>
      )}
      {q.data && !q.data.items.length && <p>Bu sayfada tanım yok.</p>}
      <ul className="recurrence-history-list">
        {q.data?.items.map(d => (
          <li key={d.id} className="recurrence-def">
            <strong>Tanım {d.number}</strong>
            <span className="muted">
              {d.effectiveFrom} itibarıyla · {shortSummary(d.rule)}
            </span>
          </li>
        ))}
      </ul>
      <Paging
        noun="tanımlar"
        offset={offset}
        total={q.data?.total ?? 0}
        loading={q.isPending || locked}
        set={setOffset}
      />
    </section>
  );
}

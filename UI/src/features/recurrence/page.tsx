"use client";
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { validTaskId } from "../../components/layout/task-panel-url";
import { useDisplayPreferences } from "../workspace/queries";
import { recurrenceFailure, routineState, shortSummary, weekOrder } from "./model";
import { localToday } from "../preferences/model";

import { useTemplates } from "./queries";
import { WeekStrip } from "./week-strip";
import { Paging } from "./paging";
import { Detail } from "./detail";
import type { Intent } from "./dialog";
import { RecurrenceEmpty } from "./empty-state";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";
const Dialog = lazy(() => import("./dialog").then(m => ({ default: m.RecurrenceDialog })));
export function RecurrencePage() {
  const p = useDisplayPreferences();
  return p.data ? (
    <Board zone={p.data.values.timeZoneId} />
  ) : p.isError ? (
    <p role="alert">
      Tercihler okunamadı.<button onClick={() => void p.refetch()}>Tercihleri yeniden oku</button>
    </p>
  ) : (
    <ListSkeleton label="Rutin hazırlanıyor…" rows={3} />
  );
}
function Board({ zone }: { zone: string }) {
  const params = useSearchParams();
  const requested = params.get("templateId");
  const [selected, setSelected] = useState<string | null>(() => (validTaskId(requested ?? "") ? requested : null)),
    [offset, setOffset] = useState(0),
    [intent, setIntent] = useState<Intent | null>(null);
  const [seenRequest, setSeenRequest] = useState(requested);
  if (seenRequest !== requested) {
    setSeenRequest(requested);
    setSelected(validTaskId(requested ?? "") ? requested : null);
  }
  const q = useTemplates(offset);
  const today = localToday(zone);
  const empty = q.isSuccess && Number(q.data.total) === 0 && !offset && !selected;
  return (
    <div className="recurrence-wrap">
      <div className={`recurrence-board${empty ? " is-empty" : ""}`}>
        <section aria-label="Tekrar şablonları">
          {!empty && (
            <div className="actions recurrence-top">
              <h2 className="sr-only">Serilerin</h2>
              <button
                className="primary"
                disabled={!!intent}
                onClick={e => setIntent({ action: "create", trigger: e.currentTarget })}
              >
                Rutin oluştur
              </button>
            </div>
          )}
          {q.isPending && <p role="status">Şablonlar okunuyor…</p>}
          {q.isError && <p role="alert">{recurrenceFailure(q.error)}</p>}
          {empty && (
            <RecurrenceEmpty
              locked={!!intent}
              create={(trigger, starter) => setIntent({ action: "create", trigger, starter })}
            />
          )}
          <ul className="recurrence-cards">
            {q.data?.items.map(t => {
              const days =
                t.rule.frequency === "Daily"
                  ? weekOrder
                  : t.rule.frequency === "Weekly"
                    ? (t.rule.weekDays ?? []).map(Number)
                    : null;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className="recurrence-card"
                    disabled={!!intent}
                    aria-pressed={selected === t.id}
                    aria-label={`${t.task.title} serisini aç`}
                    onClick={() => setSelected(t.id)}
                  >
                    {days && <WeekStrip days={days} />}
                    <span className="recurrence-card-text">
                      <strong>{t.task.title}</strong>
                      <span className="muted">{shortSummary(t.rule)}</span>
                    </span>
                    <span className={`recurrence-state${routineState(t, today) === "Etkin" ? "" : " off"}`}>
                      {routineState(t, today)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Paging
            noun="şablonlar"
            offset={offset}
            total={q.data?.total ?? 0}
            loading={q.isPending || !!intent}
            set={setOffset}
          />
        </section>
        {selected && <Detail key={selected} id={selected} open={setIntent} locked={!!intent} />}
        {intent && (
          <Suspense fallback={<p role="status">Tekrar formu açılıyor…</p>}>
            <Dialog intent={intent} zone={zone} close={() => setIntent(null)} created={setSelected} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

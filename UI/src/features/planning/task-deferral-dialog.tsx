"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { useToast } from "../../components/ui/toast";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { shiftDate } from "../../lib/time/date-only";
import { useSession } from "../auth/provider";
import { localToday, validDate } from "../preferences/model";
import { isOffline, offlineWrite } from "../tasks/model";
import { useWork } from "../work/coordinator";
import { useDialogGuard } from "../work/draft-guard";
import { entryFacts, orderEntries } from "./day-plan";
import { planFailure, type Day } from "./model";
import { useOverviewDay, useOverviewItems, useOverviewSchedules } from "./overview-queries";
import { readTaskDeferral, type TaskDeferralBody, type TaskDeferralResult } from "./task-deferral-model";
import "./day-tools.css";

type Command = {
  body: TaskDeferralBody;
  execute: (options?: { retryUnknownResult?: boolean }) => Promise<TaskDeferralResult>;
};
export function TaskDeferralDialog({ day, trigger, close }: { day: Day; trigger: HTMLElement; close: () => void }) {
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const client = useQueryClient(),
    toast = useToast(),
    work = useWork(),
    id = useId();
  const source = useOverviewDay(day.localDate),
    blocks = useOverviewSchedules(day.localDate),
    items = useOverviewItems(day.localDate);
  const version = useRef(day.planningVersion),
    sending = useRef(false);
  const [dates, setDates] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [unknown, setUnknown] = useState<Command | null>(null),
    [blocked, setBlocked] = useState(false);
  const guard = useDialogGuard({ dirty: false, pending: busy, close, trigger, message: "Erteleme tamamlanıyor." });
  const minimum = shiftDate(day.localDate, 1);
  const tomorrow = shiftDate(localToday(day.timeZoneId), 1);
  const defaultDate = minimum > tomorrow ? minimum : tomorrow;
  const { timed, untimed } = orderEntries(
    blocks.data?.items.filter(x => x.state === "Planned") ?? [],
    items.data?.items ?? [],
  );
  const recurring = new Set([...blocks.recurringTaskIds, ...items.recurringTaskIds]);
  const tasks = new Map<string, { title: string; parent: string | null; reason: string }>();
  for (const entry of [...timed, ...untimed]) {
    const facts = entryFacts(entry);
    if (facts.done || !facts.taskId) continue;
    const reason = recurring.has(facts.taskId)
      ? "Rutin görevi · Ertelenemez"
      : work.work?.state === "Running" && work.work.taskId === facts.taskId
        ? "Şu an çalışılıyor"
        : entry.kind === "block" && (entry.block.isFixed || entry.block.isLocked)
          ? "Sabit veya kilitli plan"
          : "";
    const previous = tasks.get(facts.taskId);
    tasks.set(facts.taskId, { title: facts.title, parent: facts.parent, reason: previous?.reason || reason });
  }
  const locked = busy || !!unknown || blocked;
  const selected = Object.entries(dates);
  const loaded = !!blocks.data && !!items.data;
  function refresh() {
    if (!current()) return;
    for (const resource of [
      "day-overview",
      "plan-day",
      "plan-blocks",
      "day-items",
      "plan-glance",
      "plan-revisions",
      "calendar-items",
      "calendar-overview",
      "calendar-range",
      "calendar-day",
    ])
      void client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) });
  }
  async function run(command: Command, retry = false) {
    if (sending.current || !current()) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    sending.current = true;
    setBusy(true);
    setFailure("");
    try {
      readTaskDeferral(await command.execute({ retryUnknownResult: retry }), command.body);
      if (!current()) return;
      setUnknown(null);
      close();
      refresh();
      toast({ text: "Seçtiğin görevler ertelendi." });
    } catch (error) {
      if (!current()) return;
      setFailure(
        error instanceof ApiError && error.code === "defer_recurring_task"
          ? "Rutin görevleri ertelenemez. Hiçbir görev taşınmadı."
          : error instanceof ApiError &&
              ["defer_schedule_protected", "defer_work_running", "pool_work_running"].includes(error.code ?? "")
            ? "Sabit, kilitli veya çalışan görev korunuyor. Hiçbir görev taşınmadı."
            : planFailure(error),
      );
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUnknown(command);
      else {
        setUnknown(null);
        if (error instanceof ApiError && [404, 409].includes(error.status)) setBlocked(true);
      }
    } finally {
      sending.current = false;
      if (current()) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      locked ||
      !loaded ||
      !selected.length ||
      selected.length > 50 ||
      source.isError ||
      blocks.isError ||
      items.isError
    )
      return;
    if (
      selected.some(
        ([taskId, date]) => !validDate(date) || date < minimum || !tasks.has(taskId) || tasks.get(taskId)!.reason,
      )
    ) {
      setFailure("Seçtiğin görevleri ve tarihlerini kontrol et.");
      return;
    }
    const body: TaskDeferralBody = {
      tasks: selected.map(([taskId, targetDate]) => ({ taskId, targetDate })),
      expectedPlanningVersion: version.current,
    };
    const command = session.api.mutation("/api/calendar/days/{date}/defer-tasks", "post", {
      path: { date: day.localDate },
      body,
    });
    void run({ body, execute: command.execute });
  }
  return (
    <Surface title="Görev Ertele" modal returnTo={trigger} onClose={guard.requestClose} closeDisabled={busy}>
      <form className="day-defer" onSubmit={submit}>
        <p className="muted">Ertelemek istediğin görevleri ve tarihlerini seç.</p>
        {!loaded && !blocks.isError && !items.isError && <p role="status">Bitmemiş görevler okunuyor…</p>}
        {(blocks.isError || items.isError || source.isError) && (
          <p role="alert">
            Görevler okunamadı.{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void blocks.refetch();
                void items.refetch();
              }}
            >
              Yeniden yükle
            </button>
          </p>
        )}
        {loaded && !tasks.size && <p>Bu gün için ertelenecek bitmemiş görev yok.</p>}
        <ul className="day-defer-list">
          {[...tasks].map(([taskId, task], i) => {
            const checked = Object.hasOwn(dates, taskId),
              field = `${id}-${i}`;
            return (
              <li key={taskId} className={checked ? "selected" : ""}>
                <input
                  id={field}
                  type="checkbox"
                  checked={checked}
                  disabled={locked || !!task.reason || (!checked && selected.length >= 50)}
                  onChange={event => {
                    const check = event.target.checked;
                    setDates(previous => {
                      const next = { ...previous };
                      if (check) next[taskId] = defaultDate;
                      else delete next[taskId];
                      return next;
                    });
                  }}
                />
                <label htmlFor={field} className="day-defer-task">
                  {task.parent && <span className="muted">{task.parent} ›</span>}
                  <strong>{task.title}</strong>
                  {task.reason && <small>{task.reason}</small>}
                </label>
                <label className="day-defer-date">
                  <span className="sr-only">{task.title} için tarih</span>
                  <TemporalInput
                    type="date"
                    min={minimum}
                    max="9998-12-31"
                    value={dates[taskId] ?? defaultDate}
                    disabled={!checked || locked}
                    onChange={event => setDates(previous => ({ ...previous, [taskId]: event.target.value }))}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        {(blocks.hasMore || items.hasMore) && (
          <button
            type="button"
            disabled={locked || blocks.loadingMore || items.loadingMore}
            onClick={() => {
              if (blocks.hasMore) blocks.loadMore();
              if (items.hasMore) items.loadMore();
            }}
          >
            Diğer görevleri göster
          </button>
        )}
        {failure && (
          <p className="field-error" role="alert">
            {failure}
          </p>
        )}
        {blocked && <p>Plan değişmiş olabilir. Pencereyi yeniden açıp güncel görevleri seç.</p>}
        {unknown && <p role="status">İşlem sonucu alınamadı. Aynı işlem kimliğiyle sonucu alabilirsin.</p>}
        <div className="day-tools-footer">
          {unknown ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void run(unknown, true)}>
              Sonucu güvenle al
            </button>
          ) : (
            <button
              type="submit"
              className="primary"
              disabled={locked || !loaded || !selected.length || blocks.isError || items.isError || source.isError}
              aria-busy={busy}
            >
              {busy ? "Erteleniyor…" : "Ertele"}
            </button>
          )}
        </div>
      </form>
    </Surface>
  );
}

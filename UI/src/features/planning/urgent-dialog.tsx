"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "../../lib/api/generated/schema";
import { Surface } from "../../components/ui/surface";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import { useDisplayPreferences } from "../workspace/queries";
import { localToday } from "../preferences/model";
import { TaskPicker, type PickerRow, type NewTaskFields } from "../tasks/picker";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { readDay, readDayItem } from "./model";
import { dayFailure } from "./day-actions";

type Result = components["schemas"]["PlanEntryResult"];
type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Result> };

export function UrgentDialog({
  trigger,
  close,
  date: requested,
}: {
  trigger: HTMLElement;
  close: () => void;
  date?: string;
}) {
  const { session, state } = useSession();
  const client = useQueryClient(),
    prefs = useDisplayPreferences();
  const date = requested ?? (prefs.data ? localToday(prefs.data.values.timeZoneId) : null);
  const [pending, setPending] = useState(false),
    [failure, setFailure] = useState(""),
    [unknown, setUnknown] = useState<Command | null>(null);
  const busy = useRef(false);
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
  const guard = useDialogGuard({
    dirty: !!unknown,
    pending,
    close,
    trigger,
    message:
      "Eklemeye ait yanıt alınamadı; iş kaydedilmiş olabilir. Gün planını kontrol etmeden ayrılmak istiyor musun?",
  });
  async function send(command: Command, retry = false) {
    const result = await command.execute({ retryUnknownResult: retry });
    const item = readDayItem(result.item, date!);
    if (!item.isUrgent || !item.startsAt || item.endsAt != null)
      throw new ApiError("protocol", "Acil plan öğesi doğrulanamadı.");
    if (!current()) return false;
    guard.markSaved();
    close();
    void Promise.all(
      [
        "day-overview",
        "day-items",
        "plan-day",
        "plan-glance",
        "plan-revisions",
        "calendar-items",
        "calendar-overview",
        "calendar-range",
        "task-tree",
        "tasks",
        "task-picker",
      ].map(name => client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) })),
    );
    return true;
  }
  async function add(row: PickerRow | string, fields?: NewTaskFields) {
    if (busy.current || !date || unknown) return false;
    busy.current = true;
    setPending(true);
    setFailure("");
    let command: Command | null = null;
    try {
      const day = readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
      if (!current()) return false;
      command = session.api.mutation("/api/daily-plans/{date}/entries", "post", {
        path: { date },
        body: {
          ...(typeof row === "string" ? { title: row, ...fields } : { taskId: row.id }),
          isUrgent: true,
          expectedPlanningVersion: day.planningVersion,
        },
      });
      return await send(command);
    } catch (error) {
      if (current()) {
        setFailure(dayFailure(error));
        if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUnknown(command);
      }
      return false;
    } finally {
      busy.current = false;
      if (current()) setPending(false);
    }
  }
  async function retry() {
    if (!unknown || busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await send(unknown, true);
    } catch (error) {
      if (current()) setFailure(dayFailure(error));
    } finally {
      busy.current = false;
      if (current()) setPending(false);
    }
  }
  return (
    <Surface
      title="Acil işe geç"
      modal
      initialFocus="field"
      returnTo={trigger}
      closeDisabled={pending}
      onClose={() => {
        if (!busy.current) return guard.requestClose();
        return false;
      }}
    >
      {date ? (
        <TaskPicker
          date={date}
          placeholder="Görev ara veya yeni görev yaz"
          choose={row => add(row)}
          create={add}
          createLabel={title => `“${title}” görevine başla`}
          disabled={pending || !!unknown}
        />
      ) : (
        <p role="status">Gün hazırlanıyor…</p>
      )}
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      {unknown && (
        <button type="button" disabled={pending} onClick={() => void retry()}>
          Aynı eklemeyi güvenle yeniden dene
        </button>
      )}
    </Surface>
  );
}

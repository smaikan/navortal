"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite } from "../tasks/model";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { useToast } from "../../components/ui/toast";
import { planFailure, type Day } from "./model";
import { entryFacts } from "./day-plan";
import { readDeferralResult, type DeferralBody, type DeferralExpectation, type DeferralResult } from "./deferral-model";

type Entry = Parameters<typeof entryFacts>[0];
type Command = {
  execute: (options?: { retryUnknownResult?: boolean }) => Promise<DeferralResult>;
  expected: DeferralExpectation;
};

/** Saatli yer başka saate kopyalanmaz, iptal edilir. Mevcut görev saatsiz olur. */
export function LightenDefer({
  day,
  targetDate,
  entries,
  pending,
  close,
  disabled = false,
}: {
  day: Day;
  targetDate: string;
  entries: Entry[];
  pending: (value: boolean) => void;
  close: () => void;
  disabled?: boolean;
}) {
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const client = useQueryClient(),
    toast = useToast(),
    base = useRef(day.planningVersion),
    sending = useRef(false);
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState<Command | null>(null),
    [blocked, setBlocked] = useState(false),
    [failure, setFailure] = useState("");
  const locked = busy || !!unknown;
  useEffect(() => {
    pending(locked);
    return () => pending(false);
  }, [locked, pending]);
  const selected = entries.map(e => ({
    id: e.kind === "block" ? e.block.id : e.item.id,
    taskId: entryFacts(e).taskId!,
    version: e.kind === "block" ? e.block.version : e.item.version,
    timed: e.kind === "block",
  }));
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
      const result = readDeferralResult(await command.execute({ retryUnknownResult: retry }), command.expected);
      if (!current()) return;
      setUnknown(null);
      close();
      refresh();
      let undoSent = false;
      toast({
        text: "İşler yarının saatsiz planına ayrıldı.",
        action: {
          label: "Geri al",
          run: async () => {
            if (undoSent || !current()) return;
            undoSent = true;
            if (isOffline()) {
              toast({ text: offlineWrite, tone: "error" });
              return;
            }
            try {
              await session.api
                .mutation("/api/day-items/undo", "post", {
                  body: { changeSetId: result.changeSetId, expectedPlanningVersion: result.planningVersion },
                })
                .execute();
              if (current()) toast({ text: "Erteleme geri alındı; önceki plan öğeleri korundu." });
            } catch (error) {
              if (current())
                toast({
                  tone: "error",
                  text:
                    error instanceof ApiError && error.outcomeUnknown
                      ? "Geri alma sonucu alınamadı. Plan geçmişini okuyup kontrol et; istek tekrarlanmadı."
                      : "Plan bu arada değişmiş olabilir. Güncel plan geçmişinden kontrol et.",
                });
            }
            refresh();
          },
        },
      });
    } catch (error) {
      if (!current()) return;
      setFailure(
        error instanceof ApiError &&
          ["defer_schedule_protected", "schedule_protected", "pool_work_running", "defer_work_running"].includes(
            error.code ?? "",
          )
          ? "Sabit, kilitli veya çalışan iş korunuyor. Hiçbir öğe taşınmadı; güncel planı okuyup başka işler seç."
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
  function confirm() {
    if (disabled || sending.current || blocked || locked || !selected.length || selected.length > 50) return;
    const expected: DeferralExpectation = {
      sourceDate: day.localDate,
      targetDate,
      planningVersion: base.current,
      schedules: selected.filter(x => x.timed).map(({ id, taskId, version }) => ({ id, taskId, version })),
      items: selected.filter(x => !x.timed).map(({ id, taskId, version }) => ({ id, taskId, version })),
    };
    const body: DeferralBody = {
      targetDate,
      expectedPlanningVersion: base.current,
      schedules: expected.schedules.map(({ id, version }) => ({ id, version })),
      items: expected.items.map(({ id, version }) => ({ id, version })),
      allowProtectedChange: false,
      reason: "Bugünü hafiflet: yarına ayır",
    };
    const command = session.api.mutation("/api/calendar/days/{date}/defer", "post", {
      path: { date: day.localDate },
      body,
    });
    void run({ execute: command.execute, expected });
  }
  return (
    <section aria-label="Saati iptal ederek erteleme">
      <p>
        {selected.length} iş <time dateTime={targetDate}>{targetDate}</time> gününe saatsiz alınır. Saat tahsisleri
        kaldırılır; görev ve çalışma geçmişi korunur.
      </p>
      {!unknown && (
        <button
          type="button"
          className="primary"
          disabled={disabled || locked || blocked || !selected.length || selected.length > 50}
          aria-busy={busy}
          onClick={confirm}
        >
          {busy ? "Taşınıyor…" : "Seçilmeyenleri yarına ayır"}
        </button>
      )}
      {selected.length > 50 && <p role="alert">Bir işlemde en çok 50 plan öğesi ayırabilirsin.</p>}
      {unknown && (
        <button type="button" className="primary" disabled={busy} onClick={() => void run(unknown, true)}>
          Aynı ertelemeyi güvenle yeniden gönder
        </button>
      )}
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      {blocked && <p>Güncel planı okuyup pencereyi yeniden aç; önceki seçim kendiliğinden uygulanmayacak.</p>}
    </section>
  );
}

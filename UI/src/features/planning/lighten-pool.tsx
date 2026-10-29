"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useResources } from "../collections/queries";
import { useTaskCache } from "../tasks/queries";
import { isOffline, offlineWrite, readTask } from "../tasks/model";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useToast } from "../../components/ui/toast";
import { planFailure, readResult, type Day, type Result } from "./model";

type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Result> };

/** Tek onay, tek atomik sunucu grubu ve korumalı geri alma. Burada görev veya plan hesabı yapılmaz. */
export function LightenPool({
  day,
  taskIds,
  conflict,
  pending,
  close,
}: {
  day: Day;
  taskIds: string[];
  conflict: boolean;
  pending: (value: boolean) => void;
  close: () => void;
}) {
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const baseVersion = useRef(day.planningVersion);
  const client = useQueryClient(),
    cache = useTaskCache(),
    toast = useToast(),
    id = useId();
  const [pool, setPool] = useState(""),
    [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState<Command | null>(null),
    [blocked, setBlocked] = useState(false),
    [failure, setFailure] = useState("");
  const sending = useRef(false),
    locked = busy || !!unknown;
  const pools = useResources("pools", { offset, limit: 25, includeArchived: false });
  const tasks = useQuery({
    queryKey: queryKeys.resource(owner, "lighten-pool-tasks", { ids: taskIds, date: day.localDate }),
    enabled: taskIds.length > 0 && taskIds.length <= 50,
    networkMode: "always",
    queryFn: ({ signal }) =>
      Promise.all(
        taskIds.map(async taskId =>
          readTask(await session.api.read("/api/tasks/{id}", { path: { id: taskId }, signal })),
        ),
      ),
  });
  useEffect(() => {
    pending(locked);
    return () => pending(false);
  }, [locked, pending]);
  function refresh() {
    if (!current()) return;
    void cache.manyChanged();
    for (const name of [
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
      void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
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
      const receipt = readResult(await command.execute({ retryUnknownResult: retry }));
      if (!current()) return;
      setUnknown(null);
      refresh();
      close();
      let undoSent = false;
      toast({
        text: receipt.revisionIds.length
          ? `${taskIds.length} görev havuzda bekliyor; açık plan öğeleri kaldırıldı.`
          : "Görevler zaten bu havuzda; plan değişmedi.",
        action: receipt.revisionIds.length
          ? {
              label: "Geri al",
              run: async () => {
                if (undoSent || !current()) return;
                undoSent = true;
                try {
                  await session.api
                    .mutation("/api/day-items/undo", "post", {
                      body: { changeSetId: receipt.changeSetId, expectedPlanningVersion: receipt.planningVersion },
                    })
                    .execute();
                  if (current()) toast({ text: "Görev havuzları ve plan öğeleri geri alındı." });
                } catch (error) {
                  if (current())
                    toast({
                      tone: "error",
                      text:
                        error instanceof ApiError && error.outcomeUnknown
                          ? "Geri alma sonucu alınamadı. Plan geçmişini okuyup kontrol et; istek tekrarlanmadı."
                          : "Bu arada plan veya görev değişmiş olabilir. Güncel plan geçmişinden kontrol et.",
                    });
                }
                refresh();
              },
            }
          : undefined,
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
        if (error instanceof ApiError && [404, 409].includes(error.status ?? 0)) setBlocked(true);
      }
    } finally {
      sending.current = false;
      if (current()) setBusy(false);
    }
  }
  function submit() {
    if (locked || blocked || conflict || !pool || !tasks.data || taskIds.length > 50) return;
    const command = session.api.mutation("/api/calendar/days/{date}/pool-batch", "post", {
      path: { date: day.localDate },
      body: {
        tasks: tasks.data.map(task => ({ id: task.id, version: task.version })),
        poolId: pool,
        expectedPlanningVersion: baseVersion.current,
        allowProtectedChange: false,
        reason: "Bugünü hafiflet: havuzda beklet",
      },
    });
    void run(command);
  }
  return (
    <section aria-label="Seçilmeyen işleri havuzda beklet">
      <p>
        Seçilen görevlerin gelecekteki saatli tahsisleri ve bu günün açık saatsiz öğeleri tek işlemle kaldırılır.
        Görevler bitmez; gerçek çalışma ve geçmiş korunur. Sonra geri alabilirsin.
      </p>
      {conflict && (
        <p role="alert">
          Aynı görevin bugün tutulacak başka bir öğesi var. Havuza almak için o görevin bütün öğelerindeki seçimi
          kaldır.
        </p>
      )}
      {taskIds.length > 50 && <p role="alert">Bir işlemde en çok 50 farklı görev seçebilirsin.</p>}
      <label htmlFor={`${id}-pool`}>Hedef havuz</label>
      <select
        id={`${id}-pool`}
        value={pool}
        disabled={locked || !pools.data}
        onChange={event => setPool(event.target.value)}
      >
        <option value="">Havuz seç</option>
        {pools.data?.items.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {pools.data && Number(pools.data.total) > 25 && (
        <div className="actions">
          <button type="button" disabled={locked || offset === 0} onClick={() => setOffset(offset - 25)}>
            Önceki havuzlar
          </button>
          <button
            type="button"
            disabled={locked || offset + 25 >= Number(pools.data.total)}
            onClick={() => setOffset(offset + 25)}
          >
            Sonraki havuzlar
          </button>
        </div>
      )}
      {(pools.isError || tasks.isError) && (
        <p role="alert">
          Güncel kayıtlar okunamadı.{" "}
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              void pools.refetch();
              void tasks.refetch();
            }}
          >
            Kayıtları yeniden oku
          </button>
        </p>
      )}
      <p className="muted">Sabit, kilitli veya çalışan bir işe dokunulmaz. Böyle bir tahsis varsa işlem uygulanmaz.</p>
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      {blocked && <p>Güncel planı okuyup bu pencereyi yeniden aç; önceki seçim kendiliğinden uygulanmayacak.</p>}
      {unknown ? (
        <button type="button" className="primary" disabled={busy} onClick={() => void run(unknown, true)}>
          Aynı isteği güvenle yeniden gönder
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={locked || blocked || conflict || !pool || !tasks.data || !taskIds.length || taskIds.length > 50}
          aria-busy={busy}
          onClick={submit}
        >
          {busy ? "Havuzda bekletiliyor…" : "Seçilmeyenleri havuzda beklet"}
        </button>
      )}
    </section>
  );
}

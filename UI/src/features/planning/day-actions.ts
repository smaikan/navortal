"use client";
import { useRef, useState } from "react";
import type { components } from "../../lib/api/generated/schema";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useToast } from "../../components/ui/toast";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite } from "../tasks/model";
import type { NewTaskFields } from "../tasks/picker";
import { readDay, readDayItem, readResult, readSchedule, type Day, type DayItem, type Schedule } from "./model";
import type { DayOverview } from "./overview-model";
import type { Glance } from "./glance";
import { patchGlance, removeEntry, replaceRows, restoreEntry, setEntryDone, type RemovedRow } from "./optimistic";

export type Entry = { kind: "block"; block: Schedule } | { kind: "item"; item: DayItem };
export const entryId = (entry: Entry) => (entry.kind === "block" ? entry.block.id : entry.item.id);

export function dayFailure(error: unknown) {
  if (error instanceof RangeError) return error.message;
  if (!(error instanceof ApiError)) return "İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.";
  if (error.outcomeUnknown)
    return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel planı kontrol et.";
  if (error.kind === "offline" || error.kind === "protocol") return error.message;
  const messages: Record<string, string> = {
    day_item_exists: "Bu görev bu günün planında zaten var.",
    task_not_plannable: "Bu görev plana eklenemez. Bitmiş, arşivlenmiş veya kendi işi olmayan bir görev olabilir.",
    schedule_move_requires_intent:
      "Planlı bir saati gece yarısını geçecek şekilde değiştiremezsin. Öğeyi başka güne taşı veya bitişi gece yarısından önce seç.",
    schedule_range_invalid: "Saat aralığını kontrol et.",
    schedule_protected: "Grubun sabit veya kilitli saatli bir öğesi var. Önce bu öğenin kilidini kaldır.",
  };
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 409) return "Plan başka bir yerde değişti. Güncel planı kontrol edip yeniden seç.";
  if (error.status === 404) return "Bu plan öğesi veya görev artık yok. Güncel planı kontrol et.";
  if (error.status === 400) return "Sunucu bu değeri kabul etmedi. Saatleri kontrol et.";
  return "İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.";
}

/** Gün listesi yazıları sürüm gerektiğinde güncel okumadan başlıyor. Belirsiz sonuç ve çatışma yalnız GET ile uzlaştırılıyor. */
export function useDayActions(date: string, zone: string) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; text: string } | null>(null);
  // Bütün yazılar tek sırada, arka planda gider. Ekran önce değişir; sıra boşalınca bir kez yenilenir.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  const inFlight = useRef(new Set<string>());
  const versions = useRef(new Map<string, DayItem["version"]>());
  const [uncertainCreate, setUncertainCreate] = useState<{
    execute: (options?: { retryUnknownResult?: boolean }) => Promise<components["schemas"]["PlanEntryResult"]>;
  } | null>(null);
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const refresh = () =>
    Promise.all(
      [
        "day-overview",
        "plan-day",
        "plan-blocks",
        "day-items",
        "plan-allocation",
        "tasks",
        "task",
        "task-detail",
        "task-tree",
        "collection-task-tree",
        "collection-workload",
        "analytics",
        "task-picker",
        "plan-glance",
        "calendar-day",
        "calendar-range",
        "calendar-items",
        "calendar-overview",
      ].map(resource => client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) })),
    );
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    waiting.current++;
    const job = queue.current.then(task).finally(() => {
      waiting.current--;
      if (waiting.current === 0) {
        // Sıra boşalınca tek yenileme: sunucudaki gerçek durum arka planda eşitlenir.
        versions.current.clear();
        if (current()) void refresh().catch(() => {});
      }
    });
    queue.current = job.catch(() => undefined);
    return job;
  }
  /** Aynı işlem sürerken tekrar gönderilmez; farklı işlemler sırayla beklemeden kuyruğa girer, tıklama yutulmaz. */
  function run(id: string, action: () => Promise<void>) {
    if (isOffline()) {
      setFailure({ id, text: offlineWrite });
      return Promise.resolve(false);
    }
    if (inFlight.current.has(id)) return Promise.resolve(false);
    inFlight.current.add(id);
    return enqueue(async () => {
      setPending(id);
      setFailure(null);
      try {
        await action();
        return current();
      } catch (error) {
        if (current()) setFailure({ id, text: dayFailure(error) });
        return false;
      } finally {
        inFlight.current.delete(id);
        setPending(null);
      }
    });
  }
  const dayKeys = ["day-overview", "day-overview-page"].map(resource =>
    queryKeys.resource(owner, resource).slice(0, 3),
  );
  const glanceKey = queryKeys.resource(owner, "plan-glance").slice(0, 3);
  /** Devam eden yenileme eski durumu geri yazmasın; sonra değişiklik önbelleğe hemen uygulanır. */
  const patchDay = (change: (overview: DayOverview) => DayOverview, glanceDelta = 0) => {
    for (const key of dayKeys) client.setQueriesData<DayOverview>({ queryKey: key }, old => (old ? change(old) : old));
    if (glanceDelta)
      client.setQueriesData<Glance>({ queryKey: glanceKey }, old => (old ? patchGlance(old, glanceDelta) : old));
  };
  const holdRefetch = () => {
    // Yalnız verisi olan sorgular durdurulur; ilk yüklemesi süren sorgu takılı kalmasın.
    for (const key of [...dayKeys, glanceKey])
      void client.cancelQueries({ queryKey: key, predicate: query => query.state.data !== undefined });
  };
  /** Satırı listeden hemen çıkarır; hata olursa geri koyacak işlevi döndürür. */
  function removeNow(id: string) {
    holdRefetch();
    const saved: { key: readonly unknown[]; removed: RemovedRow }[] = [];
    for (const key of dayKeys)
      for (const [queryKey, data] of client.getQueriesData<DayOverview>({ queryKey: key })) {
        const hit = data ? removeEntry(data, id) : null;
        if (!hit) continue;
        client.setQueryData(queryKey, hit.overview);
        saved.push({ key: queryKey, removed: hit.removed });
      }
    return () => {
      for (const { key, removed } of saved)
        client.setQueryData<DayOverview>(key, old => (old ? restoreEntry(old, removed) : old));
    };
  }
  const cachedPlanningVersion = () =>
    client.getQueryData<DayOverview>(queryKeys.resource(owner, "day-overview", { date }))?.day.planningVersion;
  const fresh = async () => readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
  /** Önbellekteki plan sürümüyle hemen yazar; sürüm çakıştıysa (409) yalnız bir kez güncel okuyup yeniden dener. */
  async function withPlanningVersion<T>(attempt: (version: Day["planningVersion"]) => Promise<T>): Promise<T> {
    const cached = cachedPlanningVersion();
    if (cached !== undefined) {
      try {
        return await attempt(cached);
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "planning_version_conflict")) throw error;
      }
    }
    return attempt((await fresh()).planningVersion);
  }
  const add = (taskId: string, scope: "Single" | "Subtree" = "Single") =>
    run(`add:${taskId}`, () =>
      withPlanningVersion(async planningVersion => {
        const command = session.api.mutation("/api/daily-plans/{date}/entries", "post", {
          path: { date },
          body: { taskId, scope, expectedPlanningVersion: planningVersion },
        });
        try {
          readDayItem((await command.execute()).item, date);
        } catch (error) {
          if (current() && error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol"))
            setUncertainCreate(command);
          throw error;
        }
      }),
    );
  return {
    pending,
    failure,
    clear: () => setFailure(null),
    add,
    uncertainCreate: !!uncertainCreate,
    retryCreate: () =>
      run("add:new", async () => {
        if (!uncertainCreate) return;
        readDayItem((await uncertainCreate.execute({ retryUnknownResult: true })).item, date);
        if (current()) setUncertainCreate(null);
      }),
    async create(title: string, fields?: NewTaskFields) {
      if (uncertainCreate) return false;
      return run("add:new", () =>
        withPlanningVersion(async planningVersion => {
          const command = session.api.mutation("/api/daily-plans/{date}/entries", "post", {
            path: { date },
            body: { title, expectedPlanningVersion: planningVersion, ...fields },
          });
          try {
            readDayItem((await command.execute()).item, date);
          } catch (error) {
            if (current() && error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol"))
              setUncertainCreate(command);
            throw error;
          }
        }),
      );
    },
    /**
     * İyimser: satır ve gün özeti önbellekte hemen değişir, istek arka planda sırayla gider.
     * Hata olursa yalnız bu satırın değişikliği geri alınır ve satırda sebep yazar.
     */
    toggle(entry: Entry, wantDone?: boolean): Promise<boolean> {
      const id = entryId(entry);
      if (isOffline()) {
        setFailure({ id, text: offlineWrite });
        return Promise.resolve(false);
      }
      // Satır, ekranda gördüğü durumun tersini ister; önbellek henüz çizilmediyse bile yön doğru kalır.
      const done = wantDone ?? !(entry.kind === "item" ? entry.item.completedAt : entry.block.completedAt);
      holdRefetch();
      setFailure(null);
      patchDay(old => setEntryDone(old, id, done, new Date().toISOString()), done ? 1 : -1);
      return enqueue(async () => {
        try {
          // Aynı satıra art arda basıldıysa önceki yanıtın güncel sürümü kullanılır.
          const version =
            versions.current.get(id) ?? (entry.kind === "item" ? entry.item.version : entry.block.version);
          const options = { path: { id }, body: { version, completeTask: true } };
          if (entry.kind === "item") {
            const item = readDayItem(
              await (
                done
                  ? session.api.mutation("/api/day-items/{id}/complete", "post", options)
                  : session.api.mutation("/api/day-items/{id}/reopen", "post", options)
              ).execute(),
            );
            versions.current.set(id, item.version);
            patchDay(old => replaceRows(old, { items: [item] }));
          } else {
            const result = await (
              done
                ? session.api.mutation("/api/schedules/{id}/complete", "post", options)
                : session.api.mutation("/api/schedules/{id}/reopen", "post", options)
            ).execute();
            if (!Array.isArray(result?.schedules))
              throw new ApiError("protocol", "Plan yanıtı eksik veya geçersiz. Güncel planı yeniden yükle.");
            const schedules = result.schedules.map(readSchedule);
            for (const schedule of schedules) versions.current.set(schedule.id, schedule.version);
            patchDay(old => replaceRows(old, { schedules }));
          }
          return true;
        } catch (error) {
          if (current()) {
            patchDay(old => setEntryDone(old, id, !done, new Date().toISOString()), done ? -1 : 1);
            setFailure({ id, text: dayFailure(error) });
          }
          return false;
        }
      });
    },
    /** Satır listeden hemen kalkar; istek arka planda gider, hata olursa satır yerine döner. */
    remove(entry: Entry, title: string) {
      const id = entryId(entry);
      if (isOffline()) {
        setFailure({ id, text: offlineWrite });
        return Promise.resolve(false);
      }
      if (inFlight.current.has(id)) return Promise.resolve(false);
      const undoRemove = removeNow(id);
      return run(id, async () => {
        try {
          if (entry.kind === "item") {
            const removed = readDayItem(
              await session.api
                .mutation("/api/day-items/{id}/remove", "post", {
                  path: { id: entry.item.id },
                  body: { version: entry.item.version },
                })
                .execute(),
            );
            const changeSetId = removed.changeSetId;
            if (!changeSetId) throw new ApiError("protocol", "Geri alma kaydı okunamadı. Güncel planı kontrol et.");
            toast({
              text: `Plandan kaldırıldı: ${title}`,
              action: {
                label: "Geri al",
                run: () =>
                  void run(`undo:${changeSetId}`, async () => {
                    const day = await fresh();
                    await session.api
                      .mutation("/api/day-items/undo", "post", {
                        body: { changeSetId, expectedPlanningVersion: day.planningVersion },
                      })
                      .execute();
                  }),
              },
            });
          } else {
            readResult(
              await withPlanningVersion(planningVersion =>
                session.api
                  .mutation("/api/schedules/{id}/remove", "post", {
                    path: { id: entry.block.id },
                    body: {
                      version: entry.block.version,
                      expectedPlanningVersion: planningVersion,
                      allowProtectedChange: true,
                      reason: null,
                    },
                  })
                  .execute(),
              ),
            );
            toast({ text: `Plandan kaldırıldı: ${title}` });
          }
        } catch (error) {
          if (current()) undoRemove();
          throw error;
        }
      });
    },
    /** Başka güne taşınan öğe bu günün listesinden hemen kalkar; hata olursa geri döner. */
    moveItem(item: DayItem, targetDate: string) {
      if (isOffline()) {
        setFailure({ id: item.id, text: offlineWrite });
        return Promise.resolve(false);
      }
      if (inFlight.current.has(item.id)) return Promise.resolve(false);
      const undoMove = removeNow(item.id);
      return run(item.id, async () => {
        try {
          readDayItem(
            await session.api
              .mutation("/api/day-items/{id}/move", "post", {
                path: { id: item.id },
                body: { version: item.version, targetDate },
              })
              .execute(),
          );
          toast({ text: `Başka güne taşındı: ${item.taskTitle}` });
        } catch (error) {
          if (current()) undoMove();
          throw error;
        }
      });
    },
    /** Saatsiz öğe tek işlemde saatliye döner; saatliyse aynı günün saatleri değişir. Çakışma kabul edilir ve gösterilir. */
    setTime(entry: Entry, start: string, end: string) {
      return run(entryId(entry), () =>
        withPlanningVersion(async planningVersion => {
          const { timeRange, partialTimeRange } = await import("./time-range");
          if (entry.kind === "item" && (entry.item.isUrgent || !end)) {
            const range = partialTimeRange(date, zone, start, end);
            readDayItem(
              await session.api
                .mutation("/api/day-items/{id}/time", "put", {
                  path: { id: entry.item.id },
                  body: {
                    version: entry.item.version,
                    expectedPlanningVersion: planningVersion,
                    startsAt: range.startsAt,
                    endsAt: range.endsAt,
                  },
                })
                .execute(),
              date,
            );
            return;
          }
          const range = timeRange(date, zone, start, end);
          const result = readResult(
            entry.kind === "item"
              ? await session.api
                  .mutation("/api/schedules", "post", {
                    body: {
                      localDate: date,
                      taskId: entry.item.taskId,
                      kind: "Work",
                      startsAt: range.startsAt,
                      endsAt: range.endsAt,
                      isFixed: false,
                      isLocked: false,
                      allowConflicts: true,
                      expectedPlanningVersion: planningVersion,
                      reason: null,
                      dayItemId: entry.item.id,
                      dayItemVersion: entry.item.version,
                    },
                  })
                  .execute()
              : await session.api
                  .mutation("/api/schedules/{id}", "put", {
                    path: { id: entry.block.id },
                    body: {
                      version: entry.block.version,
                      expectedPlanningVersion: planningVersion,
                      startsAt: range.startsAt,
                      endsAt: range.endsAt,
                      isFixed: entry.block.isFixed,
                      isLocked: entry.block.isLocked,
                      allowConflicts: true,
                      allowProtectedChange: true,
                      reason: null,
                    },
                  })
                  .execute(),
          );
          if (result.warnings.some(warning => warning.code === "manual_overlap_accepted"))
            toast({ text: "Saat kaydedildi. Başka bir plan öğesiyle çakışıyor." });
        }),
      );
    },
  };
}
export type DayActions = ReturnType<typeof useDayActions>;

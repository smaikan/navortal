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
import { readDay, readDayItem, readResult, readSchedule, type DayItem, type Schedule } from "./model";

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
  const busy = useRef(false);
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
        "task-picker",
        "plan-glance",
        "calendar-day",
        "calendar-range",
        "calendar-items",
        "calendar-overview",
      ].map(resource => client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) })),
    );
  async function run(id: string, action: () => Promise<void>) {
    if (busy.current) return false;
    if (isOffline()) {
      setFailure({ id, text: offlineWrite });
      return false;
    }
    busy.current = true;
    setPending(id);
    setFailure(null);
    try {
      await action();
      if (!current()) return false;
      void refresh().catch(() => {});
      return true;
    } catch (error) {
      if (!current()) return false;
      setFailure({ id, text: dayFailure(error) });
      if (error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status === 404))
        void refresh().catch(() => {});
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  const fresh = async () => readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
  const add = (taskId: string) =>
    run(`add:${taskId}`, async () => {
      readDayItem(
        await session.api
          .mutation("/api/daily-plans/{date}/items", "post", { path: { date }, body: { taskId } })
          .execute(),
        date,
      );
    });
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
      return run("add:new", async () => {
        const day = await fresh();
        const command = session.api.mutation("/api/daily-plans/{date}/entries", "post", {
          path: { date },
          body: { title, expectedPlanningVersion: day.planningVersion, ...fields },
        });
        try {
          readDayItem((await command.execute()).item, date);
        } catch (error) {
          if (current() && error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol"))
            setUncertainCreate(command);
          throw error;
        }
      });
    },
    toggle(entry: Entry) {
      return run(entryId(entry), async () => {
        if (entry.kind === "item") {
          const options = { path: { id: entry.item.id }, body: { version: entry.item.version } };
          readDayItem(
            await (
              entry.item.completedAt
                ? session.api.mutation("/api/day-items/{id}/reopen", "post", options)
                : session.api.mutation("/api/day-items/{id}/complete", "post", options)
            ).execute(),
          );
        } else {
          const options = { path: { id: entry.block.id }, body: { version: entry.block.version } };
          const result = await (
            entry.block.completedAt
              ? session.api.mutation("/api/schedules/{id}/reopen", "post", options)
              : session.api.mutation("/api/schedules/{id}/complete", "post", options)
          ).execute();
          if (!Array.isArray(result?.schedules))
            throw new ApiError("protocol", "Plan yanıtı eksik veya geçersiz. Güncel planı yeniden yükle.");
          result.schedules.forEach(readSchedule);
        }
      });
    },
    remove(entry: Entry, title: string) {
      return run(entryId(entry), async () => {
        if (entry.kind === "item") {
          readDayItem(
            await session.api
              .mutation("/api/day-items/{id}/remove", "post", {
                path: { id: entry.item.id },
                body: { version: entry.item.version },
              })
              .execute(),
          );
          const taskId = entry.item.taskId;
          toast({ text: `Plandan kaldırıldı: ${title}`, action: { label: "Geri al", run: () => void add(taskId) } });
        } else {
          const day = await fresh();
          readResult(
            await session.api
              .mutation("/api/schedules/{id}/remove", "post", {
                path: { id: entry.block.id },
                body: {
                  version: entry.block.version,
                  expectedPlanningVersion: day.planningVersion,
                  allowProtectedChange: true,
                  reason: null,
                },
              })
              .execute(),
          );
          toast({ text: `Plandan kaldırıldı: ${title}` });
        }
      });
    },
    moveItem(item: DayItem, targetDate: string) {
      return run(item.id, async () => {
        readDayItem(
          await session.api
            .mutation("/api/day-items/{id}/move", "post", {
              path: { id: item.id },
              body: { version: item.version, targetDate },
            })
            .execute(),
        );
        toast({ text: `Başka güne taşındı: ${item.taskTitle}` });
      });
    },
    /** Saatsiz öğe tek işlemde saatliye döner; saatliyse aynı günün saatleri değişir. Çakışma kabul edilir ve gösterilir. */
    setTime(entry: Entry, start: string, end: string) {
      return run(entryId(entry), async () => {
        const { timeRange, partialTimeRange } = await import("./time-range");
        const day = await fresh();
        if (entry.kind === "item" && (entry.item.isUrgent || !end)) {
          const range = partialTimeRange(date, zone, start, end);
          readDayItem(
            await session.api
              .mutation("/api/day-items/{id}/time", "put", {
                path: { id: entry.item.id },
                body: {
                  version: entry.item.version,
                  expectedPlanningVersion: day.planningVersion,
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
                    expectedPlanningVersion: day.planningVersion,
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
                    expectedPlanningVersion: day.planningVersion,
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
      });
    },
  };
}
export type DayActions = ReturnType<typeof useDayActions>;

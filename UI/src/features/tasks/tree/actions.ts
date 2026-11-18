"use client";
import { useRef, useState } from "react";
import { useSession } from "../../auth/provider";
import { useToast } from "../../../components/ui/toast";
import { ApiError } from "../../../lib/api/errors";
import { useOptionalWork } from "../../work/coordinator";
import { useTaskCache } from "../queries";
import { offlineWrite as offline, readTask, titleIssue, type Task } from "../model";
import { moveBody, readTreeTask, treeCommandFailure, type Disposition } from "./command-model";
import { completedNow, reopenedNow } from "./optimistic";

const keepDirect = [
  "parent_work_history",
  "parent_has_schedule",
  "parent_budget_conflict",
  "parent_direct_completed",
  "parent_work_decision_required",
];
const failure = (error: unknown) =>
  error instanceof ApiError && error.code === "parent_deleted" ? "Önce üst görevi geri al." : treeCommandFailure(error);

/** Satır eski sayfadan kalabilir. Her komut önce güncel sürümü okur, bir kere gönderir, belirsizi tekrarlamaz ve görev görünümlerini yeniler. Aynı anda tek komut. */
export function useTreeActions() {
  const { session } = useSession();
  const cache = useTaskCache();
  const workState = useOptionalWork();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  const versions = useRef(new Map<string, Task["version"]>());
  const read = async (id: string) => readTreeTask(await session.api.read("/api/tasks/{id}", { path: { id } }));
  async function run<T>(id: string, work: () => Promise<T>): Promise<T | undefined> {
    if (busy.current) return undefined;
    // Yazı sürüm okumasıyla başlıyor olsa da çevrimdışıyken gönderilmediği söylenmeli.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({ text: offline, tone: "error" });
      return undefined;
    }
    busy.current = true;
    setPending(id);
    try {
      const result = await work();
      if (cache.current()) void workState?.refresh();
      await cache.manyChanged();
      return result;
    } catch (error) {
      if (cache.current()) toast({ text: failure(error), tone: "error" });
      // Belirsiz yazı okumayla uzlaştırılır, tekrar gönderilmez. Kesin ret hiçbir şeyi değiştirmedi.
      if (error instanceof ApiError && (error.outcomeUnknown || error.status === 409)) {
        if (cache.current()) void workState?.refresh();
        void cache.manyChanged();
      }
      return undefined;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  /** Satırdaki sürümle hemen gönderir. Sürüm çakışırsa (409) bir kez güncel okuyup yeniden dener; böylece çoğu yazma tek istek. */
  async function state(task: Pick<Task, "id" | "version">, action: "Complete" | "Reopen", version = task.version) {
    const send = (current: Task["version"]) =>
      session.api
        .mutation("/api/tasks/{id}/state", "post", {
          path: { id: task.id },
          body: {
            version: current,
            action,
            parentCompletionChoice: action === "Complete" ? "CompleteSubtree" : null,
            reason: null,
          },
        })
        .execute();
    try {
      return readTask(await send(version));
    } catch (error) {
      if (!(error instanceof ApiError) || error.outcomeUnknown || error.status !== 409) throw error;
      return readTask(await send((await read(task.id)).version));
    }
  }
  /**
   * Bitir / yeniden aç ekranda hemen görünür; istek arka planda sırayla gider ve satırı kilitlemez.
   * Hata olursa satır eski haline döner ve sebep bildirilir. Yenileme sıra boşalınca bir kez yapılır.
   */
  function change(task: Task, action: "Complete" | "Reopen") {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({ text: offline, tone: "error" });
      return Promise.resolve(undefined);
    }
    cache.patch(task.id, row =>
      action === "Complete" ? completedNow(row, new Date().toISOString()) : reopenedNow(row),
    );
    waiting.current++;
    const job = queue.current.then(async (): Promise<Task | undefined> => {
      try {
        // Aynı göreve art arda basıldıysa önceki yanıtın güncel sürümü kullanılır.
        const saved = await state(task, action, versions.current.get(task.id) ?? task.version);
        versions.current.set(task.id, saved.version);
        cache.patch(task.id, () => saved);
        return saved;
      } catch (error) {
        if (cache.current()) {
          cache.patch(task.id, () => task);
          toast({ text: failure(error), tone: "error" });
        }
        return undefined;
      } finally {
        waiting.current--;
        if (waiting.current === 0) {
          versions.current.clear();
          if (cache.current()) {
            void workState?.refresh();
            void cache.manyChanged();
          }
        }
      }
    });
    queue.current = job;
    return job;
  }
  async function restore(deleted: Task) {
    await run(deleted.id, async () =>
      readTask(
        await session.api
          .mutation("/api/tasks/{id}/restore", "post", { path: { id: deleted.id }, body: { version: deleted.version } })
          .execute(),
      ),
    );
  }
  async function move(
    source: Task,
    target: { parentId: string | null; before: string | null },
    version: Task["version"] = source.version,
    fast = true,
  ): Promise<Task> {
    // Hızlı yol: satırdaki sürümlerle hemen yazılır. Sürüm çakışırsa güncel okuyup bir kez yeniden denenir.
    const fresh = fast ? { ...source, version } : await read(source.id);
    const parent = target.parentId
      ? ((fast ? cache.cachedTask(target.parentId) : undefined) ?? (await read(target.parentId)))
      : null;
    const send = (disposition: Disposition) =>
      session.api
        .mutation("/api/tasks/{id}/move", "post", {
          path: { id: fresh.id },
          body: moveBody(fresh, parent, target.before, disposition),
        })
        .execute();
    const preferred: Disposition =
      parent && parent.hasDirectWork && parent.id !== fresh.parentTaskId
        ? parent.directEstimatedSeconds !== null || parent.directWorkCompleted
          ? "PreserveDirect"
          : "ConvertToContainer"
        : "";
    try {
      try {
        return readTask(await send(preferred));
      } catch (error) {
        // Reddedilen dönüşüm yazmadı. Üst görevin kendi işini korumak güvenli ikinci seçenek.
        if (
          preferred === "ConvertToContainer" &&
          error instanceof ApiError &&
          !error.outcomeUnknown &&
          error.code &&
          keepDirect.includes(error.code)
        )
          return readTask(await send("PreserveDirect"));
        throw error;
      }
    } catch (error) {
      if (fast && error instanceof ApiError && !error.outcomeUnknown && error.status === 409)
        return move(source, target, source.version, false);
      throw error;
    }
  }
  /**
   * Taşıma ekranda hemen görünür; istek arka planda sırayla gider ve satırı kilitlemez.
   * Hata olursa satır eski yerine döner ve sebep bildirilir.
   */
  function relocate(source: Task, target: { parentId: string | null; before: string | null }) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({ text: offline, tone: "error" });
      return Promise.resolve(undefined);
    }
    if (target.parentId === source.id || target.before === source.id) {
      toast({ text: "Görevi kendi altına veya kendi önüne taşıyamazsın.", tone: "error" });
      return Promise.resolve(undefined);
    }
    const undoMove = cache.moveRow(source, target);
    waiting.current++;
    const job = queue.current.then(async (): Promise<Task | undefined> => {
      try {
        const saved = await move(source, target, versions.current.get(source.id) ?? source.version);
        versions.current.set(source.id, saved.version);
        cache.patch(source.id, () => saved);
        return saved;
      } catch (error) {
        if (cache.current()) {
          undoMove();
          toast({ text: failure(error), tone: "error" });
        }
        return undefined;
      } finally {
        waiting.current--;
        if (waiting.current === 0) {
          versions.current.clear();
          if (cache.current()) {
            void workState?.refresh();
            void cache.manyChanged();
          }
        }
      }
    });
    queue.current = job;
    return job;
  }
  return {
    pending,
    complete: (task: Task) => change(task, "Complete"),
    reopen: (task: Task) => change(task, "Reopen"),
    remove: async (task: Task) => {
      const deleted = await run(task.id, async () => {
        const fresh = await read(task.id);
        return readTask(
          await session.api
            .mutation("/api/tasks/{id}/delete", "post", { path: { id: task.id }, body: { version: fresh.version } })
            .execute(),
        );
      });
      if (deleted) toast({ text: "Görev silindi", action: { label: "Geri al", run: () => restore(deleted) } });
      return deleted;
    },
    move: (source: Task, target: { parentId: string | null; before: string | null }) => relocate(source, target),
    /** Kök veya alt görev oluşturur. Hata fırlarsa satırdaki metin kalır. */
    add: async (parentId: string | null, title: string) => {
      const issue = titleIssue(title);
      if (issue) throw new Error(issue);
      if (busy.current) throw new Error("Önceki işlem sürüyor.");
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(offline);
      busy.current = true;
      try {
        if (!parentId)
          return readTask(
            await session.api.mutation("/api/tasks", "post", { body: { title: title.trim() } }).execute(),
          );
        const create = async (force: boolean) => {
          const parent = await read(parentId);
          const disposition =
            force || (parent.hasDirectWork && (parent.directEstimatedSeconds !== null || parent.directWorkCompleted))
              ? "PreserveDirect"
              : null;
          return readTask(
            await session.api
              .mutation("/api/tasks/{id}/children", "post", {
                path: { id: parentId },
                body: { title: title.trim(), parentVersion: parent.version, parentWorkDisposition: disposition },
              })
              .execute(),
          );
        };
        try {
          return await create(false);
        } catch (error) {
          if (error instanceof ApiError && !error.outcomeUnknown && error.code === "parent_work_decision_required")
            return await create(true);
          throw error;
        }
      } catch (error) {
        throw new Error(error instanceof Error && !(error instanceof ApiError) ? error.message : failure(error));
      } finally {
        busy.current = false;
        void cache.manyChanged();
      }
    },
  };
}

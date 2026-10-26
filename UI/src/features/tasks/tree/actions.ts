"use client";
import { useRef, useState } from "react";
import { useSession } from "../../auth/provider";
import { useToast } from "../../../components/ui/toast";
import { ApiError } from "../../../lib/api/errors";
import { useOptionalWork } from "../../work/coordinator";
import { useTaskCache } from "../queries";
import { offlineWrite as offline, readTask, titleIssue, type Task } from "../model";
import { moveBody, readTreeTask, treeCommandFailure, type Disposition } from "./command-model";

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
  async function state(task: Pick<Task, "id">, action: "Complete" | "Reopen") {
    const fresh = await read(task.id);
    return readTask(
      await session.api
        .mutation("/api/tasks/{id}/state", "post", {
          path: { id: task.id },
          body: {
            version: fresh.version,
            action,
            parentCompletionChoice: action === "Complete" ? "CompleteSubtree" : null,
            reason: null,
          },
        })
        .execute(),
    );
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
  async function move(source: Task, target: { parentId: string | null; before: string | null }) {
    const fresh = await read(source.id);
    const parent = target.parentId ? await read(target.parentId) : null;
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
  }
  return {
    pending,
    complete: (task: Task) => run(task.id, () => state(task, "Complete")),
    reopen: (task: Task) => run(task.id, () => state(task, "Reopen")),
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
    move: (source: Task, target: { parentId: string | null; before: string | null }) =>
      run(source.id, () => move(source, target)),
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

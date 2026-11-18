"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readPage, readTask, type Task, type TaskQuery } from "./model";
import { mapTasks, planMove, type MoveTarget } from "./tree/optimistic";

export function useTasks(query: TaskQuery, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "tasks", query),
    queryFn: async ({ signal }) => readPage(await session.api.read("/api/tasks", { query, signal })),
    enabled,
    networkMode: "always",
  });
}
export function useTask(id: string, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task", { id }),
    enabled,
    queryFn: async ({ signal }) => readTask(await session.api.read("/api/tasks/{id}", { path: { id }, signal })),
    networkMode: "always",
  });
}
export function useTaskCache() {
  const client = useQueryClient();
  const { session, state } = useSession();
  const owner = state.user!.id;
  const epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const update = async (task?: Task) => {
    if (!current()) return;
    if (task) client.setQueryData(queryKeys.resource(owner, "task", { id: task.id }), task);
    // Durum, ağaç veya ilişki değişikliği başka görevin başlayabilmesini de etkileyebilir.
    await Promise.all(
      [
        "collection-task-tree",
        "collections",
        "analytics",
        "day-items",
        "matrix",
        "matrix-candidates",
        "tasks",
        "task-picker",
        "task-tree",
        "task-work",
        "task-detail",
        "task-components",
        "task-lifecycle-progress",
        "task-relations",
        "task-start",
        "task-ancestors",
        "collection-workload",
        "task-classification",
        "day-overview",
        "plan-day",
        "plan-blocks",
        "plan-allocation",
        "return-context",
        "support-end",
        "recurrence-occurrences",
        "task-recurrence",
      ].map(resource => client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) })),
    );
  };
  /** Görev satırını önbellekte hemen değiştirir. Devam eden okuma eski halini geri yazmasın diye önce durdurulur. */
  const patch = (id: string, change: (task: Task) => Task) => {
    if (!current()) return;
    const treeKey = queryKeys.resource(owner, "task-tree").slice(0, 3);
    void client.cancelQueries({ queryKey: treeKey, predicate: query => query.state.data !== undefined });
    client.setQueriesData({ queryKey: treeKey }, old => mapTasks(old, id, change));
    client.setQueryData<Task>(queryKeys.resource(owner, "task", { id }), old =>
      old && old.id === id ? change(old) : old,
    );
  };
  /** Taşımayı önbellekte hemen uygular. Geri koyma, o sırada başka bir şey değişmediyse eski veriyi yazar. */
  const moveRow = (task: Task, target: MoveTarget) => {
    if (!current()) return () => {};
    const treeKey = queryKeys.resource(owner, "task-tree").slice(0, 3);
    void client.cancelQueries({ queryKey: treeKey, predicate: query => query.state.data !== undefined });
    const patches = planMove(client.getQueriesData({ queryKey: treeKey }), task, target);
    for (const patch of patches) client.setQueryData(patch.key, patch.next);
    return () => {
      for (const patch of patches)
        client.setQueryData(patch.key, (now: unknown) => (now === patch.next ? patch.prev : now));
    };
  };
  /** Önbellekteki görev satırı (varsa). Sürüm için ayrı okuma yapmadan yazmaya başlamak içindir. */
  const cachedTask = (id: string): Task | undefined => {
    const detail = client.getQueryData<Task>(queryKeys.resource(owner, "task", { id }));
    if (detail?.id === id) return detail;
    for (const [, data] of client.getQueriesData({ queryKey: queryKeys.resource(owner, "task-tree").slice(0, 3) })) {
      const pages = (data as { pages?: { items?: Task[] }[] } | undefined)?.pages ?? [data as { items?: Task[] }];
      for (const page of pages) {
        const found = page?.items?.find(item => item.id === id);
        if (found) return found;
      }
    }
    return undefined;
  };
  return {
    current,
    update,
    patch,
    moveRow,
    cachedTask,
    treeChanged: async (task: Task) => {
      if (!current()) return;
      await Promise.all([
        update(task),
        client.invalidateQueries({ queryKey: queryKeys.resource(owner, "task").slice(0, 3) }),
      ]);
    },
    /** Alt ağaç gibi kapsamı bilinmeyen yazıda bütün görev görünümleri yeniden okunur. */ manyChanged: async () => {
      if (!current()) return;
      await Promise.all([
        update(),
        client.invalidateQueries({ queryKey: queryKeys.resource(owner, "task").slice(0, 3) }),
      ]);
    },
  };
}

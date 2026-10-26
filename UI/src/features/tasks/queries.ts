"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readPage, readTask, type Task, type TaskQuery } from "./model";

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
  return {
    current,
    update,
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

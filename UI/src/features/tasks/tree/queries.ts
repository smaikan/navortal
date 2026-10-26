"use client";
import { useTaskRead } from "../read-context";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { readSummary, readTreePage, treePageSize, type TreePage } from "./model";

/** Sınırlı tek sayfa. Sınıflama çocukların ilk sayfasını okumaya devam eder. */
export function useTreePage(kind: "children" | "subtree", id: string | null, offset: number, archived: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-tree", { kind, id, offset, archived }),
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const query = { offset, limit: treePageSize, includeArchived: archived };
      const reply =
        kind === "children"
          ? await session.api.read("/api/tasks/children", {
              query: { ...query, ...(id ? { parentId: id } : {}) },
              signal,
            })
          : await session.api.read("/api/tasks/{id}/subtree", { path: { id: id! }, query, signal });
      const page = readTreePage(reply, offset);
      if (kind === "children" && page.items.some(task => task.parentTaskId !== id))
        throw new Error("Görev ağacının üst bağlantısı tutarsız.");
      return page;
    },
  });
}
/** Daldaki çocuklar kardeş sırasında, bitmiş kökler en yeni önce. Satır özetleri sayfa sayfa gelir. */
export function useBranch(parentId: string | null, completed?: boolean, enabled = true, excludeRecurring = false) {
  const { session, state } = useSession();
  return useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-tree", {
      kind: "branch",
      parentId,
      completed: completed ?? null,
      excludeRecurring,
    }),
    enabled,
    networkMode: "always",
    initialPageParam: 0,
    getNextPageParam: (last: TreePage) =>
      last.hasMore && last.offset + last.limit <= 100000 ? last.offset + last.limit : undefined,
    queryFn: async ({ pageParam, signal }) => {
      const reply = await session.api.read("/api/tasks/children", {
        query: {
          offset: pageParam,
          limit: treePageSize,
          excludeRecurring,
          ...(parentId ? { parentId } : {}),
          ...(completed === undefined ? {} : { completed }),
        },
        signal,
      });
      const page = readTreePage(reply, pageParam);
      if (page.items.some(task => task.parentTaskId !== parentId))
        throw new Error("Görev ağacının üst bağlantısı tutarsız.");
      return page;
    },
  });
}
export function useTaskSummary(id: string, enabled = true) {
  const { session, state } = useSession();
  const detail = useTaskRead();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-tree", { kind: "summary", id }),
    enabled: enabled && detail?.view.task.id !== id,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      detail?.view.task.id === id
        ? (await detail.refresh()).rowSummary
        : readSummary(await session.api.read("/api/tasks/{id}/summary", { path: { id }, signal })),
  });
}

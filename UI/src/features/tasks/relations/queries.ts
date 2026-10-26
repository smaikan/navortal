"use client";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { ApiError } from "../../../lib/api/errors";
import { type Task } from "../model";
import { readRelationPage, readStartDecision, relationPageSize, type RelationKind } from "./model";
import { readAncestorPage, type TaskAncestorPage } from "../read-model";

export function useRelations(kind: RelationKind, id: string, offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-relations", { kind, id, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const options = { path: { id }, query: { offset, limit: relationPageSize }, signal };
      const page =
        kind === "dependencies"
          ? await session.api.read("/api/tasks/{id}/dependencies", options)
          : await session.api.read("/api/tasks/{id}/ordering", options);
      return readRelationPage(page, kind, id, offset);
    },
  });
}
export function useStartDecision(id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-start", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readStartDecision(await session.api.read("/api/tasks/{id}/start-eligibility", { path: { id }, signal }), id),
  });
}
/** Sayfa başına hesaba özel sınırlı HTTP okuması, sürüme bağlı kapalı sunucu imleci var. */
export function useAncestors(task: Pick<Task, "id" | "parentTaskId">, enabled: boolean) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const key = queryKeys.resource(state.user!.id, "task-ancestors", { id: task.id, parent: task.parentTaskId });
  return useInfiniteQuery({
    queryKey: key,
    enabled: enabled && task.parentTaskId !== null,
    networkMode: "always",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: TaskAncestorPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const value = readAncestorPage(
        await session.api.read("/api/tasks/{id}/ancestors", {
          path: { id: task.id },
          query: { limit: 16, cursor: pageParam },
          signal,
        }),
        task.id,
      );
      const previous = pageParam
        ? client.getQueryData<InfiniteData<TaskAncestorPage>>(key)?.pages.find(p => p.nextCursor === pageParam)
        : undefined;
      if (
        previous &&
        (String(previous.planningVersion) !== String(value.planningVersion) ||
          previous.items.at(-1)?.parentTaskId !== value.items[0]?.id)
      )
        throw new ApiError("protocol", "Üst görev sayfaları aynı yola ait değil. Yolu yeniden yükle.");
      return value;
    },
  });
}

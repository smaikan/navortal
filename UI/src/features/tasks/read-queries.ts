"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readTaskDetail } from "./read-model";

export function useTaskDetail(id: string) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id;
  return useQuery({
    queryKey: queryKeys.resource(owner, "task-detail", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const view = readTaskDetail(await session.api.read("/api/tasks/{id}/detail-view", { path: { id }, signal }), id);
      signal.throwIfAborted();
      // Yalnız tam sunucu görünümleri kullanılır. Seçili ad ve kısa üst görev tam kaynak önbelleğine girmez.
      client.setQueryData(queryKeys.resource(owner, "task", { id }), view.task);
      client.setQueryData(queryKeys.resource(owner, "task-tree", { kind: "summary", id }), view.rowSummary);
      client.setQueryData(queryKeys.resource(owner, "task-work", { id }), {
        summary: view.workload,
        time: view.time,
        progress: view.progress,
      });
      client.setQueryData(queryKeys.resource(owner, "task-classification", { id }), view.classification);
      return view;
    },
  });
}

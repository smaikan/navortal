"use client";
import { useTaskRead } from "../read-context";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { readComponents, readProgress, readSummary, readTime } from "./model";
export function useWorkReport(id: string) {
  const { session, state } = useSession();
  const detail = useTaskRead();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-work", { id }),
    enabled: detail?.view.task.id !== id,
    networkMode: "always",
    queryFn: async ({ signal }) => {
      if (detail?.view.task.id === id) {
        const view = await detail.refresh();
        return { summary: view.workload, time: view.time, progress: view.progress };
      }
      const path = { id };
      const [summary, time, progress] = await Promise.all([
        session.api.read("/api/tasks/{id}/workload", { path, signal }),
        session.api.read("/api/tasks/{id}/time", { path, signal }),
        session.api.read("/api/tasks/{id}/progress", { path, signal }),
      ]);
      return { summary: readSummary(summary, id), time: readTime(time, id), progress: readProgress(progress, id) };
    },
  });
}
export function useWorkComponents(id: string, offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-components", { id, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readComponents(
        await session.api.read("/api/tasks/{id}/work-components", {
          path: { id },
          query: { offset, limit: 25 },
          signal,
        }),
        offset,
      ),
  });
}

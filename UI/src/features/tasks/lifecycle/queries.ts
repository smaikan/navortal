"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { readProgress } from "../work/model";
export function useCompletionScope(id: string, enabled: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-lifecycle-progress", { id }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readProgress(await session.api.read("/api/tasks/{id}/progress", { path: { id }, signal }), id),
  });
}

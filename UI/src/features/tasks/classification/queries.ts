"use client";
import { useTaskRead } from "../read-context";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { readClassification } from "./model";

export function useClassification(id: string) {
  const { session, state } = useSession();
  const detail = useTaskRead();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-classification", { id }),
    enabled: detail?.view.task.id !== id,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      detail?.view.task.id === id
        ? (await detail.refresh()).classification
        : readClassification(await session.api.read("/api/tasks/{id}/classification", { path: { id }, signal }), id),
  });
}

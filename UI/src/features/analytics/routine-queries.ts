"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import type { View } from "./period";
import { readRoutineDetail, readRoutineReport } from "./routine-model";

export function useRoutineReport(view: View, limit: number) {
  const { session, state } = useSession();
  const { fromDate, toDate, previous } = view;
  const compareFromDate = previous?.fromDate,
    compareToDate = previous?.toDate;
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", {
      kind: "routines",
      fromDate,
      toDate,
      compareFromDate,
      compareToDate,
      limit,
    }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readRoutineReport(
        await session.api.read("/api/analytics/recurrences", {
          query: { fromDate, toDate, compareFromDate, compareToDate, offset: 0, limit },
          signal,
        }),
        { fromDate, toDate },
      ),
  });
}
export function useRoutineDetail(id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", { kind: "routine", id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readRoutineDetail(await session.api.read("/api/analytics/recurrences/{id}", { path: { id }, signal }), id),
  });
}

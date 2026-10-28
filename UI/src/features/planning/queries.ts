"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { dayItemLimit, pageSize, readAllocation, readDay, readDayItems, readSchedules } from "./model";
import { dayWindow } from "./time-model";

export function useDay(date: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-day", { date }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readDay(await session.api.read("/api/daily-plans/{date}", { path: { date }, signal }), date),
  });
}
export function useSchedules(date: string, zone: string, offset: number, limit = pageSize) {
  const { session, state } = useSession();
  const window = useMemo(() => dayWindow(date, zone), [date, zone]);
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-blocks", { date, zone, offset, limit }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSchedules(
        await session.api.read("/api/schedules", {
          query: { From: window.from, To: window.to, Offset: offset, Limit: limit },
          signal,
        }),
        limit,
      ),
  });
}
/** Saatsiz gün öğelerinden sınırlı tek sayfa. */
export function useDayItems(date: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "day-items", { date }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readDayItems(
        await session.api.read("/api/daily-plans/{date}/items", {
          path: { date },
          query: { Offset: 0, Limit: dayItemLimit },
          signal,
        }),
        date,
      ),
  });
}
export function useAllocation(id: string, from: string, to: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-allocation", { id, from, to }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readAllocation(
        await session.api.read("/api/tasks/{id}/allocation", { path: { id }, query: { From: from, To: to }, signal }),
        id,
      ),
  });
}

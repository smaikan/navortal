"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { queryKeys } from "../../lib/api/query-client";
import { readSupportDay } from "./model";
export function useSupportDay(date: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "support-day", { date }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSupportDay(await session.api.read("/api/support/days/{date}", { path: { date }, signal }), date),
  });
}
export function usePreparation(date: string, offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "support-end", { date, offset }),
    staleTime: 0,
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const [decoder, value] = await Promise.all([
        import("./preparation-model"),
        session.api.read("/api/support/days/{date}/end-preparation", {
          path: { date },
          query: { offset, limit: 25 },
          signal,
        }),
      ]);
      return decoder.readPreparation(value, date, offset);
    },
  });
}
export function useSupportCache() {
  const tasks = useTaskCache();
  const { state } = useSession();
  const client = useQueryClient();
  return {
    current: tasks.current,
    changed: () => {
      if (!tasks.current()) return;
      void tasks.manyChanged();
      for (const r of [
        "day-overview",
        "support-day",
        "support-end",
        "calendar-day",
        "calendar-range",
        "calendar-overview",
      ])
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, r).slice(0, 3) });
    },
  };
}

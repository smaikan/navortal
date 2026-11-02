"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readOccurrences, readPage } from "./model";

export function useSpecialDays(offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "special-days", { offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPage(
        await session.api.read("/api/special-days", { query: { Offset: offset, Limit: pageSize }, signal }),
        offset,
      ),
  });
}
/** En fazla 366 günlük aralık veya tek gün için bir okuma. SpecialDayChanged yeniler. */
export function useOccurrences(from: string, to: string, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "special-day-occurrences", { from, to }),
    networkMode: "always",
    enabled,
    queryFn: async ({ signal }) =>
      readOccurrences(
        await session.api.read("/api/special-days/occurrences", { query: { fromDate: from, toDate: to }, signal }),
        from,
        to,
      ),
  });
}

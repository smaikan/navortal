"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readActual, readBreakdown, type Filters } from "./model";
import type { Range } from "./period";
export function useActual(range: Range | null, bucket: Filters["bucket"]) {
  const { session, state } = useSession();
  const { fromDate = "", toDate = "" } = range ?? {};
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", { kind: "actual", fromDate, toDate, bucket }),
    enabled: !!range,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readActual(await session.api.read("/api/analytics/actual", { query: { fromDate, toDate, bucket }, signal }), {
        fromDate,
        toDate,
        bucket,
      }),
  });
}
export function useBreakdown(range: Range, dimension: Filters["dimension"], offset: number) {
  const { session, state } = useSession();
  const { fromDate, toDate } = range;
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", {
      kind: "breakdown",
      fromDate,
      toDate,
      dimension,
      offset,
    }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readBreakdown(
        await session.api.read("/api/analytics/actual/breakdown", {
          query: { fromDate, toDate, dimension, offset, limit: pageSize },
          signal,
        }),
        { fromDate, toDate, dimension, offset },
      ),
  });
}

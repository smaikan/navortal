"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readPlan, readReview, readSuggestion, type PlanFilters } from "./plan-model";
export function usePlanReport(f: PlanFilters) {
  const { session, state } = useSession();
  const { fromDate, toDate, startToleranceSeconds, reviewDate } = f;
  const report = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", {
      kind: "plans",
      fromDate,
      toDate,
      startToleranceSeconds,
    }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPlan(
        await session.api.read("/api/analytics/plans", { query: { fromDate, toDate, startToleranceSeconds }, signal }),
        f,
      ),
  });
  const review = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", {
      kind: "review",
      date: reviewDate,
      startToleranceSeconds,
    }),
    enabled: !!reviewDate,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readReview(
        await session.api.read("/api/analytics/days/{date}/review", {
          path: { date: reviewDate! },
          query: { startToleranceSeconds },
          signal,
        }),
        reviewDate!,
      ),
  });
  return { report, review };
}
export function useEstimateSuggestion(f: PlanFilters) {
  const { session, state } = useSession();
  const { fromDate, toDate, suggestionTask: taskId } = f;
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "analytics", { kind: "suggestion", fromDate, toDate, taskId }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSuggestion(
        await session.api.read("/api/analytics/estimate-suggestion", {
          query: { fromDate, toDate, taskId: taskId! },
          signal,
        }),
        f,
      ),
  });
}

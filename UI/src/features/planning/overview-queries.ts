"use client";
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readOverview, type DayOverview } from "./overview-model";
import { ApiError } from "../../lib/api/errors";

function useOverviewPart<T>(date: string, select: (value: DayOverview) => T) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id;
  return useQuery({
    queryKey: queryKeys.resource(owner, "day-overview", { date }),
    networkMode: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    select,
    queryFn: async ({ signal }) => {
      const value = readOverview(
        await session.api.read("/api/daily-plans/{date}/overview", { path: { date }, signal }),
        date,
      );
      signal.throwIfAborted();
      // Tam sunucu görünümleri küçük bağımsız parçalara başlangıç verir. Eksik DTO önbelleğe girmez.
      client.setQueryData(queryKeys.resource(owner, "plan-glance", { date }), value.glance);
      client.setQueryData(queryKeys.resource(owner, "support-day", { date }), value.support);
      return value;
    },
  });
}
const day = (value: DayOverview) => value.day;
const support = (value: DayOverview) => value.support;
export const useOverviewSupport = (date: string) => useOverviewPart(date, support);
const whole = (value: DayOverview) => value;
export const useOverviewDay = (date: string) => useOverviewPart(date, day);
function useOverviewRows<K extends "timed" | "untimed">(date: string, kind: K) {
  const initial = useOverviewPart(date, whole);
  const { session, state } = useSession();
  const owner = state.user!.id;
  const [request, setRequest] = useState({ date, owner, count: 0 });
  const wanted = request.date === date && request.owner === owner ? request.count : 0;
  const client = useQueryClient();
  const first = initial.data?.[kind];
  const version = initial.data?.versions.planning;
  const pages = useQueries({
    queries: Array.from({ length: wanted }, (_, i) => {
      const offset = (i + 1) * 100;
      const scope =
        kind === "timed"
          ? { scheduleOffset: offset, scheduleLimit: 100, itemOffset: 0, itemLimit: 1 }
          : { scheduleOffset: 0, scheduleLimit: 1, itemOffset: offset, itemLimit: 100 };
      return {
        queryKey: queryKeys.resource(state.user!.id, "day-overview-page", {
          date,
          kind,
          offset,
          version: String(version),
        }),
        placeholderData: () =>
          client
            .getQueryCache()
            .findAll({
              predicate: q => {
                const f = q.queryKey[3] as { date?: string; kind?: string; offset?: number } | undefined;
                return (
                  q.queryKey[0] === "user" &&
                  q.queryKey[1] === state.user!.id &&
                  q.queryKey[2] === "day-overview-page" &&
                  f?.date === date &&
                  f.kind === kind &&
                  f.offset === offset &&
                  !!q.state.data
                );
              },
            })
            .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state.data as DayOverview | undefined,
        enabled: !!first && offset < Number(first.total),
        networkMode: "always" as const,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const page = readOverview(
            await session.api.read("/api/daily-plans/{date}/overview", {
              path: { date },
              query: {
                ScheduleOffset: scope.scheduleOffset,
                ScheduleLimit: scope.scheduleLimit,
                ItemOffset: scope.itemOffset,
                ItemLimit: scope.itemLimit,
              },
              signal,
            }),
            date,
            scope,
          );
          if (String(page.versions.planning) !== String(version))
            throw new ApiError(
              "http",
              "Gün planı değişti. Devam etmeden önce planı yeniden yükle.",
              409,
              "planning_version_conflict",
            );
          return page;
        },
      };
    }),
  });
  // Bu görünüm verisi, önbellekte gerçek sınırlı sunucu sayfasının üstüne yazılmaz.
  const rows = first ? [...first.items] : [];
  const recurringTaskIds = new Set(initial.data?.recurringTaskIds ?? []);
  for (const page of pages) {
    if (!page.data) break;
    rows.push(...page.data[kind].items);
    page.data.recurringTaskIds.forEach(id => recurringTaskIds.add(id));
  }
  const failure = pages.find(p => p.isError);
  const loadingMore = pages.some(p => p.isFetching);
  return {
    ...initial,
    recurringTaskIds,
    data: first
      ? {
          items: rows as DayOverview[K]["items"],
          total: first.total,
          completedItemCount: initial.data!.glance.completedItemCount,
        }
      : undefined,
    isError: initial.isError || !!failure,
    error: initial.error ?? failure?.error ?? null,
    loadingMore,
    hasMore: !!first && rows.length < Number(first.total),
    loadMore: () => {
      if (!loadingMore && !failure)
        setRequest(previous => ({
          date,
          owner,
          count: previous.date === date && previous.owner === owner ? previous.count + 1 : 1,
        }));
    },
    refetch: () => Promise.allSettled([initial.refetch(), ...pages.filter(p => p.isEnabled).map(p => p.refetch())]),
  };
}
export const useOverviewSchedules = (date: string) => useOverviewRows(date, "timed");
export const useOverviewItems = (date: string) => useOverviewRows(date, "untimed");

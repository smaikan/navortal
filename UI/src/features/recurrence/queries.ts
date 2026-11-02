"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readTemplate, readDefinition, readOccurrence, readPage, windowDates } from "./model";
export function useTemplates(offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "recurrence", { offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPage(
        await session.api.read("/api/recurrence-templates", { query: { offset, limit: pageSize }, signal }),
        offset,
        t => readTemplate(t),
        t => t.id,
      ),
  });
}
export function useTemplate(id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "recurrence-detail", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readTemplate(await session.api.read("/api/recurrence-templates/{id}", { path: { id }, signal }), id),
  });
}
export function useDefinitions(id: string, offset: number, enabled: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "recurrence-definitions", { id, offset }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPage(
        await session.api.read("/api/recurrence-templates/{id}/definitions", {
          path: { id },
          query: { offset, limit: pageSize },
          signal,
        }),
        offset,
        readDefinition,
        d => d.id,
      ),
  });
}
export function useOccurrences(id: string, fromDate: string, toDate: string, offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "recurrence-occurrences", { id, fromDate, toDate, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const range = windowDates(fromDate, toDate);
      return readPage(
        await session.api.read("/api/recurrence-templates/{id}/occurrences", {
          path: { id },
          query: { FromDate: range.fromDate, ToDate: range.toDate, Offset: offset, Limit: pageSize },
          signal,
        }),
        offset,
        o => {
          readOccurrence(o, id);
          if (o.localDate < fromDate || o.localDate > toDate)
            throw new RangeError("Oluşum seçili tarih aralığına ait değil.");
          return o;
        },
        o => o.localDate,
      );
    },
  });
}
export function useRecurrenceCache() {
  const { state } = useSession();
  const client = useQueryClient();
  const tasks = useTaskCache();
  return {
    current: tasks.current,
    changed: () => {
      if (!tasks.current()) return;
      for (const name of [
        "recurrence",
        "recurrence-detail",
        "recurrence-definitions",
        "recurrence-occurrences",
        "recurrence-projection",
        "task-recurrence",
        "day-overview",
        "calendar-items",
        "calendar-day",
        "calendar-range",
        "calendar-overview",
        "calendar-revisions",
        "plan-revisions",
        "task-time",
        "task-detail",
        "support-end",
      ])
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, name).slice(0, 3) });
      void tasks.manyChanged();
    },
  };
}

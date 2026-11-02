"use client";
import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readJobs, readReminders, type JobState } from "./model";
const channelName = "adhd.reminders.changes.v1";
export function useReminders() {
  const { session, state } = useSession();
  const query = useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "custom-reminders", { kind: "active-list" }),
    initialPageParam: 0,
    getNextPageParam: (last: ReturnType<typeof readReminders>, _pages, offset) =>
      last.length > pageSize && offset + pageSize <= 100000 ? offset + pageSize : undefined,
    networkMode: "always",
    queryFn: async ({ signal, pageParam }) =>
      readReminders(
        await session.api.read("/api/notifications/reminders", {
          query: { offset: pageParam, limit: pageSize + 1, activeOnly: true },
          signal,
        }),
      ),
  });
  const { data, refetch } = query;
  useEffect(() => {
    // Sıradaki tek seferlik zaman gelince yeniden okuruz. Aktif satırları sunucu seçer.
    const due = data?.pages
      .flatMap(page => page)
      .filter(r => !r.repeat && !r.canceled)
      .map(r => Date.parse(r.dueAt));
    if (!due?.length) return;
    const next = due.reduce((earliest, at) => Math.min(earliest, at), Infinity);
    const timer = setTimeout(() => void refetch(), Math.max(1000, Math.min(2147483647, next - Date.now() + 250)));
    return () => clearTimeout(timer);
  }, [data, refetch]);
  return query;
}
export function useJobs(offset: number, filter: JobState | "") {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "jobs-outbox", { offset, filter }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readJobs(
        await session.api.read("/api/jobs/outbox", {
          query: { offset, limit: pageSize, state: filter || undefined },
          signal,
        }),
        offset,
        filter,
      ),
  });
}
export function useReminderCache(listen = false) {
  const { session, state } = useSession();
  const client = useQueryClient(),
    owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const resources = ["custom-reminders", "jobs-outbox", "notifications", "notification"];
  useEffect(() => {
    if (!listen) return;
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = e => {
        if (e.data?.owner === owner && e.data?.version === 1)
          for (const name of ["custom-reminders", "jobs-outbox", "notifications", "notification"])
            void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
      };
    } catch {
      /* Görünürlükte ve elle yeniden okuma açık kalır. */
    }
    return () => channel?.close();
  }, [client, owner, listen]);
  return {
    current,
    changed() {
      if (!current()) return;
      for (const name of resources)
        void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
      try {
        const c = new BroadcastChannel(channelName);
        c.postMessage({ version: 1, owner });
        c.close();
      } catch {
        /* Elle okuma açık kalır. */
      }
    },
  };
}

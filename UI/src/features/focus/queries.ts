"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useWork, WORK_CHANNEL } from "../work/coordinator";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readCurrent, readFocusPage, readPresets } from "./model";

export function useFocusCurrent(enabled = true) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const work = useWork();
  const workId = work.work?.id,
    workVersion = work.work?.version,
    refreshWork = work.refresh;
  const key = queryKeys.resource(state.user!.id, "focus-current");
  const query = useQuery({
    queryKey: key,
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const current = readCurrent(await session.api.read("/api/focus-sessions/current", { signal }));
      return { ...current, receivedAt: performance.now() };
    },
    refetchOnWindowFocus: "always",
  });
  const focusWorkId = query.data?.session?.workSessionId,
    focusWorkVersion = query.data?.session?.workSessionVersion;
  useEffect(() => {
    if (
      enabled &&
      work.ready &&
      focusWorkId &&
      (workId !== focusWorkId || String(workVersion) !== String(focusWorkVersion))
    )
      void refreshWork();
  }, [enabled, work.ready, focusWorkId, focusWorkVersion, workId, workVersion, refreshWork]);
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-current") });
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-list").slice(0, 3) });
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(WORK_CHANNEL);
      channel.onmessage = event => {
        if (event.data?.version === 1 && event.data.kind === "work-changed") refresh();
      };
    } catch {
      /* Görünürken ara sıra okuma yedek yol olarak kalıyor. */
    }
    window.addEventListener("online", refresh);
    return () => {
      channel?.close();
      window.removeEventListener("online", refresh);
    };
  }, [client, state.user]);
  return query;
}
export function usePresets(offset: number, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "focus-presets", { offset }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPresets(await session.api.read("/api/focus-presets", { query: { offset, limit: pageSize }, signal })),
  });
}
export function useFocusList(offset: number, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "focus-list", { offset }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readFocusPage(await session.api.read("/api/focus-sessions", { query: { offset, limit: pageSize }, signal })),
  });
}

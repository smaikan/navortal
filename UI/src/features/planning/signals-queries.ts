"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useWork } from "../work/coordinator";
import { useDisplayPreferences } from "../workspace/queries";
import { useNotificationCache } from "../notifications/cache";
import { queryKeys } from "../../lib/api/query-client";
import { readSignals } from "./signals-model";

export function useDaySignals(date: string, enabled = true) {
  const { session, state } = useSession();
  const work = useWork();
  const preferences = useDisplayPreferences();
  const observeFocus = work.work?.state === "Running" && preferences.data?.values.uiSupports.nudges === true;
  useNotificationCache(enabled);
  const query = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "day-signals", { date, observeFocus }),
    enabled,
    networkMode: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) =>
      readSignals(
        await session.api.read("/api/daily-plans/{date}/signals", {
          path: { date },
          query: { observeFocus },
          signal,
        }),
        date,
      ),
  });
  const runningId = work.work?.state === "Running" ? work.work.id : null;
  const actualId = query.data?.runningWorkSessionId;
  const focus = query.data?.focus;
  const refresh = work.refresh;
  useEffect(() => {
    if (
      enabled &&
      work.ready &&
      actualId !== undefined &&
      (actualId !== runningId ||
        (focus?.workSessionId === runningId &&
          runningId !== null &&
          String(focus.workSessionVersion) !== String(work.work?.version)))
    )
      void refresh();
  }, [
    enabled,
    work.ready,
    actualId,
    runningId,
    focus?.workSessionId,
    focus?.workSessionVersion,
    work.work?.version,
    refresh,
  ]);
  return query;
}

"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { isAlertSound } from "./alert-tones";
import { alertAudio } from "./alert-audio";
import { claimAlertSound } from "./alert-claims";
import { alertWindow, readAlertPage } from "./alert-window";
import type { Notification } from "./model";
import { alertHealth } from "./alert-health";

/** Yalnız ses açılmış ve çalışma alanı görünürken bağlanıyor. Koordinatör ve yedek okumayla yenileniyor. */
export function AlertFeed() {
  const { session, state } = useSession();
  const owner = state.user!.id;
  const [observation] = useState(() => ({ window: alertWindow(), mountedAt: performance.now() }));
  const query = useQuery({
    queryKey: queryKeys.resource(owner, "notification-alerts"),
    networkMode: "always",
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const startedAt = performance.now();
      const items: Notification[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      let serverNow = "";
      let preferencesVersion: number | string = 0;
      do {
        const page = readAlertPage(
          await session.api.read("/api/notifications/alerts", { query: { limit: 50, cursor }, signal }),
        );
        serverNow = page.serverNow;
        preferencesVersion = page.preferencesVersion;
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
        if (cursor && cursors.has(cursor)) throw new ApiError("protocol", "Bildirim sayfası tekrarlandı.");
        if (cursor) cursors.add(cursor);
      } while (cursor && !signal.aborted);
      signal.throwIfAborted();
      return { serverNow, items, startedAt, preferencesVersion };
    },
  });
  useEffect(() => {
    alertHealth.report(
      query.isError ? "Hazır hatırlatmalar okunamadı. Bağlantı geldiğinde yeniden kontrol edilecek." : "",
    );
  }, [query.isError]);
  useEffect(() => {
    const epoch = session.getIdentity().epoch;
    let disposed = false;
    const current = () =>
      !disposed &&
      session.getIdentity().epoch === epoch &&
      session.getSnapshot().user?.id === owner &&
      document.visibilityState === "visible" &&
      alertAudio.getSnapshot() === "ready";
    if (query.data && query.data.startedAt >= observation.mountedAt) {
      const pending = observation.window.accept(query.data.serverNow, query.data.items, query.data.preferencesVersion);
      void (async () => {
        let played = false;
        for (const n of pending) {
          if (!current()) return;
          await claimAlertSound(owner, n.id, Number(n.snoozeCount), current, () => {
            if (played) return true;
            played = alertAudio.play(isAlertSound(n.sound) ? n.sound : "soft");
            return played;
          });
        }
        // Birlikte gelen hatırlatmalar tek ses çalıyor. Makbuzlar her olayı ayrıca tekilleştiriyor.
      })();
    }
    return () => {
      disposed = true;
    };
  }, [query.data, observation, session, owner]);
  return null;
}

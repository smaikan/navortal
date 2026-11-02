"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import type { Notification, Preferences } from "./model";
const channelName = "adhd.notifications.changes.v1";
export function useNotificationCache(listen = false) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  useEffect(() => {
    if (!listen) return;
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = e => {
        if (e.data?.owner === owner && e.data?.version === 1)
          for (const name of [
            "notifications",
            "notification",
            "notification-alerts",
            "notification-preferences",
            "day-signals",
          ])
            void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
      };
    } catch {
      /* Canlı eşitleme ve görünürlükte yenileme yedek yol olarak var. */
    }
    return () => channel?.close();
  }, [client, owner, listen]);
  return {
    current,
    changed(n?: Notification, p?: Preferences) {
      if (!current()) return;
      if (n) client.setQueryData(queryKeys.resource(owner, "notification", { id: n.id }), n);
      if (p) client.setQueryData(queryKeys.resource(owner, "notification-preferences"), p);
      // Makbuz zaten görünür. Yavaş GET yazıyı beklemede tutmuyor.
      for (const name of [
        "notifications",
        "notification",
        "notification-alerts",
        "notification-preferences",
        "day-signals",
      ])
        void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
      try {
        const channel = new BroadcastChannel(channelName);
        channel.postMessage({ version: 1, owner });
        channel.close();
      } catch {
        /* Elle okuma yolu açık kalıyor. */
      }
    },
  };
}

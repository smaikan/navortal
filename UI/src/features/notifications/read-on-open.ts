"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Temporal } from "temporal-polyfill";
import { useSession } from "../auth/provider";
import { useNotificationCache } from "./cache";
import type { components } from "../../lib/api/generated/schema";
import { queryKeys } from "../../lib/api/query-client";
import { notificationBadgeKey, readInboxSummary, type InboxSummary } from "./badge";

type ReadReceipt = components["schemas"]["ReadAllNotificationsResult"];

/** Tek açılış mevcut sunucu listesini işaretler, sonraki taramaları değil. StrictMode etkileri aynı isteği paylaşır. */
export function useReadNotificationsOnOpen() {
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const cache = useNotificationCache();
  const client = useQueryClient();
  // Bu doğrulanmış komut makbuzu. Bildirim sürümüne iyimser değer yazmıyoruz.
  // Panel kapanıp açılsa da tutuluyor. Hesap/epoch ayrımı çalışma alanı önbelleğinden geliyor.
  const receipt = useQuery<ReadReceipt | null>({
    queryKey: queryKeys.resource(owner, "notification-read-receipt", { epoch }),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  });
  const latest = useRef(cache);
  useEffect(() => {
    latest.current = cache;
  }, [cache]);
  const request = useRef<{
    owner: string;
    epoch: number;
    promise: Promise<ReadReceipt>;
    applied?: boolean;
  } | null>(null);
  const [issue, setIssue] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (!request.current || request.current.owner !== owner || request.current.epoch !== epoch)
      request.current = {
        owner,
        epoch,
        promise: session.api.mutation("/api/notifications/read-all", "post", {}).execute(),
      };
    const pending = request.current;
    void pending.promise
      .then(async result => {
        if (
          !latest.current.current() ||
          session.getIdentity().epoch !== epoch ||
          session.getSnapshot().user?.id !== owner
        )
          return;
        if (
          !Number.isSafeInteger(Number(result.readCount)) ||
          Number(result.readCount) < 0 ||
          !Number.isFinite(Date.parse(result.readAt))
        )
          throw new Error("Invalid read receipt");
        Temporal.Instant.from(result.readAt);
        const summary = readInboxSummary(result.summary);
        if (pending.applied || request.current !== pending) return;
        pending.applied = true;
        // Eski GET makbuzu ezemez. İyimser sayı yerine aynı transaction'ın sunucu özeti kullanılır.
        await client.cancelQueries({ queryKey: notificationBadgeKey(owner), exact: true });
        if (!latest.current.current()) return;
        client.setQueryData<InboxSummary>(notificationBadgeKey(owner), previous =>
          previous && Temporal.Instant.compare(previous.asOf, summary.asOf) > 0 ? previous : summary,
        );
        client.setQueryData<ReadReceipt | null>(
          queryKeys.resource(owner, "notification-read-receipt", { epoch }),
          previous => (previous && Temporal.Instant.compare(previous.readAt, result.readAt) > 0 ? previous : result),
        );
        if (live) setIssue("");
        latest.current.changed();
      })
      .catch(() => {
        if (live && latest.current.current())
          setIssue("Bildirimlerin okundu durumu doğrulanamadı. Yeniden işaretlemeyi seçebilirsin.");
      });
    return () => {
      live = false;
    };
  }, [session, owner, epoch, attempt, client]);
  return {
    issue,
    readAt: receipt.data?.readAt ?? null,
    retry() {
      request.current = null;
      setAttempt(value => value + 1);
    },
  };
}

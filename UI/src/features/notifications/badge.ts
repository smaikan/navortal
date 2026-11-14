"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import type { components } from "../../lib/api/generated/schema";

type SummaryResponse = components["schemas"]["NotificationInboxSummary"];
export type InboxSummary = Omit<SummaryResponse, "unreadCount"> & { unreadCount: number };
export const notificationBadgeKey = (owner: string) => queryKeys.resource(owner, "notifications", { kind: "badge" });
export function readInboxSummary(value: SummaryResponse): InboxSummary {
  if (
    !value ||
    typeof value.unreadCount !== "number" ||
    !Number.isSafeInteger(value.unreadCount) ||
    value.unreadCount < 0 ||
    typeof value.asOf !== "string" ||
    !Number.isFinite(Date.parse(value.asOf))
  )
    throw new ApiError("protocol", "Bildirim sayısı doğrulanamadı.");
  return { ...value, unreadCount: value.unreadCount };
}
/** Zil yalnız owner kapsamında sunucunun saydığı özeti okur; geçmiş sayfalarını indirmez. */
export function useNotificationBadge(enabled: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: notificationBadgeKey(state.user!.id),
    enabled,
    networkMode: "always",
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => readInboxSummary(await session.api.read("/api/notifications/summary", { signal })),
  });
}

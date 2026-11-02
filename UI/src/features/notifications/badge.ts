"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";

/** Zil sayısı kabukta. Temporal bağımlılığını taşımamak için yalnız son birkaç satırı ve gereken alanları okuyoruz. 9+ doğru kalıyor. */
export const badgeLimit = 10;
type BadgeRow = { id: string; state: string; readAt: string | null };
function readBadge(value: unknown): BadgeRow[] {
  const page = value as { items?: unknown; offset?: unknown; limit?: unknown } | null;
  const items = page?.items;
  if (
    !page ||
    !Array.isArray(items) ||
    Number(page.offset) !== 0 ||
    Number(page.limit) !== badgeLimit ||
    items.length > badgeLimit ||
    items.some(
      n =>
        !n ||
        typeof n.id !== "string" ||
        typeof n.state !== "string" ||
        !(n.readAt === null || typeof n.readAt === "string"),
    )
  )
    throw new ApiError("protocol", "Bildirim sayısı doğrulanamadı.");
  return items as BadgeRow[];
}
/** Okunmamış demek sunucuda hazır ve henüz okunmamış demek. */
export const unreadIds = (rows: BadgeRow[]) =>
  rows.filter(n => n.state === "Ready" && n.readAt === null).map(n => n.id);
export function useNotificationBadge(enabled: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "notifications", { kind: "badge" }),
    enabled,
    networkMode: "always",
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) =>
      readBadge(await session.api.read("/api/notifications", { query: { offset: 0, limit: badgeLimit }, signal })),
  });
}

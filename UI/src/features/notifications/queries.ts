"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readNotification, readPage, readPreferences } from "./model";
export function useNotifications(offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "notifications", { offset, kind: "inbox" }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPage(await session.api.read("/api/notifications", { query: { offset, limit: pageSize }, signal }), offset),
  });
}
export function useNotification(id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "notification", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readNotification(await session.api.read("/api/notifications/{id}", { path: { id }, signal }), id),
  });
}
export function useNotificationPreferences() {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "notification-preferences"),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readPreferences(await session.api.read("/api/notifications/preferences", { signal })),
  });
}

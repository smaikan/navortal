"use client";
import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { queryKeys } from "../../lib/api/query-client";
import { pageSize, readCategoryList, readNotes, readReturn, type NoteScope } from "./model";
export const NOTE_CHANNEL = "adhd.notes.changes.v1";
const resources = ["notes", "note-categories", "return-context", "day-overview"] as const;
/** Görev panelindeki notların ilk sayfası. NextStep sunucuda dışarıda kalıyor. */
export function useNotes(taskId: string | undefined, offset = 0) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "notes", { taskId, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readNotes(
        await session.api.read("/api/notes", { query: { taskId, offset, limit: pageSize }, signal }),
        pageSize,
        { taskId },
      ),
  });
}
export type FeedScope = NoteScope & { search?: string; excludePinned?: boolean };
/** Bölümde 25'lik sayfalar Daha fazla göster ile ekleniyor. Kapsam değişince liste baştan başlıyor. */
export function useNoteFeed(scope: FeedScope, enabled = true) {
  const { session, state } = useSession();
  const { search, excludePinned, ...decoded } = scope;
  return useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "notes", { ...scope, feed: true }),
    networkMode: "always",
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => ({
      ...readNotes(
        await session.api.read("/api/notes", {
          query: {
            taskId: decoded.taskId,
            kind: decoded.kind,
            date: decoded.date,
            categoryId: decoded.categoryId,
            taskLinked: decoded.taskLinked || undefined,
            excludePinned: excludePinned || undefined,
            search: search || undefined,
            offset: pageParam,
            limit: pageSize,
          },
          signal,
        }),
        pageSize,
        decoded,
      ),
      offset: pageParam,
    }),
    getNextPageParam: last =>
      last.offset + last.items.length < Number(last.total) && last.offset + pageSize <= 100000
        ? last.offset + pageSize
        : undefined,
  });
}
export function useNoteCategories() {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "note-categories"),
    networkMode: "always",
    queryFn: async ({ signal }) => readCategoryList(await session.api.read("/api/note-categories", { signal })),
  });
}
export function useReturn(id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "return-context", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readReturn(await session.api.read("/api/tasks/{id}/return-context", { path: { id }, signal }), id),
  });
}
export function useNotesCache(listen = false) {
  const { state } = useSession();
  const client = useQueryClient();
  const tasks = useTaskCache();
  const owner = state.user!.id;
  const refresh = () => {
    for (const name of resources)
      void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
  };
  const invalidate = () => {
    if (tasks.current()) refresh();
  };
  useEffect(() => {
    if (!listen) return;
    let channel: BroadcastChannel | undefined;
    const reread = () => {
      for (const name of resources)
        void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
    };
    try {
      channel = new BroadcastChannel(NOTE_CHANNEL);
      channel.onmessage = e => {
        if (e.data?.version === 1 && e.data.kind === "notes-changed") reread();
      };
    } catch {
      /* Görünür sorguyu yeniden okuma yolu açık kalıyor. */
    }
    return () => channel?.close();
  }, [client, owner, listen]);
  return {
    current: tasks.current,
    changed: (converted = false) => {
      if (!tasks.current()) return;
      invalidate();
      if (converted) void tasks.manyChanged();
      try {
        const c = new BroadcastChannel(NOTE_CHANNEL);
        c.postMessage({ version: 1, kind: "notes-changed" });
        c.close();
      } catch {
        /* Odak veya okuma, eşitlemenin yedek yolu. */
      }
    },
    invalidate,
  };
}

"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { readBoard, readCandidates, integer, type Board, type Quadrant } from "./model";
import { dropCard, moveCard, withVersion } from "./optimistic";
export type Offsets = Record<Quadrant, number>;
export function useMatrix(offsets: Offsets) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const q = useQuery({
    queryKey: queryKeys.resource(owner, "matrix", offsets),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readBoard(
        await session.api.read("/api/matrix", {
          signal,
          query: {
            inboxOffset: offsets.Inbox,
            doOffset: offsets.Do,
            scheduleOffset: offsets.Schedule,
            delegateOffset: offsets.Delegate,
            eliminateOffset: offsets.Eliminate,
            limit: 25,
          },
        }),
      ),
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  const ownVersion = useRef<number | string | undefined>(undefined);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [failure, setFailure] = useState("");
  async function refresh() {
    const result = await q.refetch();
    if (!current()) return;
    if (result.isSuccess) {
      await client.invalidateQueries({ queryKey: queryKeys.resource(owner, "matrix-candidates").slice(0, 3) });
      if (!current()) return;
      setBlocked(false);
      setFailure("");
    }
  }
  const boards = queryKeys.resource(owner, "matrix").slice(0, 3);
  /** Önbellekteki bütün matris görünümlerine uygular. Devam eden okuma eski halini geri yazmasın diye önce durdurulur. */
  function patchBoards(change: (board: Board) => Board | null) {
    void client.cancelQueries({ queryKey: boards, predicate: query => query.state.data !== undefined });
    const undo: (() => void)[] = [];
    for (const [key, data] of client.getQueriesData<Board>({ queryKey: boards })) {
      const next = data ? change(data) : null;
      if (!next || next === data) continue;
      client.setQueryData(key, next);
      undo.push(() => client.setQueryData<Board>(key, now => (now === next ? data : now)));
    }
    return () => undo.forEach(run => run());
  }
  function settle() {
    waiting.current--;
    if (waiting.current === 0) {
      ownVersion.current = undefined;
      if (current()) {
        setPending(false);
        void refresh().catch(() => {});
      }
    }
  }
  /**
   * Taşıma ve çıkarma ekranda hemen görünür, sunucuya arka planda sırayla gider; tahta kilitlenmez.
   * Ekleme hemen gösterilmez (kart verisi sunucudan gelir), sıra boşalınca tahta yenilenir.
   */
  function write(
    kind: "add" | "move" | "remove",
    taskId: string,
    quadrant: Quadrant,
    beforeTaskId: string | null = null,
    version = q.data?.version,
  ): Promise<number | string | false> {
    if (blocked || version === undefined || !current()) return Promise.resolve(false);
    setFailure("");
    const undo =
      kind === "move"
        ? patchBoards(board => moveCard(board, taskId, quadrant, beforeTaskId))
        : kind === "remove"
          ? patchBoards(board => dropCard(board, taskId))
          : () => {};
    if (kind === "add") setPending(true);
    waiting.current++;
    const job = queue.current.then(async (): Promise<number | string | false> => {
      // Art arda yazılarda önceki yanıtın sürümü kullanılır; başka sekmedeki değişiklik yine çakışma olarak döner.
      const sent = ownVersion.current ?? version;
      try {
        const body = { version: sent, quadrant, beforeTaskId };
        const result =
          kind === "add"
            ? await session.api.mutation("/api/matrix/items/{taskId}", "post", { path: { taskId }, body }).execute()
            : kind === "move"
              ? await session.api.mutation("/api/matrix/items/{taskId}", "put", { path: { taskId }, body }).execute()
              : await session.api
                  .mutation("/api/matrix/items/{taskId}", "delete", { path: { taskId }, query: { version: sent } })
                  .execute();
        if (!current()) return false;
        if (!result || result.taskId !== taskId || !integer(result.version) || BigInt(result.version) <= BigInt(sent))
          throw new ApiError(
            "protocol",
            "İşlemin sonucu doğrulanamadı. Listeyi kontrol et.",
            0,
            undefined,
            {},
            undefined,
            undefined,
            true,
          );
        ownVersion.current = result.version;
        for (const [key, data] of client.getQueriesData<Board>({ queryKey: boards }))
          if (data) client.setQueryData(key, withVersion(data, result.version));
        return result.version;
      } catch (e) {
        if (!current()) return false;
        undo();
        const error = e instanceof ApiError ? e : null;
        setFailure(
          error?.outcomeUnknown
            ? "İşlemin sonucu alınamadı. Yeniden taşımadan önce listeyi kontrol et."
            : error?.code === "matrix_version_conflict"
              ? "Matris başka bir işlemde değişti. Güncel listeyi alıp yeniden seç."
              : error?.code === "matrix_task_exists"
                ? "Bu görev matriste zaten var. Listeyi yenile."
                : error?.message || "Değişiklik kaydedilemedi.",
        );
        if (error?.outcomeUnknown) setBlocked(true);
        ownVersion.current = undefined;
        return false;
      } finally {
        settle();
      }
    });
    queue.current = job;
    return job;
  }
  return { q, pending, blocked, failure, write, refresh };
}
export function useCandidates(search: string, offset: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "matrix-candidates", { search, offset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readCandidates(
        await session.api.read("/api/matrix/candidates", { signal, query: { search, offset, limit: 25 } }),
      ),
  });
}

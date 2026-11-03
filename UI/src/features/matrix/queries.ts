"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { readBoard, readCandidates, integer, type Quadrant } from "./model";
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
  const flight = useRef(false);
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
  async function write(
    kind: "add" | "move" | "remove",
    taskId: string,
    quadrant: Quadrant,
    beforeTaskId: string | null = null,
    version = q.data?.version,
  ) {
    if (flight.current || blocked || version === undefined || !current()) return false;
    flight.current = true;
    setPending(true);
    setFailure("");
    try {
      const body = { version, quadrant, beforeTaskId };
      const result =
        kind === "add"
          ? await session.api.mutation("/api/matrix/items/{taskId}", "post", { path: { taskId }, body }).execute()
          : kind === "move"
            ? await session.api.mutation("/api/matrix/items/{taskId}", "put", { path: { taskId }, body }).execute()
            : await session.api
                .mutation("/api/matrix/items/{taskId}", "delete", { path: { taskId }, query: { version } })
                .execute();
      if (!current()) return false;
      if (!result || result.taskId !== taskId || !integer(result.version) || BigInt(result.version) <= BigInt(version))
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
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.resource(owner, "matrix").slice(0, 3) }),
        client.invalidateQueries({ queryKey: queryKeys.resource(owner, "matrix-candidates").slice(0, 3) }),
      ]);
      return current() ? result.version : false;
    } catch (e) {
      if (!current()) return false;
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
      if (error?.status === 409 || error?.status === 404) await q.refetch();
      return false;
    } finally {
      flight.current = false;
      if (current()) setPending(false);
    }
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

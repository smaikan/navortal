"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../auth/provider";
import { queryKeys } from "../../../lib/api/query-client";
import { ApiError } from "../../../lib/api/errors";
import { readTask, type Task } from "../model";
import { useTaskCache } from "../queries";
import { readRelation, refreshAfter, relationFailure, relationKinds, type RelationKind } from "./model";

export type RelationSource = { id: string; title: string };
/** Tek seferde tek ilişki yazısı. Hedef sürüm son görev okumasından gelir, her yazıdan sonra yenilenir. */
export function useRelationCommand(id: string) {
  const { session, state } = useSession();
  const cache = useTaskCache();
  const client = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [stale, setStale] = useState(false);
  const [checked, setChecked] = useState(false);
  const latest = () => client.getQueryData<Task>(queryKeys.resource(state.user!.id, "task", { id }));
  async function reload() {
    const task = readTask(await session.api.read("/api/tasks/{id}", { path: { id } }));
    if (task.id !== id) throw new ApiError("protocol", "Görev yanıtı başka bir kayda ait.");
    // setQueryData hemen işler, bağlı liste okumaları arkada sürer.
    if (cache.current()) {
      void cache.update(task);
      setStale(false);
    }
  }
  async function run(kind: RelationKind, op: "add" | "remove", source: RelationSource) {
    if (busy.current || stale || unknown) return false;
    const task = latest();
    if (!task) {
      setStale(true);
      return false;
    }
    if (task.archivedAt) {
      setFailure(relationFailure(new ApiError("http", "", 409, "task_archived")));
      return false;
    }
    busy.current = true;
    setPending(true);
    setFailure("");
    setDone("");
    setChecked(false);
    let ok = false;
    try {
      if (op === "add") {
        const raw =
          kind === "dependencies"
            ? await session.api
                .mutation("/api/tasks/{id}/dependencies", "post", {
                  path: { id },
                  body: { version: task.version, predecessorTaskId: source.id },
                })
                .execute()
            : await session.api
                .mutation("/api/tasks/{id}/ordering", "post", {
                  path: { id },
                  body: { version: task.version, beforeTaskId: source.id },
                })
                .execute();
        try {
          readRelation(raw, kind, id, source.id);
        } catch {
          throw new ApiError("protocol", "Yanıt eksik.", 201, undefined, {}, undefined, undefined, true);
        }
      } else {
        const options = { path: { id, sourceId: source.id }, query: { version: task.version } };
        if (kind === "dependencies")
          await session.api.mutation("/api/tasks/{id}/dependencies/{sourceId}", "delete", options).execute();
        else await session.api.mutation("/api/tasks/{id}/ordering/{sourceId}", "delete", options).execute();
      }
      if (!cache.current()) return false;
      ok = true;
      setDone(op === "add" ? relationKinds[kind].added(source.title) : relationKinds[kind].removed(source.title));
      // Yazı şimdi onaylı. Yalnız sonraki yazı yeni hedef sürümünü bekler.
      try {
        await reload();
      } catch {
        if (cache.current()) setStale(true);
      }
    } catch (error) {
      if (!cache.current()) return false;
      setUnknown(error instanceof ApiError && error.outcomeUnknown);
      setFailure(relationFailure(error));
      if (refreshAfter(error)) {
        try {
          await reload();
        } catch {
          if (cache.current()) setStale(true);
        }
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
    return ok;
  }
  /** Yalnız okuma var, belirsiz yazı tekrar gönderilmez. */
  async function inspect() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await reload();
      if (cache.current()) setChecked(true);
    } catch (error) {
      if (cache.current()) {
        setStale(true);
        setFailure(relationFailure(error));
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function acknowledge() {
    setUnknown(false);
    setChecked(false);
    setFailure("");
  }
  function clear() {
    setDone("");
    setFailure("");
  }
  return {
    run,
    inspect,
    acknowledge,
    clear,
    reload: inspect,
    pending,
    failure,
    done,
    unknown,
    stale,
    checked,
    locked: pending || stale || unknown,
  };
}

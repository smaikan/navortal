"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { announcements, readWork, resyncAfter, workFailure, type Work, type WorkAction } from "./model";
import type { Status } from "../sync/model";
import { invalidateWorkspaceReads } from "../workspace/invalidation";
import { workspaceKey, workspaceRead } from "../workspace/queries";
import type { WorkspaceSnapshot } from "../workspace/model";
import { readQueue } from "./read-queue";
import { syncEngine } from "../sync/engine";

import { announceWorkChange, WORK_CHANNEL } from "./changed";
import type { Immediate, ImmediateRequest } from "./immediate-types";
import { withMiniPlayer } from "../mini-player/controller";
import { listenNativeTimerResume, publishNativeTimer } from "./native-timer";

export { WORK_CHANNEL };
type Pending =
  | { kind: "start"; taskId: string; retry: () => Promise<unknown> }
  | { kind: "immediate"; retry: () => Promise<unknown> }
  | { kind: "transition"; action: WorkAction };
export type WorkState = {
  ready: boolean;
  syncStatus: Status;
  retrySync: () => void;
  work: Work | null;
  receivedAt: number;
  online: boolean;
  busy: boolean;
  failure: string;
  uncertain: Pending | null;
  announcement: string;
  notice: string;
  immediate: Immediate | null;
  startNow: (body: ImmediateRequest) => Promise<boolean>;
  clearImmediate: () => void;
  /** Son komutun geldiği yer. Geri bildirim o kontrolün yanında kalır. */ origin:
    "panel" | "player" | "agenda" | "immediate";
  refresh: () => Promise<void>;
  start: (taskId: string, schedule?: { id: string; version: number | string }) => Promise<boolean>;
  transition: (action: WorkAction, selected?: Work) => Promise<boolean>;
  retryStart: () => Promise<boolean>;
  acknowledge: () => void;
  dismiss: () => void;
};
const Context = createContext<WorkState | null>(null);
export function useWork() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkProvider gerekli.");
  return value;
}
export function useOptionalWork() {
  return useContext(Context);
}

/** Sekme başına tek eşitleme sayacı. Bileşen sayacı yok, gizliyken veya çevrimdışıyken tarama yok. */
export function WorkProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id;
  const [work, setWork] = useState<Work | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const bootstrapFlight = useRef<Promise<void> | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [uncertain, setUncertain] = useState<Pending | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState<WorkState["origin"]>("player");
  const [immediate, setImmediate] = useState<Immediate | null>(null);
  const [syncStatus, setSyncStatus] = useState<Status>(enabled ? "connecting" : "paused");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const realtime = useRef<{ dispose: () => void; retry: () => void; refresh: () => void } | null>(null);
  const busyRef = useRef(false);
  const acceptedWorkspace = useRef<WorkspaceSnapshot | null>(null);
  const nativeResumeRequested = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const epoch = useRef(session.getIdentity().epoch);
  const current = useCallback(
    () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch.current,
    [session, owner],
  );
  const accept = useCallback(
    (next: Work | null, requestPermission = false) => {
      if (!current()) return;
      const forceNative = !readyRef.current || nativeResumeRequested.current;
      nativeResumeRequested.current = false;
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
        setFailure("");
      }
      const value = next && (next.state === "Running" || next.state === "Paused") ? next : null;
      // Hâlâ oturum yok yanıtı her eşitlemede kabuğu tekrar çizmesin.
      setWork(previous => (previous === null && value === null ? previous : value));
      const at = performance.now();
      if (value) setReceivedAt(at);
      publishNativeTimer(owner, next, at, requestPermission, forceNative);
    },
    [current, owner],
  );
  const acceptWorkspace = useCallback(
    (snapshot: WorkspaceSnapshot) => {
      if (!current() || (acceptedWorkspace.current === snapshot && !nativeResumeRequested.current)) return;
      acceptedWorkspace.current = snapshot;
      accept(snapshot.activeWork);
    },
    [accept, current],
  );
  useEffect(
    () =>
      client.getQueryCache().subscribe(event => {
        if (
          event.type === "updated" &&
          event.action.type === "success" &&
          !event.action.manual &&
          event.query.queryKey[0] === "user" &&
          event.query.queryKey[1] === owner &&
          event.query.queryKey[2] === "workspace-snapshot"
        )
          acceptWorkspace(event.query.state.data as WorkspaceSnapshot);
      }),
    [client, owner, acceptWorkspace],
  );
  const readCurrent = useCallback(async () => {
    try {
      const snapshot = await client.fetchQuery({
        queryKey: workspaceKey(owner),
        queryFn: ({ signal }) => workspaceRead(session, signal),
        staleTime: 0,
        networkMode: "always",
      });
      acceptWorkspace(snapshot);
      if (current())
        void client.invalidateQueries(
          { queryKey: queryKeys.resource(owner, "focus-current"), refetchType: "active" },
          { cancelRefetch: false },
        );
    } catch (error) {
      if (current() && !isCancelledError(error) && !(error instanceof ApiError && error.kind === "canceled"))
        setFailure(workFailure(error));
    }
  }, [session, acceptWorkspace, current, client, owner]);
  const queue = useMemo(
    () => readQueue(readCurrent, () => enabled && current() && navigator.onLine !== false),
    [readCurrent, enabled, current],
  );
  const refresh = queue.refresh;
  const bootstrap = useCallback(() => {
    if (readyRef.current) return Promise.resolve();
    if (bootstrapFlight.current) return bootstrapFlight.current;
    const flight = refresh();
    bootstrapFlight.current = flight;
    const clear = () => {
      if (bootstrapFlight.current === flight) bootstrapFlight.current = null;
    };
    void flight.then(clear, clear);
    return flight;
  }, [refresh]);
  const afterWrite = useCallback(() => announceWorkChange(client, owner, channel.current), [client, owner]);
  // Bağlantı ve kopuk durumdaki 15/30sn yedek okuma tek yaşam döngüsüne ait.
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const abortReads = () => {
      bootstrapFlight.current = null;
      queue.clear();
      void client.cancelQueries({ queryKey: workspaceKey(owner), exact: true });
    };
    const network = () => {
      setOnline(navigator.onLine !== false);
      if (navigator.onLine === false || document.visibilityState !== "visible") abortReads();
    };
    const stopNativeResume = listenNativeTimerResume(() => {
      nativeResumeRequested.current = true;
      return refresh();
    });
    try {
      channel.current = new BroadcastChannel(WORK_CHANNEL);
      channel.current.onmessage = event => {
        if (event.data?.version === 1 && event.data.kind === "work-changed") realtime.current?.refresh();
      };
    } catch {
      channel.current = null;
    }
    const firstRead = syncAttempt ? refresh : bootstrap;
    if (document.visibilityState === "visible" && navigator.onLine !== false) void firstRead();
    void import("../sync/runtime")
      .then(({ connectRealtime }) => {
        if (!disposed && current())
          realtime.current = connectRealtime({
            session,
            client,
            owner,
            current,
            refresh,
            bootstrap: firstRead,
            status: value => {
              if (!disposed && current()) setSyncStatus(value);
            },
          });
      })
      .catch(() => {
        if (disposed || !current()) return;
        const nothing = () => {};
        realtime.current = syncEngine({
          browser: window,
          document,
          current,
          refresh,
          bootstrap: firstRead,
          status: setSyncStatus,
          invalidate: () => {
            void invalidateWorkspaceReads(client, owner, current);
          },
          signal: nothing,
          createHub: () => ({
            start: async () => {
              throw new Error("Canlı bağlantı yüklenemedi.");
            },
            stop: async () => {},
            on: nothing,
            off: nothing,
            onclose: nothing,
            onreconnecting: nothing,
            onreconnected: nothing,
          }),
        });
      });
    const cleanOwner = session.onIdentityChange(() => {
      realtime.current?.dispose();
      realtime.current = null;
      abortReads();
    });
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", network);
    window.addEventListener("pagehide", abortReads);
    return () => {
      disposed = true;
      cleanOwner();
      realtime.current?.dispose();
      realtime.current = null;
      abortReads();
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      stopNativeResume();
      document.removeEventListener("visibilitychange", network);
      window.removeEventListener("pagehide", abortReads);
      channel.current?.close();
      channel.current = null;
    };
  }, [enabled, refresh, bootstrap, queue, client, owner, session, current, syncAttempt]);
  async function guarded(command: () => Promise<boolean>, resolvingUncertain = false) {
    if (!readyRef.current) {
      setFailure("Çalışma durumu henüz doğrulanmadı. Önce güncel durumu yeniden oku.");
      return false;
    }
    // Belirsiz yazı yeni komutu engeller. Yalnız kendi aynı anahtarlı denemesi veya okuma ilerler.
    if (busyRef.current || (uncertain && !resolvingUncertain)) return false;
    busyRef.current = true;
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      return await command();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function handle(error: unknown, pending: Pending) {
    if (!current()) return;
    if (error instanceof ApiError && error.outcomeUnknown) setUncertain(pending);
    setFailure(workFailure(error));
    if (resyncAfter(error)) await refresh();
    if (
      error instanceof ApiError &&
      ["schedule_stale", "schedule_not_found", "schedule_task_mismatch"].includes(error.code ?? "")
    )
      await Promise.all(
        ["day-overview", "day-signals", "plan-day", "plan-blocks"].map(resource =>
          client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) }),
        ),
      );
    if (error instanceof ApiError && error.code === "session_paused" && pending.kind === "start")
      await loadPaused(pending.taskId);
  }
  async function loadPaused(taskId: string) {
    try {
      const page = await session.api.read("/api/work-sessions", { query: { State: "Paused", Limit: 100 } });
      const found = (page.items ?? []).map(readWork).find(item => item.taskId === taskId);
      if (found && current()) {
        accept(found);
        setNotice("Bu görevin duraklatılmış oturumu çalışma çubuğunda. “Devam et” ile sürdürebilirsin.");
      }
    } catch {
      /* Yukarıdaki mesaj sonraki adımı anlatmaya devam ediyor. */
    }
  }
  async function runStart(
    taskId: string,
    mutation: ReturnType<typeof session.api.mutation<"/api/work-sessions/start", "post">>,
    retry: boolean,
  ) {
    try {
      const result = readWork(await mutation.execute({ retryUnknownResult: retry }));
      if (!current()) return false;
      setUncertain(null);
      accept(result, true);
      setAnnouncement(announcements.start);
      afterWrite();
      // Aynı anahtar ilk yanıtı döndürür. Ardından gerçek güncel durum okunur.
      void refresh();
      return true;
    } catch (error) {
      await handle(error, { kind: "start", taskId, retry: () => runStart(taskId, mutation, true) });
      return false;
    }
  }
  const start: WorkState["start"] = (taskId, schedule) =>
    guarded(() =>
      withMiniPlayer(session, async () => {
        setOrigin(schedule ? "agenda" : "panel");
        return runStart(
          taskId,
          session.api.mutation("/api/work-sessions/start", "post", {
            body: { taskId, ...(schedule && { scheduleId: schedule.id, scheduleVersion: schedule.version }) },
          }),
          false,
        );
      }),
    );
  async function runImmediate(
    mutation: ReturnType<typeof session.api.mutation<"/api/work-sessions/start-now", "post">>,
    retry: boolean,
  ) {
    try {
      const { readImmediate } = await import("./immediate-model");
      const result = readImmediate(await mutation.execute({ retryUnknownResult: retry }));
      if (!current()) return false;
      setImmediate(result);
      setUncertain(null);
      accept(result.receipt.session, true);
      setAnnouncement("Acil çalışma başladı. Kalan planın sonucu ayrı gösteriliyor.");
      afterWrite();
      void refresh();
      return true;
    } catch (error) {
      if (!current()) return false;
      // Bozuk makbuz da belirsiz yazıdır. Gezinmede ilk anahtarı koruyoruz.
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol"))
        setUncertain({ kind: "immediate", retry: () => runImmediate(mutation, true) });
      setFailure(workFailure(error));
      await refresh();
      return false;
    }
  }
  const startNow: WorkState["startNow"] = body =>
    guarded(() =>
      withMiniPlayer(session, async () => {
        setOrigin("immediate");
        setImmediate(null);
        return runImmediate(session.api.mutation("/api/work-sessions/start-now", "post", { body }), false);
      }),
    );
  const transition = (action: WorkAction, selected?: Work) =>
    guarded(async () => {
      const target = selected ?? work;
      if (!target) return false;
      setOrigin("player");
      const options = { path: { id: target.id }, body: { version: target.version } };
      const execute = async () => {
        try {
          const raw =
            action === "pause"
              ? await session.api.mutation("/api/work-sessions/{id}/pause", "post", options).execute()
              : action === "resume"
                ? await session.api.mutation("/api/work-sessions/{id}/resume", "post", options).execute()
                : await session.api.mutation("/api/work-sessions/{id}/finish", "post", options).execute();
          const result = readWork(raw);
          if (!current()) return false;
          accept(result);
          setAnnouncement(announcements[action]);
          if (action === "finish") setNotice("");
          afterWrite();
          void refresh();
          return true;
        } catch (error) {
          await handle(error, { kind: "transition", action });
          return false;
        }
      };
      return action === "resume" ? withMiniPlayer(session, execute) : execute();
    });
  const retryStart = () =>
    guarded(
      () =>
        withMiniPlayer(session, async () => {
          const pending = uncertain;
          if (pending?.kind !== "start" && pending?.kind !== "immediate") return false;
          if (pending.kind === "start") setUncertain(null);
          return Boolean(await pending.retry());
        }),
      true,
    );
  /** Yalnız okuma. Belirsiz anahtarsız geçiş sunucu durumundan çözülür, tekrarlanmaz. */
  const acknowledge = () => {
    if (uncertain?.kind !== "immediate") {
      setUncertain(null);
      setFailure("");
    }
    void refresh();
  };
  const dismiss = () => {
    setNotice("");
    setFailure("");
  };
  return (
    <Context.Provider
      value={{
        ready,
        syncStatus,
        retrySync: () => setSyncAttempt(n => n + 1),
        work,
        receivedAt,
        online,
        busy: busy || !ready,
        failure,
        uncertain,
        announcement,
        notice,
        origin,
        refresh,
        start,
        transition,
        retryStart,
        acknowledge,
        dismiss,
        immediate,
        startNow,
        clearImmediate: () => {
          if (!busyRef.current && !uncertain) setImmediate(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

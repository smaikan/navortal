"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause } from "lucide-react";
import { useWork } from "../work/coordinator";
import { clock, displaySeconds, spoken } from "../work/model";
import { useFocusCurrent } from "../focus/queries";
import { displayFocus } from "../focus/model";
import { useFocusCommand } from "../focus/use-command";
import type { MiniPlayer } from "./controller";
import { styleMiniPlayer } from "./styles";
import { miniActivity } from "./activity";

export function MiniPlayerView({ player, target, waiting }: { player: MiniPlayer; target: Window; waiting: boolean }) {
  const work = useWork();
  const query = useFocusCurrent();
  const focus = query.data?.session;
  const { runningFocus, runningWork } = miniActivity(work.work, focus);
  const command = useFocusCommand(() => {
    void query.refetch();
  });
  const refreshRef = useRef(() => {});
  const refreshWork = work.refresh;
  const refetchFocus = query.refetch;
  useEffect(() => {
    refreshRef.current = () => {
      void refreshWork();
      void refetchFocus();
    };
  }, [refreshWork, refetchFocus]);
  useLayoutEffect(() => {
    target.document.getElementById("mini-player-loading")?.remove();
    return styleMiniPlayer(target);
  }, [target]);
  useEffect(() => {
    // Ana sayfa gizliyken de yalnız açık mini pencerenin mevcut sorguları eşitlenir.
    const refresh = () => {
      if (document.visibilityState !== "visible" && navigator.onLine !== false) refreshRef.current();
    };
    const timer = target.setInterval(refresh, 15_000);
    target.addEventListener("online", refresh);
    return () => {
      target.clearInterval(timer);
      target.removeEventListener("online", refresh);
    };
  }, [target]);
  useEffect(() => {
    if (!waiting && work.ready && !query.isPending && !runningWork && !runningFocus) player.close();
  }, [waiting, work.ready, query.isPending, runningWork, runningFocus, player]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = target.setInterval(() => setNow(performance.now()), 1000);
    return () => target.clearInterval(timer);
  }, [target]);
  const focusTime = runningFocus ? displayFocus(runningFocus, query.data!.receivedAt, now) : null;
  const inBreak = runningFocus?.state === "Break";
  const seconds = focusTime
    ? inBreak
      ? focusTime.breakRemaining
      : focusTime.remaining
    : runningWork
      ? displaySeconds(runningWork, work.receivedAt, now)
      : 0;
  const reached = useRef("");
  useEffect(() => {
    const key = runningFocus ? `${runningFocus.id}:${runningFocus.cycleNumber}:${runningFocus.state}` : "";
    if (key && seconds === 0 && reached.current !== key && work.online) {
      reached.current = key;
      refreshRef.current();
    }
  }, [seconds, runningFocus, work.online]);
  const title = runningFocus
    ? runningFocus.taskId && work.work?.id === runningFocus.workSessionId
      ? (work.work.taskAtStart?.title ?? "Göreve bağlı Pomodoro")
      : runningFocus.taskId
        ? "Göreve bağlı Pomodoro"
        : "Genel odak"
    : (runningWork?.taskAtStart?.title ?? "Çalışma");
  const kind = runningFocus ? (inBreak ? "Mola" : "Pomodoro") : "Çalışma";
  const blocked = work.busy || !!work.uncertain || !work.online || command.blocked;
  return createPortal(
    waiting || (!runningWork && !runningFocus) ? (
      <p className="mini-player-pending" role="status">
        Sayaç hazırlanıyor…
      </p>
    ) : (
      <main className="mini-player" aria-label="Mini sayaç" onClick={event => event.stopPropagation()}>
        <div className="mini-player-info">
          <p className="mini-player-kind" title={`${kind} · ${title}`}>
            <span>
              {!work.online
                ? "Bağlantı yok · son kayıt"
                : command.failure
                  ? "Doğrulanamadı · uygulamadan bak"
                  : `${kind} · ${title}`}
            </span>
          </p>
          <div className="mini-player-row">
            <p
              className="mini-player-time"
              role="timer"
              aria-live="off"
              aria-label={`${kind} süresi ${spoken(seconds)}`}
            >
              {clock(seconds)}
            </p>
            <div className="mini-player-actions">
              <button
                type="button"
                aria-label="Duraklat"
                title="Duraklat"
                disabled={blocked || inBreak}
                onClick={() => {
                  if (runningFocus) void command.run(runningFocus, "pause");
                  else void work.transition("pause");
                }}
              >
                <Pause size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </main>
    ),
    target.document.body,
  );
}

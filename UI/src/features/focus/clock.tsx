"use client";
import { useEffect, useRef, useState } from "react";
import { clock, spoken } from "../work/model";
import { displayFocus, type Focus } from "./model";

/** Saniye güncellemesini yalnız bu küçük görünüm dinliyor. Sorgular, form ve kabuk dinlemiyor. */
export function FocusClock({
  focus: f,
  receivedAt,
  refresh,
}: {
  focus: Focus;
  receivedAt: number;
  refresh: () => void;
}) {
  const [now, setNow] = useState(() => performance.now());
  const observed = useRef(new Set<string>());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const resume = () => {
      stop();
      if (
        document.visibilityState === "visible" &&
        navigator.onLine !== false &&
        (f.state === "Working" || f.state === "Break")
      )
        timer = setInterval(() => setNow(performance.now()), 1000);
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", stop);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", stop);
    };
  }, [f.state]);
  const value = displayFocus(f, receivedAt, now);
  const inBreak = f.state === "Break" || f.state === "AwaitingNext";
  useEffect(() => {
    const kind =
      f.state === "Working" && !f.effectiveTargetReached && value.remaining === 0
        ? "target"
        : f.state === "Break" && value.breakRemaining === 0
          ? "break"
          : null;
    if (!kind || navigator.onLine === false) return;
    const key = `${f.id}:${kind}`;
    if (!observed.current.has(key)) {
      observed.current.add(key);
      refresh();
    }
  }, [f.id, f.state, f.effectiveTargetReached, value.remaining, value.breakRemaining, refresh]);
  return (
    <div className="focus-clock">
      <p className="muted">{inBreak ? "Molada kalan" : "Hedefe kalan"}</p>
      <p
        role="timer"
        aria-live="off"
        className="focus-countdown"
        aria-label={`${inBreak ? "Molada kalan" : "Hedefe kalan"} ${spoken(inBreak ? value.breakRemaining : value.remaining)}`}
      >
        {clock(inBreak ? value.breakRemaining : value.remaining)}
      </p>
      <dl className="focus-metrics">
        <div>
          <dt>Odak hedefi</dt>
          <dd>{clock(f.settings.workSeconds)}</dd>
        </div>
        <div>
          <dt>Çalışma süresi</dt>
          <dd data-focus-active>{clock(value.active)}</dd>
        </div>
        <div>
          <dt>Hedef aşımı</dt>
          <dd data-focus-overtime>{clock(value.overtime)}</dd>
        </div>
        {inBreak && (
          <div>
            <dt>Bu döngünün mola hedefi</dt>
            <dd>{clock(Number(f.breakTargetSeconds))}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

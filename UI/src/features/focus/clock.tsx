"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clock, spoken } from "../work/model";
import { displayFocus, type Focus } from "./model";
import { clockAt, cyclePosition, shortTime } from "./rhythm";

/** Saniye güncellemesini yalnız sayaç ve ölçü şeridi dinliyor. Sorgular, form ve kabuk dinlemiyor. */
function useFocusTick(f: Focus, receivedAt: number) {
  const [now, setNow] = useState(() => performance.now());
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
  return { ...displayFocus(f, receivedAt, now), wall: performance.timeOrigin + now };
}

export function FocusClock({
  focus: f,
  zone,
  receivedAt,
  refresh,
}: {
  focus: Focus;
  zone: string;
  receivedAt: number;
  refresh: () => void;
}) {
  const value = useFocusTick(f, receivedAt);
  const observed = useRef(new Set<string>());
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

  const reached = !inBreak && (f.effectiveTargetReached || value.remaining === 0);
  const breakTarget = Number(f.breakTargetSeconds);
  const progress = inBreak
    ? f.state === "AwaitingNext"
      ? 1
      : 1 - value.breakRemaining / breakTarget
    : reached
      ? 1
      : 1 - value.remaining / f.settings.workSeconds;
  // Duvar saati yalnız yaklaşık bitişi göstermek için; sayaç sunucu süresine göre ilerliyor.
  const wall = value.wall;
  let label = "Hedefe kalan",
    shown = value.remaining,
    sub = `Hedef ${clockAt(wall + value.remaining * 1000, zone)} saatinde dolar`;
  if (reached) {
    label = "Çalışma süresi";
    shown = value.active;
    sub = `+${clock(value.overtime)} hedefin üstünde`;
  }
  if (f.state === "Paused") sub = "Sayaç duraklatıldı";
  if (f.state === "Break") {
    label = "Molada kalan";
    shown = value.breakRemaining;
    sub = `Mola ${clockAt(wall + value.breakRemaining * 1000, zone)} saatinde biter`;
  }
  if (f.state === "AwaitingNext") {
    label = "Molada kalan";
    shown = 0;
    sub = "Hazır olduğunda devam et";
  }
  const every = f.settings.longBreakEvery,
    position = cyclePosition(Number(f.cycleNumber), every);
  const next = inBreak
    ? `${Number(f.cycleNumber) + 1}. döngü`
    : position === every
      ? `${shortTime(f.settings.longBreakSeconds)} uzun mola`
      : `${shortTime(f.settings.shortBreakSeconds)} mola`;
  return (
    <div className="focus-clock">
      {/* Halka düz CSS: metnin arkası düz zemin, kontrast ölçülebiliyor. */}
      <div className="focus-ring" style={{ "--focus-progress": Math.min(1, Math.max(0, progress)) } as CSSProperties}>
        <div className="focus-ring-center">
          <p className="muted">{label}</p>
          <p role="timer" aria-live="off" className="focus-countdown" aria-label={`${label} ${spoken(shown)}`}>
            {clock(shown)}
          </p>
          <p className="focus-ring-sub" data-over={(reached && value.overtime > 0) || undefined}>
            {sub}
          </p>
        </div>
      </div>
      <div className="focus-cycle">
        {every <= 8 && (
          <span className="focus-dots" aria-hidden="true">
            {Array.from({ length: every }, (_, index) => {
              const n = index + 1;
              const done = n < position || (n === position && inBreak);
              return <i key={n} data-state={done ? "done" : n === position ? "now" : undefined} />;
            })}
            <i data-state="long" />
          </span>
        )}
        <span className="muted">
          Döngü {f.cycleNumber} · sırada {next}
        </span>
      </div>
    </div>
  );
}

export function FocusMetrics({ focus: f, receivedAt }: { focus: Focus; receivedAt: number }) {
  const value = useFocusTick(f, receivedAt);
  const inBreak = f.state === "Break" || f.state === "AwaitingNext";
  return (
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
          <dt>Mola hedefi</dt>
          <dd>{clock(Number(f.breakTargetSeconds))}</dd>
        </div>
      )}
    </dl>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Lock, Moon, Pin, Play } from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { kinds, minutes, timeText, titleOf, type Schedule } from "./model";

/** Yalnız görünümde :00 saniye sonunu atıyoruz. Sıfır olmayan gerçek saniye görünür, yuvarlama yok. */
export function shortTime(value: string, zone: string, format: string) {
  const full = timeText(value, zone, format),
    date = new Date(value);
  return date.getUTCSeconds() === 0 ? full.replace(/(\d{2}:\d{2}):00/, "$1") : full;
}

/** Dakika güncellemesi şimdi çizgisi ve sıradaki yazısı için. Komut veya toplam hesabına girmez. */
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export type Phase = "past" | "current" | "next";
export function phaseOf(block: Schedule, now: number): Phase {
  const start = Date.parse(block.startsAt),
    end = Date.parse(block.endsAt);
  return end <= now ? "past" : start <= now ? "current" : "next";
}

/** Şimdi ne var satırı yalnız yüklenmiş bugünkü sayfadan gelir. Veri yoksa tahmin etmiyoruz. */
export function NowNext({
  blocks,
  now,
  zone,
  format,
  start,
  canStart,
}: {
  blocks: Schedule[];
  now: number;
  zone: string;
  format: string;
  start: (block: Schedule) => void;
  canStart: boolean;
}) {
  const current = blocks.find(block => phaseOf(block, now) === "current");
  const block = current ?? blocks.find(block => phaseOf(block, now) === "next");
  if (!block) return null;
  const left = Math.max(0, Math.ceil((Date.parse(block.endsAt) - now) / 60000)),
    until = Math.max(0, Math.ceil((Date.parse(block.startsAt) - now) / 60000));
  const span = `${shortTime(block.startsAt, zone, format)}–${shortTime(block.endsAt, zone, format)}`;
  const total = Date.parse(block.endsAt) - Date.parse(block.startsAt),
    done = current ? Math.min(100, Math.max(0, ((now - Date.parse(block.startsAt)) / total) * 100)) : 0;
  return (
    <section className="now-next" aria-label={current ? "Şimdi" : "Sıradaki"}>
      <div className="now-next-text">
        <p className="now-next-when">
          {current ? "Şimdi" : "Sıradaki"} · {span} · {current ? `${left} dk kaldı` : `${until} dk sonra`}
        </p>
        <p className="now-next-title">{titleOf(block)}</p>
        {current && (
          <div className="now-progress" aria-hidden="true">
            <span style={{ width: `${done}%` }} />
          </div>
        )}
      </div>
      {block.kind === "Work" && block.taskId && (
        <button
          className="primary"
          disabled={!canStart}
          onClick={() => start(block)}
          aria-label={`Başlat: ${titleOf(block)}`}
        >
          <Play aria-hidden="true" size={14} />
          Başlat
        </button>
      )}
    </section>
  );
}

type RowProps = {
  block: Schedule;
  zone: string;
  format: string;
  phase: Phase;
  ready: boolean;
  canStart: boolean;
  edit: (trigger: HTMLElement) => void;
  remove: (trigger: HTMLElement) => void;
  move: (trigger: HTMLElement) => void;
  open: (trigger: HTMLElement) => void;
  start: () => void;
};

export function BlockRow({ block, zone, format, phase, ready, canStart, edit, remove, move, open, start }: RowProps) {
  const title = titleOf(block),
    task = block.kind === "Work" && !!block.taskId;
  return (
    <li
      className={`agenda-block agenda-${block.kind.toLowerCase()} is-${phase}`}
      aria-current={phase === "current" ? "time" : undefined}
    >
      <div className="agenda-time">
        <time dateTime={block.startsAt}>{shortTime(block.startsAt, zone, format)}</time>
        <span aria-hidden="true"> — </span>
        <time dateTime={block.endsAt}>{shortTime(block.endsAt, zone, format)}</time>
      </div>
      <div className="agenda-block-body">
        <h3>
          {task ? (
            <button className="block-title" onClick={e => open(e.currentTarget)}>
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        <p className="agenda-meta">
          <span className="kind-dot" aria-hidden="true" />
          {kinds[block.kind]} · {minutes((Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 1000)}
          {block.isFixed && (
            <span className="chip amber">
              <Pin aria-hidden="true" size={12} />
              Sabit
            </span>
          )}
          {block.isLocked && (
            <span className="chip">
              <Lock aria-hidden="true" size={12} />
              Kilitli
            </span>
          )}
          {block.splitGroupId && (
            <span className="chip">
              <Moon aria-hidden="true" size={12} />
              Bağlı gece parçası
            </span>
          )}
          {phase === "current" && <span className="now-tag">Şimdi</span>}
          {phase === "past" && <span>Geçti</span>}
        </p>
        {block.taskSnapshot && (
          <p className="muted form-hint block-note">
            Plan anındaki kendi iş tahmini: {minutes(block.taskSnapshot.directEstimatedSeconds)}. Güncel görev ayrı
            okunur.
          </p>
        )}
      </div>
      <div className="agenda-block-actions">
        {task && (
          <button
            className="ghost start"
            disabled={!ready || !canStart}
            onClick={start}
            aria-label="Planlı çalışmayı başlat"
          >
            <Play aria-hidden="true" size={14} />
            <span className="start-label">Başlat</span>
          </button>
        )}
        <Menu
          label={`${title} bloğu için işlemler`}
          items={[
            { label: "Saatleri düzenle", ariaLabel: `${title} bloğunu düzenle`, disabled: !ready, onSelect: edit },
            {
              label: "Başka güne taşı",
              ariaLabel: `${title} bloğunu başka güne taşı`,
              disabled: !ready,
              onSelect: move,
            },
            task && { label: "Görev ayrıntısı", onSelect: open },
            { label: "Kaldır", ariaLabel: `${title} bloğunu kaldır`, danger: true, disabled: !ready, onSelect: remove },
          ]}
        />
      </div>
    </li>
  );
}

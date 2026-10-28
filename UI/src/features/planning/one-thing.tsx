"use client";
import { useState } from "react";
import { ArrowRight, Check, Pencil, Play, Timer } from "lucide-react";
import { entryFacts } from "./day-plan";
import type { Hint } from "./glance";
import { FirstStepEditor } from "./first-step";
import { shortTime } from "./agenda-blocks";

type Entry = Parameters<typeof entryFacts>[0];
const laterKey = (date: string) => `adhd.later.v1:${date}`;
function readLater(date: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(laterKey(date));
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function writeLater(date: string, value: Record<string, number>) {
  try {
    localStorage.setItem(laterKey(date), JSON.stringify(value));
  } catch {
    /* Sonra bak yalnız bu görünümde etkili. */
  }
}

/** Tek görev önce mevcut saatli öğeyi, yoksa ilk açık öğeyi gösterir. Sonra bak yalnız görünümü değiştirir, yazı yok. Aynı görev aynı gün ikinci kez ertelenince küçültme önerilir. */
export function OneThing({
  date,
  zone,
  format,
  entries,
  currentKey,
  hints,
  canStart,
  supportsEnabled,
  start,
  finish,
  five,
  now,
}: {
  date: string;
  zone: string;
  format: string;
  entries: Entry[];
  currentKey: string | null;
  hints: Map<string, Hint>;
  canStart: boolean;
  supportsEnabled: boolean;
  start: (entry: Entry) => void;
  finish: (entry: Entry) => Promise<unknown>;
  five: (taskId: string, title: string, trigger: HTMLElement) => void;
  now: number;
}) {
  const [later, setLater] = useState<Record<string, number>>(() => readLater(date));
  const [skipped, setSkipped] = useState<string[]>([]);
  const [editing, setEditing] = useState<"first" | "stuck" | null>(null);
  const keyOf = (entry: Entry) => `${entry.kind}:${entry.kind === "block" ? entry.block.id : entry.item.id}`;
  const open = entries.filter(entry => !entryFacts(entry).done);
  const ordered = [
    ...open.filter(entry => keyOf(entry) === currentKey),
    ...open.filter(entry => keyOf(entry) !== currentKey),
  ];
  const visible = ordered.filter(entry => !skipped.includes(keyOf(entry)));
  const entry = visible[0] ?? ordered[0];
  if (!entry)
    return (
      <section className="one-thing" aria-label="Şimdi tek görev">
        <p>Bu gün için açık iş kalmadı. Dinlenebilir ya da listeye dönebilirsin.</p>
      </section>
    );
  const facts = entryFacts(entry);
  const block = entry.kind === "block" ? entry.block : null;
  const isNow = keyOf(entry) === currentKey;
  const step = facts.taskId ? hints.get(facts.taskId)?.nextStep : undefined;
  const next = visible.find(x => keyOf(x) !== keyOf(entry));
  const laterCount = facts.taskId ? (later[facts.taskId] ?? 0) : 0;
  const left = block && isNow ? Math.max(0, Math.ceil((Date.parse(block.endsAt) - now) / 60000)) : 0;
  const time = (iso: string) => shortTime(iso, zone, format);
  return (
    <section className="one-thing" aria-labelledby="one-thing-title">
      <p className="one-thing-meta">
        <span className="one-thing-badge">{isNow ? "Şimdi" : "Sıradaki"}</span>
        <span className="muted">
          {block ? `${time(block.startsAt)}–${time(block.endsAt)}` : "Saatsiz"}
          {isNow ? ` · ${left} dk kaldı` : facts.estimate ? ` · ${facts.estimate}` : ""}
        </span>
      </p>
      {facts.parent && <p className="muted one-thing-parent">{facts.parent}</p>}
      <h2 id="one-thing-title">{facts.title}</h2>
      {editing && facts.taskId ? (
        <FirstStepEditor taskId={facts.taskId} prompt={editing} close={() => setEditing(null)} />
      ) : step ? (
        <div className="one-thing-step">
          <ArrowRight aria-hidden="true" size={18} />
          <div>
            <span className="one-thing-step-label">İlk adım</span>
            <span>{step.text}</span>
          </div>
          <button
            type="button"
            className="ghost icon"
            aria-label="İlk adımı düzenle"
            onClick={() => setEditing("first")}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
      {laterCount >= 2 && !editing && facts.taskId && (
        <p className="one-thing-hint">
          Bu iş büyük mü geliyor?{" "}
          <button type="button" className="r2-quiet-link" onClick={() => setEditing("stuck")}>
            Küçültelim mi?
          </button>
        </p>
      )}
      <div className="one-thing-actions">
        <button type="button" className="primary" disabled={!canStart || !facts.taskId} onClick={() => start(entry)}>
          <Play aria-hidden="true" size={16} />
          Başlat
        </button>
        <button type="button" onClick={() => void finish(entry)}>
          <Check aria-hidden="true" size={16} />
          Bitti
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            if (facts.taskId) {
              const value = { ...later, [facts.taskId]: laterCount + 1 };
              setLater(value);
              writeLater(date, value);
            }
            setSkipped([...skipped, keyOf(entry)]);
          }}
        >
          Sonra bak
        </button>
      </div>
      {facts.taskId && !editing && (!step || supportsEnabled) && (
        <div className="one-thing-small">
          {!step && (
            <button type="button" className="one-thing-chip" onClick={() => setEditing("first")}>
              <Pencil aria-hidden="true" size={14} />
              İlk adımı yaz
            </button>
          )}
          {supportsEnabled && (
            <button
              type="button"
              className="one-thing-chip"
              disabled={!canStart}
              onClick={event => five(facts.taskId!, facts.title, event.currentTarget)}
            >
              <Timer aria-hidden="true" size={14} />
              Sadece 5 dakika
            </button>
          )}
        </div>
      )}
      {next && (
        <p className="muted one-thing-next">
          Sıradaki: <span>{entryFacts(next).title}</span>
        </p>
      )}
    </section>
  );
}

"use client";
import type { Schedule } from "./model";

export const leadMinutes = 10;
export const hyperRatio = 1.5;
export type Nudge = { key: string; text: string; kind: "transition" | "hyper" };

/** Uyarı saatleri sunucu blokları, tahminleri ve düzeltilmiş saatten gelir. Eşikler görünüm sabiti. Uyarı sorar, durdurmaz veya taşımaz; tek şerit gösterilir. Yalnız eşleşen Ready/okunmamış bildirim geçiş şeridini bastırır. */
export function pickNudge({
  now,
  blocks,
  work,
  dismissed,
  notify,
}: {
  now: number;
  blocks: Pick<Schedule, "id" | "startsAt" | "endsAt" | "completedAt" | "kind" | "taskSnapshot">[];
  work: {
    id: string;
    activeSeconds: number;
    estimateSeconds: number | null;
    plannedEnd: string | null;
    focus: boolean;
  } | null;
  dismissed: ReadonlySet<string>;
  notify: ReadonlySet<string>;
}): Nudge | null {
  if (work && !work.focus) {
    const overPlan = work.plannedEnd ? now > Date.parse(work.plannedEnd) : false;
    const overEstimate = work.estimateSeconds ? work.activeSeconds >= work.estimateSeconds * hyperRatio : false;
    const key = `hyper:${work.id}`;
    if ((overPlan || overEstimate) && !dismissed.has(key))
      return { key, kind: "hyper", text: "Planladığın süre doldu; devam mı, kısa mola mı?" };
  }
  for (const block of blocks) {
    if (block.kind !== "Work" || block.completedAt) continue;
    const start = Date.parse(block.startsAt),
      end = Date.parse(block.endsAt);
    const title = block.taskSnapshot?.task.title ?? "Sıradaki iş";
    if (
      !notify.has(`start:${block.id}`) &&
      start > now &&
      start - now <= leadMinutes * 60_000 &&
      !dismissed.has(`start:${block.id}`)
    )
      return {
        key: `start:${block.id}`,
        kind: "transition",
        text: `${Math.ceil((start - now) / 60_000)} dk sonra: ${title}`,
      };
    if (
      !notify.has(`end:${block.id}`) &&
      end > now &&
      end - now <= 5 * 60_000 &&
      start <= now &&
      !dismissed.has(`end:${block.id}`)
    )
      return { key: `end:${block.id}`, kind: "transition", text: `${title} için ayrılan süre bitmek üzere.` };
  }
  return null;
}

export function NudgeStrip({
  nudge,
  calm,
  dismiss,
  pause,
}: {
  nudge: Nudge;
  calm: boolean;
  dismiss: (key: string) => void;
  pause: () => void;
}) {
  return (
    <div className={`nudge${calm ? " calm" : ""}`} role="status">
      <span>{nudge.text}</span>
      {nudge.kind === "hyper" ? (
        <>
          <button type="button" className="r2-quiet-link" onClick={() => dismiss(nudge.key)}>
            Devam
          </button>
          <button
            type="button"
            className="r2-quiet-link"
            onClick={() => {
              dismiss(nudge.key);
              pause();
            }}
          >
            Kısa mola
          </button>
        </>
      ) : (
        <button type="button" className="r2-quiet-link" onClick={() => dismiss(nudge.key)}>
          Tamam
        </button>
      )}
    </div>
  );
}

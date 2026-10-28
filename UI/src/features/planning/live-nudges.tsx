"use client";
import { useState } from "react";
import { useSession } from "../auth/provider";
import { useWork } from "../work/coordinator";
import { useLocal, writeLocal } from "../../lib/local-preference";
import { useMinute } from "./agenda-blocks";
import { useGlance } from "./glance";
import { NudgeStrip, pickNudge } from "./nudges";
import { readyHintKeys } from "./notification-hints";
import { useDaySignals } from "./signals-queries";
import type { Schedule } from "./model";

/** Saat, bildirim ve süre değişince yalnız şerit çizilir, plan listesi değil. */
export function LiveNudges({
  date,
  blocks,
  loaded,
  calm,
}: {
  date: string;
  blocks: Schedule[];
  loaded: boolean;
  calm: boolean;
}) {
  const work = useWork(),
    { state } = useSession(),
    now = useMinute();
  const running = work.work?.state === "Running" ? work.work : null;
  const signals = useDaySignals(date).data;
  const focus = signals?.focus;
  const glance = useGlance(date, false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const continueKey = `adhd.nudge.continued.v1:${state.user!.id}`;
  const continued = useLocal(continueKey);
  const remembered = continued ? new Set([...dismissed, `hyper:${continued}`]) : dismissed;
  const task = signals?.runningTask;
  const nudgeNow = glance.data ? Date.parse(glance.data.serverNow) + Math.max(0, now - glance.dataUpdatedAt) : now;
  const planned = blocks.filter(b => b.state === "Planned");
  const block = running ? planned.find(b => b.id === running.startedScheduleId) : undefined;
  const nudge =
    loaded && signals?.complete
      ? pickNudge({
          now: nudgeNow,
          blocks: planned,
          work: running
            ? {
                id: running.id,
                activeSeconds:
                  Number(running.activeSeconds) + Math.max(0, (nudgeNow - Date.parse(running.serverNow)) / 1000),
                estimateSeconds:
                  !task?.hasDirectWork || task.directEstimatedSeconds == null
                    ? null
                    : Number(task.directEstimatedSeconds),
                plannedEnd: block?.endsAt ?? null,
                focus: !signals?.focusIncluded || focus?.workSessionId === running.id,
              }
            : null,
          notify: readyHintKeys(signals.notifications),
          dismissed: remembered,
        })
      : null;
  return nudge ? (
    <NudgeStrip
      nudge={nudge}
      calm={calm}
      dismiss={key => {
        setDismissed(new Set([...dismissed, key]));
        if (key.startsWith("hyper:")) writeLocal(continueKey, key.slice(6));
      }}
      pause={() => void work.transition("pause")}
    />
  ) : null;
}

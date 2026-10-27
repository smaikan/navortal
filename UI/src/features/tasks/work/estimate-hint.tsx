"use client";
import { useState } from "react";
import { useEstimateSuggestion } from "../../analytics/plan-queries";
import { useDisplayPreferences } from "../../workspace/queries";
import { localToday } from "../../preferences/model";
import { shiftDate } from "../../planning/day-nav";
import type { Task } from "../model";

export function EstimateHint({ task, apply }: { task: Task; apply: (minutes: string) => Promise<void> }) {
  const preferences = useDisplayPreferences();
  if (!preferences.data) return null;
  return <Hint task={task} today={localToday(preferences.data.values.timeZoneId)} apply={apply} />;
}
function Hint({ task, today, apply }: { task: Task; today: string; apply: (minutes: string) => Promise<void> }) {
  const query = useEstimateSuggestion({
    fromDate: shiftDate(today, -90),
    toDate: today,
    suggestionTask: task.id,
    reviewDate: null,
    startToleranceSeconds: 300,
  });
  const [busy, setBusy] = useState(false);
  const suggestion = query.data;
  if (!suggestion || suggestion.unavailableReason !== null || suggestion.suggestedSeconds === null) return null;
  const minutes = String(Math.round(Number(suggestion.suggestedSeconds) / 60));
  return (
    <p className="r2-hint">
      Benzer işler genelde {minutes} dk sürdü.{" "}
      <button
        type="button"
        className="r2-quiet-link"
        disabled={busy || query.isError}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await apply(minutes);
          } finally {
            setBusy(false);
          }
        }}
      >
        Tahmin olarak kullan
      </button>
    </p>
  );
}

"use client";
import { useId, useState } from "react";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite, readTask, taskFailure, type Task } from "../tasks/model";
import { useTaskCache } from "../tasks/queries";
import { useDisplayPreferences } from "../workspace/queries";
import { energies, type Energy } from "./model";

/** Görev enerjisi satır içi tek seçim. Ayrı düğme veya panel yok, seçince kaydolur. */
export function TaskEnergy({ task }: { task: Task }) {
  const prefs = useDisplayPreferences();
  const { session } = useSession();
  const cache = useTaskCache();
  const id = useId();
  const [value, setValue] = useState<Energy | null>(task.energyDemand ?? null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(task.energyDemand ?? null);
  if (seen !== (task.energyDemand ?? null) && !busy) {
    setSeen(task.energyDemand ?? null);
    setValue(task.energyDemand ?? null);
  }
  if (!prefs.data?.values.supportEnabled) return null;
  async function pick(next: Energy | null) {
    if (busy || task.archivedAt) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    const previous = value;
    setValue(next);
    setFailure("");
    setBusy(true);
    try {
      const fresh = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
      const result = readTask(
        await session.api
          .mutation("/api/tasks/{id}/energy", "put", {
            path: { id: task.id },
            body: { version: fresh.version, energyDemand: next },
          })
          .execute(),
      );
      if (cache.current()) void cache.update(result);
    } catch (error) {
      if (cache.current()) {
        setValue(previous);
        setFailure(taskFailure(error));
      }
    } finally {
      setBusy(false);
    }
  }
  const options: [Energy | null, string][] = [
    ...(Object.entries(energies) as [Energy, string][]),
    [null, "Belirtilmedi"],
  ];
  return (
    <section className="r2-section">
      <fieldset
        className="r2-energy"
        disabled={!!task.archivedAt}
        aria-busy={busy || undefined}
        aria-describedby={failure ? `${id}-error` : undefined}
      >
        <legend>Efor ihtiyacı</legend>
        {options.map(([key, label]) => (
          <label key={label}>
            <input type="radio" name={`${id}-energy`} checked={value === key} onChange={() => void pick(key)} />
            {label}
          </label>
        ))}
      </fieldset>
      {failure && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {failure}
        </p>
      )}
    </section>
  );
}

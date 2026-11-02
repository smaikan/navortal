"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { estimateText } from "../tasks/model";
import { readProjection, recurrenceFailure, type ProjectionItem } from "./model";
import { useRecurrenceCache } from "./queries";
import "./projection.css";

/** Sunucunun kuraldan hesapladığı, henüz kaydı olmayan rutin günleri. Okuma hata verirse plan görünümü yerinde kalır. */
export function useProjection(from: string, to: string, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "recurrence-projection", { from, to }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readProjection(
        await session.api.read("/api/recurrence-templates/projection", {
          query: { FromDate: from, ToDate: to },
          signal,
        }),
        from,
        to,
      ),
  });
}
export function byProjectionDate(items: readonly ProjectionItem[] = []) {
  const days = new Map<string, ProjectionItem[]>();
  for (const item of items) days.set(item.localDate, [...(days.get(item.localDate) ?? []), item]);
  return days;
}
export const projectionTime = (item: ProjectionItem) => item.startTime?.slice(0, 5) ?? "";

function Row({ item }: { item: ProjectionItem }) {
  const { session } = useSession();
  const cache = useRecurrenceCache();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const estimate = estimateText(item.estimatedSeconds);
  async function run(action: "skip" | "add") {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      const version = item.templateVersion;
      await (
        action === "skip"
          ? session.api.mutation("/api/recurrence-templates/{id}/occurrences/{date}/skip", "post", {
              path: { id: item.templateId, date: item.localDate },
              body: { version, taskVersion: null },
            })
          : session.api.mutation("/api/recurrence-templates/{id}/materialize", "post", {
              path: { id: item.templateId },
              body: { version, fromDate: item.localDate, toDate: item.localDate },
            })
      ).execute();
      if (cache.current()) cache.changed();
    } catch (error) {
      setFailure(recurrenceFailure(error));
      setBusy(false);
    }
  }
  return (
    <li className="routine-projected-row">
      <span className="routine-projected-text">
        {projectionTime(item) && <span className="routine-projected-time">{projectionTime(item)}</span>}
        <span>{item.title}</span>
        {estimate && <span className="muted">{estimate}</span>}
      </span>
      <span className="routine-projected-actions">
        <button
          type="button"
          aria-label={`Plana ekle: ${item.title}`}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run("add")}
        >
          Plana ekle
        </button>
        <button
          type="button"
          aria-label={`Bu günü atla: ${item.title}`}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run("skip")}
        >
          Bu günü atla
        </button>
      </span>
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
    </li>
  );
}

/** Gerçek plan öğesi değildir: kapasiteye girmez, gün yaklaşınca sunucu kendi kaydını üretir. */
export function ProjectedRoutines({ items }: { items: readonly ProjectionItem[] }) {
  if (!items.length) return null;
  return (
    <section className="routine-projected" aria-label="Rutin önizlemesi">
      <h3>Rutin önizlemesi</h3>
      <p className="muted">Bu rutinler gün yaklaşınca plana eklenir.</p>
      <ul>
        {items.map(item => (
          <Row key={`${item.templateId}:${item.localDate}`} item={item} />
        ))}
      </ul>
    </section>
  );
}
export function ProjectedDay({ date }: { date: string }) {
  const projection = useProjection(date, date);
  return <ProjectedRoutines items={projection.data?.items ?? []} />;
}

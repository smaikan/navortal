"use client";
import { useState } from "react";
import { useMinute } from "../planning/agenda-blocks";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { stamp } from "../notifications/model";
import { pageSize, readReminders, reminderFailure, repeatLabel } from "./model";

/** Aktif listede görünmeyenler: iptal edilen ve zamanı geçen tek seferlikler. Katlı gelir, açılınca bir kere okunur. */
export function ReminderHistory({ zone }: { zone: string }) {
  const { session, state } = useSession();
  const [open, setOpen] = useState(false);
  const now = useMinute();
  const history = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "custom-reminders", { kind: "history" }),
    enabled: open,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readReminders(
        await session.api.read("/api/notifications/reminders", {
          query: { offset: 0, limit: pageSize, activeOnly: false },
          signal,
        }),
        pageSize,
      ),
  });
  const rows = (history.data ?? []).filter(r => r.canceled || (!r.repeat && Date.parse(r.dueAt) < now));
  return (
    <details className="reminder-history" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Geçmiş ve iptal edilenler</summary>
      {history.isPending && open && <p role="status">Geçmiş okunuyor…</p>}
      {history.isError && <p role="alert">{reminderFailure(history.error)}</p>}
      {history.data && !rows.length && <p className="muted">Geçmişte hatırlatma yok.</p>}
      {rows.length > 0 && (
        <ul className="reminder-history-list" aria-label="Geçmiş hatırlatmalar">
          {rows.map(r => (
            <li key={r.id}>
              <span>{r.title}</span>
              <span className="muted">
                {stamp(r.dueAt, zone)}
                {r.repeat ? ` · ${repeatLabel(r.repeat)}` : ""}
                {r.canceled ? " · İptal edildi" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

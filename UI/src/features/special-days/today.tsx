"use client";
import { kindClass, occurrenceName } from "./model";
import { useOccurrences } from "./queries";
import { kindIcon } from "./icons";
import "./styles.css";

/** Bugünün özel günleri sakin şeritte, sakin görünümde de var. Okuma hatasında fazladan bir şey gösterilmez. */
export function SpecialToday({ date }: { date: string }) {
  const occurrences = useOccurrences(date, date);
  const items = occurrences.data?.items ?? [];
  if (!items.length) return null;
  return (
    <ul className="special-strip special-today" aria-label="Bugünün özel günleri">
      {items.map(o => {
        const Icon = kindIcon[o.kind];
        return (
          <li key={`${o.specialDayId}:${o.date}`} className={`special-chip ${kindClass(o.kind)}`}>
            <Icon aria-hidden="true" size={14} />
            <span className="sr-only">{occurrenceName(o)}</span>
            <span aria-hidden="true">{o.title}</span>
          </li>
        );
      })}
    </ul>
  );
}

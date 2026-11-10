"use client";
import { Plus } from "lucide-react";
import { TaskPicker, PickerLabel, pickerRows, useTaskPicker } from "../tasks/picker";
import type { DayActions } from "./day-actions";
import "./styles.css";

export function AddToPlan({
  date,
  planned,
  plannedTitles,
  actions,
  large = false,
}: {
  date: string;
  planned: ReadonlySet<string>;
  plannedTitles: ReadonlySet<string>;
  actions: DayActions;
  large?: boolean;
}) {
  const failure = actions.failure?.id.startsWith("add:") ? actions.failure.text : "";
  return (
    <div className={large ? "r2-add-plan-large" : undefined}>
      <TaskPicker
        leadingIcon={<Plus size={18} aria-hidden="true" />}
        date={date}
        excluded={planned}
        excludedTitles={plannedTitles}
        hierarchical
        choose={(row, scope) => actions.add(row.id, scope)}
        create={(title, fields) => actions.create(title, fields)}
        disabled={!!actions.pending || actions.uncertainCreate}
      />
      {actions.uncertainCreate && (
        <button type="button" disabled={!!actions.pending} onClick={() => void actions.retryCreate()}>
          Aynı eklemeyi güvenle yeniden dene
        </button>
      )}
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
    </div>
  );
}
export function AssignedList({
  date,
  planned,
  actions,
}: {
  date: string;
  planned: ReadonlySet<string>;
  actions: DayActions;
}) {
  const query = useTaskPicker(date, "");
  const assigned = pickerRows(query.data?.pages, "assigned", planned);
  const last = query.data?.pages.at(-1)?.assigned;
  const moreAssigned = !!last && Number(last.offset) + last.items.length < Number(last.total);
  if (!assigned.length) return null;
  return (
    <section className="r2-assigned" aria-labelledby="r2-assigned-title">
      <h3 id="r2-assigned-title">Bu güne atanmış görevler</h3>
      <ul>
        {assigned.map(row => (
          <li key={row.id}>
            <PickerLabel row={row} />
            <button
              type="button"
              className="r2-soft"
              disabled={!!actions.pending || actions.uncertainCreate}
              aria-label={`Plana ekle: ${row.title}`}
              onClick={() => void actions.add(row.id)}
            >
              Ekle
            </button>
          </li>
        ))}
      </ul>
      {moreAssigned && (
        <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Diğer görevleri göster
        </button>
      )}
    </section>
  );
}

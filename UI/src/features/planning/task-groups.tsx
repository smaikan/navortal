"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { components } from "../../lib/api/generated/schema";
import { entryFacts } from "./day-plan";
import { entryId, type Entry } from "./day-actions";
export type PlanGroup = components["schemas"]["DayPlanGroup"];
/** Group membership comes from the saved plan, rather than today's mutable task tree. */
export function groupEntries(entries: Entry[], groups: PlanGroup[]) {
  const groupByTask = new Map(
    groups
      .filter(g => entries.some(e => entryFacts(e).taskId === g.taskId))
      .flatMap(g => g.members.map(m => [m.taskId, g] as const)),
  );
  return entries
    .filter(e => {
      const g = groupByTask.get(entryFacts(e).taskId ?? "");
      return !g || g.taskId === entryFacts(e).taskId;
    })
    .map(entry => ({ entry, group: groupByTask.get(entryFacts(entry).taskId ?? "") }));
}
export function PlanTaskGroup({
  group,
  entries,
  row,
}: {
  group: PlanGroup;
  entries: Entry[];
  row: (entry: Entry) => ReactNode;
}) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const render = (taskId: string, seen: ReadonlySet<string> = new Set()): ReactNode => {
    if (seen.has(taskId)) return null;
    const path = new Set(seen).add(taskId),
      own = entries.filter(e => entryFacts(e).taskId === taskId);
    const children = group.members.filter(m => m.parentTaskId === taskId && m.taskId !== taskId);
    const open = !closed.has(taskId),
      title = group.members.find(m => m.taskId === taskId)?.title ?? "Alt görevler";
    return (
      <li key={taskId} className="r2-plan-task-group">
        <div className="r2-plan-group-head">
          {children.length > 0 && (
            <button
              type="button"
              className="ghost icon r2-plan-group-toggle"
              aria-label={`${title} alt görevleri`}
              aria-expanded={open}
              onClick={() =>
                setClosed(before => {
                  const next = new Set(before);
                  if (next.has(taskId)) next.delete(taskId);
                  else next.add(taskId);
                  return next;
                })
              }
            >
              <ChevronRight size={14} aria-hidden style={{ transform: open ? "rotate(90deg)" : undefined }} />
            </button>
          )}
          <ol className="r2-plan-list">
            {own.length ? (
              own.map(e => <Slot key={`${e.kind}:${entryId(e)}`}>{row(e)}</Slot>)
            ) : (
              <li className="r2-plan-group-context">{title}</li>
            )}
          </ol>
        </div>
        {open && children.length > 0 && (
          <ol className="r2-plan-group-children">{children.map(m => render(m.taskId, path))}</ol>
        )}
      </li>
    );
  };
  return render(group.taskId);
}
function Slot({ children }: { children: ReactNode }) {
  return children;
}

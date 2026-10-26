import { Flag, Gauge } from "lucide-react";
import { energies } from "../support/model";
import type { Task } from "./model";
import type { rowFacts } from "./tree/model";

export function RowLevels({
  priority,
  effort,
}: {
  priority: ReturnType<typeof rowFacts>["priority"];
  effort: Task["energyDemand"];
}) {
  return (
    <>
      {priority && (
        <span className={`r2-priority ${priority.tone}`}>
          <Flag aria-hidden="true" size={12} />
          Öncelik: {priority.text}
        </span>
      )}
      {effort && (
        <span className="r2-effort" data-effort={effort}>
          <Gauge aria-hidden="true" size={12} />
          Efor: {energies[effort]}
        </span>
      )}
    </>
  );
}

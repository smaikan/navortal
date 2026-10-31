import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-client";

export const WORK_CHANNEL = "adhd.work.changes.v1";
const resources = [
  "task",
  "tasks",
  "task-tree",
  "task-work",
  "task-components",
  "task-lifecycle-progress",
  "task-start",
  "collection-workload",
  "work-log",
  "work-detail",
  "work-segments",
  "work-corrections",
  "plan-allocation",
  "day-overview",
  "day-signals",
  "plan-day",
  "plan-blocks",
  "task-time",
  "task-detail",
  "return-context",
  "support-end",
  "recurrence-occurrences",
  "task-recurrence",
];

/** Çalışma yazısı süreyi, ilerlemeyi ve bütün iş görünümlerini etkiler. Duyuru gelince bu ve diğer sekmeler yeniden okur. */
export function announceWorkChange(client: QueryClient, owner: string, channel?: BroadcastChannel | null) {
  void Promise.all(
    resources.map(resource => client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) })),
  );
  try {
    const target = channel ?? new BroadcastChannel(WORK_CHANNEL);
    target.postMessage({ version: 1, kind: "work-changed" });
    if (!channel) target.close();
  } catch {
    /* Diğer sekmeler sonraki görünür eşitlemede güncel duruma gelir. */
  }
}

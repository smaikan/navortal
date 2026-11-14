import { validTaskId } from "../../components/layout/task-panel-url";
export const resources = {
  MatrixChanged: ["matrix", "matrix-candidates"],
  TaskChanged: [
    "matrix",
    "matrix-candidates",
    "day-overview",
    "day-signals",
    "task",
    "tasks",
    "day-items",
    "calendar-items",
    "calendar-overview",
    "task-tree",
    "task-work",
    "task-components",
    "task-lifecycle-progress",
    "task-relations",
    "task-start",
    "task-ancestors",
    "task-classification",
    "task-detail",
    "collection-workload",
    "collections",
    "collection-task-tree",
    "plan-allocation",
    "task-time",
    "task-detail",
    "return-context",
    "support-day",
    "support-end",
    "recurrence-occurrences",
    "task-recurrence",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
    "analytics",
    "plan-glance",
    "estimate-accuracy",
    "work-latest",
  ],
  PlanChanged: [
    "calendar-items",
    "day-overview",
    "day-signals",
    "plan-day",
    "plan-blocks",
    "day-items",
    "calendar-items",
    "calendar-overview",
    "plan-allocation",
    "plan-revisions",
    "plan-revision",
    "revision-items",
    "revision-changes",
    "calendar-range",
    "calendar-overview",
    "calendar-day",
    "calendar-revisions",
    "task-time",
    "task-detail",
    "support-end",
    "analytics",
    "plan-glance",
  ],
  DayItemChanged: [
    "recurrence-projection",
    "day-overview",
    "day-signals",
    "plan-blocks",
    "day-items",
    "calendar-items",
    "calendar-overview",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
    "plan-glance",
    "plan-revisions",
    "revision-changes",
  ],
  WorkChanged: [
    "collections",
    "collection-workload",
    "collection-task-tree",
    "day-overview",
    "day-signals",
    "task",
    "tasks",
    "task-work",
    "task-components",
    "task-lifecycle-progress",
    "task-start",
    "task-time",
    "task-detail",
    "return-context",
    "work-log",
    "work-detail",
    "work-segments",
    "work-corrections",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
    "support-end",
    "focus-current",
    "focus-list",
    "analytics",
    "plan-glance",
    "estimate-accuracy",
    "work-latest",
  ],
  FocusChanged: [
    "day-overview",
    "day-signals",
    "focus-current",
    "focus-list",
    "focus-detail",
    "work-detail",
    "work-log",
    "task-time",
    "task-detail",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
    "analytics",
  ],
  PreferencesChanged: [
    "day-overview",
    "day-signals",
    "workspace-snapshot",
    "preferences",
    "plan-day",
    "plan-blocks",
    "plan-allocation",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
    "support-day",
    "support-end",
    "plan-glance",
  ],
  RecurrenceChanged: [
    "collections",
    "recurrence",
    "recurrence-projection",
    "day-overview",
    "calendar-items",
    "calendar-overview",
    "recurrence-detail",
    "recurrence-definitions",
    "recurrence-occurrences",
    "task-recurrence",
    "tasks",
    "task",
    "task-detail",
    "task-tree",
    "collection-workload",
    "collection-task-tree",
    "support-end",
  ],
  NotificationReady: ["notifications", "notification", "notification-alerts", "custom-reminders", "day-signals"],
  NotesChanged: [
    "notes",
    "note-categories",
    "return-context",
    "plan-glance",
    "day-overview",
    "day-signals",
    "support-end",
  ],
  NotificationPreferencesChanged: ["notification-preferences", "notification-alerts", "push-config", "day-signals"],
  // Özel gün değişirse tekrarlar ve çalışılmayan günse bugünün kapasitesi de değişir.
  SpecialDayChanged: [
    "day-overview",
    "day-signals",
    "special-days",
    "special-day-occurrences",
    "plan-glance",
    "plan-day",
    "plan-blocks",
    "calendar-day",
    "calendar-range",
    "calendar-overview",
  ],
} as const;
export type ChangeKind = keyof typeof resources;
export type Change = { eventId: string; kind: ChangeKind; sourceId: string; sourceVersion: number | string };
export type Status = "connecting" | "connected" | "reconnecting" | "fallback" | "offline" | "paused";
export const statusLabels: Record<Status, string> = {
  connecting: "Canlı bağlantı kuruluyor",
  connected: "Canlı bağlantı açık",
  reconnecting: "Canlı bağlantı yeniden kuruluyor",
  fallback: "Canlı bağlantı yok; aralıklı kontrol açık",
  offline: "Çevrimdışı; bağlantı bekleniyor",
  paused: "Arka planda; dönüşte güncellenecek",
};
export function decodeChange(v: unknown): Change | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>,
    n = e.sourceVersion;
  const version =
    typeof n === "number"
      ? Number.isSafeInteger(n) && n >= 0
      : typeof n === "string" && /^(0|[1-9]\d*)$/.test(n) && BigInt(n) <= 9223372036854775807n;
  if (
    typeof e.eventId !== "string" ||
    !validTaskId(e.eventId) ||
    typeof e.sourceId !== "string" ||
    !validTaskId(e.sourceId) ||
    typeof e.kind !== "string" ||
    !Object.hasOwn(resources, e.kind) ||
    !version
  )
    return null;
  return { eventId: e.eventId, sourceId: e.sourceId, kind: e.kind as ChangeKind, sourceVersion: n as number | string };
}
/** Yalnız makbuz kimlikleri tutulur. Sürümler türe göre farklıdır, HTTP verisini ezmezler. */
export function eventWindow(capacity = 1024) {
  const seen = new Set<string>();
  return {
    accept(id: string) {
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > capacity) seen.delete(seen.values().next().value!);
      return true;
    },
    clear: () => seen.clear(),
    size: () => seen.size,
  };
}

import type { Notification } from "../notifications/model";
import { isUnread } from "../notifications/unread";

export function readyHintKeys(items: readonly Pick<Notification, "kind" | "sourceId" | "state" | "readAt">[]) {
  return new Set(
    items
      .filter(isUnread)
      .flatMap(n =>
        n.kind === "ScheduleStart" ? [`start:${n.sourceId}`] : n.kind === "ScheduleEnd" ? [`end:${n.sourceId}`] : [],
      ),
  );
}

import type { Notification } from "./model";
export const isUnread = (n: Pick<Notification, "state" | "readAt">) => n.state === "Ready" && n.readAt === null;

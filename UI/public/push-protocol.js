import { isAlertSound } from "./alert-tones.js";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const deliveryKey = (owner, id, round) => `${owner}:${id}:${round}`;
export function notificationPath(id, url) {
  if (typeof id !== "string" || !guid.test(id)) return null;
  const path = `/notifications?notificationId=${id}`;
  return url === `/notifications/${id}` || url === path || url === `/app/bildirimler?notificationId=${id}` ? path : null;
}
export function readEnvelope(v) {
  const text = value => typeof value === "string" && value.length >= 1 && value.length <= 200 && value.trim() === value;
  if (!v || !guid.test(v.notificationId) || !guid.test(v.recipientUserId) || !Number.isSafeInteger(v.snoozeCount) || v.snoozeCount < 0 || v.snoozeCount > 2147483647 || v.tag !== `notification:${v.notificationId}` || !text(v.title) || !text(v.body) || typeof v.silent !== "boolean") return null;
  if (v.sound !== undefined && !isAlertSound(v.sound)) return null;
  const url = notificationPath(v.notificationId, v.url); if (!url) return null;
  return { notificationId: v.notificationId, recipientUserId: v.recipientUserId, snoozeCount: v.snoozeCount, tag: v.tag, title: v.title, body: v.body, url, silent: v.silent, sound: v.sound ?? "soft" };
}

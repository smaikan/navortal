import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { deliveryKey as pushDeliveryKey } from "../../../public/push-protocol.js";
import { isAlertSound } from "./alert-tones";
export type Notification = components["schemas"]["NotificationView"];
export type Preferences = components["schemas"]["NotificationPreferencesView"];
export type Settings = Preferences["settings"];
export const pageSize = 25;
export function stamp(value: string | null, zone: string) {
  return value
    ? new Intl.DateTimeFormat("tr", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(value))
    : "—";
}
export const kinds = {
  ScheduleStart: "Planlı iş başlıyor",
  ScheduleEnd: "Planlı iş bitiyor",
  TaskDeadline: "Son teslim",
  FocusTarget: "Odak hedefi",
  BreakEnd: "Mola bitti",
  ReturnToTask: "İşe dönüş",
  Custom: "Hatırlatma",
  SpecialDay: "Özel gün",
};
export const states = {
  Pending: "Bekliyor",
  Ready: "Hazır",
  Obsolete: "Geçerliliğini yitirdi",
  Suppressed: "Tercihler nedeniyle kapalı",
  Expired: "Süresi geçti",
};
export const switches = {
  enabled: "Bildirimler açık",
  soundEnabled: "Bildirim sesi",
  scheduleStart: "Planlı iş başlangıcı",
  scheduleEnd: "Planlı iş bitişi",
  taskDeadline: "Görev son teslimi",
  focusTarget: "Odak hedefi",
  breakEnd: "Mola sonu",
  returnToTask: "İşe dönüş",
  custom: "Özel hatırlatmalar",
  specialDay: "Özel günler",
} as const;
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" &&
      /^(0|[1-9]\d*)$/.test(v) &&
      BigInt(v) >= BigInt(min) &&
      BigInt(v) <= 9223372036854775807n;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
function invalid(): never {
  throw new ApiError("protocol", "Bildirim yanıtı eksik veya geçersiz. Yeniden yükle.");
}
export type DeliveryStatus = components["schemas"]["NotificationDeliveryStatus"];
export function readDeliveryStatus(value: DeliveryStatus): DeliveryStatus {
  if (
    !value ||
    typeof value.snoozeCount !== "number" ||
    !Number.isSafeInteger(value.snoozeCount) ||
    value.snoozeCount < 0 ||
    ![value.preparedAt, value.providerAcceptedAt, value.clientDisplayedAt, value.clientOpenedAt, value.readAt].every(
      v => v === null || instant(v),
    )
  )
    invalid();
  return value;
}
export function readNotification(n: Notification, expectedId?: string): Notification {
  if (
    !n ||
    !id(n.id) ||
    (expectedId && n.id !== expectedId) ||
    !id(n.sourceId) ||
    ![n.taskId, n.dailyPlanId, n.revisionId].every(nullableId) ||
    typeof n.kind !== "string" ||
    !Object.hasOwn(kinds, n.kind) ||
    !Object.hasOwn(states, n.state) ||
    !instant(n.occurredAt) ||
    ![n.readyAt, n.notBefore, n.readAt].every(v => v === null || instant(v)) ||
    !integer(n.snoozeCount) ||
    !integer(n.version, 1) ||
    typeof n.soundEnabled !== "boolean" ||
    (n.sound != null && !isAlertSound(n.sound)) ||
    (n.title != null && (typeof n.title !== "string" || !n.title.trim() || n.title.length > 200)) ||
    (n.state === "Ready" && n.readyAt === null)
  )
    invalid();
  return n;
}
export function readPage(p: components["schemas"]["NotificationPage"], offset: number) {
  if (
    !p ||
    !Array.isArray(p.items) ||
    !integer(p.offset) ||
    !integer(p.limit, 1) ||
    Number(p.offset) !== offset ||
    Number(p.limit) !== pageSize ||
    !integer(p.total) ||
    p.items.length > pageSize ||
    (Number(p.total) < offset + p.items.length && p.items.length > 0)
  )
    invalid();
  const ids = new Set<string>();
  p.items.forEach(n => {
    readNotification(n);
    if (ids.has(n.id)) invalid();
    ids.add(n.id);
  });
  return p;
}
export function validateSettings(s: Settings): Settings {
  if (!s || ![...Object.keys(switches), "pushEnabled"].every(key => typeof s[key as keyof Settings] === "boolean"))
    throw new RangeError("Bildirim türlerini kontrol et.");
  if (![s.pomodoroSound, s.reminderSound, s.taskEndSound].every(isAlertSound))
    throw new RangeError("Bildirim sesini listeden seç.");
  for (const key of ["leadSeconds", "snoozeSeconds", "returnAfterSeconds"] as const)
    if (!integer(s[key], key === "snoozeSeconds" ? 60 : 0) || Number(s[key]) > 86400)
      throw new RangeError(
        key === "snoozeSeconds" ? "Erteleme 60–86400 saniye olmalı." : "Süre 0–86400 saniye olmalı.",
      );
  const a = s.quietStart ?? null,
    b = s.quietEnd ?? null;
  const time = (v: string) => {
    try {
      return /^\d\d:\d\d(?::\d\d(?:\.\d{1,7})?)?$/.test(v) && !!Temporal.PlainTime.from(v);
    } catch {
      return false;
    }
  };
  if (
    (a !== null && (typeof a !== "string" || !time(a))) ||
    (b !== null && (typeof b !== "string" || !time(b))) ||
    (a === null) !== (b === null) ||
    (a !== null && b !== null && Temporal.PlainTime.compare(a, b) === 0)
  )
    throw new RangeError(
      "Sessiz saatlerin başlangıç ve bitişini farklı iki saat olarak gir veya ikisini de boş bırak.",
    );
  return s;
}
export function readPreferences(p: Preferences): Preferences {
  if (!p || !integer(p.version)) invalid();
  try {
    validateSettings(p.settings);
  } catch {
    invalid();
  }
  return p;
}
export type Filter = "all" | "unread" | Notification["state"];
export const isUnread = (n: Pick<Notification, "state" | "readAt">) => n.state === "Ready" && n.readAt === null;
/** Toplu okuma makbuzu eski liste yanıtından üstündür. Sonradan gelenler okunmamış kalır. */
export const isUnreadAfter = (n: Pick<Notification, "state" | "readAt" | "readyAt">, readAt: string | null) =>
  isUnread(n) && (!readAt || !n.readyAt || Temporal.Instant.compare(n.readyAt, readAt) > 0);
export const filterPage = (items: Notification[], filter: Filter) =>
  items.filter(n => filter === "all" || (filter === "unread" ? isUnread(n) : n.state === filter));
/** Gelen kutusu, açık sekme ve push için aynı kimlik. Erteleme aynı kaydın yeni teslimidir. */
export const deliveryKey = (owner: string, n: Notification) => pushDeliveryKey(owner, n.id, n.snoozeCount);
export function rebaseSettings(base: Settings, draft: Settings, remote: Settings): Settings {
  return Object.fromEntries(
    Object.entries(remote).map(([key, value]) => [
      key,
      draft[key as keyof Settings] === base[key as keyof Settings] ? value : draft[key as keyof Settings],
    ]),
  ) as Settings;
}
export function failure(e: unknown) {
  if (e instanceof RangeError) return e.message;
  if (e instanceof ApiError) {
    if (e.outcomeUnknown)
      return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel kaydı kontrol et.";
    if (e.status === 409) return "Kayıt başka bir yerde değişmiş. Seçimin korundu; güncel kaydı kontrol et.";
    if (e.status === 404) return "Bildirim bulunamadı veya bu hesaba ait değil.";
    if (e.status === 400) return "Sunucu bu değerleri kabul etmedi. Alanları kontrol et.";
    if (["offline", "protocol"].includes(e.kind)) return e.message;
  }
  return "Bildirimler alınamadı. Bağlantını kontrol edip yeniden dene.";
}
export const mustReconcile = (e: unknown) =>
  e instanceof ApiError && (e.outcomeUnknown || e.kind === "protocol" || e.status === 409 || e.status === 404);

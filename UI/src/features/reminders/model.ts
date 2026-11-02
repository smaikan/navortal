import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { resolveWallTime, type WallChoice } from "../../lib/time/wall-time";
export type Reminder = components["schemas"]["CustomReminderView"];
export type Repeat = NonNullable<Reminder["repeat"]>;
export const reminderDays = [
  [1, "Pazartesi"],
  [2, "Salı"],
  [3, "Çarşamba"],
  [4, "Perşembe"],
  [5, "Cuma"],
  [6, "Cumartesi"],
  [0, "Pazar"],
] as const;
export function repeatLabel(repeat: Repeat) {
  return `${reminderDays
    .filter(([day]) => repeat.weekDays.map(Number).includes(day))
    .map(([, name]) => name)
    .join(", ")} · ${repeat.localTime.slice(0, 5)}`;
}
export function reminderToday(zone: string) {
  return Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
}
export function reminderAfter(minutes: number, zone: string) {
  return Temporal.Now.zonedDateTimeISO(zone)
    .add({ minutes })
    .round({ smallestUnit: "minute", roundingMode: "ceil" })
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export type Job = components["schemas"]["OutboxView"];
export type JobState = Job["state"];
export const pageSize = 25;
export const jobStates = {
  Pending: "Sırada",
  Processing: "İşleniyor",
  Completed: "İşlendi",
  Obsolete: "Artık gerekli değil",
  Failed: "Tamamlanamadı",
};
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" &&
      /^(0|[1-9]\d*)$/.test(v) &&
      BigInt(v) >= BigInt(min) &&
      BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
function validRepeat(repeat: Repeat) {
  try {
    new Intl.DateTimeFormat("tr-TR", { timeZone: repeat.timeZoneId });
    return (
      !!repeat.timeZoneId &&
      /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(repeat.localTime) &&
      Array.isArray(repeat.weekDays) &&
      repeat.weekDays.length >= 1 &&
      repeat.weekDays.length <= 7 &&
      new Set(repeat.weekDays.map(Number)).size === repeat.weekDays.length &&
      repeat.weekDays.every(d => integer(d) && Number(d) >= 0 && Number(d) <= 6)
    );
  } catch {
    return false;
  }
}
function invalid(): never {
  throw new ApiError("protocol", "Hatırlatma yanıtı eksik veya geçersiz. Güncel listeyi yeniden oku.");
}
export function readReminder(r: Reminder, expectedId?: string): Reminder {
  if (
    !r ||
    !id(r.id) ||
    (expectedId && r.id !== expectedId) ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    r.title.length > 200 ||
    !instant(r.dueAt) ||
    !(r.taskId === null || id(r.taskId)) ||
    !integer(r.version, 1) ||
    typeof r.canceled !== "boolean" ||
    (r.repeat != null && !validRepeat(r.repeat))
  )
    invalid();
  return r;
}
export function readReminders(rows: Reminder[], max = pageSize + 1) {
  if (!Array.isArray(rows) || rows.length > max) invalid();
  const ids = new Set<string>();
  rows.forEach(r => {
    readReminder(r);
    if (ids.has(r.id)) invalid();
    ids.add(r.id);
  });
  return rows;
}
export function dueInput(at: string, zone: string) {
  return Temporal.Instant.from(at).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "second" });
}
export function reminderFields(
  title: string,
  due: string,
  zone: string,
  choice: WallChoice,
  taskId: string,
  original?: Reminder,
  repeat?: Repeat | null,
) {
  const clean = title.trim();
  if (!clean || clean.length > 200) throw new RangeError("Hatırlatma başlığı 1–200 karakter olmalı.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(due)) throw new RangeError("Hatırlatma tarihini ve saatini seç.");
  if (repeat && !repeat.weekDays.length) throw new RangeError("Tekrarlanacak en az bir gün seç.");
  if (taskId && !id(taskId)) throw new RangeError("Geçerli bir görev seç.");
  const dueAt =
    original && due === dueInput(original.dueAt, zone) ? original.dueAt : resolveWallTime(due, zone, choice);
  return {
    title: clean,
    dueAt: repeat
      ? Temporal.Instant.from(dueAt).round({ smallestUnit: "minute", roundingMode: "floor" }).toString()
      : dueAt,
    taskId: taskId || null,
    ...(original && { version: original.version }),
    ...(repeat !== undefined && { repeat }),
  };
}
export function readJob(j: Job, expectedId?: string): Job {
  if (
    !j ||
    !id(j.id) ||
    (expectedId && j.id !== expectedId) ||
    !id(j.sourceId) ||
    !integer(j.sourceVersion) ||
    typeof j.kind !== "string" ||
    !j.kind ||
    !Object.hasOwn(jobStates, j.state) ||
    !integer(j.version, 1) ||
    !integer(j.attempts) ||
    ![j.occurredAt, j.availableAt].every(instant) ||
    ![j.leaseUntil, j.completedAt].every(v => v === null || instant(v)) ||
    !(j.lastErrorCode === null || (typeof j.lastErrorCode === "string" && j.lastErrorCode.length <= 100))
  )
    invalid();
  return j;
}
export function readJobs(p: components["schemas"]["OutboxPage"], offset: number, state: JobState | "") {
  if (
    !p ||
    !Array.isArray(p.items) ||
    p.items.length > pageSize ||
    !integer(p.total) ||
    !integer(p.offset) ||
    Number(p.offset) !== offset ||
    Number(p.limit) !== pageSize
  )
    invalid();
  const ids = new Set<string>();
  p.items.forEach(j => {
    readJob(j);
    if ((state && j.state !== state) || ids.has(j.id)) invalid();
    ids.add(j.id);
  });
  return p;
}
export const canRetry = (j: Job) => j.state === "Failed";
export function reminderFailure(e: unknown) {
  if (e instanceof RangeError) return e.message;
  if (e instanceof ApiError) {
    if (e.outcomeUnknown) return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi.";
    if (e.status === 409) return "Kayıt değişmiş. Taslağın korundu; güncel listeyi oku.";
    if (e.status === 404) return "Kayıt bulunamadı veya bu hesaba ait değil.";
    if (e.status === 400) return "Başlık ve zamanı kontrol et. Zaman gelecekte ve en çok bir yıl sonra olmalı.";
    if (["offline", "protocol"].includes(e.kind)) return e.message;
  }
  return "İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.";
}

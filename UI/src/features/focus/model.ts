import { readCoverage } from "../workspace/read-coverage";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { workFailure, type Work } from "../work/model";

type WireFocus = components["schemas"]["FocusView"];
type WireSettings = components["schemas"]["FocusSettings"];
type WirePreset = components["schemas"]["FocusPresetView"];
export type Settings = {
  workSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  longBreakEvery: number;
  targetBehavior: "ContinueTracking" | "AutoBreak";
  soundEnabled: boolean;
  notificationsEnabled: boolean;
};
export type Focus = Omit<WireFocus, "settings"> & { settings: Settings };
export type Preset = Omit<WirePreset, "settings"> & { settings: Settings };
export type Start = components["schemas"]["FocusStart"];
export const pageSize = 25;
export const labels: Record<Focus["state"], string> = {
  Working: "Odaklanılıyor",
  Paused: "Odak duraklatıldı",
  Break: "Moladasın",
  AwaitingNext: "Mola bitti; hazır olduğunda devam et",
  Finished: "Odak oturumu bitti",
  Interrupted: "Odak iptal edildi",
};
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) >= BigInt(min);
const seconds = (v: unknown) =>
  (typeof v === "number" || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0;
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
function invalid(): never {
  throw new ApiError("protocol", "Odak yanıtı eksik veya geçersiz. Güncel durumu yeniden oku.");
}
export function readSettings(s: WireSettings): Settings {
  if (
    !s ||
    !integer(s.workSeconds, 1) ||
    Number(s.workSeconds) > 86400 ||
    !integer(s.shortBreakSeconds, 1) ||
    Number(s.shortBreakSeconds) > 14400 ||
    !integer(s.longBreakSeconds, 1) ||
    Number(s.longBreakSeconds) > 43200 ||
    !integer(s.longBreakEvery, 1) ||
    Number(s.longBreakEvery) > 20 ||
    !["ContinueTracking", "AutoBreak"].includes(s.targetBehavior ?? "") ||
    typeof s.soundEnabled !== "boolean" ||
    typeof s.notificationsEnabled !== "boolean"
  )
    invalid();
  return {
    ...s,
    workSeconds: Number(s.workSeconds),
    shortBreakSeconds: Number(s.shortBreakSeconds),
    longBreakSeconds: Number(s.longBreakSeconds),
    longBreakEvery: Number(s.longBreakEvery),
    targetBehavior: s.targetBehavior as Settings["targetBehavior"],
  };
}
export function readPreset(p: WirePreset): Preset {
  if (!p || !id(p.id) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 100 || !integer(p.version, 1))
    invalid();
  return { ...p, settings: readSettings(p.settings) };
}
export function readPresets(p: components["schemas"]["FocusPresetPage"]) {
  if (
    !p ||
    !Array.isArray(p.items) ||
    p.items.length > pageSize ||
    !integer(p.total) ||
    !integer(p.offset) ||
    !Array.isArray(p.builtIns)
  )
    invalid();
  return { ...p, items: p.items.map(readPreset), builtIns: p.builtIns.map(readSettings) };
}
export function readFocus(f: WireFocus): Focus {
  if (
    !f ||
    !id(f.id) ||
    !id(f.workSessionId) ||
    !nullableId(f.taskId) ||
    !nullableId(f.previousFocusId) ||
    !nullableId(f.presetId) ||
    !nullableId(f.targetEventId) ||
    !Object.hasOwn(labels, f.state) ||
    !integer(f.cycleNumber, 1) ||
    !integer(f.version, 1) ||
    !integer(f.workSessionVersion, 1) ||
    !instant(f.startedAt) ||
    !instant(f.serverNow) ||
    ![f.workEndedAt, f.breakStartedAt, f.breakEndedAt, f.endedAt, f.targetReachedAt, f.targetObservedAt].every(
      v => v === null || instant(v),
    ) ||
    ![f.activeSeconds, f.remainingSeconds, f.overtimeSeconds, f.breakElapsedSeconds, f.breakRemainingSeconds].every(
      seconds,
    ) ||
    !integer(f.breakTargetSeconds, 1) ||
    typeof f.effectiveTargetReached !== "boolean"
  )
    invalid();
  return { ...f, settings: readSettings(f.settings) };
}
export function readCurrent(c: components["schemas"]["FocusCurrent"]) {
  readCoverage(c?.coverage);
  if (!c || !instant(c.serverNow) || !(c.session === null || typeof c.session === "object")) invalid();
  return { ...c, session: c.session === null ? null : readFocus(c.session) };
}
export function readFocusPage(p: components["schemas"]["FocusPage"]) {
  if (!p || !Array.isArray(p.items) || p.items.length > pageSize || !integer(p.total) || !integer(p.offset)) invalid();
  return { ...p, items: p.items.map(readFocus) };
}
export function settingsLabel(s: Settings) {
  const time = (n: number) => (n % 60 === 0 ? `${n / 60} dk` : `${n} sn`);
  return `${time(s.workSeconds)} çalışma / ${time(s.shortBreakSeconds)} mola`;
}
export function attachment(work: Work, planned?: { taskId: string; scheduleId: string }) {
  if (!["Running", "Paused"].includes(work.state))
    throw new RangeError("Bitmiş çalışmaya odak bağlanamaz. Güncel bir çalışma seç.");
  if (planned && (work.taskId !== planned.taskId || work.startedScheduleId !== planned.scheduleId))
    throw new RangeError("Güncel çalışma seçilen plan bloğuna ait değil. Mevcut çalışma seçeneğinden kontrol et.");
  return { workSessionId: work.id, workSessionVersion: work.version };
}
export type FocusAction = "pause" | "resume" | "break" | "next" | "finish" | "cancel";
export const actionLabels: Record<FocusAction, string> = {
  pause: "Odağı duraklat",
  resume: "Odağa devam et",
  break: "Molaya geç",
  next: "Sonraki döngüyü başlat",
  finish: "Odak oturumunu bitir",
  cancel: "Odağı iptal et",
};
export function availableActions(state: Focus["state"]): FocusAction[] {
  if (state === "Working") return ["pause", "break", "finish", "cancel"];
  if (state === "Paused") return ["resume", "break", "finish", "cancel"];
  if (state === "Break" || state === "AwaitingNext") return ["next", "finish", "cancel"];
  return [];
}
/** Duraklamadan sonra da ana eylemi sunucunun etkin hedef bilgisi seçiyor. */
export function primaryFocusAction(f: Focus): FocusAction | null {
  if ((f.state === "Working" || f.state === "Paused") && f.effectiveTargetReached) return "break";
  if (f.state === "Working") return "pause";
  if (f.state === "Paused") return "resume";
  if (f.state === "Break" || f.state === "AwaitingNext") return "next";
  return null;
}
/** Yalnız ekrandaki süreyi gösteriyoruz. Görevi bitirmiyor, sunucu çalışma veya odak durumunu değiştirmiyoruz. */
export function displayFocus(f: Focus, receivedAt: number, now: number) {
  const delta = Math.max(0, now - receivedAt) / 1000;
  const working = f.state === "Working" ? delta : 0;
  return {
    active: Number(f.activeSeconds) + working,
    remaining: Math.max(0, Number(f.remainingSeconds) - working),
    overtime: Number(f.overtimeSeconds) + Math.max(0, working - Number(f.remainingSeconds)),
    breakRemaining: Math.max(0, Number(f.breakRemainingSeconds) - (f.state === "Break" ? delta : 0)),
  };
}
export function focusCommand(f: Focus, action: FocusAction, skipBreak: boolean) {
  if (!availableActions(f.state).includes(action)) throw new RangeError("Bu odak durumunda bu işlem seçilemez.");
  if (action === "next" && f.state === "Break" && !skipBreak)
    throw new RangeError("Mola sürüyor. Bitmesini bekle veya molayı atlamayı açıkça seç.");
  return {
    version: f.version,
    workSessionVersion: f.workSessionVersion,
    skipBreak: action === "next" && f.state === "Break" && skipBreak,
  };
}
export function focusFailure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.kind === "protocol") return error.message;
    const messages: Record<string, string> = {
      support_disabled: "İsteğe bağlı destekler bu hesapta kapalı. Normal Pomodoro akışını kullanabilirsin.",
      focus_already_active: "Zaten açık bir odak oturumun var. Güncel odak durumunu kontrol et.",
      focus_settings_invalid:
        "Süreleri kontrol et: çalışma 1–86400, kısa mola 1–14400, uzun mola 1–43200 saniye; sıklık 1–20 olmalı.",
      focus_preset_not_found: "Seçilen odak ayarına erişilemiyor. Ayarları yeniden oku.",
      focus_task_mismatch: "Çalışma seçilen göreve ait değil. Güncel çalışmayı seç.",
      focus_finished: "Bu odak döngüsü bitmiş. Güncel durumu kontrol et.",
      focus_break_pending: "Mola sürüyor. Bitmesini bekle veya molayı atlamayı açıkça seç.",
      focus_transition_invalid: "Odak durumu değişmiş. Güncel duruma göre işlemi yeniden seç.",
      version_conflict: "Odak veya çalışma başka bir sekmede değişti. Güncel durumu kontrol edip işlemi yeniden seç.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return workFailure(error);
}

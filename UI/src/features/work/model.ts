import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { taskFailure } from "../tasks/model";

export type Work = components["schemas"]["WorkView"];
export type Sync = components["schemas"]["SyncView"];
export type Segment = components["schemas"]["SegmentView"];
export type WorkAction = "pause" | "resume" | "finish";
export const syncIntervalMs = 15_000;
export const visibleRefreshEvery = 2; // Eşitlemede görünen listeler en sık 30 saniyede yenilenir.
export const segmentLimit = 100;

const states = ["Running", "Paused", "Finished", "Canceled"] as const;
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value);
const integer = (value: unknown, min = 0) =>
  typeof value === "number"
    ? Number.isSafeInteger(value) && value >= min
    : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) >= BigInt(min);
const seconds = (value: unknown) =>
  ((typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) &&
  Number(value) >= 0;
function invalid(): never {
  throw new ApiError("protocol", "Çalışma yanıtı eksik veya geçersiz. Yeniden yükle.");
}

export function readWork(value: Work): Work {
  if (
    !value ||
    !validTaskId(value.id) ||
    !(value.taskId === null || (typeof value.taskId === "string" && validTaskId(value.taskId))) ||
    !states.includes(value.state as (typeof states)[number]) ||
    !instant(value.startedAt) ||
    !(value.endedAt === null || instant(value.endedAt)) ||
    !instant(value.serverNow) ||
    !integer(value.version, 1) ||
    !seconds(value.activeSeconds) ||
    typeof value.timeZoneId !== "string"
  )
    invalid();
  return value;
}
export function readSync(value: Sync): Sync {
  if (
    !value ||
    !instant(value.serverNow) ||
    !integer(value.planningVersion) ||
    !(value.workSessionId === null || (typeof value.workSessionId === "string" && validTaskId(value.workSessionId))) ||
    !(value.focusSessionId === null || (typeof value.focusSessionId === "string" && validTaskId(value.focusSessionId)))
  )
    invalid();
  return value;
}
export function readSegments(value: components["schemas"]["SegmentPage"]) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    value.items.length > segmentLimit ||
    !value.items.every(
      item =>
        item &&
        validTaskId(item.id) &&
        instant(item.startedAt) &&
        (item.endedAt === null || instant(item.endedAt)) &&
        typeof item.isVoided === "boolean" &&
        integer(item.version, 1),
    )
  )
    invalid();
  return { items: value.items, total: Number(value.total) };
}

/** Sunucu activeSeconds değerine gelişinden beri monoton süre eklenir. Yalnız gösterim, duvar saati sapması yok. */
export function displaySeconds(work: Pick<Work, "state" | "activeSeconds">, receivedAt: number, now: number) {
  const base = Number(work.activeSeconds);
  return work.state === "Running" ? base + Math.max(0, now - receivedAt) / 1000 : base;
}
export function clock(total: number) {
  const whole = Math.max(0, Math.floor(total));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}
export function spoken(total: number) {
  const whole = Math.max(0, Math.floor(total));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return [h && `${h} saat`, m && `${m} dakika`, (s || (!h && !m)) && `${s} saniye`].filter(Boolean).join(" ");
}
/** Kapsanan süre ilk etkin başlangıçtan son etkin bitişe, açıksa sunucunun şimdisine kadardır. Molalar kapsama girer, aktif süreye girmez. */
export function coveredSeconds(segments: readonly Segment[], serverNow: string, elapsedSinceRead = 0): number | null {
  const effective = segments.filter(segment => !segment.isVoided);
  if (!effective.length) return null;
  const start = Math.min(...effective.map(segment => Date.parse(segment.startedAt)));
  const end = Math.max(
    ...effective.map(segment =>
      segment.endedAt ? Date.parse(segment.endedAt) : Date.parse(serverNow) + elapsedSinceRead * 1000,
    ),
  );
  return Math.max(0, (end - start) / 1000);
}
export const stateLabels: Record<string, string> = {
  Running: "Çalışılıyor",
  Paused: "Duraklatıldı",
  Finished: "Bitti",
  Canceled: "İptal edildi",
};
export const announcements: Record<WorkAction | "start", string> = {
  start: "Çalışma başladı.",
  pause: "Çalışma duraklatıldı. Duraklama gerçek çalışmaya eklenmez.",
  resume: "Çalışma devam ediyor.",
  finish: "Oturum bitirildi.",
};

export function workFailure(error: unknown) {
  if (error instanceof ApiError && error.outcomeUnknown)
    return "İşlemin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel çalışma durumunu kontrol et.";
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      planning_version_conflict:
        "Plan veya çalışma değişmiş. Güncel durumu okuyup geçişi yeniden hazırla; eski istek tekrarlanmadı.",
      session_conflict: "Beklenen çalışma başka bir sekmede değişmiş. Güncel durumu okuyup geçişi yeniden hazırla.",
      work_already_running: "Başka bir çalışma sürüyor. Önce onu duraklat veya bitir; güncel durum yüklendi.",
      session_paused: "Bu görevin duraklatılmış bir oturumu var. Yeni oturum yerine ona devam et.",
      version_conflict: "Çalışma başka bir sekmede veya cihazda değişti. Güncel durum yüklendi; işlemi yeniden seç.",
      session_finished: "Bu oturum zaten bitmiş. Güncel durum yüklendi.",
      session_not_found: "Bu çalışma oturumuna erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      predecessor_incomplete: "Tamamlanmamış bir ön koşul var; görev şimdi başlatılamaz.",
      task_inactive: "Görev ertelenmiş, atlanmış veya iptal edilmiş. Başlatmak için önce yeniden aç.",
      task_archived: "Arşivlenmiş görevde çalışma başlatılamaz.",
      direct_work_required: "Bu görevin kendi işi yok; çalışmayı alt görevlerinde başlat.",
      direct_work_completed: "Bu görevin kendi işi tamamlanmış. Yeniden çalışmak için önce kendi işini yeniden aç.",
      server_clock_conflict: "Sunucu saati önceki kayıtla uyuşmuyor. Birkaç saniye sonra yeniden dene.",
      idempotency_conflict: "Bu başlatma isteği başka bir komutla karıştı. Güncel durumu kontrol edip yeniden başlat.",
      task_not_found: "Bu göreve erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      schedule_stale: "Plan bloğu değişmiş. Güncel planı kontrol edip başlatmayı yeniden seç.",
      schedule_not_found: "Bu plan bloğuna erişilemiyor. Güncel planı yeniden yükle.",
      schedule_task_mismatch: "Plan bloğu seçilen göreve ait değil. Güncel planı kontrol et.",
    };
    if (error.code && messages[error.code]) return messages[error.code];
  }
  return taskFailure(error);
}
/** Bu kodlarda sonraki adım sunucudan okuma, yazıyı tekrar göndermek değil. */
export function resyncAfter(error: unknown) {
  return (
    error instanceof ApiError &&
    !error.outcomeUnknown &&
    [
      "version_conflict",
      "session_finished",
      "session_not_found",
      "work_already_running",
      "session_paused",
      "schedule_stale",
      "schedule_not_found",
      "schedule_task_mismatch",
    ].includes(error.code ?? "")
  );
}

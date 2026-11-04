import { validDate, validZone } from "../preferences/model";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
export type SupportDay = components["schemas"]["SupportDayView"];
export type EndPreparation = components["schemas"]["DayEndPreparation"];
export type Energy = NonNullable<components["schemas"]["EnergyLevel"]>;
export const energies: Record<Energy, string> = { Low: "Düşük", Medium: "Orta", High: "Yüksek" };
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
export const validEnergy = (v: unknown) => v === null || (typeof v === "string" && Object.hasOwn(energies, v));
function invalid(): never {
  throw new ApiError("protocol", "Destek yanıtı doğrulanamadı. Güncel durumu yeniden oku.");
}
export function criticalIds(ids: readonly string[]) {
  if (ids.length > 3 || new Set(ids).size !== ids.length || !ids.every(validTaskId))
    throw new RangeError("En çok 3 farklı kritik iş seçebilirsin.");
  return [...ids];
}
export function readSupportDay(v: SupportDay, date: string): SupportDay {
  if (
    !v ||
    v.localDate !== date ||
    typeof v.timeZoneId !== "string" ||
    !v.timeZoneId ||
    !integer(v.version) ||
    !integer(v.planningVersion) ||
    !validEnergy(v.availableEnergy) ||
    !Array.isArray(v.criticalTaskIds) ||
    typeof v.enabled !== "boolean"
  )
    invalid();
  try {
    if (!validDate(date) || !validZone(v.timeZoneId)) invalid();
    criticalIds(v.criticalTaskIds);
  } catch {
    invalid();
  }
  return v;
}
export function supportChange(base: SupportDay, energy: Energy | null, ids: readonly string[]) {
  if (!validEnergy(energy)) throw new RangeError("Geçerli bir efor seç veya boş bırak.");
  return { version: base.version, availableEnergy: energy, criticalTaskIds: criticalIds(ids) };
}
export function supportFailure(e: unknown) {
  if (e instanceof RangeError) return e.message;
  if (e instanceof ApiError) {
    if (e.kind === "offline" || e.kind === "protocol") return e.message;
    if (e.outcomeUnknown)
      return "Kayıt sonucu alınamadı; kaydedilmiş olabilir. Otomatik tekrar gönderilmedi. Güncel kaydı kontrol et.";
    if (e.code === "support_disabled")
      return "İsteğe bağlı destekler kapalı. Ayarlardan açabilir veya normal akışları kullanabilirsin.";
    if (e.code === "rescue_today_required") return "Günü kurtar yalnız bugünün kalan kısmı için kullanılabilir.";
    if (e.status === 409) return "Kayıt değişmiş. Seçimin korundu; güncel kaydı kontrol et.";
    if (e.status === 404) return "Bu kayda bu hesapta erişilemiyor; arşivlenmiş veya kaldırılmış olabilir.";
    if (e.status === 400) return "Seçimler kabul edilmedi. En çok 3 farklı iş ve geçerli efor seç.";
  }
  return "Destek bilgisi alınamadı. Seçimin korundu; bağlantını kontrol et.";
}

/** Mevcut hızlı başlatma ile beş dakikalık odak hedefi. Destek paneli, gün satırı ve tek görev kullanır. */
export const quickSettings = {
  workSeconds: 300,
  shortBreakSeconds: 300,
  longBreakSeconds: 900,
  longBreakEvery: 4,
  targetBehavior: "ContinueTracking" as const,
  soundEnabled: true,
  notificationsEnabled: true,
};

import { ApiError } from "../../lib/api/errors";
import { offlineWrite } from "../tasks/model";
import { readDayItem, type DayItem } from "./model";

export function acceptTaskPlan(value: DayItem, taskId: string, date: string) {
  const item = readDayItem(value, date);
  if (item.taskId !== taskId)
    throw new ApiError("protocol", "Plan yanıtı görevle uyuşmuyor.", 200, undefined, {}, undefined, undefined, true);
  return item;
}
export const blocksTaskPlanRetry = (error: unknown) =>
  error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol" || error.status === 409);
/** POST hatasında takip GET'i yapılmış gibi göstermiyoruz. */
export function taskPlanFailure(error: unknown) {
  if (!(error instanceof ApiError)) return "İşlem tamamlanamadı. Bağlantını kontrol et.";
  if (error.outcomeUnknown || error.kind === "protocol")
    return "Sonuç alınamadı; kaydedilmiş olabilir. İşlem tekrar gönderilmeyecek. Güncel planı okuyarak kontrol et.";
  if (error.kind === "offline") return offlineWrite;
  if (error.code === "day_item_exists")
    return "Bu görev bu günün planında zaten var. Güncel planı okuyarak kontrol et.";
  if (error.status === 409) return "Plan başka bir yerde değişti. Güncel planı okuyarak kontrol et.";
  if ([400, 404].includes(error.status))
    return "Görev plana eklenemedi. Bitmiş, arşivlenmiş veya erişilemiyor olabilir. Görevin güncel durumunu kontrol et.";
  return "İşlem tamamlanamadı. Bağlantını kontrol et.";
}

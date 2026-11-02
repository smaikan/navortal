import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { readNotification, type Notification } from "./model";

export type AlertPage = components["schemas"]["NotificationAlertPage"];
export function readAlertPage(value: AlertPage): AlertPage {
  try {
    Temporal.Instant.from(value.serverNow);
    if (
      !/(?:Z|[+-]\d\d:\d\d)$/.test(value.serverNow) ||
      !Array.isArray(value.items) ||
      !/^(0|[1-9]\d*)$/.test(String(value.preferencesVersion)) ||
      BigInt(value.preferencesVersion) > 9223372036854775807n ||
      (typeof value.preferencesVersion === "number" && !Number.isSafeInteger(value.preferencesVersion)) ||
      value.items.length > 50 ||
      (value.nextCursor !== null &&
        (typeof value.nextCursor !== "string" || !value.nextCursor || value.nextCursor.length > 2048))
    )
      throw new Error();
    const seen = new Set<string>();
    for (const n of value.items) {
      readNotification(n);
      if (n.state !== "Ready" || n.readAt !== null || seen.has(n.id)) throw new Error();
      seen.add(n.id);
    }
    return value;
  } catch {
    throw new ApiError("protocol", "Hazır bildirimler doğrulanamadı.");
  }
}

/** Bu yalnız sesin başlangıç noktası. Uygunluk ve güncelliği sunucu seçiyor, burada zamanlama yapılmıyor. */
export function alertWindow() {
  let baseline: Temporal.Instant | undefined;
  let policy: string | undefined;
  return {
    accept(serverNow: string, items: Notification[], preferencesVersion: number | string = 0) {
      if (!baseline || policy !== String(preferencesVersion)) {
        baseline = Temporal.Instant.from(serverNow);
        policy = String(preferencesVersion);
        return [];
      }
      return items.filter(n => {
        // Ertelemede ReadyAt ilk makbuzun zamanı olarak kalıyor.
        const at = Number(n.snoozeCount) > 0 ? n.notBefore : n.readyAt;
        return n.soundEnabled && at !== null && Temporal.Instant.compare(Temporal.Instant.from(at), baseline!) > 0;
      });
    },
  };
}

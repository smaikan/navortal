import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
export type Subscription = components["schemas"]["SubscriptionView"];
const version = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 1
    : typeof v === "string" && /^[1-9]\d*$/.test(v) && BigInt(v) <= 9223372036854775807n;
export function readConfig(p: components["schemas"]["PushConfiguration"]) {
  if (
    !p ||
    typeof p.enabled !== "boolean" ||
    !(p.publicKey === null || typeof p.publicKey === "string") ||
    (p.enabled && !p.publicKey)
  )
    throw new ApiError("protocol", "Push yapılandırması okunamadı.");
  return p;
}
export function publicKey(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new RangeError("Push yapılandırması geçersiz.");
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new RangeError("Push yapılandırması geçersiz.");
  return bytes;
}
export function readSubscription(s: Subscription) {
  if (
    !s ||
    !validTaskId(s.id) ||
    typeof s.providerHost !== "string" ||
    !s.providerHost ||
    typeof s.label !== "string" ||
    s.label.length > 100 ||
    typeof s.active !== "boolean" ||
    !(s.expiresAt === null || (typeof s.expiresAt === "string" && Number.isFinite(Date.parse(s.expiresAt)))) ||
    !version(s.version)
  )
    throw new ApiError("protocol", "Abonelik bilgisi okunamadı.");
  return s;
}
export function readSubscriptions(rows: Subscription[]) {
  if (!Array.isArray(rows) || rows.length > 100) throw new ApiError("protocol", "Abonelik listesi okunamadı.");
  rows.forEach(readSubscription);
  return rows;
}
export function pushFailure(e: unknown) {
  if (e instanceof ApiError && e.outcomeUnknown)
    return "İşlemin sonucu belirsiz. Durumu yenileyip kontrol et; işlem kendiliğinden tekrarlanmadı.";
  if (e instanceof ApiError && e.status === 409)
    return "Cihaz ayarları başka bir yerde değişmiş. Durumu yenileyip tekrar dene.";
  if (e instanceof ApiError && e.kind === "offline") return e.message;
  return "Bu tarayıcıda bildirim hazırlığı tamamlanamadı. İzni ve bağlantını kontrol et.";
}
export function deviceLabel() {
  const key = "adhd.push-device.v1";
  let id = localStorage.getItem(key);
  if (!id || !validTaskId(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return `Tarayıcı:${id}`;
}
/** Desteklenmeyen veya engelli ortamda kayıt hiç bitmeyebilir. Bu süreden sonra takip yazısı gönderilmez. */
export async function setupDeadline<T>(pending: Promise<T>, milliseconds = 15000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Çevrimdışı ekran henüz hazır değil.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

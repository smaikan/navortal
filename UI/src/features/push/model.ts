import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
export type Subscription = components["schemas"]["SubscriptionView"];
export type MobilePreferences = components["schemas"]["MobilePushPreferencesView"];
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
  if (p.enabled) {
    try {
      publicKey(p.publicKey!);
    } catch {
      throw new ApiError("protocol", "Push yapılandırması okunamadı.");
    }
  }
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
  if (e instanceof ApiError && e.code === "push_subscription_limit")
    return "En fazla 20 cihaz kaydedebilirsin. Kullanmadığın bir cihazı kaldırıp yeniden dene.";
  if (e instanceof ApiError && e.kind === "offline") return e.message;
  if (e instanceof PushStorageError || (e instanceof Error && e.name === "PushStorageError"))
    return "Bu tarayıcıda cihaz bilgisi saklanamıyor. Site verilerine izin verip yeniden dene.";
  if (e instanceof Error && e.name === "NotAllowedError")
    return "Tarayıcı bildirim izni vermedi. Site izinlerini kontrol et; bildirimlerini sağ üstteki zilden görebilirsin.";
  if (e instanceof Error && (e.name === "AbortError" || e.name === "NetworkError"))
    return "Tarayıcının bildirim hizmetine bağlanılamadı. Bağlantını kontrol edip yeniden dene.";
  return "Bu tarayıcıda bildirim hazırlığı tamamlanamadı. İzni ve bağlantını kontrol et.";
}
class PushStorageError extends Error {}
export function deviceLabel() {
  const key = "adhd.push-device.v1";
  try {
    let id = localStorage.getItem(key);
    if (!id || !validTaskId(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return `Tarayıcı:${id}`;
  } catch {
    throw new PushStorageError();
  }
}
/** Anahtar değişimi veya süresi dolmuş yerel kayıt yeni bir abonelik gerektirir. */
export function subscriptionMatchesKey(subscription: PushSubscription, key: string, now = Date.now()) {
  if (subscription.expirationTime !== null && subscription.expirationTime <= now) return false;
  const actual = subscription.options.applicationServerKey;
  if (!actual) return false;
  const expected = publicKey(key),
    bytes = new Uint8Array(actual);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
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

const mobileVersion = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
/** Telefon (FCM) tercihi; sürüm 0 henüz hiç kaydedilmemiş varsayılanı gösterir. */
export function readMobilePreferences(p: MobilePreferences) {
  if (!p || typeof p.enabled !== "boolean" || typeof p.fcmAvailable !== "boolean" || !mobileVersion(p.version))
    throw new ApiError("protocol", "Telefon bildirim tercihi okunamadı.");
  return p;
}
export function mobileFailure(e: unknown) {
  if (e instanceof ApiError && e.outcomeUnknown)
    return "İşlemin sonucu belirsiz. Durumu yenileyip kontrol et; işlem kendiliğinden tekrarlanmadı.";
  if (e instanceof ApiError && e.status === 409)
    return "Telefon bildirim tercihi başka bir yerde değişmiş. Durumu yenileyip tekrar dene.";
  if (e instanceof ApiError && e.kind === "offline") return e.message;
  return "Telefon bildirim tercihi kaydedilemedi. Bağlantını kontrol edip yeniden dene.";
}

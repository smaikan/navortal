"use client";
import { lazy, Suspense, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { validTaskId } from "../../components/layout/task-panel-url";
import { useDisplayPreferences } from "../workspace/queries";
import { useNotificationCache } from "./cache";
const noop = () => () => {};
const Detail = lazy(() => import("./detail").then(m => ({ default: m.NotificationDetail })));

/** Cihaz bildiriminin notificationId bağlantısı yalnız o bildirimin ayrıntısını açar. Zil paneli kapalı kalır. */
export function LinkedNotification() {
  const params = useSearchParams(),
    pathname = usePathname();
  const prefs = useDisplayPreferences();
  const selected = params.get("notificationId");
  // Başka sekmedeki okuma veya erteleme açık ayrıntıyı yeniliyor.
  useNotificationCache(!!selected);
  // Ayrıntı kapanınca odak sayfa başlığına döner. Başlık ilk tarayıcı bağlanmasından sonra var.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const trigger = mounted ? document.querySelector<HTMLElement>("#main h1") : null;
  function clearLink() {
    const next = new URLSearchParams(params);
    next.delete("notificationId");
    window.history.replaceState({}, "", pathname + (next.size ? `?${next}` : ""));
  }
  if (!selected) return null;
  if (!validTaskId(selected))
    return (
      <p role="alert">
        Bildirim bağlantısı geçersiz.<button onClick={clearLink}>Bağlantıyı temizle</button>
      </p>
    );
  return (
    <Suspense fallback={<p role="status">Bildirim açılıyor…</p>}>
      {prefs.data && trigger && (
        <Detail key={selected} id={selected} zone={prefs.data.values.timeZoneId} trigger={trigger} close={clearLink} />
      )}
    </Suspense>
  );
}

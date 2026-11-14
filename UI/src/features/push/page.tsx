"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { useWork } from "../work/coordinator";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { useNotificationPreferences } from "../notifications/queries";
import { useNotificationCache } from "../notifications/cache";
import { readPreferences } from "../notifications/model";
import "./styles.css";
import { setRecipient } from "../../../public/recipient-store.js";
import {
  deviceLabel,
  publicKey,
  pushFailure,
  readConfig,
  readSubscription,
  readSubscriptions,
  setupDeadline,
  subscriptionMatchesKey,
  type Subscription,
} from "./model";
import { appleMobile, browserChanges, permissionValue, pushSupport, storedDeviceLabel } from "./browser";
import { hasAndroidTimerHost } from "../work/native-timer";
import { PhoneNotifications } from "./phone";
const never = () => () => {};
/** Android uygulamasında (window.navortalTimer) tarayıcı Web Push yerine telefon bildirim bölümü gösterilir. */
export function PushPage() {
  const phone = useSyncExternalStore(never, hasAndroidTimerHost, () => false);
  return phone ? <PhoneNotifications /> : <BrowserPushPage />;
}
function BrowserPushPage() {
  const headingId = useId();
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const cache = useNotificationCache();
  const work = useWork();
  const prefs = useNotificationPreferences();
  const config = useQuery({
    queryKey: queryKeys.resource(owner, "push-config"),
    networkMode: "always",
    queryFn: async ({ signal }) => readConfig(await session.api.read("/api/notifications/push-config", { signal })),
  });
  const subs = useQuery({
    queryKey: queryKeys.resource(owner, "push-subscriptions"),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSubscriptions(await session.api.read("/api/notifications/subscriptions", { signal })),
  });
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null),
    [waiting, setWaiting] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [issue, setIssue] = useState("");
  const support = useSyncExternalStore(browserChanges, pushSupport, () => "checking");
  const permission = useSyncExternalStore(browserChanges, permissionValue, () => "unsupported");
  const localLabel = useSyncExternalStore(browserChanges, storedDeviceLabel, () => null);
  const busy = useRef(false);
  const apple = useSyncExternalStore(browserChanges, appleMobile, () => false);
  const [showInstall, setShowInstall] = useState(false);
  const [localSubscription, setLocalSubscription] = useState<PushSubscription | null>(null);
  const [localChecking, setLocalChecking] = useState(true);
  const [localIssue, setLocalIssue] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const activating = useRef<number | null>(null);
  const [reconcile, setReconcile] = useState(false);
  useEffect(() => {
    const current = () => session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
    let live = true,
      sequence = 0;
    const check = async () => {
      const attempt = ++sequence;
      if (support !== "supported" || permission !== "granted") {
        setLocalSubscription(null);
        setLocalChecking(false);
        setLocalIssue("");
        return;
      }
      setLocalChecking(true);
      try {
        const r = await setupDeadline(navigator.serviceWorker.getRegistration("/"));
        const subscription = r ? await setupDeadline(r.pushManager.getSubscription()) : null;
        if (live && attempt === sequence && current()) {
          setLocalSubscription(subscription);
          setLocalIssue("");
        }
      } catch (error) {
        if (live && attempt === sequence && current()) {
          setLocalSubscription(null);
          setLocalIssue(pushFailure(error));
        }
      } finally {
        if (live && attempt === sequence && current()) {
          setLocalChecking(false);
          setCheckedAt(Date.now());
        }
      }
    };
    void check();
    const stop = browserChanges(() => void check());
    return () => {
      live = false;
      stop();
    };
  }, [support, permission, session, owner, epoch]);
  useEffect(() => {
    if (support === "unsupported" || support === "checking") return;
    let live = true;
    const changed = () => {
      const epoch = activating.current;
      activating.current = null;
      if (epoch !== null && session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner)
        location.reload();
    };
    void navigator.serviceWorker
      .getRegistration("/")
      .then(r => {
        if (live && r) {
          setRegistration(r);
          setWaiting(!!r.waiting);
        }
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    return () => {
      live = false;
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, [support, session, owner]);
  useEffect(() => {
    if (!registration) return;
    const workers = new Set<ServiceWorker>();
    const update = () => setWaiting(!!registration.waiting);
    const watch = () => {
      const worker = registration.installing;
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener("statechange", update);
      }
    };
    watch();
    registration.addEventListener("updatefound", watch);
    return () => {
      registration.removeEventListener("updatefound", watch);
      for (const worker of workers) worker.removeEventListener("statechange", update);
    };
  }, [registration]);
  async function prepare() {
    const r = await setupDeadline(
      (async () => {
        const r = await navigator.serviceWorker.register("/planner-sw.js", {
          type: "module",
          scope: "/",
          updateViaCache: "none",
        });
        await navigator.serviceWorker.ready;
        return r;
      })(),
    );
    if (!cache.current()) throw new Error("Hesap değişti.");
    await setupDeadline(setRecipient(owner, undefined, cache.current));
    if (!cache.current()) throw new Error("Hesap değişti.");
    setRegistration(r);
    setWaiting(!!r.waiting);
    return r;
  }
  async function action(fn: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setIssue("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (cache.current()) {
        setIssue(pushFailure(e));
        if (e instanceof ApiError && (e.outcomeUnknown || e.status === 409 || e.kind === "protocol"))
          setReconcile(true);
      }
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  async function activate() {
    if (work.work || work.busy || busy.current) return;
    await action(async () => {
      const fresh = await navigator.serviceWorker.getRegistration("/");
      if (!cache.current()) return;
      const worker = fresh?.waiting;
      // Hazır işareti kayıt nesnesinden uzun yaşayabilir. Kullanıcı açıkça yeni belge istemiş.
      if (!worker) {
        setWaiting(false);
        location.reload();
        return;
      }
      const channel = new MessageChannel();
      activating.current = session.getIdentity().epoch;
      try {
        await setupDeadline(
          new Promise<void>((resolve, reject) => {
            channel.port1.onmessage = e =>
              e.data?.accepted === true ? resolve() : reject(new Error("Güncelleme kabul edilmedi."));
            worker.postMessage({ kind: "ACTIVATE_UPDATE" }, [channel.port2]);
          }),
          5000,
        );
      } catch (e) {
        activating.current = null;
        throw e;
      } finally {
        channel.port1.close();
      }
    });
  }
  async function enable() {
    if (support !== "supported" || !config.data?.enabled || !config.data.publicKey) return;
    // İstek tıklamada hemen başlar. Kullanıcı etkinliğini tüketebilecek await'lerden önce.
    const allowed = await Notification.requestPermission();
    if (!cache.current()) return;
    window.dispatchEvent(new Event("planner-push-permission"));
    if (allowed !== "granted") {
      setMessage("İzin verilmedi. Bildirimler gelen kutusunda kullanılabilir.");
      return;
    }
    const label = deviceLabel();
    const r = await prepare();
    let subscription = await setupDeadline(r.pushManager.getSubscription());
    if (!cache.current()) return;
    if (
      subscription &&
      (!subscriptionMatchesKey(subscription, config.data.publicKey) ||
        !subs.data?.some(s => s.active && s.label === label))
    ) {
      if (!(await setupDeadline(subscription.unsubscribe()))) throw new Error("Eski abonelik kaldırılamadı.");
      subscription = null;
    }
    if (!cache.current()) return;
    subscription ??= await setupDeadline(
      r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey(config.data.publicKey),
      }),
    );
    if (!cache.current()) {
      await setupDeadline(subscription.unsubscribe());
      return;
    }
    const value = subscription.toJSON();
    if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error("Abonelik eksik.");
    readSubscription(
      await session.api
        .mutation("/api/notifications/subscriptions", "post", {
          body: {
            endpoint: value.endpoint,
            p256dh: value.keys.p256dh,
            auth: value.keys.auth,
            label,
            expiresAt: value.expirationTime ? new Date(value.expirationTime).toISOString() : null,
          },
        })
        .execute(),
    );
    if (!cache.current()) return;
    setLocalSubscription(subscription);
    if (cache.current()) {
      window.dispatchEvent(new Event("planner-push-registered"));
      setMessage("Bu cihaz kaydedildi. Bildirimler açılıyor…");
      void subs.refetch();
    }
    const fresh = readPreferences(await session.api.read("/api/notifications/preferences"));
    if (!cache.current()) return;
    const saved = readPreferences(
      await session.api
        .mutation("/api/notifications/preferences", "put", {
          body: { version: fresh.version, settings: { ...fresh.settings, pushEnabled: true } },
        })
        .execute(),
    );
    if (cache.current()) {
      cache.changed(undefined, saved);
      void subs.refetch();
      setMessage("Bu cihazda bildirimler açık.");
    }
  }
  async function remove(s: Subscription) {
    await session.api
      .mutation("/api/notifications/subscriptions/{id}/remove", "post", {
        path: { id: s.id },
        body: { version: s.version },
      })
      .execute();
    if (!cache.current()) return;
    void subs.refetch();
    setMessage("Bu cihazın bildirimleri kapatıldı.");
    try {
      if (s.label === storedDeviceLabel()) {
        const r = registration ?? (await setupDeadline(navigator.serviceWorker.getRegistration("/")));
        const subscription = r ? await setupDeadline(r.pushManager.getSubscription()) : null;
        if (!cache.current()) return;
        if (subscription && !(await setupDeadline(subscription.unsubscribe())))
          throw new Error("Tarayıcı aboneliği kaldırılamadı.");
        if (!cache.current()) return;
        setLocalSubscription(null);
        window.dispatchEvent(new Event("planner-push-registered"));
      }
    } catch {
      if (cache.current()) setIssue("Sunucu aboneliği kaldırıldı; tarayıcıdaki izin ve aboneliği ayrıca kontrol et.");
    }
  }
  async function disable() {
    const fresh = readPreferences(await session.api.read("/api/notifications/preferences"));
    if (!cache.current()) return;
    const saved = readPreferences(
      await session.api
        .mutation("/api/notifications/preferences", "put", {
          body: { version: fresh.version, settings: { ...fresh.settings, pushEnabled: false } },
        })
        .execute(),
    );
    if (cache.current()) {
      cache.changed(undefined, saved);
      setMessage("Tüm cihaz bildirimleri kapalı. Uygulamadaki gelen kutusu açık kalır.");
    }
  }
  const thisDevice = subs.data?.find(
    s => s.active && s.label === localLabel && (!s.expiresAt || Date.parse(s.expiresAt) > checkedAt),
  );
  const browserReady =
    !!localSubscription &&
    !!config.data?.publicKey &&
    subscriptionMatchesKey(localSubscription, config.data.publicKey, checkedAt);
  const deviceOn =
    !!thisDevice &&
    browserReady &&
    !!prefs.data?.settings.pushEnabled &&
    !!config.data?.enabled &&
    permission === "granted";
  const activeDevices = subs.data?.filter(s => s.active) ?? [];
  async function reread() {
    const rows = await Promise.all([config.refetch(), prefs.refetch(), subs.refetch()]);
    if (rows.some(r => r.isError)) throw new Error("Okuma tamamlanmadı.");
    if (cache.current()) {
      setReconcile(false);
      window.dispatchEvent(new Event("planner-push-registered"));
      setMessage("Bildirim durumu güncellendi.");
    }
  }
  return (
    <section aria-labelledby={headingId} className="device-notifications">
      <div className="device-heading">
        <div>
          <h2 id={headingId}>Bu cihazda bildirim</h2>
          <p>Uygulama arka plandayken de hatırlatmalarını ekranında gör.</p>
        </div>
        <span className={`device-state${deviceOn ? " on" : ""}`}>
          {support === "checking" || localChecking ? "Kontrol ediliyor" : deviceOn ? "Açık" : "Kapalı"}
        </span>
      </div>
      {(support === "unsupported" || support === "worker-only") && (
        <p role="status">
          Bu tarayıcıda cihaz bildirimi kullanılamıyor. Hatırlatmalarını gelen kutusunda görebilirsin.
        </p>
      )}
      {support === "install-required" && (
        <div className="device-install">
          <p>iPhone veya iPad’de bildirim almak için Navortal’ı ana ekranından aç.</p>
          <button
            type="button"
            aria-expanded={showInstall}
            aria-controls={`${headingId}-install`}
            onClick={() => setShowInstall(value => !value)}
          >
            Ana ekrana ekleyerek kullan
          </button>
          {showInstall && (
            <ol id={`${headingId}-install`}>
              <li>Tarayıcının Paylaş veya menü düğmesini aç.</li>
              <li>“Ana Ekrana Ekle”yi seç. Bu seçenek görünmüyorsa sayfayı Safari’de aç.</li>
              <li>Navortal’ı ana ekranındaki simgesinden açıp bildirim tercihlerine dön.</li>
            </ol>
          )}
        </div>
      )}
      {support === "supported" && (
        <>
          {permission === "denied" && (
            <p role="status">
              {apple
                ? "Bildirim izni kapalı. iPhone veya iPad Ayarlar → Bildirimler → Navortal bölümünden izin ver."
                : "Bildirim izni kapalı. Tarayıcının site izinlerinden bildirimlere izin ver."}
            </p>
          )}
          {config.data?.enabled === false && (
            <p role="status">
              Cihaz bildirimleri şu an kullanılamıyor. Bildirimlerini sağ üstteki zilden görebilirsin.
            </p>
          )}
          {prefs.data?.settings.enabled === false && (
            <p role="status">
              Genel bildirim tercihin kapalı. Hatırlatma almak için yukarıdaki “Bildirimler açık” seçeneğini de aç.
            </p>
          )}
          <div className="device-main-action">
            <button
              className={deviceOn ? undefined : "primary"}
              disabled={
                pending ||
                reconcile ||
                localChecking ||
                !prefs.data ||
                !subs.data ||
                !config.data?.enabled ||
                permission === "denied"
              }
              onClick={() => void action(deviceOn && thisDevice ? () => remove(thisDevice) : enable)}
            >
              {deviceOn
                ? "Bu cihazda bildirimleri kapat"
                : permission === "granted"
                  ? "Bağlantıyı yenile"
                  : "Bu cihazda bildirimleri aç"}
            </button>
            <p className="r2-hint">Bu seçim cihaz bildirimlerini etkiler. Sağ üstteki zil her zaman çalışır.</p>
            <p className="r2-hint">
              Bildirimler hatırlatma adını kilit ekranında gösterebilir ve tarayıcının bildirim hizmeti üzerinden
              iletilir.{" "}
              <Link href="/privacy-notice" target="_blank" rel="noopener">
                Veri kullanımı hakkında bilgi<span className="sr-only"> (yeni sekmede açılır)</span>
              </Link>
            </p>
          </div>
        </>
      )}
      {(config.isError || prefs.isError || subs.isError || reconcile || issue || localIssue) && (
        <div className="form-error">
          <p role="alert">{issue || localIssue || "Bildirim durumu doğrulanamadı. Yenileyip tekrar kontrol et."}</p>
          <button disabled={pending} onClick={() => void action(reread)}>
            Durumu yenile
          </button>
        </div>
      )}
      {pending && <p role="status">İşlem sürüyor…</p>}
      {message && (
        <p role="status" className="form-notice">
          {message}
        </p>
      )}
      <details className="device-details">
        <summary>Diğer cihazlar ve uygulama</summary>
        <section aria-label="Kayıtlı cihazlar">
          <h3>Kayıtlı cihazlar</h3>
          {activeDevices.length ? (
            <ul className="device-list">
              {activeDevices.map(s => (
                <li key={s.id} data-subscription-id={s.id}>
                  <span>
                    {s.label === localLabel
                      ? "Bu cihaz"
                      : s.label.startsWith("Tarayıcı:")
                        ? "Diğer tarayıcı"
                        : s.label || "Diğer cihaz"}
                  </span>
                  <button disabled={pending || reconcile} onClick={() => void action(() => remove(s))}>
                    Bu cihazı kaldır
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Bildirim alan kayıtlı cihaz yok.</p>
          )}
          {prefs.data?.settings.pushEnabled && (
            <button disabled={pending || reconcile} onClick={() => void action(disable)}>
              Tüm cihaz bildirimlerini kapat
            </button>
          )}
          <button disabled={pending} onClick={() => void action(reread)}>
            Durumu yenile
          </button>
        </section>
        {(support === "supported" || support === "worker-only") && (
          <section aria-label="Uygulama güncellemesi">
            <h3>Uygulama güncellemesi</h3>
            <button
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  const r = registration ?? (await prepare());
                  await r.update();
                  setWaiting(!!r.waiting);
                  setMessage(r.waiting ? "Yeni sürüm hazır." : "Uygulama güncel.");
                })
              }
            >
              Güncellemeyi kontrol et
            </button>
            {waiting && (
              <div>
                <p>Yeni sürüm hazır.</p>
                <button disabled={pending || !!work.work || work.busy} onClick={() => void activate()}>
                  Yeni sürümü kullan
                </button>
                {work.work && <p>Açık çalışma bittikten sonra güncelleyebilirsin.</p>}
              </div>
            )}
          </section>
        )}
      </details>
    </section>
  );
}

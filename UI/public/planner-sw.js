import { isWorkspacePath } from "./route-paths.js";
import { readEnvelope, deliveryKey, notificationPath } from "./push-protocol.js";
import { getRecipient, clearRecipient, claimDelivery, releaseDelivery } from "./recipient-store.js";
import { claimAlertSound } from "./alert-sound-store.js";
import { queueReceipt, clearReceipts, flushReceipts } from "./delivery-receipts.js";
const cacheName = "adhd-public-v3";
const publicAssets = [
  "/offline.html",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(cacheName).then(cache =>
      Promise.all(
        publicAssets.map(url =>
          fetch(url, { credentials: "omit", cache: "reload" }).then(response => {
            if (!response.ok) throw new Error("Public asset unavailable");
            return cache.put(url, response);
          }),
        ),
      ),
    ),
  );
});
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then(keys =>
          Promise.all(
            keys.filter(key => key.startsWith("adhd-public-") && key !== cacheName).map(key => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", event => {
  const r = event.request,
    url = new URL(r.url);
  if (
    r.method !== "GET" ||
    url.origin !== self.location.origin ||
    r.headers.has("Authorization") ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (publicAssets.includes(url.pathname) && !url.search)
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(url.pathname)) ?? fetch(r)));
  else if (r.mode === "navigate")
    event.respondWith(
      fetch(r, { cache: "no-store" }).catch(async () => (await caches.match("/offline.html")) ?? Response.error()),
    );
});
const sameOriginClient = source => {
  try {
    return source.type === "window" && new URL(source.url).origin === self.location.origin;
  } catch {
    return false;
  }
};
const validClient = source => {
  if (!sameOriginClient(source)) return false;
  const path = new URL(source.url).pathname;
  return isWorkspacePath(path);
};
self.addEventListener("message", event => {
  if (!sameOriginClient(event.source)) return;
  const message = event.data;
  if (message?.kind === "CLEAR_RECIPIENT" && /^[0-9a-f-]{36}$/i.test(message.generation))
    event.waitUntil(
      clearRecipient(message.owner, message.generation).then(async cleared => {
        if (cleared || (await getRecipient()) !== message.owner) {
          await clearReceipts(message.owner);
          for (const n of await self.registration.getNotifications())
            if (n.data?.recipientUserId === message.owner) n.close();
        }
      }),
    );
  // Çıkışın temizleme isteği gelmeden giriş sayfasına geçilmiş olabilir. Hesap ve generation yine eşleşmeli.
  else if (message?.kind === "ACTIVATE_UPDATE" && validClient(event.source))
    event.waitUntil(
      self.skipWaiting().then(() => {
        event.ports?.[0]?.postMessage({ accepted: true });
      }),
    );
  // Sürüm 3 yalnız uyumlu bildirim yaması. Açık çalışma belgesini yenilemeden etkinleşebilir.
  else if (
    message?.kind === "ACTIVATE_NOTIFICATION_PATCH" &&
    [2, 3].includes(message.version) &&
    validClient(event.source)
  )
    event.waitUntil(
      (async () => {
        if ((await getRecipient()) === message.owner) await self.skipWaiting();
      })(),
    );
});
async function foregroundSound(client, envelope) {
  const channel = new MessageChannel();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 1200);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.played === true);
    };
    try {
      client.postMessage({ kind: "PLANNER_SOUND", envelope }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      channel.port1.close();
      resolve(false);
    }
  });
}
async function deliver(data) {
  const n = readEnvelope(data);
  if (!n || (await getRecipient()) !== n.recipientUserId) return;
  if (!(await claimDelivery(n.recipientUserId, deliveryKey(n.recipientUserId, n.notificationId, n.snoozeCount))))
    return;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Sekmelere teslim kimliği yeter. Yerel bildirimin özel görev/hatırlatma metni gönderilmez.
  const receipt = { ...n, title: "Bildirim", body: "Bildirim" };
  const candidates = clients.filter(validClient);
  // Sesi önceden açılmış sekme arkadayken de çalabilir. Atomik işlem tek sekme seçer.
  const played =
    !n.silent &&
    (await Promise.any(
      candidates.map(async client => {
        if (await foregroundSound(client, receipt)) return true;
        throw new Error("No app playback");
      }),
    ).catch(() => false));
  const sound = !n.silent && !played && (await claimAlertSound(n.recipientUserId, n.notificationId, n.snoozeCount));
  if ((await getRecipient()) !== n.recipientUserId) return;
  // Geçerli her push kullanıcıya gösterilir. Sekme bu olayı çaldıysa yerel bildirim sessiz olur.
  try {
    await self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      silent: !sound,
      renotify: sound,
      icon: "/icon.svg",
      data: n,
    });
  } catch {
    await releaseDelivery(n.recipientUserId, deliveryKey(n.recipientUserId, n.notificationId, n.snoozeCount));
    return;
  }
  for (const client of clients)
    if (validClient(client) && client.visibilityState === "visible")
      client.postMessage({ kind: "PLANNER_NOTIFICATION", envelope: receipt });
  await queueReceipt(n.recipientUserId, n.notificationId, n.snoozeCount, "Displayed");
  await flushReceipts(n.recipientUserId);
}
self.addEventListener("push", event => {
  event.waitUntil(
    (async () => {
      try {
        await deliver(event.data?.json());
      } catch {
        /* Özel veri veya kimlik bilgisi kayda yazılmaz. */
      }
    })(),
  );
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const n = readEnvelope(event.notification.data);
      if (!n || (await getRecipient()) !== n.recipientUserId) return;
      const url = notificationPath(n.notificationId, n.url);
      if (!url) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clients.find(validClient);
      if (existing) {
        await existing.navigate(url);
        await existing.focus();
      } else await self.clients.openWindow(url);
      await queueReceipt(n.recipientUserId, n.notificationId, n.snoozeCount, "Opened");
      await flushReceipts(n.recipientUserId);
    })(),
  );
});

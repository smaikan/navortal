"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readEnvelope } from "../../../public/push-protocol.js";
import { clearRecipient, setRecipient } from "../../../public/recipient-store.js";
import { claimAlertSound } from "../notifications/alert-claims";
import { alertAudio } from "../notifications/alert-audio";
import { clearReceipts, flushReceipts } from "../../../public/delivery-receipts.js";

/** Yalnız doğrulanmış çalışma alanında açılır. Worker kaydetmez veya izin istemez. */
export function PushBridge() {
  const { session, state } = useSession();
  const client = useQueryClient();
  const owner = state.user!.id;
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const epoch = session.getIdentity().epoch,
      generation = crypto.randomUUID();
    let disposed = false;
    let ownedSubscription: PushSubscription | null = null;
    const workerListeners: (() => void)[] = [];
    const watched = new WeakSet<ServiceWorkerRegistration>();
    const current = () =>
      !disposed && session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
    function notificationPatch(r: ServiceWorkerRegistration) {
      const activate = () => {
        // Uyumlu worker yaması yalnız bildirim sunumunu değiştirir. Açık çalışma oturumunu yenilemez.
        if (current()) r.waiting?.postMessage({ kind: "ACTIVATE_NOTIFICATION_PATCH", version: 3, owner });
      };
      activate();
      if (watched.has(r)) return;
      watched.add(r);
      const watch = () => {
        const worker = r.installing;
        if (!worker) return;
        worker.addEventListener("statechange", activate);
        workerListeners.push(() => worker.removeEventListener("statechange", activate));
      };
      watch();
      r.addEventListener("updatefound", watch);
      workerListeners.push(() => r.removeEventListener("updatefound", watch));
      void r.update().catch(() => {});
    }
    async function synchronize() {
      try {
        const r = await navigator.serviceWorker.getRegistration("/");
        if (r?.active && current()) {
          await setRecipient(owner, generation, current);
          if (current()) void flushReceipts(owner, current);
          if (current()) notificationPatch(r);
          // Yerel abonelik yalnız kullanıcı açtıktan sonra okunur. Bazı tarayıcılar izinden önce bunu bitiremiyor.
          if ("PushManager" in window && "Notification" in window && Notification.permission === "granted") {
            const subscription = await r.pushManager.getSubscription();
            if (current()) ownedSubscription = subscription;
          }
        }
      } catch {
        /* Depolama veya kurulum hatası izin panelinde gösterilir. */
      }
    }
    const unsubscribe = session.onIdentityChange(() => {
      // Çevrimdışı çıkışta da kalıcı alıcı hemen silinir. Karşılaştırıp silme yeni hesabı korur.
      void clearRecipient(owner, generation, () => session.getSnapshot().phase !== "authenticated").catch(() => {});
      void clearReceipts(owner);
      const oldSubscription = ownedSubscription;
      void oldSubscription?.unsubscribe().catch(() => {});
      const message = { kind: "CLEAR_RECIPIENT", owner, generation };
      // Çevrimdışı çıkış belgeyi terk etmeden temizlik sıraya girer. İşlem ömrünü worker yönetir.
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(message);
      else
        void navigator.serviceWorker
          .getRegistration("/")
          .then(r => {
            r?.active?.postMessage(message);
          })
          .catch(() => {});
    });
    const message = (event: MessageEvent) => {
      if (
        !current() ||
        !(event.source instanceof ServiceWorker) ||
        !["PLANNER_NOTIFICATION", "PLANNER_SOUND"].includes(event.data?.kind)
      )
        return;
      const n = readEnvelope(event.data.envelope);
      if (!n || n.recipientUserId !== owner) {
        event.ports[0]?.postMessage({ played: false });
        return;
      }
      if (event.data.kind === "PLANNER_SOUND") {
        const audible = () => current() && alertAudio.getSnapshot() === "ready";
        if (n.silent || !audible()) {
          event.ports[0]?.postMessage({ played: false });
          return;
        }
        void claimAlertSound(owner, n.notificationId, n.snoozeCount, audible, () => alertAudio.play(n.sound)).then(
          played => event.ports[0]?.postMessage({ played }),
          () => event.ports[0]?.postMessage({ played: false }),
        );
        return;
      }
      // userVisibleOnly bildirimi worker gösterir. Sekme yalnız sunucu okumalarını yeniler.
      for (const name of ["notifications", "notification", "notification-alerts", "day-signals"])
        void client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) });
    };
    void synchronize();
    const retryReceipts = () => {
      if (current()) void flushReceipts(owner, current);
    };
    window.addEventListener("online", retryReceipts);
    document.addEventListener("visibilitychange", retryReceipts);
    navigator.serviceWorker.addEventListener("controllerchange", synchronize);
    navigator.serviceWorker.addEventListener("message", message);
    window.addEventListener("planner-push-registered", synchronize);
    return () => {
      disposed = true;
      workerListeners.forEach(remove => remove());
      unsubscribe();
      navigator.serviceWorker.removeEventListener("controllerchange", synchronize);
      navigator.serviceWorker.removeEventListener("message", message);
      window.removeEventListener("online", retryReceipts);
      document.removeEventListener("visibilitychange", retryReceipts);
      window.removeEventListener("planner-push-registered", synchronize);
    };
  }, [session, owner, client]);
  return null;
}

"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readPreferences } from "../notifications/model";
import { browserChanges, permissionValue, pushSupport, storedDeviceLabel } from "./browser";
import { readConfig, readSubscriptions, setupDeadline, subscriptionMatchesKey } from "./model";
import "./styles.css";

/** Yalnız başarılı, açık bir hatırlatma oluşturma niyetinden sonra bağlanır; izin istemez. */
export function ReminderPushNudge() {
  const { session, state } = useSession();
  const owner = state.user!.id;
  const support = useSyncExternalStore(browserChanges, pushSupport, () => "checking");
  const permission = useSyncExternalStore(browserChanges, permissionValue, () => "unsupported");
  const [dismissed, setDismissed] = useState(false);
  const key = `adhd.push-nudge.v1:${owner}`;
  const readiness = useQuery({
    queryKey: queryKeys.resource(owner, "push-nudge", { support, permission }),
    enabled: !dismissed && ["supported", "install-required"].includes(support) && permission !== "denied",
    networkMode: "always",
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      try {
        if (sessionStorage.getItem(key)) return false;
      } catch {
        return false;
      }
      const epoch = session.getIdentity().epoch;
      const current = () =>
        session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner && !signal.aborted;
      const [configuration, preferences, subscriptions] = await Promise.all([
        session.api.read("/api/notifications/push-config", { signal }),
        session.api.read("/api/notifications/preferences", { signal }),
        session.api.read("/api/notifications/subscriptions", { signal }),
      ]);
      const config = readConfig(configuration),
        prefs = readPreferences(preferences),
        rows = readSubscriptions(subscriptions);
      if (!current() || !config.enabled || !prefs.settings.enabled || !prefs.settings.custom) return false;
      if (support === "install-required" || permission !== "granted") return true;
      const registration = await setupDeadline(navigator.serviceWorker.getRegistration("/"));
      const subscription = registration ? await setupDeadline(registration.pushManager.getSubscription()) : null;
      const label = storedDeviceLabel();
      const registered = rows.some(
        row => row.active && row.label === label && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()),
      );
      return (
        current() &&
        !(
          prefs.settings.pushEnabled &&
          registered &&
          subscription &&
          config.publicKey &&
          subscriptionMatchesKey(subscription, config.publicKey)
        )
      );
    },
  });
  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(key, "dismissed");
    } catch {
      /* Bu görünümde yine kapanır. */
    }
  }
  if (dismissed || !readiness.data || permission === "denied") return null;
  return (
    <aside className="reminder-push-nudge" aria-label="Hatırlatmayı cihazında gör">
      <p>Bu hatırlatmayı cihazında da görmek ister misin?</p>
      <div>
        <Link href="/reminders/preferences" prefetch={false} onClick={dismiss}>
          Bildirimleri ayarla
        </Link>
        <button type="button" className="ghost" onClick={dismiss}>
          Şimdi değil
        </button>
      </div>
    </aside>
  );
}

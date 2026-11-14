"use client";
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useNotificationPreferences } from "../notifications/queries";
import { mobileFailure, readMobilePreferences } from "./model";
import "./styles.css";

/** Yalnız Navortal Android uygulamasında gösterilir; bildirimleri uygulama yönetir, tarayıcı Web Push'u kullanılmaz. */
export function PhoneNotifications() {
  const headingId = useId();
  const { session, state } = useSession();
  const owner = state.user!.id;
  const queryClient = useQueryClient();
  const general = useNotificationPreferences();
  const key = queryKeys.resource(owner, "mobile-push-preferences");
  const mobile = useQuery({
    queryKey: key,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readMobilePreferences(await session.api.read("/api/mobile/push/preferences", { signal })),
  });
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [issue, setIssue] = useState("");

  async function change(enabled: boolean) {
    setPending(true);
    setIssue("");
    setMessage("");
    try {
      const fresh = readMobilePreferences(await session.api.read("/api/mobile/push/preferences"));
      const saved = readMobilePreferences(
        await session.api
          .mutation("/api/mobile/push/preferences", "put", {
            body: { expectedUserId: owner, version: fresh.version, enabled },
          })
          .execute(),
      );
      queryClient.setQueryData(key, saved);
      setMessage(enabled ? "Bu telefonda bildirimler açık." : "Bu telefonda bildirimler kapalı.");
    } catch (e) {
      setIssue(mobileFailure(e));
    } finally {
      setPending(false);
    }
  }

  const on = mobile.data?.enabled === true;
  return (
    <section aria-labelledby={headingId} className="device-notifications" data-phone-notifications>
      <div className="device-heading">
        <div>
          <h2 id={headingId}>Bu telefonda bildirimler</h2>
          <p>Bildirimler uygulama tarafından yönetilir.</p>
        </div>
        <span className={`device-state${on ? " on" : ""}`}>
          {mobile.isPending ? "Kontrol ediliyor" : on ? "Açık" : "Kapalı"}
        </span>
      </div>
      {general.data?.settings.enabled === false && (
        <p role="status">
          Genel bildirim tercihin kapalı. Hatırlatma almak için yukarıdaki “Bildirimler açık” seçeneğini de aç.
        </p>
      )}
      {mobile.data?.fcmAvailable === false && (
        <p role="status">Telefon bildirimleri şu an kullanılamıyor. Bildirimlerini sağ üstteki zilden görebilirsin.</p>
      )}
      <div className="device-main-action">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={on ? undefined : "primary"}
          disabled={pending || !mobile.data}
          onClick={() => void change(!on)}
        >
          {on ? "Bu telefonda bildirimleri kapat" : "Bu telefonda bildirimleri aç"}
        </button>
        <p className="r2-hint">
          Bu seçim yalnız bu hesabın telefon bildirimlerini etkiler. Sağ üstteki zil her zaman çalışır.
        </p>
      </div>
      {(mobile.isError || issue) && (
        <div className="form-error">
          <p role="alert">{issue || "Telefon bildirim durumu okunamadı. Yenileyip tekrar dene."}</p>
          <button type="button" disabled={pending} onClick={() => void mobile.refetch()}>
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
    </section>
  );
}

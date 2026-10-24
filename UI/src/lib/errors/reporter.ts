import { isWorkspacePath } from "../../../public/route-paths.js";
import type { Session } from "../../features/auth/session";

type Kind = "Error" | "UnhandledRejection" | "React";
const sent = new Set<string>();
const maxPerPage = 20;

/** Raporda tarayıcıdan çıkmaması gereken JWT, bearer, e-posta ve uzun sır benzeri değerleri maskeliyoruz. */
export function maskReport(text: string) {
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[gizli]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [gizli]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-posta]")
    .replace(/(?<![A-Za-z0-9])[A-Za-z0-9+/_=-]{24,}(?![A-Za-z0-9])/g, "[gizli]")
    .slice(0, 500);
}
export function browserFamily(agent: string) {
  if (agent.includes("Edg/")) return "Edge";
  if (agent.includes("Firefox/")) return "Firefox";
  if (agent.includes("Chrome/") || agent.includes("Chromium/")) return "Chrome";
  if (agent.includes("Safari/")) return "Safari";
  return "Other";
}

/** Yakalanmayan hata ve reddedilen promise kendi API'mize maskeli, tekilleştirilmiş ve sayfa başına en fazla 20 gönderilir. Çevrimdışı veya çıkışta atılır. Yalnız adres yolu gider, sorgu ve hash asla gitmez. */
export function reportClientError(session: Session, kind: Kind, error: unknown) {
  try {
    // Yalnız girişli çalışma alanı raporlar. Açık sayfa hiçbir şey göndermez.
    if (!isWorkspacePath(location.pathname)) return;
    if (!session.getIdentity().verified || navigator.onLine === false || sent.size >= maxPerPage) return;
    const message = maskReport(
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "Bilinmeyen hata"),
    );
    const route = location.pathname.slice(0, 200) || "/";
    const fingerprint = `${kind}|${route}|${message}`;
    if (sent.has(fingerprint)) return;
    sent.add(fingerprint);
    const buildId =
      (window as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__?.buildId ??
      document.documentElement.dataset.build ??
      "unknown";
    void session.api
      .mutation("/api/client-errors", "post", {
        body: {
          message: message || "Boş hata",
          kind,
          route,
          buildId: maskReport(buildId).slice(0, 100),
          browserFamily: browserFamily(navigator.userAgent),
          occurredAt: new Date().toISOString(),
        },
      })
      .execute()
      .catch(() => {
        /* Hata raporu başka hata raporu veya görünür hata oluşturmamalı. */
      });
  } catch {
    /* Raporlayıcıdan hata fırlatmıyoruz. */
  }
}

export function connectErrorReporter(session: Session, target: Window = window) {
  const onError = (event: ErrorEvent) => reportClientError(session, "Error", event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportClientError(session, "UnhandledRejection", event.reason);
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

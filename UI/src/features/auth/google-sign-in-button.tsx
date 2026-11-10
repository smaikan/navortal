"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { ApiError } from "../../lib/api/errors";
import { loadGisScript } from "./gis";
import { useSession } from "./provider";

export function GoogleSignInButton({
  mode,
  disabled = false,
  disabledMessage,
  onBusyChange,
  onLinked,
}: {
  mode: "login" | "register" | "link";
  disabled?: boolean;
  disabledMessage?: string;
  onBusyChange?: (busy: boolean) => void;
  onLinked?: () => void;
}) {
  const { session } = useSession();
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onBusyChange, onLinked });
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "disabled" | "ready" | "failed" | "busy">("loading");
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    callbacks.current = { onBusyChange, onLinked };
  }, [onBusyChange, onLinked]);

  useEffect(() => {
    let disposed = false,
      pending = false;
    const controller = new AbortController();
    const epoch = session.getIdentity().epoch;
    const current = () => !disposed && session.getIdentity().epoch === epoch;
    const element = container.current;
    let resize: ResizeObserver | undefined;
    element?.replaceChildren();
    async function initialize() {
      try {
        const config = await session.getGoogleConfig(controller.signal);
        if (!current()) return;
        if (!config.enabled) {
          setPhase("disabled");
          return;
        }
        if (disabled) {
          setPhase("ready");
          return;
        }
        await loadGisScript();
        if (!current() || !element || !window.google?.accounts.id) return;
        window.google.accounts.id.initialize({
          client_id: config.clientId!,
          nonce: config.nonce!,
          auto_select: false,
          ux_mode: "popup",
          callback: response => {
            if (!current() || pending || !response.credential) return;
            pending = true;
            element.replaceChildren();
            setPhase("busy");
            setIssue("");
            setMessage("");
            callbacks.current.onBusyChange?.(true);
            void (async () => {
              try {
                if (mode === "link") {
                  await session.linkGoogle(response.credential, epoch);
                  if (current()) {
                    setMessage("Google hesabın bağlandı.");
                    callbacks.current.onLinked?.();
                  }
                } else await session.authenticateGoogle(response.credential, epoch);
              } catch (error) {
                if (!current() || (error instanceof ApiError && error.kind === "identity-changed")) return;
                setIssue(
                  error instanceof ApiError && error.code === "google_link_required"
                    ? "Bu e-postayla bir hesabın var. Önce e-posta ve parolanla giriş yap, ardından Ayarlar › Profil bölümünden Google hesabını bağla."
                    : error instanceof ApiError && error.code === "google_challenge_invalid"
                      ? "Google girişinin süresi doldu. Yeniden deneyebilirsin."
                      : error instanceof Error
                        ? error.message
                        : "Google ile giriş tamamlanamadı.",
                );
              } finally {
                if (!disposed) {
                  callbacks.current.onBusyChange?.(false);
                  setAttempt(value => value + 1);
                }
              }
            })();
          },
        });
        let renderedWidth = 0;
        const render = () => {
          if (!current() || pending) return;
          const width = Math.min(400, Math.floor(element.getBoundingClientRect().width));
          if (width <= 0 || width === renderedWidth) return;
          renderedWidth = width;
          element.replaceChildren();
          window.google!.accounts.id.renderButton(element, {
            type: "standard",
            theme: "outline",
            size: "large",
            shape: "rectangular",
            text: "continue_with",
            logo_alignment: "left",
            locale: "tr",
            width,
          });
        };
        render();
        resize = new ResizeObserver(render);
        resize.observe(element);
        setPhase("ready");
      } catch {
        if (current()) {
          setPhase("failed");
          setIssue("Google ile giriş yüklenemedi. E-posta ve parolanla devam edebilir veya yeniden deneyebilirsin.");
        }
      }
    }
    void initialize();
    return () => {
      disposed = true;
      controller.abort();
      resize?.disconnect();
      element?.replaceChildren();
      if (pending) callbacks.current.onBusyChange?.(false);
    };
  }, [session, mode, disabled, attempt]);

  return (
    <div
      className={`google-auth google-auth-${mode}`}
      hidden={phase === "disabled"}
      aria-busy={phase === "loading" || phase === "busy"}
    >
      {mode !== "link" && (
        <div className="google-auth-divider" aria-hidden="true">
          <span>veya</span>
        </div>
      )}
      {mode === "link" && <p className="google-auth-caption">Google hesabınla da giriş yapabilirsin.</p>}
      <div
        className="google-auth-control"
        hidden={phase === "failed" || (phase === "ready" && disabled && !disabledMessage)}
      >
        <div className="google-auth-button" ref={container} />
        {(phase === "loading" || phase === "busy") && (
          <p className="google-auth-placeholder" role="status">
            <LoaderCircle size={17} className="google-auth-spinner" aria-hidden="true" />
            {phase === "busy" ? "Google girişi tamamlanıyor…" : "Google giriş seçeneği kontrol ediliyor…"}
          </p>
        )}
        {phase === "ready" && disabled && disabledMessage && (
          <p className="google-auth-placeholder google-auth-terms">
            <LockKeyhole size={17} aria-hidden="true" />
            {disabledMessage}
          </p>
        )}
      </div>
      {issue && (
        <p className="form-error" role="alert">
          {issue}
        </p>
      )}
      {message && (
        <p className="google-auth-caption" role="status">
          {message}
        </p>
      )}
      {phase === "failed" && (
        <button
          type="button"
          className="google-auth-retry"
          onClick={() => {
            setIssue("");
            setAttempt(value => value + 1);
          }}
        >
          Google girişini yeniden yükle
        </button>
      )}
    </div>
  );
}

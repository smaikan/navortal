"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormSkeleton } from "../../components/ui/skeleton";
import { useForm, useWatch } from "react-hook-form";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "./provider";
import type { Credentials } from "./session";
import { safeReturnPath } from "./return-path";
import { validateCredentials } from "./credentials";
import { takeLogoutNotice } from "./logout-notice";
import { GoogleSignInButton } from "./google-sign-in-button";

type AuthFields = Credentials & { acceptTerms: boolean };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const signup = mode === "register";
  const { state, session } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeReturnPath(search.get("next"));
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const summary = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const [logoutNotice, setLogoutNotice] = useState<"all" | "current" | null>(null);
  useEffect(() => {
    const notice = takeLogoutNotice();
    if (notice) queueMicrotask(() => setLogoutNotice(notice));
  }, []);
  const {
    register,
    handleSubmit,
    setError,
    resetField,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AuthFields>({
    defaultValues: { email: "", password: "", acceptTerms: false },
    resolver: values => {
      const result = validateCredentials(mode, values);
      const errors = {
        ...result.errors,
        ...(signup && !values.acceptTerms
          ? { acceptTerms: { type: "validate", message: "Devam etmek için Kullanım Koşulları’nı kabul et." } }
          : {}),
      };
      return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
    },
  });
  const acceptTerms = useWatch({ control, name: "acceptTerms" });
  useEffect(() => {
    if (state.phase === "authenticated") router.replace(next);
  }, [state.phase, router, next]);
  useEffect(() => {
    if (errors.root?.server) summary.current?.focus();
  }, [errors.root]);
  useEffect(() => {
    if (!waitUntil) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [waitUntil]);

  async function submit(values: Credentials) {
    if (submitting.current || googleBusy || secondsLeft || uncertain) return;
    submitting.current = true;
    try {
      // Kutu yalnız form şartı. KVKK rızası veya sunucuda tutulan kabul kaydı sayılmıyor.
      await session.authenticate(mode, { email: values.email, password: values.password });
    } catch (error) {
      if (error instanceof ApiError && error.kind === "identity-changed") return;
      let message = "Giriş tamamlanamadı. Yeniden deneyebilirsin.";
      if (error instanceof ApiError) {
        if (error.status === 401) message = "E-posta veya parola hatalı. Kontrol edip yeniden dene.";
        else if (error.code === "email_exists") message = "Bu e-posta adresiyle bir hesap var. Giriş yapabilirsin.";
        else if (error.outcomeUnknown && signup) {
          message = "Hesabının oluşup oluşmadığı doğrulanamadı. Aynı bilgilerle giriş yapmayı dene.";
          setUncertain(true);
        } else if (error.kind === "offline")
          message = "Bağlantı yok. Giriş isteği gönderilmedi. Bağlantın geldiğinde yeniden deneyebilirsin.";
        else if (error.status === 429) {
          message = "Çok sık deneme yapıldı. Biraz bekleyip yeniden dene.";
          setWaitUntil(Date.now() + (error.retryAfterSeconds ?? 30) * 1000);
        } else if (error.kind === "network") message = "Sunucuya bağlanılamadı. Bağlantını kontrol edip yeniden dene.";
        else message = error.message;
        for (const field of ["email", "password"] as const) {
          const messages = error.fieldErrors[field];
          if (messages?.[0]) setError(field, { type: "server", message: messages[0] });
        }
      }
      setError("root.server", { type: "server", message });
    } finally {
      resetField("password", { keepError: true });
      setShowPassword(false);
      submitting.current = false;
    }
  }

  if (state.phase === "initializing" || state.phase === "checking" || state.phase === "authenticated") {
    return <FormSkeleton label="Giriş durumu kontrol ediliyor…" />;
  }
  if (state.phase === "unavailable")
    return (
      <section>
        <h1>Girişin doğrulanamadı</h1>
        <p className="muted">Bağlantını kontrol edip yeniden dene. Giriş kaydın bu tarayıcıda duruyor.</p>
        <div className="actions">
          <button className="primary" onClick={() => void session.verify()}>
            Yeniden dene
          </button>
          <button onClick={() => session.forget()}>Başka hesapla giriş yap</button>
        </div>
      </section>
    );

  const counterpart = `${signup ? "/login" : "/register"}?next=${encodeURIComponent(next)}`;
  return (
    <section aria-labelledby="auth-heading">
      <header>
        <h1 id="auth-heading">{signup ? "Kendi alanını oluştur" : "Hesabına giriş yap"}</h1>
        <p className="muted">
          {signup ? "Görevlerini toparla, gününü adım adım planla." : "Planına kaldığın yerden devam et."}
        </p>
      </header>
      {logoutNotice && (
        <p className="form-notice" role="status">
          Sunucudaki oturumun kapatıldığı doğrulanamadı.
          {logoutNotice === "all" && " Diğer cihazlardaki oturumlar açık kalmış olabilir."} Bağlantın düzeldiğinde giriş
          yapıp Ayarlar › Hesap bölümünden tüm cihazlardan çıkabilirsin.
        </p>
      )}
      <form
        noValidate
        onKeyDown={event => {
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
        }}
        onSubmit={event => {
          void handleSubmit(submit)(event);
        }}
        aria-busy={isSubmitting || googleBusy}
      >
        <fieldset disabled={isSubmitting || googleBusy}>
          <legend className="sr-only">{signup ? "Hesap bilgileri" : "Giriş bilgileri"}</legend>
          <div className="form-field">
            <label htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={320}
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p className="field-error" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="password">Parola</label>
            {signup && (
              <p id="password-hint" className="muted form-hint">
                En az 6 karakter.
              </p>
            )}
            <div className="password-control">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 6 : undefined}
                aria-invalid={!!errors.password}
                aria-describedby={
                  [signup && "password-hint", errors.password && "password-error"].filter(Boolean).join(" ") ||
                  undefined
                }
                {...register("password")}
              />
              <button
                type="button"
                aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(value => !value)}
              >
                {showPassword ? "Gizle" : "Göster"}
              </button>
            </div>
            {errors.password && (
              <p className="field-error" id="password-error">
                {errors.password.message}
              </p>
            )}
            {!signup && (
              <Link className="auth-forgot-link" href="/forgot-password">
                Parolamı unuttum
              </Link>
            )}
          </div>
          {errors.root?.server && (
            <p className="form-error" role="alert" tabIndex={-1} ref={summary}>
              {errors.root.server.message}
            </p>
          )}
          {signup && (
            <div className="auth-registration-notice">
              <div className="auth-terms-row">
                <input
                  id="accept-terms"
                  type="checkbox"
                  required
                  aria-invalid={!!errors.acceptTerms}
                  aria-describedby={errors.acceptTerms ? "terms-error" : undefined}
                  {...register("acceptTerms")}
                />
                <label htmlFor="accept-terms">Kullanım Koşulları’nı kabul ediyorum.</label>
              </div>
              {errors.acceptTerms && (
                <p className="field-error" id="terms-error">
                  {errors.acceptTerms.message}
                </p>
              )}
              <div className="auth-registration-docs">
                <Link href="/terms" target="_blank" rel="noopener">
                  Koşulları oku<span className="sr-only"> (yeni sekmede açılır)</span>
                </Link>
                <Link href="/privacy-notice" target="_blank" rel="noopener">
                  KVKK Aydınlatma Metni<span className="sr-only"> (yeni sekmede açılır)</span>
                </Link>
              </div>
            </div>
          )}
          {secondsLeft > 0 && <p className="muted">Yeniden denemek için {secondsLeft} saniye bekle.</p>}
          <button className="primary auth-submit" type="submit" disabled={isSubmitting || secondsLeft > 0 || uncertain}>
            {isSubmitting ? "Devam ediliyor…" : signup ? "Hesap oluştur" : "Giriş yap"}
          </button>
        </fieldset>
      </form>
      <GoogleSignInButton
        mode={mode}
        disabled={isSubmitting || secondsLeft > 0 || uncertain || (signup && !acceptTerms)}
        disabledMessage={
          signup && !acceptTerms ? "Google ile devam etmek için Kullanım Koşulları’nı kabul et." : undefined
        }
        onBusyChange={setGoogleBusy}
      />
      <p className="auth-switch auth-switch-account">
        {signup ? "Hesabın var mı?" : "Hesabın yok mu?"}{" "}
        <Link href={counterpart} prefetch={false}>
          {signup ? "Giriş yap" : "Ücretsiz hesap oluştur"}
        </Link>
      </p>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { GoogleSignInButton } from "../auth/google-sign-in-button";
import { useUnsaved } from "./use-unsaved";

type Values = { currentPassword: string; newPassword: string; confirmation: string };
const empty: Values = { currentPassword: "", newPassword: "", confirmation: "" };

export function PasswordChange({
  owner,
  mode = "change",
  onDirty,
  onCreated,
}: {
  owner: string;
  mode?: "change" | "create";
  onDirty?: (dirty: boolean) => void;
  onCreated?: () => void;
}) {
  const { session } = useSession();
  const creating = mode === "create";
  const title = creating ? "Şifre oluştur" : "Parolayı değiştir";
  const credential = useRef<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [shown, setShown] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  const mounted = useRef(true);
  const summary = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ defaultValues: empty });
  useUnsaved(isDirty);
  useEffect(() => {
    onDirty?.(isDirty || isSubmitting);
    return () => onDirty?.(false);
  }, [isDirty, isSubmitting, onDirty]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      credential.current = null;
    };
  }, []);
  useEffect(() => {
    if (errors.root?.server) summary.current?.focus();
  }, [errors.root]);

  async function submit(values: Values) {
    if (sending.current || blocked || (creating && !credential.current)) return;
    sending.current = true;
    setMessage("");
    const epoch = session.getIdentity().epoch;
    const current = () =>
      mounted.current && session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
    try {
      const user = creating
        ? await session.api
            .mutation("/api/auth/set-password", "post", {
              body: { expectedUserId: owner, idToken: credential.current!, newPassword: values.newPassword },
            })
            .execute()
        : await session.api
            .mutation("/api/auth/change-password", "post", {
              body: { expectedUserId: owner, currentPassword: values.currentPassword, newPassword: values.newPassword },
            })
            .execute();
      if (!current()) return;
      if (
        !user ||
        user.id !== owner ||
        typeof user.email !== "string" ||
        typeof user.displayName !== "string" ||
        typeof user.profileVersion !== "number" ||
        !Number.isSafeInteger(user.profileVersion) ||
        user.profileVersion < 1
      ) {
        throw new ApiError(
          "protocol",
          "Parola değişikliği yanıtı doğrulanamadı.",
          200,
          undefined,
          {},
          undefined,
          undefined,
          true,
        );
      }
      session.updateUser(user, epoch);
      reset(empty);
      credential.current = null;
      if (creating) {
        setVerified(false);
        onCreated?.();
      } else setMessage("Parolan değiştirildi. Diğer cihazlardaki oturumların kapatıldı.");
    } catch (error) {
      if (!current()) return;
      reset(empty);
      if (creating) {
        credential.current = null;
        setVerified(false);
        setVerificationAttempt(value => value + 1);
      }
      if (creating && error instanceof ApiError && error.code === "google_account_mismatch") {
        setError("root.server", { message: "Bu hesaba bağlı Google hesabını seç." });
      } else if (
        creating &&
        error instanceof ApiError &&
        (error.code === "google_invalid" || error.code === "google_challenge_invalid")
      ) {
        setError("root.server", {
          message: "Google doğrulaması geçersiz veya süresi dolmuş. Google hesabını yeniden seç.",
        });
      } else if (creating && error instanceof ApiError && error.code === "password_already_set") {
        setBlocked(true);
        setError("root.server", {
          message: "Bu hesapta zaten parola var. Hesap ayarlarını yeniden açıp Parolayı değiştir seçeneğini kullan.",
        });
      } else if (
        creating &&
        error instanceof ApiError &&
        (error.code === "google_disabled" || error.code === "google_not_configured")
      ) {
        setError("root.server", { message: "Google doğrulaması şu anda kullanılamıyor. Daha sonra yeniden dene." });
      } else if (error instanceof ApiError && (error.outcomeUnknown || error.status >= 500 || error.status === 409)) {
        setBlocked(true);
        setError("root.server", {
          message: "İşlemin sonucu doğrulanamadı. Parolan değişmiş olabilir. Yeni parolanla giriş yaparak kontrol et.",
        });
      } else if (error instanceof ApiError && error.code === "current_password_invalid") {
        setError("currentPassword", { message: "Mevcut parolan doğru değil." }, { shouldFocus: true });
      } else if (error instanceof ApiError && error.code === "password_unchanged") {
        setError("newPassword", { message: "Yeni parolan mevcut parolandan farklı olmalı." }, { shouldFocus: true });
      } else {
        setError("root.server", {
          message: error instanceof ApiError ? error.message : "Parolan değiştirilemedi. Yeniden dene.",
        });
      }
    } finally {
      sending.current = false;
      if (current()) setShown({});
    }
  }

  return (
    <form
      className="account-password-form"
      noValidate
      aria-labelledby="password-change-heading"
      aria-busy={isSubmitting}
      onSubmit={event => {
        void handleSubmit(submit)(event);
      }}
    >
      <h3 id="password-change-heading">{title}</h3>
      <p className="muted" id="password-change-hint">
        Yeni parolan için en az 6 karakter yeterli.
      </p>
      {creating && (
        <>
          <p className="muted">
            Google hesabını doğrula, ardından yeni şifreni belirle. Google ile de giriş yapmaya devam edebilirsin.
          </p>
          <GoogleSignInButton
            key={verificationAttempt}
            mode="verify"
            disabled={blocked}
            onVerified={proof => {
              credential.current = proof;
              setVerified(true);
            }}
          />
        </>
      )}
      <fieldset disabled={isSubmitting || blocked}>
        <legend className="sr-only">Parola bilgileri</legend>
        {(
          [
            ["currentPassword", "Mevcut parola", "current-password", "Mevcut parolayı"],
            ["newPassword", "Yeni parola", "new-password", "Yeni parolayı"],
            ["confirmation", "Yeni parola tekrar", "new-password", "Yeni parola tekrarını"],
          ] as const
        )
          .filter(([name]) => !creating || name !== "currentPassword")
          .map(([name, label, autocomplete, action]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`account-${name}`}>{label}</label>
              <div className="password-control">
                <input
                  id={`account-${name}`}
                  type={shown[name] ? "text" : "password"}
                  autoComplete={autocomplete}
                  required
                  minLength={name === "newPassword" ? 6 : undefined}
                  aria-invalid={!!errors[name]}
                  aria-describedby={
                    errors[name] ? `account-${name}-error` : name === "newPassword" ? "password-change-hint" : undefined
                  }
                  {...register(name, {
                    required: `${label} alanını doldur.`,
                    ...(name === "newPassword"
                      ? { minLength: { value: 6, message: "Parola en az 6 karakter olmalı." } }
                      : {}),
                    ...(name === "confirmation"
                      ? {
                          validate: (value: string) =>
                            value === getValues("newPassword") || "Yeni parolalar eşleşmiyor.",
                        }
                      : {}),
                  })}
                />
                <button
                  type="button"
                  aria-label={`${action} ${shown[name] ? "gizle" : "göster"}`}
                  aria-pressed={!!shown[name]}
                  onClick={() => setShown(old => ({ ...old, [name]: !old[name] }))}
                >
                  {shown[name] ? "Gizle" : "Göster"}
                </button>
              </div>
              {errors[name] && (
                <p id={`account-${name}-error`} className="field-error">
                  {errors[name]?.message}
                </p>
              )}
            </div>
          ))}
        <p className="muted account-password-note">
          Bu cihazda açık kalırsın. Diğer cihazlardaki oturumların kapatılır.
        </p>
        <button type="submit" className="primary" disabled={isSubmitting || blocked || (creating && !verified)}>
          {isSubmitting ? (creating ? "Oluşturuluyor…" : "Değiştiriliyor…") : title}
        </button>
      </fieldset>
      {errors.root?.server && (
        <p ref={summary} tabIndex={-1} role="alert" className="form-error">
          {errors.root.server.message}
        </p>
      )}
      {blocked && (
        <Link href="/login" onClick={() => session.forget(session.getIdentity().epoch)}>
          Yeni parolayla giriş yap
        </Link>
      )}
      {message && (
        <p role="status" className="account-password-success">
          {message}
        </p>
      )}
    </form>
  );
}

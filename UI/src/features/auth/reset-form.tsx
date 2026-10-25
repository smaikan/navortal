"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "./provider";
import { readResetCode } from "./reset-code";

type Values = Pick<components["schemas"]["ResetPasswordRequest"], "newPassword">;
export function ResetForm() {
  const { session } = useSession();
  const code = useRef<string | null>(null);
  const read = useRef(false);
  const busy = useRef(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "invalid" | "complete" | "uncertain">("loading");
  const [show, setShow] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    resetField,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { newPassword: "" } });
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    code.current = readResetCode(window.location.hash);
    // Sırrı geçmişten kaldırırken Next'in yönlendirme durumunu koruyoruz.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setPhase(code.current ? "ready" : "invalid");
  }, []);
  useEffect(() => {
    if (phase === "complete" || phase === "invalid" || phase === "uncertain") heading.current?.focus();
  }, [phase]);
  useEffect(() => {
    if (errors.root?.server) summary.current?.focus();
  }, [errors.root]);
  async function submit(values: Values) {
    if (busy.current || !code.current || phase !== "ready") return;
    busy.current = true;
    try {
      await session.api
        .mutation("/api/auth/reset-password", "post", {
          body: { token: code.current, newPassword: values.newPassword },
        })
        .execute();
      code.current = null;
      session.forget();
      setPhase("complete");
    } catch (error) {
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "identity-changed")) {
        code.current = null;
        setPhase("uncertain");
      } else if (error instanceof ApiError && error.code === "reset_invalid") {
        code.current = null;
        setPhase("invalid");
      } else {
        const message = error instanceof ApiError ? error.message : "Parolan güncellenemedi. Yeniden dene.";
        setError("root.server", { message });
        if (error instanceof ApiError && error.fieldErrors.newpassword?.[0])
          setError("newPassword", { message: error.fieldErrors.newpassword[0] });
      }
    } finally {
      resetField("newPassword", { keepError: true });
      setShow(false);
      busy.current = false;
    }
  }
  if (phase === "loading") return <p role="status">Bağlantı kontrol ediliyor…</p>;
  if (phase !== "ready")
    return (
      <section>
        <h1 ref={heading} tabIndex={-1}>
          {phase === "complete"
            ? "Parolan güncellendi"
            : phase === "uncertain"
              ? "Sonuç doğrulanamadı"
              : "Bu bağlantı kullanılamıyor"}
        </h1>
        <p className="muted auth-switch">
          {phase === "complete"
            ? "Yeni parolanla giriş yapabilirsin."
            : phase === "uncertain"
              ? "İşlem tamamlanmış olabilir. Yeni parolanla giriş yapmayı dene."
              : "Bağlantı eksik, kullanılmış veya süresi dolmuş olabilir. Yeni bir sıfırlama bağlantısı iste."}
        </p>
        <div className="actions">
          <Link className="button primary" href={phase === "invalid" ? "/forgot-password" : "/login"}>
            {phase === "invalid" ? "Yeni bağlantı iste" : "Giriş yap"}
          </Link>
        </div>
      </section>
    );
  return (
    <section aria-labelledby="reset-heading">
      <header>
        <h1 id="reset-heading">Yeni parolanı belirle</h1>
        <p className="muted">En az 6 karakter yeterli.</p>
      </header>
      <form
        noValidate
        aria-busy={isSubmitting}
        onSubmit={event => {
          void handleSubmit(submit)(event);
        }}
      >
        <fieldset disabled={isSubmitting}>
          <legend className="sr-only">Yeni parola</legend>
          <div className="form-field">
            <label htmlFor="new-password">Yeni parola</label>
            <div className="password-control">
              <input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={6}
                required
                aria-invalid={!!errors.newPassword}
                aria-describedby={errors.newPassword ? "new-password-error" : undefined}
                {...register("newPassword", {
                  minLength: { value: 6, message: "Parola en az 6 karakter olmalı." },
                  required: "Yeni parolanı yaz.",
                })}
              />
              <button
                type="button"
                aria-label={show ? "Parolayı gizle" : "Parolayı göster"}
                aria-pressed={show}
                onClick={() => setShow(value => !value)}
              >
                {show ? "Gizle" : "Göster"}
              </button>
            </div>
            {errors.newPassword && (
              <p id="new-password-error" className="field-error">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          {errors.root?.server && (
            <p ref={summary} tabIndex={-1} role="alert" className="form-error">
              {errors.root.server.message}
            </p>
          )}
          <button type="submit" className="primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Güncelleniyor…" : "Parolayı güncelle"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

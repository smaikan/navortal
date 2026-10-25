"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { emailError } from "./credentials";
import { useSession } from "./provider";

type Values = components["schemas"]["ForgotPasswordRequest"];
export function ForgotForm() {
  const { session } = useSession();
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const busy = useRef(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { email: "" } });
  useEffect(() => {
    if (complete) heading.current?.focus();
    else if (errors.root?.server) errorSummary.current?.focus();
  }, [complete, errors.root]);
  async function submit(values: Values) {
    if (busy.current) return;
    busy.current = true;
    try {
      await session.api.mutation("/api/auth/forgot-password", "post", { body: values }).execute();
      setComplete(true);
    } catch (error) {
      let message = "İstek tamamlanamadı. Biraz sonra yeniden deneyebilirsin.";
      if (error instanceof ApiError) {
        if (error.status === 503) message = "Parola kurtarma hizmetine şu anda ulaşılamıyor. Biraz sonra yeniden dene.";
        else if (error.outcomeUnknown)
          message = "İsteğin sonucu doğrulanamadı. E-postanı kontrol et; bağlantı gelmezse daha sonra yeniden iste.";
        else if (error.kind === "offline")
          message = "Bağlantı yok. İstek gönderilmedi. Bağlantın geldiğinde yeniden dene.";
        else message = error.message;
        if (error.fieldErrors.email?.[0]) setError("email", { message: error.fieldErrors.email[0] });
      }
      setError("root.server", { message });
    } finally {
      busy.current = false;
    }
  }
  if (complete)
    return (
      <section>
        <h1 ref={heading} tabIndex={-1}>
          E-postanı kontrol edebilirsin
        </h1>
        <p className="muted auth-switch">
          Hesabın uygunsa sıfırlama bağlantısı gönderilecek. Bu mesaj e-postanın teslim edildiğini doğrulamaz.
        </p>
        <p className="auth-switch">Bağlantı gelmezse spam klasörünü kontrol et. Daha sonra yeniden isteyebilirsin.</p>
        <div className="actions">
          <Link className="button" href="/login">
            Girişe dön
          </Link>
        </div>
      </section>
    );
  return (
    <section aria-labelledby="forgot-heading">
      <header>
        <h1 id="forgot-heading">Parolanı yenile</h1>
        <p className="muted">Hesabının e-posta adresini yaz.</p>
      </header>
      <form
        noValidate
        aria-busy={isSubmitting}
        onSubmit={event => {
          void handleSubmit(submit)(event);
        }}
      >
        <fieldset disabled={isSubmitting}>
          <legend className="sr-only">Kurtarma e-postası</legend>
          <div className="form-field">
            <label htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={320}
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email", { validate: value => emailError(value) ?? true })}
            />
            {errors.email && (
              <p className="field-error" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>
          {errors.root?.server && (
            <p className="form-error" ref={errorSummary} tabIndex={-1} role="alert">
              {errors.root.server.message}
            </p>
          )}
          <button type="submit" className="primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Gönderiliyor…" : "Sıfırlama bağlantısı iste"}
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        <Link href="/login">Girişe dön</Link>
      </p>
    </section>
  );
}

import type { Credentials } from "./session";

// HTML'in normal e-posta kuralı. Hesaba veya parolaya fazladan karmaşıklık şartı eklemiyoruz.
const emailPattern =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
export function emailError(value: string) {
  return !value
    ? "E-posta adresini yaz."
    : value.length > 320
      ? "E-posta adresi en fazla 320 karakter olabilir."
      : !emailPattern.test(value)
        ? "Geçerli bir e-posta adresi yaz."
        : null;
}
/** İki alanlık form için küçük, eşzamanlı RHF kontrolü. Ek modül veya ağ turu gerekmiyor. */
export function validateCredentials(mode: "login" | "register", values: Credentials) {
  const errors: Partial<Record<keyof Credentials, { type: string; message: string }>> = {};
  const message = emailError(values.email);
  if (message) errors.email = { type: "validate", message };
  if (mode === "register" && values.password.length < 6)
    errors.password = { type: "validate", message: "Parola en az 6 karakter olmalı." };
  else if (!values.password) errors.password = { type: "validate", message: "Parolanı yaz." };
  return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
}

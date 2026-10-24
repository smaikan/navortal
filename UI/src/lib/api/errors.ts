export type ApiFailureKind =
  | "http"
  | "network"
  | "offline"
  | "canceled"
  | "protocol"
  | "identity-changed"
  | "not-authenticated"
  | "policy"
  | "uncertain";

export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    public readonly kind: ApiFailureKind,
    message: string,
    public readonly status = 0,
    public readonly code?: string,
    public readonly fieldErrors: Readonly<Record<string, readonly string[]>> = {},
    public readonly traceId?: string,
    public readonly retryAfterSeconds?: number,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
  }
}

export function httpMessage(status: number): string {
  switch (status) {
    case 400:
      return "Gönderilen alanları kontrol et.";
    case 401:
      return "Devam etmek için giriş yap.";
    case 404:
      return "Bu kaynağa erişilemiyor.";
    case 409:
      return "Güncel durum değişti. Son bilgileri yenile.";
    case 429:
      return "Çok sık istek gönderildi. Biraz bekleyip yeniden dene.";
    case 503:
      return "Bu özellik şu anda kullanılamıyor.";
    default:
      return "İşlem tamamlanamadı. Yeniden deneyebilirsin.";
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? Math.max(0, Math.ceil((instant - now) / 1000)) : undefined;
}

/** Yalnız geçici okuma tekrar edilir. Yazılar bu kuralı kullanmaz. */
export function retryRead(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    error instanceof ApiError &&
    (error.kind === "network" || (error.kind === "http" && [500, 502, 504].includes(error.status)))
  );
}

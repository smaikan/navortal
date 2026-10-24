import type { paths } from "./generated/schema";
import { operationPolicies } from "./generated/operation-policies";
import { ApiError, httpMessage, parseRetryAfter } from "./errors";
import { parseApiJson, serializeBody } from "./json";

type Path = keyof paths;
type Verb = "get" | "post" | "put" | "patch" | "delete";
type Method<P extends Path> = {
  [M in Verb]: M extends keyof paths[P] ? (paths[P][M] extends undefined ? never : M) : never;
}[Verb];
type Operation<P extends Path, M extends Method<P>> = NonNullable<paths[P][M & keyof paths[P]]>;
type Body<O> = O extends { requestBody?: infer B }
  ? NonNullable<B> extends { content: { "application/json": infer V } }
    ? V
    : never
  : never;
type Params<O, K extends "path" | "query"> = O extends { parameters: infer P }
  ? K extends keyof P
    ? P[K]
    : never
  : never;
type ResponseBody<R> = R extends { content: { "application/json": infer V } } ? V : undefined;
type Success<O> = O extends { responses: infer R } ? ResponseBody<R[Extract<keyof R, 200 | 201 | 202 | 204>]> : never;
type Options<O> = {
  query?: Params<O, "query">;
  signal?: AbortSignal;
} & ([Exclude<Params<O, "path">, undefined>] extends [never] ? { path?: never } : { path: Params<O, "path"> }) &
  ([Body<O>] extends [never]
    ? { body?: never }
    : O extends { requestBody: unknown }
      ? { body: Body<O> }
      : { body?: Body<O> });
type ReadPath = { [P in Path]: "get" extends Method<P> ? P : never }[Path];

/** active tarayıcıda oturum cookie'si olabilir demek. Asıl kimlik bilgisi HttpOnly, burada görülemez. */
export type ApiIdentity = Readonly<{ epoch: number; active: boolean; verified: boolean }>;
/** Cookie ile yazma bu başlığı ve aynı kaynak Origin bilgisini ister. Başka site bunu ekleyemez. */
export const CSRF_HEADER = "X-ADHD-CSRF";
type Policy = { auth: boolean; key: boolean; maxKeyLength: number | null; retry: string; disabled: boolean };
type ClientConfig = {
  identity: () => ApiIdentity;
  onUnauthorized: (epoch: number) => void;
  fetch?: typeof fetch;
  online?: () => boolean;
  newKey?: () => string;
  timeoutMs?: number;
};

function policyFor(pattern: string, method: string, params: unknown): Policy {
  const operation = (params as { operation?: string } | undefined)?.operation;
  const policyPath = pattern.replace("{operation}", operation ?? "{operation}");
  const policy = (operationPolicies as Record<string, Policy>)[`${method.toUpperCase()} ${policyPath}`];
  if (!policy || policy.disabled) throw new ApiError("policy", "Bu işlem kullanıma açık değil.");
  return policy;
}

function urlFor(pattern: string, params: unknown, query: unknown): string {
  const values = params as Record<string, unknown> | undefined;
  const path = pattern.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = values?.[name];
    if (typeof value !== "string" && typeof value !== "number")
      throw new ApiError("policy", "İşlem için gerekli kimlik eksik.");
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries((query ?? {}) as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  return path + (search.size ? `?${search}` : "");
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function createApiClient(config: ClientConfig) {
  const fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
  const online = config.online ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const timeoutMs = config.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new ApiError("policy", "İstek zaman aşımı ayarı geçersiz.");
  const checkEpoch = (epoch: number) => {
    if (config.identity().epoch !== epoch)
      throw new ApiError("identity-changed", "Hesap değişti. Sonuç önceki çalışma alanına ait.");
  };

  async function send(
    pattern: string,
    method: string,
    path: unknown,
    query: unknown,
    body: string | undefined,
    policy: Policy,
    identity: ApiIdentity,
    signal?: AbortSignal,
    key?: string,
  ): Promise<unknown> {
    checkEpoch(identity.epoch);
    const write = method !== "get";
    if (signal?.aborted) throw new ApiError("canceled", "İstek gönderilmeden iptal edildi.");
    if (write && !online())
      throw new ApiError(
        "offline",
        "Bağlantı yok. Değişiklik gönderilmedi; yeniden bağlanınca kendiliğinden gönderilmeyecek.",
      );
    if (policy.auth && (!identity.active || (!identity.verified && pattern !== "/api/auth/me"))) {
      throw new ApiError("not-authenticated", "Çalışma alanını açmadan önce girişini doğrula.");
    }
    const headers: Record<string, string> = { Accept: "application/json, application/problem+json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (write) headers[CSRF_HEADER] = "1";
    if (key) headers["Idempotency-Key"] = key;
    const url = urlFor(pattern, path, query);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, timeoutMs);
    let response: Response;
    let raw: string;
    try {
      response = await fetcher(url, {
        method: method.toUpperCase(),
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      });
      raw = response.status === 204 ? "" : await response.text();
    } catch {
      checkEpoch(identity.epoch);
      const canceled = signal?.aborted;
      throw new ApiError(
        canceled ? "canceled" : "network",
        write ? "İşlemin sonucu alınamadı. Güncel kaydı kontrol et." : "Bilgiler alınamadı. Bağlantını kontrol et.",
        0,
        undefined,
        {},
        undefined,
        undefined,
        write,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
    checkEpoch(identity.epoch);
    let parsed: unknown;
    try {
      if (response.status !== 204) {
        if (!raw.trim() && [200, 201].includes(response.status))
          throw new ApiError("protocol", "Sunucunun yanıtı tamamlanmadı.");
        if (raw && /(?:application\/json|\+json)(?:;|$)/i.test(response.headers.get("Content-Type") ?? ""))
          parsed = parseApiJson(raw);
        else if (raw && response.ok) throw new ApiError("protocol", "Sunucu yanıtı okunamadı.");
      }
    } catch (error) {
      checkEpoch(identity.epoch);
      if (response.ok)
        throw new ApiError(
          "protocol",
          error instanceof ApiError ? error.message : "Sunucu yanıtı okunamadı.",
          response.status,
          undefined,
          {},
          undefined,
          undefined,
          write,
        );
      // Altyapı hatası boş, JSON dışı veya bozuk gövdeyle gelebilir.
    }
    checkEpoch(identity.epoch);
    if (!response.ok) {
      const problem = object(parsed);
      const fieldErrors: Record<string, string[]> = {};
      for (const [field, messages] of Object.entries(object(problem.errors))) {
        if (Array.isArray(messages))
          fieldErrors[field.toLowerCase()] = messages.filter((value): value is string => typeof value === "string");
      }
      const error = new ApiError(
        "http",
        httpMessage(response.status),
        response.status,
        typeof problem.code === "string" ? problem.code : undefined,
        fieldErrors,
        typeof problem.traceId === "string" ? problem.traceId : undefined,
        parseRetryAfter(response.headers.get("Retry-After")),
      );
      if (response.status === 401 && policy.auth) config.onUnauthorized(identity.epoch);
      throw error;
    }
    return parsed;
  }

  return {
    read<P extends ReadPath>(
      pattern: P,
      ...args: Partial<Options<Operation<P, Extract<Method<P>, "get">>>> extends Options<
        Operation<P, Extract<Method<P>, "get">>
      >
        ? [options?: Options<Operation<P, Extract<Method<P>, "get">>>]
        : [options: Options<Operation<P, Extract<Method<P>, "get">>>]
    ) {
      const options = (args[0] ?? {}) as Options<Operation<P, Extract<Method<P>, "get">>>;
      const policy = policyFor(pattern, "get", options.path);
      return send(
        pattern,
        "get",
        options.path,
        options.query,
        undefined,
        policy,
        config.identity(),
        options.signal,
      ) as Promise<Success<Operation<P, Extract<Method<P>, "get">>>>;
    },
    mutation<P extends Path, M extends Exclude<Method<P>, "get">>(
      pattern: P,
      method: M,
      options: Options<Operation<P, M>>,
    ) {
      const identity = config.identity();
      const policy = policyFor(pattern, method, options.path);
      const body = serializeBody(options.body);
      // Tekrarda aynı niyet kalsın diye URL girdilerini de gövde gibi sabitliyoruz.
      const path = options.path === undefined ? undefined : parseApiJson(serializeBody(options.path)!);
      const query = options.query === undefined ? undefined : parseApiJson(serializeBody(options.query)!);
      const key = policy.key ? (config.newKey ?? (() => crypto.randomUUID()))() : undefined;
      if (key && (!key.trim() || key.length > (policy.maxKeyLength ?? 128)))
        throw new ApiError("policy", "İşlem kimliği geçersiz.");
      let pending: Promise<Success<Operation<P, M>>> | undefined;
      let completed = false;
      let result: Success<Operation<P, M>>;
      let unknownResult = false;
      return {
        key,
        execute({
          retryUnknownResult = false,
          signal = options.signal,
        }: { retryUnknownResult?: boolean; signal?: AbortSignal } = {}): Promise<Success<Operation<P, M>>> {
          checkEpoch(identity.epoch);
          if (pending) return pending;
          if (completed) return Promise.resolve(result);
          if (unknownResult && (!policy.key || !retryUnknownResult)) {
            return Promise.reject(
              new ApiError(
                "uncertain",
                policy.key
                  ? "Sonuç belirsiz. Aynı işlem kimliğiyle kontrollü yeniden dene."
                  : "Sonuç belirsiz. Tekrar göndermeden önce güncel kaydı kontrol et.",
                0,
                undefined,
                {},
                undefined,
                undefined,
                true,
              ),
            );
          }
          pending = send(pattern, method, path, query, body, policy, identity, signal, key)
            .then(value => {
              completed = true;
              result = value as Success<Operation<P, M>>;
              return result;
            })
            .catch(error => {
              unknownResult = error instanceof ApiError && error.outcomeUnknown;
              throw error;
            })
            .finally(() => {
              pending = undefined;
            });
          return pending;
        },
      };
    },
  };
}

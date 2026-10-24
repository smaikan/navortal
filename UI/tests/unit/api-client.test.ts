import { afterEach, describe, expect, test, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { createApiClient, type ApiIdentity } from "../../src/lib/api/client";
import { ApiError, parseRetryAfter, retryRead } from "../../src/lib/api/errors";
import { parseApiJson, serializeBody } from "../../src/lib/api/json";
import { createWorkspaceQueryClient, queryKeys } from "../../src/lib/api/query-client";

function fixture() {
  let identity: ApiIdentity = { epoch: 1, active: true, verified: true };
  let isOnline = true;
  const fetcher = vi.fn<typeof fetch>();
  const unauthorized = vi.fn();
  const api = createApiClient({
    identity: () => identity,
    onUnauthorized: unauthorized,
    fetch: fetcher,
    online: () => isOnline,
    newKey: () => "one-user-intent-key",
  });
  return {
    api,
    fetcher,
    unauthorized,
    setIdentity: (next: ApiIdentity) => {
      identity = next;
    },
    setOnline: (value: boolean) => {
      isOnline = value;
    },
  };
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
afterEach(() => {
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("response and policy boundaries", () => {
  test.each([200, 201])("preserves HTTP%s data, null and decimal seconds", async status => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({ id: "a", activeSeconds: 0.25, remainingSeconds: null }, status));
    const data = await f.api.read("/api/work-sessions/{id}", { path: { id: "a" } });
    expect(data).toMatchObject({ activeSeconds: 0.25, remainingSeconds: null });
    expect(f.fetcher.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
    });
    // HttpOnly cookie oturumu var. İstemci kimlik bilgisi başlığı üretmez.
    expect(f.fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    expect(f.fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("X-ADHD-CSRF");
  });
  test("204 never attempts JSON parsing", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(f.api.mutation("/api/auth/logout", "post", {}).execute()).resolves.toBeUndefined();
  });
  test.each([400, 401, 404, 409, 429, 503])("handles empty HTTP%s without a parser error", async status => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status }));
    await expect(f.api.read("/api/tasks")).rejects.toMatchObject({ kind: "http", status });
    expect(f.unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  test("ProblemDetails carries code, traceId and normalized field errors", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(
      json(
        { code: "validation_failed", traceId: "trace-test", errors: { Title: ["Başlık gerekli."], Other: [3] } },
        400,
        { "Content-Type": "application/problem+json" },
      ),
    );
    await expect(f.api.mutation("/api/tasks", "post", { body: { title: "" } }).execute()).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
      traceId: "trace-test",
      fieldErrors: { title: ["Başlık gerekli."], other: [] },
    });
  });
  test("429 exposes Retry-After and does not automatically wait or repeat", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "30" } }));
    await expect(f.api.read("/api/tasks")).rejects.toMatchObject({ retryAfterSeconds: 30 });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 30_000)).toBe(30);
    expect(parseRetryAfter("invalid")).toBeUndefined();
  });
  test("bootstrap blocks personal reads but allows me validation", async () => {
    const f = fixture();
    f.setIdentity({ epoch: 2, active: true, verified: false });
    await expect(f.api.read("/api/tasks")).rejects.toMatchObject({ kind: "not-authenticated" });
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockResolvedValueOnce(json({ id: "owner" }));
    await f.api.read("/api/auth/me");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  test("anonymous login does not attach a previous token or clear auth for invalid credentials", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      f.api
        .mutation("/api/auth/login", "post", { body: { email: "fixture@example.test", password: "synthetic" } })
        .execute(),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    expect(f.fetcher.mock.calls[0][1]?.headers).toHaveProperty("X-ADHD-CSRF", "1");
    expect(f.unauthorized).not.toHaveBeenCalled();
  });
  test("path values are encoded and false query values survive", async () => {
    const f = fixture();
    f.fetcher.mockImplementation(async () => json({ items: [] }));
    await f.api.read("/api/tasks/{id}", { path: { id: "a/b" } });
    expect(f.fetcher.mock.calls[0][0]).toBe("/api/tasks/a%2Fb");
    await f.api.read("/api/tasks", { query: { includeCompleted: false, search: "%_ test" } });
    expect(f.fetcher.mock.calls[1][0]).toBe("/api/tasks?includeCompleted=false&search=%25_+test");
  });
  test("Google and undeclared dynamic commands never fetch", () => {
    const f = fixture();
    expect(() => f.api.mutation("/api/auth/google", "post", { body: { idToken: "unused" } })).toThrow(ApiError);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  test("focus operation policy resolves only the declared concrete commands", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({ id: "focus" }));
    await f.api
      .mutation("/api/focus-sessions/{id}/{operation}", "post", {
        path: { id: "focus", operation: "pause" },
        body: { version: 1, workSessionVersion: 1, skipBreak: false },
      })
      .execute();
    expect(f.fetcher.mock.calls[0][0]).toBe("/api/focus-sessions/focus/pause");
    expect(() =>
      f.api.mutation("/api/focus-sessions/{id}/{operation}", "post", {
        // @ts-expect-error TypeScript dışından tanımsız komut gönderen çağıranı deniyoruz.
        path: { id: "focus", operation: "invented" },
        body: { version: 1, workSessionVersion: 1, skipBreak: false },
      }),
    ).toThrow(ApiError);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("uncertain writes and account changes", () => {
  test("concurrent double submit and repeated success use one intent", async () => {
    const f = fixture();
    let finish!: (value: Response) => void;
    f.fetcher.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const command = f.api.mutation("/api/tasks", "post", { body: { title: "Bir küçük adım" } });
    const one = command.execute();
    const two = command.execute();
    expect(one).toBe(two);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    finish(json({ id: "created" }, 201));
    await one;
    await command.execute();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(command.key).toBeUndefined();
  });
  test("keyless create response loss never repeats POST; read reconciliation remains available", async () => {
    const f = fixture();
    f.fetcher.mockRejectedValueOnce(new TypeError("response lost after commit"));
    const command = f.api.mutation("/api/tasks", "post", { body: { title: "Kaydı kontrol et" } });
    await expect(command.execute()).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(command.execute({ retryUnknownResult: true })).rejects.toMatchObject({ kind: "uncertain" });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    f.fetcher.mockResolvedValueOnce(json({ items: [{ id: "committed" }] }));
    await f.api.read("/api/tasks");
    expect(f.fetcher.mock.calls[1][1]?.method).toBe("GET");
    expect(f.fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
  });
  test("keyed retry retains the exact body and key after caller input changes", async () => {
    const f = fixture();
    const body = { taskId: "original-task" };
    f.fetcher.mockRejectedValueOnce(new TypeError("timeout")).mockResolvedValueOnce(json({ id: "same-work" }, 201));
    const command = f.api.mutation("/api/work-sessions/start", "post", { body });
    body.taskId = "changed-task";
    await expect(command.execute()).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(command.execute()).rejects.toMatchObject({ kind: "uncertain" });
    await command.execute({ retryUnknownResult: true });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.fetcher.mock.calls.map(call => call[1]?.body)).toEqual([
      '{"taskId":"original-task"}',
      '{"taskId":"original-task"}',
    ]);
    for (const [, init] of f.fetcher.mock.calls)
      expect(init?.headers).toHaveProperty("Idempotency-Key", "one-user-intent-key");
  });
  test("offline Query mutation rejects, stays unpaused and never writes on reconnect", async () => {
    const f = fixture();
    f.setOnline(false);
    onlineManager.setOnline(false);
    const client = createWorkspaceQueryClient();
    const command = f.api.mutation("/api/tasks", "post", {
      body: { title: "Çevrimiçi olunca kendiliğinden gönderme" },
    });
    const mutation = client.getMutationCache().build(client, { mutationFn: () => command.execute() });
    await expect(mutation.execute(undefined)).rejects.toMatchObject({ kind: "offline", outcomeUnknown: false });
    expect(mutation.state.isPaused).toBe(false);
    f.setOnline(true);
    onlineManager.setOnline(true);
    await Promise.resolve();
    expect(f.fetcher).not.toHaveBeenCalled();
    client.clear();
  });
  test.each([200, 401])("late HTTP%s from old account cannot produce data or unauthorized callback", async status => {
    const f = fixture();
    let finish!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const request = f.api.read("/api/tasks");
    f.setIdentity({ epoch: 2, active: true, verified: true });
    finish(json({ items: [] }, status));
    await expect(request).rejects.toMatchObject({ kind: "identity-changed" });
    expect(f.unauthorized).not.toHaveBeenCalled();
  });
  test("prepared old-owner intent cannot execute after account switch", () => {
    const f = fixture();
    const command = f.api.mutation("/api/tasks", "post", { body: { title: "Önceki hesap" } });
    f.setIdentity({ epoch: 2, active: true, verified: true });
    expect(() => command.execute()).toThrowError(expect.objectContaining({ kind: "identity-changed" }));
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  test("a lost or malformed success response is uncertain for a write", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(
      new Response("{invalid", { status: 201, headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      f.api.mutation("/api/tasks", "post", { body: { title: "Sonucu kontrol et" } }).execute(),
    ).rejects.toMatchObject({ kind: "protocol", outcomeUnknown: true });
  });
  test("empty201 is uncertain, not a saved task", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 201 }));
    await expect(
      f.api.mutation("/api/tasks", "post", { body: { title: "Boş yanıt" } }).execute(),
    ).rejects.toMatchObject({ kind: "protocol", outcomeUnknown: true });
  });
  test("abort before fetch is known unsent and may be retried with a fresh signal", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    const command = f.api.mutation("/api/tasks", "post", {
      body: { title: "İstek henüz gönderilmedi" },
      signal: controller.signal,
    });
    await expect(command.execute()).rejects.toMatchObject({ kind: "canceled", outcomeUnknown: false });
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockResolvedValueOnce(json({ id: "created" }, 201));
    await command.execute({ signal: new AbortController().signal });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  test("abort after fetch begins leaves a write result unknown", async () => {
    const f = fixture();
    const controller = new AbortController();
    f.fetcher.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      f.api
        .mutation("/api/tasks", "post", { body: { title: "Gönderilmiş olabilir" }, signal: controller.signal })
        .execute(),
    ).rejects.toMatchObject({ kind: "canceled", outcomeUnknown: true });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  test("request timeout covers transport and leaves no automatic write retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), {
            once: true,
          });
        }),
    );
    const api = createApiClient({
      identity: () => ({ epoch: 1, active: true, verified: true }),
      onUnauthorized: vi.fn(),
      fetch: fetcher,
      timeoutMs: 25,
    });
    const command = api.mutation("/api/tasks", "post", { body: { title: "Zaman aşımı" } });
    const result = command.execute().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toMatchObject({ kind: "network", outcomeUnknown: true });
    await expect(command.execute()).rejects.toMatchObject({ kind: "uncertain" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

test("safe number boundary rejects rounding and preserves numeric strings/null", () => {
  expect(() => parseApiJson('{"version":9007199254740993}')).toThrow(ApiError);
  expect(() => serializeBody({ version: Number.MAX_SAFE_INTEGER + 1 })).toThrow(ApiError);
  expect(parseApiJson('{"version":"9223372036854775807","seconds":0.125,"remaining":null}')).toEqual({
    version: "9223372036854775807",
    seconds: 0.125,
    remaining: null,
  });
});
test("bounded reads do not retry known HTTP failures, cancellation, or provider503", () => {
  for (const status of [400, 401, 404, 409, 429, 503])
    expect(retryRead(0, new ApiError("http", "test", status))).toBe(false);
  expect(retryRead(0, new ApiError("network", "test"))).toBe(true);
  expect(retryRead(1, new ApiError("http", "test", 502))).toBe(true);
  expect(retryRead(2, new ApiError("network", "test"))).toBe(false);
  expect(retryRead(0, new ApiError("canceled", "test"))).toBe(false);
  expect(queryKeys.resource("a", "tasks", { search: "x" })).not.toEqual(
    queryKeys.resource("b", "tasks", { search: "x" }),
  );
});

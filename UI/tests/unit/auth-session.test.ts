import { describe, expect, it, vi } from "vitest";
import {
  createSession,
  LEGACY_TOKEN_KEY,
  SESSION_MARKER_KEY,
  type TokenStorage,
} from "../../src/features/auth/session";
import { safeReturnPath } from "../../src/features/auth/return-path";
import { validateCredentials } from "../../src/features/auth/credentials";
import { createWorkspaceQueryClient } from "../../src/lib/api/query-client";
import { connectBrowserSession } from "../../src/features/auth/browser-sync";

const user = { id: "owner-a", email: "person@example.test", displayName: "Kişi" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const MARK = JSON.stringify({ version: 1 });
/** signedIn yalnız sırsız işareti saklar. Asıl oturum HttpOnly cookie'de olur. */
function fixture(signedIn = false) {
  const data = new Map<string, string>();
  if (signedIn) data.set(SESSION_MARKER_KEY, MARK);
  const storage: TokenStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: key => {
      data.delete(key);
    },
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  return { data, storage, fetch, session: createSession({ storage: () => storage, fetch }) };
}

describe("auth bootstrap and ownership (UI-R3 cookie session)", () => {
  it("keeps newer profile receipts when a previous same-owner me read arrives late", async () => {
    const f = fixture(true);
    f.fetch.mockResolvedValueOnce(json({ ...user, profileVersion: 1, photoVersion: null }));
    await f.session.initialize();
    const epoch = f.session.getIdentity().epoch;
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const pending = f.session.synchronize(true);
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    expect(f.session.updateUser({ ...user, displayName: "Yeni Ad", profileVersion: 2 }, epoch)).toBe(true);
    finish(json({ ...user, profileVersion: 1 }));
    await pending;
    expect(f.session.getSnapshot().user?.displayName).toBe("Yeni Ad");
    expect(f.session.getSnapshot().phase).toBe("authenticated");
    expect(f.session.updateUser({ ...user, id: "other-owner", profileVersion: 3 }, epoch)).toBe(false);
    f.session.forget();
    expect(f.session.updateUser({ ...user, profileVersion: 4 }, epoch)).toBe(false);
    expect(f.session.getSnapshot().user).toBeNull();
  });
  it("refreshes a changed same-owner profile without resetting the owner epoch", async () => {
    const f = fixture(true);
    f.fetch
      .mockResolvedValueOnce(json({ ...user, profileVersion: 1 }))
      .mockResolvedValueOnce(json({ ...user, displayName: "Güncel Ad", profileVersion: 2 }));
    await f.session.initialize();
    const epoch = f.session.getIdentity().epoch;
    await f.session.synchronize(true);
    expect(f.session.getSnapshot().user?.displayName).toBe("Güncel Ad");
    expect(f.session.getIdentity().epoch).toBe(epoch);
  });
  it("does not read browser storage or fetch until browser initialization", async () => {
    const f = fixture();
    expect(f.session.getSnapshot().phase).toBe("initializing");
    expect(f.fetch).not.toHaveBeenCalled();
    await f.session.initialize();
    await f.session.initialize();
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("verifies a marked session once and blocks personal reads until me completes", async () => {
    const f = fixture(true);
    let finish!: (response: Response) => void;
    f.fetch.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const ready = f.session.initialize();
    void f.session.initialize();
    await expect(f.session.api.read("/api/tasks")).rejects.toMatchObject({ kind: "not-authenticated" });
    expect(f.session.getSnapshot().user).toBeNull();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    const init = f.fetch.mock.calls[0][1]!;
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    finish(json(user));
    await ready;
    expect(f.session.getSnapshot()).toMatchObject({ phase: "authenticated", user });
    expect(f.session.getIdentity().verified).toBe(true);
  });
  it("clears a malformed marker without fetching", async () => {
    const f = fixture();
    f.data.set(SESSION_MARKER_KEY, "{bad");
    await f.session.initialize();
    expect(f.data.has(SESSION_MARKER_KEY)).toBe(false);
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("401 clears the marker, identity and cache", async () => {
    const f = fixture(true);
    f.fetch.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json({}, 401));
    await f.session.initialize();
    const client = createWorkspaceQueryClient();
    f.session.onIdentityChange(() => {
      void client.cancelQueries();
      client.clear();
    });
    client.setQueryData(["private"], "old-user");
    await expect(f.session.api.read("/api/tasks")).rejects.toMatchObject({ status: 401 });
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.data.has(SESSION_MARKER_KEY)).toBe(false);
    expect(client.getQueryData(["private"])).toBeUndefined();
  });
  it("network failure keeps the marker and explicit retry can recover", async () => {
    const f = fixture(true);
    f.fetch.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(json(user));
    await f.session.initialize();
    expect(f.session.getSnapshot().phase).toBe("unavailable");
    expect(f.session.getIdentity().active).toBe(true);
    expect(f.data.has(SESSION_MARKER_KEY)).toBe(true);
    await f.session.verify();
    expect(f.session.getSnapshot().phase).toBe("authenticated");
  });
  it("malformed successful me never opens the workspace", async () => {
    const f = fixture(true);
    f.fetch.mockResolvedValueOnce(json({ email: user.email }));
    await f.session.initialize();
    expect(f.session.getSnapshot().phase).toBe("unavailable");
    expect(f.session.getIdentity().verified).toBe(false);
  });
  it("register preserves the exact password, never stores the token and verifies me", async () => {
    const f = fixture();
    await f.session.initialize();
    f.fetch.mockResolvedValueOnce(json(user, 201)).mockResolvedValueOnce(json(user));
    await f.session.authenticate("register", { email: user.email, password: " 1234 " });
    expect(f.fetch.mock.calls[0][0]).toBe("/api/auth/session/register");
    expect(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).password).toBe(" 1234 ");
    expect(new Headers(f.fetch.mock.calls[0][1]!.headers).get("X-ADHD-CSRF")).toBe("1");
    expect(f.fetch.mock.calls[1][0]).toBe("/api/auth/me");
    expect([...f.data.entries()]).toEqual([[SESSION_MARKER_KEY, MARK]]);
    expect(JSON.stringify([...f.data.values()])).not.toContain("new-access");
    expect(f.session.getSnapshot().phase).toBe("authenticated");
  });
  it("wrong credentials cannot persist an identity", async () => {
    const f = fixture();
    await f.session.initialize();
    f.fetch.mockResolvedValueOnce(json({ code: "invalid_credentials" }, 401));
    await expect(f.session.authenticate("login", { email: user.email, password: "wrong!" })).rejects.toMatchObject({
      status: 401,
    });
    expect(f.data.size).toBe(0);
    expect(f.session.getSnapshot().phase).toBe("anonymous");
  });
  it("malformed login response is rejected before storage", async () => {
    const f = fixture();
    await f.session.initialize();
    f.fetch.mockResolvedValueOnce(json({ accessToken: "new-access", user }));
    await expect(f.session.authenticate("login", { email: user.email, password: "123456" })).rejects.toMatchObject({
      kind: "protocol",
    });
    expect(f.data.size).toBe(0);
  });
  it("late me cannot reopen a locally signed out session", async () => {
    const f = fixture(true);
    let finish!: (response: Response) => void;
    f.fetch.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const ready = f.session.initialize();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    f.session.forget();
    finish(json(user));
    await ready;
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.session.getIdentity().active).toBe(false);
  });
  it("late login cannot restore a discarded identity", async () => {
    const f = fixture();
    await f.session.initialize();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const login = f.session.authenticate("login", { email: user.email, password: "123456" });
    f.session.forget();
    finish(json(user));
    await expect(login).rejects.toMatchObject({ kind: "identity-changed" });
    expect(f.data.size).toBe(0);
  });
  it("storage failure is explicit and does not masquerade as a remembered login", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(user));
    const session = createSession({
      storage: () => {
        throw new Error("denied");
      },
      fetch,
    });
    await session.initialize();
    await session.authenticate("login", { email: user.email, password: "123456" });
    expect(session.getSnapshot().phase).toBe("authenticated");
    expect(session.getSnapshot().storageWarning).toContain("saklayamadı");
  });
  it("a sign-in change elsewhere starts a new owner epoch; a late 401 cannot sign out the new owner", async () => {
    const f = fixture(true);
    let finish!: (response: Response) => void;
    f.fetch
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(json({ ...user, id: "owner-b", email: "other@example.test" }));
    const old = f.session.initialize();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    const signal = f.fetch.mock.calls[0][1]!.signal!;
    await f.session.synchronize(true, true);
    expect(signal.aborted).toBe(true);
    finish(json({}, 401));
    await old;
    expect(f.session.getSnapshot()).toMatchObject({ phase: "authenticated", user: { id: "owner-b" } });
    expect(f.data.has(SESSION_MARKER_KEY)).toBe(true);
  });
  it("an older prepared mutation cannot run after the account changed", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const old = f.session.api.mutation("/api/tasks", "post", { body: { title: "A's task" } });
    await f.session.synchronize(true, true);
    expect(() => old.execute()).toThrow("Hesap değişti");
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it("a silent recheck keeps the workspace for the same owner and resets it for another", async () => {
    const f = fixture(true);
    f.fetch.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(user));
    await f.session.initialize();
    const epoch = f.session.getIdentity().epoch;
    const phases: string[] = [];
    f.session.subscribe(() => phases.push(f.session.getSnapshot().phase));
    await f.session.synchronize(true);
    expect(f.session.getIdentity().epoch).toBe(epoch);
    expect(phases).toEqual([]);
    f.fetch
      .mockResolvedValueOnce(json({ ...user, id: "owner-b", email: "b@example.test" }))
      .mockResolvedValueOnce(json({ ...user, id: "owner-b", email: "b@example.test" }));
    await f.session.synchronize(true);
    expect(f.session.getIdentity().epoch).toBeGreaterThan(epoch);
    expect(f.session.getSnapshot()).toMatchObject({ phase: "authenticated", user: { id: "owner-b" } });
  });
  it("a pre-cookie token is adopted once through its own endpoint and removed", async () => {
    const f = fixture();
    f.data.set(LEGACY_TOKEN_KEY, JSON.stringify({ version: 1, token: "legacy-access" }));
    f.fetch.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(user));
    await f.session.initialize();
    expect(f.fetch.mock.calls[0][0]).toBe("/api/auth/session/adopt");
    expect(new Headers(f.fetch.mock.calls[0][1]!.headers).get("Authorization")).toBe("Bearer legacy-access");
    expect(f.fetch.mock.calls[1][0]).toBe("/api/auth/me");
    expect(new Headers(f.fetch.mock.calls[1][1]!.headers).has("Authorization")).toBe(false);
    expect(f.data.has(LEGACY_TOKEN_KEY)).toBe(false);
    expect(f.data.get(SESSION_MARKER_KEY)).toBe(MARK);
    expect(f.session.getSnapshot().phase).toBe("authenticated");
  });
  it("an unknown adopt result keeps the old key; a refusal removes it and stays signed out", async () => {
    const offline = fixture();
    offline.data.set(LEGACY_TOKEN_KEY, JSON.stringify({ version: 1, token: "legacy-access" }));
    offline.fetch.mockRejectedValueOnce(new TypeError("offline"));
    await offline.session.initialize();
    expect(offline.data.has(LEGACY_TOKEN_KEY)).toBe(true);
    expect(offline.session.getSnapshot().phase).toBe("anonymous");
    const refused = fixture();
    refused.data.set(LEGACY_TOKEN_KEY, JSON.stringify({ version: 1, token: "legacy-access" }));
    refused.fetch.mockResolvedValueOnce(json({ code: "adopt_refused" }, 401));
    await refused.session.initialize();
    expect(refused.data.size).toBe(0);
    expect(refused.session.getSnapshot().phase).toBe("anonymous");
  });
  it("logout ends the server session with the CSRF header and clears locally even when offline", async () => {
    const f = fixture(true);
    f.fetch.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await f.session.initialize();
    expect(await f.session.logout()).toEqual({ status: "confirmed", allDevices: false });
    const [url, init] = f.fetch.mock.calls[1];
    expect(url).toBe("/api/auth/logout");
    expect(init!.method).toBe("POST");
    expect(new Headers(init!.headers).get("X-ADHD-CSRF")).toBe("1");
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.data.size).toBe(0);
    const g = fixture(true);
    g.fetch.mockResolvedValueOnce(json(user)).mockRejectedValueOnce(new TypeError("offline"));
    await g.session.initialize();
    expect(await g.session.logoutEverywhere()).toEqual({ status: "unconfirmed", allDevices: true });
    expect(g.fetch.mock.calls[1][0]).toBe("/api/auth/logout-all");
    expect(g.session.getSnapshot().phase).toBe("anonymous");
  });
});

function browserFixture() {
  const target = Object.assign(new EventTarget(), {
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
  });
  const channel = Object.assign(new EventTarget(), { postMessage: vi.fn(), close: vi.fn() });
  const storageEvent = () => target.dispatchEvent(Object.assign(new Event("storage"), { key: SESSION_MARKER_KEY }));
  const message = (data: unknown) => channel.dispatchEvent(Object.assign(new Event("message"), { data }));
  return {
    target,
    channel,
    storageEvent,
    message,
    browser: target as unknown as Window,
    factory: () => channel as unknown as BroadcastChannel,
  };
}

describe("browser identity invalidations", () => {
  it("marker removal clears identity and the channel carries no credential", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const b = browserFixture();
    const close = connectBrowserSession(f.session, b.browser, b.factory);
    f.data.delete(SESSION_MARKER_KEY);
    b.storageEvent();
    await vi.waitFor(() => expect(f.session.getSnapshot().phase).toBe("anonymous"));
    expect(JSON.stringify(b.channel.postMessage.mock.calls)).not.toContain("access");
    close();
  });
  it("a remote change signal resets and re-verifies without being broadcast again", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json({ ...user, id: "owner-b" }));
    await f.session.initialize();
    const b = browserFixture();
    const close = connectBrowserSession(f.session, b.browser, b.factory);
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    const epoch = f.session.getIdentity().epoch;
    b.message({ version: 1, kind: "changed" });
    await vi.waitFor(() => expect(f.session.getSnapshot().phase).toBe("authenticated"));
    expect(f.session.getIdentity().epoch).toBeGreaterThan(epoch);
    expect(b.channel.postMessage).not.toHaveBeenCalled();
    f.session.forget();
    expect(b.channel.postMessage).toHaveBeenCalledWith({ version: 1, kind: "changed" });
    close();
  });
  it("storage fallback works when BroadcastChannel is unavailable", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const b = browserFixture();
    const close = connectBrowserSession(f.session, b.browser, () => {
      throw new Error("unsupported");
    });
    f.data.clear();
    b.storageEvent();
    await vi.waitFor(() => expect(f.session.getSnapshot().phase).toBe("anonymous"));
    close();
  });
  it("cleanup removes listeners and closes only its channel", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const b = browserFixture();
    const close = connectBrowserSession(f.session, b.browser, b.factory);
    close();
    f.data.clear();
    b.storageEvent();
    b.message({ version: 1, kind: "changed" });
    expect(f.session.getSnapshot().phase).toBe("authenticated");
    expect(b.channel.close).toHaveBeenCalledTimes(1);
  });
  it("a closed channel cannot prevent a local sign out", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const b = browserFixture();
    b.channel.postMessage.mockImplementation(() => {
      throw new Error("closed");
    });
    const close = connectBrowserSession(f.session, b.browser, b.factory);
    expect(() => f.session.forget()).not.toThrow();
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    close();
  });
  it("showing, focusing or restoring the tab re-checks the owner silently", async () => {
    const f = fixture(true);
    f.fetch.mockImplementation(async () => json(user));
    await f.session.initialize();
    const b = browserFixture();
    const close = connectBrowserSession(f.session, b.browser, b.factory);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const phases: string[] = [];
    f.session.subscribe(() => phases.push(f.session.getSnapshot().phase));
    b.target.document.dispatchEvent(new Event("visibilitychange"));
    b.target.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    // Paylaşılan kontrol bitsin, Geri/İleri dönüşü sonra yeniden kontrol edebilsin.
    await f.session.synchronize(true);
    b.target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(3));
    expect(phases).toEqual([]);
    close();
  });
});

it("register enforces only six characters while login preserves existing passwords", () => {
  expect(validateCredentials("register", { email: user.email, password: "12345" }).errors).toHaveProperty("password");
  expect(validateCredentials("register", { email: user.email, password: "      " }).values).toEqual({
    email: user.email,
    password: "      ",
  });
  expect(validateCredentials("login", { email: user.email, password: "a" }).values).toEqual({
    email: user.email,
    password: "a",
  });
  expect(validateCredentials("register", { email: "invalid", password: "123456" }).errors).toHaveProperty("email");
});

it("auth return paths preserve valid app context and reject external/ambiguous paths", () => {
  expect(safeReturnPath("/planning?date=2026-10-17&taskId=123#detail")).toBe(
    "/planning?date=2026-10-17&taskId=123#detail",
  );
  for (const value of [
    "https://evil.test",
    "//evil.test/app",
    "/app/../../login",
    "/app\\evil",
    "/app/%5cevil",
    "/app/%0aevil",
    "/apple",
    "/app/%ZZ",
    null,
  ])
    expect(safeReturnPath(value)).toBe("/planning");
});

it("return paths accept only known workspace routes and migrate legacy deep links", () => {
  expect(safeReturnPath("/app/gorevler?taskId=123#detail")).toBe("/tasks?taskId=123#detail");
  expect(safeReturnPath("/calendar/special-days?date=2026-10-26")).toBe("/reminders/special-days?date=2026-10-26");
  for (const path of [
    "/tasks-evil",
    "/api/tasks",
    "/login",
    "/help",
    "/tasks/unknown",
    "/app/unknown",
    "/%2ftasks",
    "/tasks/%5cevil",
  ])
    expect(safeReturnPath(path)).toBe("/planning");
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_MARKER_KEY, type LogoutResult } from "../../src/features/auth/session";
import { OFFLINE_LOGOUT_NOTICE, rememberLogout, takeLogoutNotice } from "../../src/features/auth/logout-notice";

const user = { id: "audit-owner", email: "audit@example.test", displayName: "Audit" };
function fixture() {
  const data = new Map([[SESSION_MARKER_KEY, JSON.stringify({ version: 1 })]]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(user));
  const events: { result: LogoutResult; phase: string }[] = [];
  const session = createSession({
    storage: () => storage,
    fetch,
    onLogout: result => {
      events.push({ result, phase: session.getSnapshot().phase });
    },
  });
  return { data, storage, fetch, session, events };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("server-confirmed logout", () => {
  for (const method of ["logout", "logoutEverywhere"] as const) {
    for (const status of [200, 401, 403, 429, 500, 503, 204]) {
      it(`${method}: HTTP ${status} cannot overstate server revocation`, async () => {
        const f = fixture();
        await f.session.initialize();
        f.fetch.mockResolvedValueOnce(new Response(null, { status }));
        const result = await f.session[method]();
        const expected =
          status === 204 ? "confirmed" : status === 401 && method === "logout" ? "already-ended" : "unconfirmed";
        expect(result).toEqual({ status: expected, allDevices: method === "logoutEverywhere" });
        expect(f.events).toEqual([{ result, phase: "authenticated" }]);
        expect(f.session.getSnapshot().phase).toBe("anonymous");
        expect(f.data.size).toBe(0);
        expect(f.fetch).toHaveBeenCalledTimes(2);
      });
    }
    it(`${method}: offline still clears private data and does not retry`, async () => {
      const f = fixture();
      await f.session.initialize();
      f.fetch.mockRejectedValueOnce(new TypeError("offline"));
      expect((await f.session[method]()).status).toBe("unconfirmed");
      expect(f.data.size).toBe(0);
      expect(f.fetch).toHaveBeenCalledTimes(2);
    });
  }
  it("times out and blocks a concurrent login until the old cookie write settles", async () => {
    const f = fixture();
    await f.session.initialize();
    vi.useFakeTimers();
    f.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), {
            once: true,
          });
        }),
    );
    const pending = f.session.logoutEverywhere();
    await expect(f.session.authenticate("login", { email: user.email, password: "123456" })).rejects.toMatchObject({
      kind: "policy",
    });
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await pending).status).toBe("unconfirmed");
    expect(f.session.getSnapshot().phase).toBe("anonymous");
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("late logout does not clear a newer remote owner or publish an obsolete notice", async () => {
    const f = fixture();
    await f.session.initialize();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const pending = f.session.logout();
    f.fetch.mockResolvedValueOnce(Response.json({ ...user, id: "other-owner" }));
    await f.session.synchronize(true, true);
    finish(new Response(null, { status: 204 }));
    expect((await pending).status).toBe("superseded");
    expect(f.session.getSnapshot().user?.id).toBe("other-owner");
    expect(f.events).toEqual([]);
  });
  it("records only the scope, before navigation; consumes the notice once and clears stale notices", () => {
    const f = fixture();
    vi.stubGlobal("sessionStorage", f.storage);
    rememberLogout({ status: "unconfirmed", allDevices: true });
    expect(f.data.get(OFFLINE_LOGOUT_NOTICE)).toBe("all");
    expect(takeLogoutNotice()).toBe("all");
    expect(takeLogoutNotice()).toBeNull();
    rememberLogout({ status: "unconfirmed", allDevices: false });
    expect(takeLogoutNotice()).toBe("current");
    rememberLogout({ status: "unconfirmed", allDevices: true });
    rememberLogout({ status: "confirmed", allDevices: true });
    expect(takeLogoutNotice()).toBeNull();
  });
});

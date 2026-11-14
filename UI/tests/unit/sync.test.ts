import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { decodeChange, eventWindow, resources, type ChangeKind } from "../../src/features/sync/model";
import { changeRouter } from "../../src/features/sync/router";
import { syncEngine, type Hub } from "../../src/features/sync/engine";
const id = (n = 1) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const event = (n = 1, kind: ChangeKind = "TaskChanged", version: number | string = n) => ({
  eventId: id(n),
  kind,
  sourceId: id(7),
  sourceVersion: version,
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("bounded typed signal router", () => {
  it("accepts all eight kinds and exact long strings, including snooze zero", () => {
    for (const kind of Object.keys(resources) as ChangeKind[])
      expect(decodeChange(event(1, kind, "9007199254740993"))?.sourceVersion).toBe("9007199254740993");
    expect(decodeChange(event(1, "NotificationReady", 0))).not.toBeNull();
  });
  it("rejects missing/unknown/malformed and unsafe values", () => {
    for (const v of [
      null,
      {},
      { ...event(), kind: "Unknown" },
      { ...event(), eventId: "bad" },
      { ...event(), sourceId: "bad" },
      { ...event(), sourceVersion: 9007199254740992 },
      { ...event(), sourceVersion: "9223372036854775808" },
      { ...event(), sourceVersion: -1 },
    ])
      expect(decodeChange(v)).toBeNull();
  });
  it("bounds receipts and permits an evicted event to trigger another authoritative read", () => {
    const w = eventWindow();
    expect(w.accept(id())).toBe(true);
    expect(w.accept(id())).toBe(false);
    for (let i = 2; i <= 1025; i++) w.accept(id(i));
    expect(w.size()).toBe(1024);
    expect(w.accept(id())).toBe(true);
    w.clear();
    expect(w.size()).toBe(0);
  });
  it("coalesces 1000 events into one invalidation without patching HTTP state", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const patch = vi.spyOn(client, "setQueryData");
    const refresh = vi.fn(async () => {});
    const r = changeRouter({
      client,
      owner: id(),
      current: () => true,
      refresh,
      resolveRevision: vi.fn(async () => id(9)),
    });
    for (let i = 1; i <= 1000; i++) r.accept(event(i));
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
    r.dispose();
  });
  it("does not interpret event sourceVersion as global/task version or discard older unique receipts", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const r = changeRouter({
      client,
      owner: id(),
      current: () => true,
      refresh: async () => {},
      resolveRevision: async () => id(9),
    });
    r.accept(event(1, "TaskChanged", 9));
    await vi.advanceTimersByTimeAsync(200);
    r.accept(event(2, "TaskChanged", 3));
    r.accept(event(1, "TaskChanged", 9));
    await vi.advanceTimersByTimeAsync(1000);
    expect(invalidate).toHaveBeenCalledTimes(2);
    r.dispose();
  });
  it("restricts query predicates to the verified owner and the related resource", async () => {
    const client = new QueryClient();
    client.setQueryData(["user", id(), "task"], "own");
    client.setQueryData(["user", id(), "collections"], "project summaries");
    client.setQueryData(["user", id(2), "task"], "foreign");
    client.setQueryData(["user", id(), "notifications"], "other");
    const r = changeRouter({
      client,
      owner: id(),
      current: () => true,
      refresh: async () => {},
      resolveRevision: async () => id(9),
    });
    r.accept(event());
    await vi.advanceTimersByTimeAsync(200);
    expect(client.getQueryState(["user", id(), "task"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["user", id(), "collections"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["user", id(2), "task"])?.isInvalidated).toBe(false);
    expect(client.getQueryState(["user", id(), "notifications"])?.isInvalidated).toBe(false);
    r.dispose();
  });
  it("resolves a revision ID once per plan batch and never treats it as a daily plan ID", async () => {
    const client = new QueryClient();
    const resolve = vi.fn(async () => id(99));
    const r = changeRouter({
      client,
      owner: id(),
      current: () => true,
      refresh: async () => {},
      resolveRevision: resolve,
    });
    for (let i = 1; i < 50; i++) r.accept(event(i, "PlanChanged"));
    await vi.advanceTimersByTimeAsync(200);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(id(7));
    r.dispose();
  });
  it("bounds continuous bursts to one flush per second", async () => {
    const client = new QueryClient(),
      invalidate = vi.spyOn(client, "invalidateQueries");
    const r = changeRouter({
      client,
      owner: id(),
      current: () => true,
      refresh: async () => {},
      resolveRevision: async () => id(9),
    });
    for (let i = 1; i <= 100; i++) {
      r.accept(event(i));
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(invalidate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidate).toHaveBeenCalledTimes(2);
    r.dispose();
  });
  it("rejects stale-owner and disposed/queued work including a late revision read", async () => {
    const client = new QueryClient(),
      invalidate = vi.spyOn(client, "invalidateQueries");
    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    let current = true;
    const r = changeRouter({
      client,
      owner: id(),
      current: () => current,
      refresh: async () => {},
      resolveRevision: async () => {
        await gate;
        return id(9);
      },
    });
    r.accept(event(1, "PlanChanged"));
    await vi.advanceTimersByTimeAsync(200);
    current = false;
    r.dispose();
    release();
    await vi.advanceTimersByTimeAsync(0);
    r.accept(event(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
class FakeHub implements Hub {
  callbacks = { reconnecting: () => {}, reconnected: () => {}, closed: () => {} };
  changed?: (e: unknown) => void;
  start = vi.fn(async () => {});
  stop = vi.fn(async () => {});
  on(_name: "changed", callback: (e: unknown) => void) {
    this.changed = callback;
  }
  off(_name: "changed", callback: (e: unknown) => void) {
    if (this.changed === callback) this.changed = undefined;
  }
  onreconnecting(callback: () => void) {
    this.callbacks.reconnecting = callback;
  }
  onreconnected(callback: () => void) {
    this.callbacks.reconnected = callback;
  }
  onclose(callback: () => void) {
    this.callbacks.closed = callback;
  }
}
function setup(fail = false, startGate?: Promise<void>, onInvalidate?: () => void) {
  const browser = Object.assign(new EventTarget(), { navigator: { onLine: true } }),
    document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const hubs: FakeHub[] = [];
  const refresh = vi.fn(async () => {}),
    invalidate = vi.fn(onInvalidate ?? (() => {})),
    status = vi.fn(),
    signal = vi.fn();
  let current = true;
  const engine = syncEngine({
    browser: browser as unknown as Window,
    document: document as unknown as Document,
    current: () => current,
    refresh,
    invalidate,
    status,
    signal,
    createHub: () => {
      const h = new FakeHub();
      if (fail) h.start.mockRejectedValue(new Error("unavailable"));
      if (startGate) h.start.mockImplementation(() => startGate);
      hubs.push(h);
      return h;
    },
  });
  return {
    browser,
    document,
    hubs,
    refresh,
    invalidate,
    status,
    signal,
    engine,
    expire: () => {
      current = false;
    },
  };
}
describe("single tab connection lifecycle", () => {
  it("does not restart mounted queries before subscribing; one catch-up follows the initial HTTP read", async () => {
    let connected!: () => void;
    const gate = new Promise<void>(resolve => {
      connected = resolve;
    });
    const s = setup(false, gate);
    expect(s.refresh).toHaveBeenCalledTimes(1);
    expect(s.invalidate).not.toHaveBeenCalled();
    connected();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    expect(s.invalidate).toHaveBeenCalledTimes(1);
    s.engine.dispose();
  });
  it("reconciles a server change between the initial page read and subscription, even with a fresh cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000 } } });
    let serverVersion = 1,
      connected!: () => void;
    const options = { queryKey: ["user", id(92), "preferences"], queryFn: async () => serverVersion };
    await client.fetchQuery(options);
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    const gate = new Promise<void>(resolve => {
      connected = resolve;
    });
    const s = setup(false, gate, () => {
      void client.invalidateQueries({ queryKey: options.queryKey });
    });
    serverVersion = 2; // Bu olay sekme abone olmadan önce yayımlandı.
    expect(client.getQueryData(options.queryKey)).toBe(1);
    connected();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getQueryData(options.queryKey)).toBe(2);
    s.engine.dispose();
    stop();
    client.clear();
  });
  it("syncs on connection and has no periodic polling while connected", async () => {
    const s = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.status).toHaveBeenLastCalledWith("connected");
    s.refresh.mockClear();
    s.invalidate.mockClear();
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.refresh).not.toHaveBeenCalled();
    expect(s.invalidate).not.toHaveBeenCalled();
    s.engine.dispose();
  });
  it("uses 15/30 second fallback when disconnected and stops it on reconnection", async () => {
    const s = setup();
    await vi.advanceTimersByTimeAsync(0);
    s.hubs[0].callbacks.reconnecting();
    s.refresh.mockClear();
    s.invalidate.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    expect(s.invalidate).toHaveBeenCalledTimes(1);
    s.hubs[0].callbacks.reconnected();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.invalidate).toHaveBeenCalledTimes(2);
    s.refresh.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.engine.dispose();
  });
  it("retries initial start at most four attempts; polling survives exhaustion", async () => {
    const s = setup(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.hubs[0].start).toHaveBeenCalledTimes(4);
    expect(s.status).toHaveBeenLastCalledWith("fallback");
    const before = s.refresh.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.refresh.mock.calls.length).toBe(before + 2);
    s.engine.dispose();
  });
  it("hidden/offline pauses all polling and detaches the old hub; returning creates a fresh scope", async () => {
    const s = setup(true);
    await vi.advanceTimersByTimeAsync(0);
    s.document.visibilityState = "hidden";
    s.document.dispatchEvent(new Event("visibilitychange"));
    const count = s.refresh.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.refresh.mock.calls.length).toBe(count);
    expect(s.hubs[0].changed).toBeUndefined();
    s.document.visibilityState = "visible";
    s.browser.navigator.onLine = false;
    s.browser.dispatchEvent(new Event("offline"));
    expect(s.status).toHaveBeenLastCalledWith("offline");
    s.browser.navigator.onLine = true;
    s.browser.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.hubs).toHaveLength(2);
    s.engine.dispose();
  });
  it("focus/visibility and BFCache resume reconcile HTTP without issuing work mutations", async () => {
    const s = setup();
    await vi.advanceTimersByTimeAsync(0);
    s.refresh.mockClear();
    // İlk yüklemenin pageshow olayı ikinci bir telafi başlatmaz.
    s.browser.dispatchEvent(new Event("pageshow"));
    expect(s.refresh).not.toHaveBeenCalled();
    s.browser.dispatchEvent(new Event("focus"));
    expect(s.refresh).toHaveBeenCalledTimes(1);
    s.browser.dispatchEvent(new Event("pagehide"));
    s.browser.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.hubs).toHaveLength(2);
    s.engine.dispose();
  });
  it("disposal and identity changes prevent late events, retries, listeners and reads", async () => {
    const s = setup(true);
    await vi.advanceTimersByTimeAsync(0);
    s.expire();
    s.engine.dispose();
    const calls = s.refresh.mock.calls.length;
    for (const event of ["focus", "online", "pageshow"]) s.browser.dispatchEvent(new Event(event));
    s.document.dispatchEvent(new Event("visibilitychange"));
    s.hubs[0].callbacks.reconnected();
    await vi.advanceTimersByTimeAsync(120000);
    expect(s.refresh.mock.calls.length).toBe(calls);
    expect(s.hubs[0].changed).toBeUndefined();
  });
  it("manual retry replaces rather than stacks a failed hub", async () => {
    const s = setup(true);
    await vi.advanceTimersByTimeAsync(0);
    s.engine.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.hubs).toHaveLength(2);
    expect(s.hubs[0].stop).toHaveBeenCalledTimes(1);
    expect(s.hubs[0].changed).toBeUndefined();
    s.engine.dispose();
  });
});

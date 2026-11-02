import { isWorkspacePath } from "../../public/route-paths.js";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { readEnvelope, notificationPath, deliveryKey } from "../../public/push-protocol.js";
import { publicKey, readConfig, readSubscription, setupDeadline } from "../../src/features/push/model";
const owner = "00000000-0000-0000-0000-000000000001",
  id = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
const envelope = {
  notificationId: id,
  recipientUserId: owner,
  snoozeCount: 0,
  tag: `notification:${id}`,
  title: "Navortal",
  body: "Bir hatırlatmanız var.",
  url: `/notifications/${id}`,
  silent: true,
};
describe("push wire/privacy boundary", () => {
  it("a blocked native setup rejects at the deadline and releases its timer; an early success clears the deadline", async () => {
    vi.useFakeTimers();
    try {
      const pending = expect(setupDeadline(new Promise(() => {}), 15)).rejects.toThrow("henüz hazır değil");
      await vi.advanceTimersByTimeAsync(15);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      expect(await setupDeadline(Promise.resolve("ready"))).toBe("ready");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("normalizes only the matching notification URL and keeps same-record snooze rounds separate", () => {
    const n = readEnvelope(envelope)!;
    expect(n.url).toBe(`/notifications?notificationId=${id}`);
    expect(readEnvelope(n)).toEqual(n);
    expect(deliveryKey(owner, id, 0)).not.toBe(deliveryKey(owner, id, 1));
    expect(deliveryKey(owner, id, 0)).not.toBe(deliveryKey(other, id, 0));
  });
  it("accepts the requested reminder name and descriptive type messages as bounded plain text", () => {
    expect(readEnvelope({ ...envelope, title: "Su içmeyi hatırla", body: "Hatırlatma" })?.title).toBe(
      "Su içmeyi hatırla",
    );
    expect(
      readEnvelope({
        ...envelope,
        title: "Pomodoro süresi doldu",
        body: "Molaya geçebilir veya çalışmaya devam edebilirsin.",
      })?.title,
    ).toBe("Pomodoro süresi doldu");
    for (const title of ["", " ", " adı ", "a".repeat(201)])
      expect(readEnvelope({ ...envelope, title, body: "Hatırlatma" })).toBeNull();
  });
  it.each([
    { snoozeCount: -1 },
    { snoozeCount: undefined },
    { snoozeCount: 0.5 },
    { notificationId: "bad" },
    { recipientUserId: "bad" },
    { title: "a".repeat(201) },
    { body: "a".repeat(201) },
    { body: "" },
    { body: null },
    { body: " padded " },
    { silent: null },
    { url: `https://evil.test/notifications/${id}` },
    { url: `/notifications/${other}` },
    { url: `/notifications/${id}?token=bad` },
  ])("rejects unsafe payload %j", patch => {
    expect(readEnvelope({ ...envelope, ...patch })).toBeNull();
  });
  it("does not forward arbitrary paths, javascript or unrelated query keys", () => {
    for (const url of [
      "javascript:alert(1)",
      "//evil.test/app",
      `/notifications?notificationId=${id}&next=evil`,
      "/planning",
    ])
      expect(notificationPath(id, url)).toBeNull();
  });
  it("preserves precise subscription versions and rejects an unsafe rounded number", () => {
    const s = {
      id,
      providerHost: "push.example.test",
      label: "Tarayıcı",
      active: true,
      expiresAt: null,
      version: "9007199254740993",
    };
    expect(readSubscription(s).version).toBe(s.version);
    expect(() => readSubscription({ ...s, version: 9007199254740992 })).toThrow();
    expect(() => readConfig({ enabled: true, publicKey: null })).toThrow();
    expect(readConfig({ enabled: false, publicKey: null }).enabled).toBe(false);
  });
  it("decodes only a structural P-256 public key and never treats it as a private key", () => {
    const bytes = new Uint8Array(65);
    bytes[0] = 4;
    const key = Buffer.from(bytes).toString("base64url");
    expect(publicKey(key)).toEqual(bytes);
    for (const bad of ["private", "!bad", Buffer.alloc(65).toString("base64url")])
      expect(() => publicKey(bad)).toThrow();
  });
});
function worker() {
  let recipient: string | null = owner;
  const seen = new Set<string>();
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => {}),
    navigate = vi.fn(async () => {}),
    focus = vi.fn(async () => {}),
    openWindow = vi.fn(async () => {});
  const claimSound = vi.fn(async () => true);
  let clients: object[] = [];
  const network = vi.fn(async () => new Response("network shell"));
  const self = {
    location: { origin: "https://planner.test" },
    registration: { showNotification, getNotifications: async () => [] },
    clients: { claim: async () => {}, matchAll: async () => clients, openWindow },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (name: string, callback: (e: unknown) => void) => handlers.set(name, callback),
  };
  const source = readFileSync("public/planner-sw.js", "utf8").replace(/^import .*;\r?\n/gm, "");
  runInNewContext(source, {
    self,
    URL,
    Response,
    fetch: network,
    setTimeout,
    clearTimeout,
    MessageChannel,
    isWorkspacePath,
    readEnvelope,
    notificationPath,
    deliveryKey,
    claimAlertSound: claimSound,
    getRecipient: async () => recipient,
    setRecipient: async (o: string) => {
      recipient = o;
    },
    clearRecipient: async (o: string) => {
      if (recipient !== o) return false;
      recipient = null;
      seen.clear();
      return true;
    },
    claimDelivery: async (o: string, key: string) => {
      if (o !== recipient || seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    caches: { match: async () => new Response("offline generic") },
  });
  async function event(name: string, fields: object) {
    const waits: Promise<unknown>[] = [];
    handlers.get(name)!({ ...fields, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  return {
    event,
    self,
    network,
    showNotification,
    claimSound,
    navigate,
    focus,
    openWindow,
    clients: (v: object[]) => {
      clients = v;
    },
    recipient: () => recipient,
    changeOwner: (value: string) => {
      recipient = value;
    },
  };
}
describe("worker behavior (browser runtime tested separately)", () => {
  it("activates only the matching owner's compatible notification patch, without a page navigation", async () => {
    const w = worker();
    const source = { type: "window", url: "https://planner.test/focus" };
    await w.event("message", { source, data: { kind: "ACTIVATE_NOTIFICATION_PATCH", version: 2, owner: other } });
    await w.event("message", { source, data: { kind: "ACTIVATE_NOTIFICATION_PATCH", version: 4, owner } });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    await w.event("message", { source, data: { kind: "ACTIVATE_NOTIFICATION_PATCH", version: 2, owner } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
    await w.event("message", { source, data: { kind: "ACTIVATE_NOTIFICATION_PATCH", version: 3, owner } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(2);
    expect(w.navigate).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "prefers visible app playback=%s and falls back to native sound only when needed",
    async played => {
      const w = worker();
      const postMessage = vi.fn((_message: unknown, ports?: MessagePort[]) => ports?.[0].postMessage({ played }));
      w.clients([
        { type: "window", url: "https://planner.test/focus", visibilityState: "visible", focused: true, postMessage },
      ]);
      await w.event("push", {
        data: { json: () => ({ ...envelope, title: "Su içmeyi hatırla", body: "Hatırlatma", silent: false }) },
      });
      expect(w.showNotification).toHaveBeenCalledWith(
        "Su içmeyi hatırla",
        expect.objectContaining({ body: "Hatırlatma", silent: played, renotify: !played }),
      );
      expect(w.claimSound).toHaveBeenCalledTimes(played ? 0 : 1);
      expect(postMessage.mock.calls[0][0]).toEqual(
        expect.objectContaining({ envelope: expect.objectContaining({ title: "Bildirim", body: "Bildirim" }) }),
      );
    },
  );
  it("allows an unlocked background tab to play before falling back to Windows sound", async () => {
    const w = worker();
    w.clients([
      {
        type: "window",
        url: "https://planner.test/focus",
        visibilityState: "hidden",
        postMessage: (_message: unknown, ports: MessagePort[]) => ports[0].postMessage({ played: true }),
      },
    ]);
    await w.event("push", { data: { json: () => ({ ...envelope, silent: false }) } });
    expect(w.showNotification).toHaveBeenCalledWith(envelope.title, expect.objectContaining({ silent: true }));
    expect(w.claimSound).not.toHaveBeenCalled();
  });
  it("acknowledges an explicit private-client activation request", async () => {
    const w = worker(),
      postMessage = vi.fn();
    await w.event("message", {
      source: { type: "window", url: "https://planner.test/reminders/preferences" },
      data: { kind: "ACTIVATE_UPDATE" },
      ports: [{ postMessage }],
    });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ accepted: true });
  });
  it("private document navigation bypasses HTTP cache and falls back to a generic offline screen", async () => {
    const w = worker();
    w.network.mockRejectedValueOnce(new Error("offline"));
    const request = {
      url: "https://planner.test/tasks",
      method: "GET",
      headers: new Headers(),
      mode: "navigate",
    };
    let response: Promise<Response> | undefined;
    await w.event("fetch", {
      request,
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    });
    expect(w.network).toHaveBeenCalledWith(request, { cache: "no-store" });
    expect(await (await response!).text()).toBe("offline generic");
  });
  it("accepts late same-origin logout cleanup from the login page, without allowing public update activation", async () => {
    const w = worker(),
      source = { type: "window", url: "https://planner.test/login" };
    await w.event("message", { source, data: { kind: "ACTIVATE_UPDATE" } });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    await w.event("message", { source, data: { kind: "CLEAR_RECIPIENT", owner, generation: id } });
    expect(w.recipient()).toBeNull();
  });
  it.each(["https://foreign.test/planning", "javascript:alert(1)"])(
    "rejects cleanup from an untrusted source %s",
    async url => {
      const w = worker();
      await w.event("message", {
        source: { type: "window", url },
        data: { kind: "CLEAR_RECIPIENT", owner, generation: id },
      });
      expect(w.recipient()).toBe(owner);
    },
  );
  it("suppresses duplicate receipt, permits next snooze round and closes the old owner", async () => {
    const w = worker();
    const push = (data: object) => w.event("push", { data: { json: () => data } });
    await push(envelope);
    await push(envelope);
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    await push({ ...envelope, snoozeCount: 1 });
    expect(w.showNotification).toHaveBeenCalledTimes(2);
    await w.event("message", {
      source: { type: "window", url: "https://planner.test/planning" },
      data: { kind: "CLEAR_RECIPIENT", owner, generation: id },
    });
    await push({ ...envelope, snoozeCount: 2 });
    expect(w.showNotification).toHaveBeenCalledTimes(2);
  });
  it("stale cleanup cannot clear a new recipient; worker messages cannot assign a recipient", async () => {
    const w = worker(),
      source = { type: "window", url: "https://planner.test/planning" };
    await w.event("message", { source, data: { kind: "SET_RECIPIENT", owner: other } });
    expect(w.recipient()).toBe(owner);
    w.changeOwner(other);
    await w.event("message", { source, data: { kind: "CLEAR_RECIPIENT", owner, generation: id } });
    expect(w.recipient()).toBe(other);
    await w.event("push", { data: { json: () => envelope } });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it("notification click navigates only the owner's normalized route; foreign or unsafe data cannot open a tab", async () => {
    const w = worker();
    w.clients([{ type: "window", url: "https://planner.test/planning", navigate: w.navigate, focus: w.focus }]);
    await w.event("notificationclick", { notification: { close: vi.fn(), data: envelope } });
    expect(w.navigate).toHaveBeenCalledWith(`/notifications?notificationId=${id}`);
    expect(w.focus).toHaveBeenCalledTimes(1);
    await w.event("notificationclick", {
      notification: { close: vi.fn(), data: { ...envelope, recipientUserId: other } },
    });
    expect(w.navigate).toHaveBeenCalledTimes(1);
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("never intercepts writes, private API or authorization-bearing requests", () => {
    const w = worker();
    for (const [url, method, headers] of [
      ["https://planner.test/api/tasks", "GET", new Headers()],
      ["https://planner.test/planning", "POST", new Headers()],
      ["https://planner.test/icon.svg", "GET", new Headers({ Authorization: "synthetic" })],
    ] as const) {
      const respondWith = vi.fn();
      void w.event("fetch", { request: { url, method, headers, mode: "navigate" }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });
});

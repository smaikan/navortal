import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNativeSoundController,
  createNativeSoundStore,
  nativeSoundGetMessage,
  nativeSoundHost,
  nativeSoundSetMessage,
  nativeSoundTimeoutMs,
  parseNativeSoundState,
  type NativeSoundHost,
} from "../../src/features/notifications/native-sound";

const sounds = ["bell", "marimba", "digital", "glass", "pulse", "soft"];
const state = (enabled: boolean, sound = "soft", available: unknown = sounds) =>
  JSON.stringify({ type: "sound.state", enabled, sound, available });

function fakeHost() {
  const sent: string[] = [];
  const host: NativeSoundHost = { postMessage: message => void sent.push(message), onmessage: null };
  const reply = (data: unknown) => host.onmessage?.({ data });
  return { host, sent, reply };
}

describe("native sound bridge detection", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("hides the section when the bridge is missing (plain browser or server)", () => {
    expect(nativeSoundHost()).toBeNull();
    vi.stubGlobal("window", {});
    expect(nativeSoundHost()).toBeNull();
    vi.stubGlobal("window", { navortalTimer: {} });
    expect(nativeSoundHost()).toBeNull();
  });
  it("shows it when window.navortalTimer can post messages", () => {
    const host = { postMessage: () => {} };
    vi.stubGlobal("window", { navortalTimer: host });
    expect(nativeSoundHost()).toBe(host);
  });
});

describe("native sound messages", () => {
  it("builds the documented get and set payloads", () => {
    expect(JSON.parse(nativeSoundGetMessage())).toEqual({ type: "sound.get" });
    expect(JSON.parse(nativeSoundSetMessage(true, "glass"))).toEqual({
      type: "sound.set",
      enabled: true,
      sound: "glass",
    });
    expect(JSON.parse(nativeSoundSetMessage(false))).toEqual({ type: "sound.set", enabled: false });
  });
  it("never sends enabled:true without a valid sound", () => {
    expect(() => nativeSoundSetMessage(true)).toThrow();
    expect(() => nativeSoundSetMessage(true, "siren" as never)).toThrow();
  });
});

describe("native sound state parsing", () => {
  it("accepts the documented reply", () => {
    expect(parseNativeSoundState(state(false))).toEqual({ enabled: false, sound: "soft", available: sounds });
  });
  it("keeps the current sound selectable even if the app omits it", () => {
    expect(parseNativeSoundState(state(true, "bell", ["soft", "pulse"]))?.available).toEqual(["pulse", "soft", "bell"]);
  });
  it.each([
    ["not text", { type: "sound.state" }],
    ["not json", "{"],
    ["other type", JSON.stringify({ type: "timer.state", enabled: true, sound: "soft", available: sounds })],
    ["enabled not boolean", JSON.stringify({ type: "sound.state", enabled: "yes", sound: "soft", available: sounds })],
    ["unknown sound", state(true, "siren")],
    ["empty list", state(true, "soft", [])],
    ["unknown listed sound", state(true, "soft", ["soft", "siren"])],
    ["list not an array", state(true, "soft", "soft")],
    ["too long", "x".repeat(5000)],
    ["null", "null"],
  ])("ignores an invalid reply: %s", (_name, data) => expect(parseNativeSoundState(data)).toBeNull());
});

describe("native sound controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks for the state on creation and applies the reply", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    expect(sent.map(m => JSON.parse(m))).toEqual([{ type: "sound.get" }]);
    expect(controller.getSnapshot().phase).toBe("loading");
    reply(state(false, "marimba"));
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      pending: null,
      state: { enabled: false, sound: "marimba" },
    });
  });
  it("turning the switch on sends the chosen sound and then follows the app reply", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false, "glass"));
    controller.toggle();
    expect(JSON.parse(sent.at(-1)!)).toEqual({ type: "sound.set", enabled: true, sound: "glass" });
    expect(controller.getSnapshot().pending).toEqual({ enabled: true, sound: "glass" });
    reply(state(true, "glass"));
    expect(controller.getSnapshot()).toMatchObject({ pending: null, state: { enabled: true, sound: "glass" } });
  });
  it("choosing a sound only works while enabled and sends the new sound", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false));
    controller.choose("bell");
    expect(sent).toHaveLength(1);
    reply(state(true));
    controller.choose("bell");
    expect(JSON.parse(sent.at(-1)!)).toEqual({ type: "sound.set", enabled: true, sound: "bell" });
    reply(state(true, "bell"));
    expect(controller.getSnapshot().state?.sound).toBe("bell");
  });
  it("turning it off sends no sound", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(true, "pulse"));
    controller.toggle();
    expect(JSON.parse(sent.at(-1)!)).toEqual({ type: "sound.set", enabled: false });
    reply(state(false, "pulse"));
    expect(controller.getSnapshot().state).toMatchObject({ enabled: false, sound: "pulse" });
  });
  it("ignores invalid replies and keeps waiting for a real one", () => {
    const { host, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false));
    controller.toggle();
    reply("garbage");
    reply(state(true, "siren"));
    expect(controller.getSnapshot()).toMatchObject({ pending: { enabled: true }, state: { enabled: false } });
    reply(state(true));
    expect(controller.getSnapshot()).toMatchObject({ pending: null, state: { enabled: true } });
  });
  it("shows an error and reverts when the app does not answer within the timeout", () => {
    const { host, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false));
    controller.toggle();
    vi.advanceTimersByTime(nativeSoundTimeoutMs - 1);
    expect(controller.getSnapshot().pending).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(controller.getSnapshot()).toMatchObject({ pending: null, state: { enabled: false } });
    expect(controller.getSnapshot().error).toMatch(/geri yüklendi/);
  });
  it("fails visibly when the first state never arrives and can be retried", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    vi.advanceTimersByTime(nativeSoundTimeoutMs);
    expect(controller.getSnapshot()).toMatchObject({ phase: "failed", state: null });
    controller.refresh();
    expect(sent).toHaveLength(2);
    reply(state(false));
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", error: "" });
  });
  it("ignores toggles while a request is pending and before any state", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    controller.toggle();
    expect(sent).toHaveLength(1);
    reply(state(false));
    controller.toggle();
    controller.toggle();
    expect(sent).toHaveLength(2);
  });
  it("restores the previous message handler on dispose", () => {
    const { host } = fakeHost();
    const before = vi.fn();
    host.onmessage = before;
    const controller = createNativeSoundController(host);
    expect(host.onmessage).not.toBe(before);
    controller.dispose();
    expect(host.onmessage).toBe(before);
  });
});

describe("native sound controller default timers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("calls setTimeout as a plain function (browsers throw 'Illegal invocation' otherwise)", () => {
    const realSet = setTimeout;
    const calls: unknown[] = [];
    vi.stubGlobal("setTimeout", function (this: unknown, run: () => void, ms: number) {
      calls.push(this);
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return realSet(run, ms);
    });
    const { host } = fakeHost();
    const controller = createNativeSoundController(host);
    expect(calls).toHaveLength(1);
    controller.dispose();
  });
});

describe("native sound store", () => {
  it("does nothing without a bridge", () => {
    const store = createNativeSoundStore(() => null);
    const off = store.subscribe(() => {});
    expect(store.getSnapshot().state).toBeNull();
    store.toggle();
    off();
  });
  it("starts on the first subscriber, notifies, and releases on the last", () => {
    const { host, sent, reply } = fakeHost();
    const store = createNativeSoundStore(() => host);
    const seen = vi.fn();
    const off = store.subscribe(seen);
    expect(sent).toHaveLength(1);
    reply(state(true, "digital"));
    expect(seen).toHaveBeenCalled();
    expect(store.getSnapshot().state).toMatchObject({ enabled: true, sound: "digital" });
    off();
    expect(host.onmessage).toBeNull();
  });
});

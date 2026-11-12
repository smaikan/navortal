import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNativeSoundController,
  createNativeSoundStore,
  isLegacyNativeSoundState,
  nativeSoundGetMessage,
  nativeSoundHost,
  nativeSoundSetMessage,
  nativeSoundTimeoutMs,
  parseNativeSoundState,
  type NativeSoundHost,
} from "../../src/features/notifications/native-sound";

const sounds = ["bell", "marimba", "digital", "glass", "pulse", "soft"];
const trio = (pomodoro = "soft", reminder = "soft", taskEnd = "soft") => ({ pomodoro, reminder, taskEnd });
const state = (enabled: boolean, chosen: unknown = trio(), available: unknown = sounds) =>
  JSON.stringify({ type: "sound.state", enabled, sounds: chosen, available });
const legacy = JSON.stringify({ type: "sound.state", enabled: true, sound: "soft", available: sounds });

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
  it("builds the documented get and set payloads with all three categories", () => {
    expect(JSON.parse(nativeSoundGetMessage())).toEqual({ type: "sound.get" });
    expect(JSON.parse(nativeSoundSetMessage(true, trio("bell", "marimba", "glass") as never))).toEqual({
      type: "sound.set",
      enabled: true,
      sounds: { pomodoro: "bell", reminder: "marimba", taskEnd: "glass" },
    });
    expect(JSON.parse(nativeSoundSetMessage(false))).toEqual({ type: "sound.set", enabled: false });
  });
  it("never sends enabled:true without three valid sounds", () => {
    expect(() => nativeSoundSetMessage(true)).toThrow();
    expect(() => nativeSoundSetMessage(true, { pomodoro: "bell", reminder: "soft" } as never)).toThrow();
    expect(() => nativeSoundSetMessage(true, trio("siren") as never)).toThrow();
  });
  it("sends only the three known categories", () => {
    const sent = JSON.parse(nativeSoundSetMessage(true, { ...trio(), extra: "bell" } as never));
    expect(Object.keys(sent.sounds)).toEqual(["pomodoro", "reminder", "taskEnd"]);
  });
});

describe("native sound state parsing", () => {
  it("accepts the documented reply", () => {
    expect(parseNativeSoundState(state(false, trio("bell", "marimba", "soft")))).toEqual({
      enabled: false,
      sounds: { pomodoro: "bell", reminder: "marimba", taskEnd: "soft" },
      available: sounds,
    });
  });
  it("keeps every chosen sound selectable even if the app omits it", () => {
    expect(parseNativeSoundState(state(true, trio("bell", "glass", "soft"), ["soft", "pulse"]))?.available).toEqual([
      "bell",
      "glass",
      "pulse",
      "soft",
    ]);
  });
  it.each([
    ["not text", { type: "sound.state" }],
    ["not json", "{"],
    ["other type", JSON.stringify({ type: "timer.state", enabled: true, sounds: trio(), available: sounds })],
    ["enabled not boolean", JSON.stringify({ type: "sound.state", enabled: "yes", sounds: trio(), available: sounds })],
    ["unknown sound in a category", state(true, trio("siren"))],
    ["missing category", state(true, { pomodoro: "bell", reminder: "soft" })],
    ["sounds not an object", state(true, "soft")],
    ["legacy single sound", legacy],
    ["empty list", state(true, trio(), [])],
    ["unknown listed sound", state(true, trio(), ["soft", "siren"])],
    ["list not an array", state(true, trio(), "soft")],
    ["too long", "x".repeat(5000)],
    ["null", "null"],
  ])("ignores an invalid reply: %s", (_name, data) => expect(parseNativeSoundState(data)).toBeNull());
  it("recognises the old single-sound reply as an outdated app, nothing else", () => {
    expect(isLegacyNativeSoundState(legacy)).toBe(true);
    expect(isLegacyNativeSoundState(state(true))).toBe(false);
    expect(isLegacyNativeSoundState("garbage")).toBe(false);
    expect(isLegacyNativeSoundState(JSON.stringify({ type: "timer.state", sound: "soft" }))).toBe(false);
  });
});

describe("native sound controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks for the state on creation and applies the reply", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    expect(sent.map(m => JSON.parse(m))).toEqual([{ type: "sound.get" }]);
    expect(controller.getSnapshot().phase).toBe("loading");
    reply(state(false, trio("marimba", "bell", "soft")));
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      pending: null,
      state: { enabled: false, sounds: { pomodoro: "marimba", reminder: "bell", taskEnd: "soft" } },
    });
  });
  it("turning the switch on sends all three stored sounds and then follows the app reply", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false, trio("glass", "bell", "pulse")));
    controller.toggle();
    expect(JSON.parse(sent.at(-1)!)).toEqual({
      type: "sound.set",
      enabled: true,
      sounds: { pomodoro: "glass", reminder: "bell", taskEnd: "pulse" },
    });
    expect(controller.getSnapshot().pending).toMatchObject({ enabled: true });
    reply(state(true, trio("glass", "bell", "pulse")));
    expect(controller.getSnapshot()).toMatchObject({ pending: null, state: { enabled: true } });
  });
  it("choosing a sound changes only that category and keeps the other two", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false, trio("glass", "bell", "pulse")));
    controller.choose("reminder", "marimba");
    expect(sent).toHaveLength(1);
    reply(state(true, trio("glass", "bell", "pulse")));
    controller.choose("reminder", "marimba");
    expect(JSON.parse(sent.at(-1)!)).toEqual({
      type: "sound.set",
      enabled: true,
      sounds: { pomodoro: "glass", reminder: "marimba", taskEnd: "pulse" },
    });
    reply(state(true, trio("glass", "marimba", "pulse")));
    expect(controller.getSnapshot().state?.sounds).toEqual({
      pomodoro: "glass",
      reminder: "marimba",
      taskEnd: "pulse",
    });
    controller.choose("taskEnd", "soft");
    expect(JSON.parse(sent.at(-1)!).sounds).toEqual({ pomodoro: "glass", reminder: "marimba", taskEnd: "soft" });
  });
  it("does not send when the same sound is chosen again or the category is unknown", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(true, trio("glass", "bell", "pulse")));
    controller.choose("pomodoro", "glass");
    controller.choose("other" as never, "bell");
    expect(sent).toHaveLength(1);
  });
  it("turning it off sends no sounds", () => {
    const { host, sent, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(true, trio("pulse", "bell", "soft")));
    controller.toggle();
    expect(JSON.parse(sent.at(-1)!)).toEqual({ type: "sound.set", enabled: false });
    reply(state(false, trio("pulse", "bell", "soft")));
    expect(controller.getSnapshot().state).toMatchObject({ enabled: false, sounds: { pomodoro: "pulse" } });
  });
  it("ignores invalid replies and keeps waiting for a real one", () => {
    const { host, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(state(false));
    controller.toggle();
    reply("garbage");
    reply(state(true, trio("siren")));
    expect(controller.getSnapshot()).toMatchObject({ pending: { enabled: true }, state: { enabled: false } });
    reply(state(true));
    expect(controller.getSnapshot()).toMatchObject({ pending: null, state: { enabled: true } });
  });
  it("marks an old app that answers with a single sound as outdated", () => {
    const { host, reply } = fakeHost();
    const controller = createNativeSoundController(host);
    reply(legacy);
    expect(controller.getSnapshot()).toMatchObject({ phase: "outdated", state: null, pending: null });
    controller.toggle();
    expect(controller.getSnapshot().pending).toBeNull();
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
    reply(state(true, trio("digital", "bell", "soft")));
    expect(seen).toHaveBeenCalled();
    expect(store.getSnapshot().state).toMatchObject({ enabled: true, sounds: { pomodoro: "digital" } });
    off();
    expect(host.onmessage).toBeNull();
  });
});

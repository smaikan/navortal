import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearNativeTimer,
  hasAndroidTimerHost,
  listenNativeTimerResume,
  publishNativeTimer,
  timerMessage,
} from "../../src/features/work/native-timer";
import type { Work } from "../../src/features/work/model";

const owner = "00000000-0000-0000-0000-000000000001";
const work: Work = {
  id: "00000000-0000-0000-0000-000000000002",
  taskId: null,
  state: "Running",
  source: "Timer",
  startedAt: "2026-11-11T08:00:00Z",
  endedAt: null,
  timeZoneId: "Europe/Istanbul",
  taskAtStart: null,
  version: "9223372036854775807",
  activeSeconds: "120.5",
  serverNow: "2026-11-11T08:02:00Z",
  recordedAt: "2026-11-11T08:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearNativeTimer("");
  vi.restoreAllMocks();
});

describe("native elapsed timer", () => {
  it("adds monotonic time to accumulated active time without counting earlier pauses", () => {
    const message = timerMessage(owner, work, 1000, 6000, 500_000, true);
    expect(message.work).toMatchObject({ elapsedMs: 125_500, version: "9223372036854775807", state: "Running" });
    expect(message.requestPermission).toBe(true);
    expect(message.capturedAtMs).toBe(500_000);
  });

  it("freezes during a pause and does not request permission", () => {
    const message = timerMessage(owner, { ...work, state: "Paused" }, 1000, 3_600_000, 500_000, true);
    expect(message.work?.elapsedMs).toBe(120_500);
    expect(message.requestPermission).toBe(false);
  });

  it("sends a clear for a finished, canceled, or absent session", () => {
    for (const next of [null, { ...work, state: "Finished" as const }, { ...work, state: "Canceled" as const }]) {
      expect(timerMessage(owner, next, 1000, 2000, 500_000, true)).toMatchObject({
        ownerId: owner,
        work: null,
        requestPermission: false,
      });
    }
  });

  it("never prompts on bootstrap or a server refresh", () => {
    expect(timerMessage(owner, work, 1000, 1000, 500_000).requestPermission).toBe(false);
  });

  it("uses only the timer payload, with a bounded title and no authentication data", () => {
    const message = timerMessage(
      owner,
      { ...work, taskAtStart: { title: "a".repeat(300) } as Work["taskAtStart"] },
      0,
      0,
      500_000,
    );
    expect(message.work?.title.length).toBe(200);
    expect(Object.keys(message.work!)).toEqual(["id", "version", "serverNow", "title", "state", "elapsedMs"]);
  });

  it("does nothing on SSR, normal browsers, or PWA", () => {
    publishNativeTimer(owner, work, 0, true);
    clearNativeTimer(owner);
    vi.stubGlobal("window", {});
    expect(() => publishNativeTimer(owner, work, 0, true)).not.toThrow();
  });

  it("sends to the Android host and clears only the expected owner", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { navortalTimer: { postMessage } });
    publishNativeTimer(owner, work, performance.now(), true);
    expect(JSON.parse(postMessage.mock.calls[0][0]).work.state).toBe("Running");
    clearNativeTimer(owner);
    expect(JSON.parse(postMessage.mock.calls[1][0])).toMatchObject({ ownerId: owner, work: null });
  });

  it("sends to the iPhone host without letting native failures reject a work command", () => {
    const postMessage = vi.fn(() => {
      throw new Error("host unavailable");
    });
    vi.stubGlobal("window", { webkit: { messageHandlers: { navortalTimer: { postMessage } } } });
    expect(() => publishNativeTimer(owner, work, performance.now())).not.toThrow();
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it("detects only the Android bridge for Google login, without user agent detection", () => {
    expect(hasAndroidTimerHost()).toBe(false);
    vi.stubGlobal("window", { webkit: { messageHandlers: { navortalTimer: { postMessage: vi.fn() } } } });
    expect(hasAndroidTimerHost()).toBe(false);
    vi.stubGlobal("window", { navortalTimer: { postMessage: vi.fn() } });
    expect(hasAndroidTimerHost()).toBe(true);
  });

  it("clears the owner on logout and never carries work without an owner", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { navortalTimer: { postMessage } });
    clearNativeTimer("");
    expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject({
      ownerId: "",
      work: null,
      requestPermission: false,
    });
    expect(timerMessage("", work, 0, 1000, 500_000, true).work).toBeNull();
  });

  it("sends a bounded JSON string even when a title contains escaped characters", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { navortalTimer: { postMessage } });
    publishNativeTimer(owner, { ...work, taskAtStart: { title: '\"\\\n'.repeat(300) } as Work["taskAtStart"] }, 0);
    const raw = postMessage.mock.calls[0][0];
    expect(typeof raw).toBe("string");
    expect(raw.length).toBeLessThanOrEqual(4096);
    expect(Array.from(JSON.parse(raw).work.title).length).toBeLessThanOrEqual(200);
  });

  it("rejects older server versions and does not resurrect a finished version", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { navortalTimer: { postMessage } });
    publishNativeTimer(owner, { ...work, version: "2", state: "Paused" }, 0);
    publishNativeTimer(owner, { ...work, version: "1" }, 0, false, true);
    expect(postMessage).toHaveBeenCalledOnce();
    publishNativeTimer(owner, { ...work, version: "3", state: "Finished" }, 0);
    publishNativeTimer(owner, { ...work, version: "2" }, 0, false, true);
    publishNativeTimer(owner, { ...work, version: "3" }, 0, false, true);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(JSON.parse(postMessage.mock.calls[1][0]).work).toBeNull();
  });

  it("does not stream unchanged polls, but resends with a fresh capture time on resume", async () => {
    const postMessage = vi.fn();
    const browser = Object.assign(new EventTarget(), { navortalTimer: { postMessage } });
    vi.stubGlobal("window", browser);
    vi.spyOn(Date, "now").mockReturnValue(500_000);
    publishNativeTimer(owner, work, performance.now());
    publishNativeTimer(owner, work, performance.now());
    expect(postMessage).toHaveBeenCalledOnce();
    let finishRead: (() => void) | undefined;
    const read = vi.fn(async () => {
      await new Promise<void>(resolve => {
        finishRead = resolve;
      });
      publishNativeTimer(
        owner,
        { ...work, state: "Paused", version: "9223372036854775808" },
        performance.now(),
        false,
        true,
      );
    });
    const dispose = listenNativeTimerResume(read);
    browser.dispatchEvent(new Event("navortal:resume"));
    expect(read).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledOnce();
    vi.mocked(Date.now).mockReturnValue(520_000);
    finishRead!();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(JSON.parse(postMessage.mock.calls[1][0])).toMatchObject({
      capturedAtMs: 520_000,
      requestPermission: false,
      work: { state: "Paused" },
    });
    dispose();
    browser.dispatchEvent(new Event("navortal:resume"));
    expect(read).toHaveBeenCalledOnce();
  });

  it("ignores resume in an ordinary browser", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const read = vi.fn(async () => {});
    const dispose = listenNativeTimerResume(read);
    browser.dispatchEvent(new Event("navortal:resume"));
    expect(read).not.toHaveBeenCalled();
    dispose();
  });
});

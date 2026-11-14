import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/lib/api/errors";
import { classifyPushSupport } from "../../src/features/push/browser";
import { mobileFailure, readMobilePreferences } from "../../src/features/push/model";
import { hasAndroidTimerHost } from "../../src/features/work/native-timer";

describe("phone notification preferences", () => {
  it("reads valid mobile preferences including the unsaved default version 0", () => {
    expect(readMobilePreferences({ enabled: true, version: 0, fcmAvailable: true })).toEqual({
      enabled: true,
      version: 0,
      fcmAvailable: true,
    });
    expect(readMobilePreferences({ enabled: false, version: "9223372036854775807", fcmAvailable: false }).enabled).toBe(
      false,
    );
  });

  it("rejects malformed or unsafe preference payloads", () => {
    for (const bad of [
      null,
      { enabled: "yes", version: 1, fcmAvailable: true },
      { enabled: true, version: -1, fcmAvailable: true },
      { enabled: true, version: 1.5, fcmAvailable: true },
      { enabled: true, version: "9223372036854775808", fcmAvailable: true },
      { enabled: true, version: "01", fcmAvailable: true },
      { enabled: true, version: 1 },
    ])
      expect(() => readMobilePreferences(bad as never)).toThrow(ApiError);
  });

  it("explains conflicts and unknown outcomes without retrying silently", () => {
    expect(mobileFailure(new ApiError("http", "x", 409))).toContain("başka bir yerde değişmiş");
    expect(mobileFailure(new Error("boom"))).toContain("kaydedilemedi");
  });
});

describe("phone section is only for the Android app", () => {
  it("detects the app bridge and ignores browsers and PWAs", () => {
    vi.stubGlobal("window", { navortalTimer: { postMessage: vi.fn() } });
    expect(hasAndroidTimerHost()).toBe(true);
    vi.stubGlobal("window", {});
    expect(hasAndroidTimerHost()).toBe(false);
    vi.stubGlobal("window", { navortalTimer: {} });
    expect(hasAndroidTimerHost()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("keeps browser classification unchanged", () => {
    const facts = {
      secure: true,
      worker: true,
      notification: true,
      push: true,
      userAgent: "Chrome",
      platform: "Linux",
      touchPoints: 0,
      standalone: false,
    };
    expect(classifyPushSupport(facts)).toBe("supported");
    expect(classifyPushSupport({ ...facts, push: false })).toBe("worker-only");
    expect(classifyPushSupport({ ...facts, secure: false })).toBe("unsupported");
  });
});

import { describe, expect, it } from "vitest";
import { classifyPushSupport, isAppleMobile, type PushBrowserFacts } from "../../src/features/push/browser";
const desktop: PushBrowserFacts = {
  secure: true,
  worker: true,
  notification: true,
  push: true,
  userAgent: "Chrome",
  platform: "Linux x86_64",
  touchPoints: 0,
  standalone: false,
};
describe("platform-aware push readiness", () => {
  it("does not require installation on Android, desktop or touch Windows", () => {
    for (const patch of [
      {},
      { userAgent: "Mozilla Android Chrome", platform: "Linux armv8l", touchPoints: 5 },
      { platform: "Win32", touchPoints: 10 },
    ])
      expect(classifyPushSupport({ ...desktop, ...patch })).toBe("supported");
  });
  it("recognizes iPhone, iPad desktop mode and installed Apple web apps independently of viewport", () => {
    for (const patch of [
      { userAgent: "Mozilla iPhone Safari", platform: "iPhone", touchPoints: 5 },
      { userAgent: "Mozilla Macintosh Safari", platform: "MacIntel", touchPoints: 5 },
    ]) {
      const facts = { ...desktop, ...patch };
      expect(isAppleMobile(facts)).toBe(true);
      expect(classifyPushSupport(facts)).toBe("install-required");
      expect(classifyPushSupport({ ...facts, standalone: true })).toBe("supported");
      expect(classifyPushSupport({ ...facts, standalone: true, push: false })).toBe("worker-only");
    }
    expect(isAppleMobile({ ...desktop, platform: "MacIntel" })).toBe(false);
  });
  it("requires secure context and service workers before suggesting install or permission", () => {
    for (const patch of [{ secure: false }, { worker: false }])
      expect(classifyPushSupport({ ...desktop, userAgent: "iPhone", ...patch })).toBe("unsupported");
    expect(classifyPushSupport({ ...desktop, push: false })).toBe("worker-only");
    expect(classifyPushSupport({ ...desktop, notification: false })).toBe("worker-only");
  });
});

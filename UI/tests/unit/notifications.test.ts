import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../src/lib/api/client";
import { ApiError } from "../../src/lib/api/errors";
import {
  deliveryKey,
  failure,
  filterPage,
  isUnread,
  isUnreadAfter,
  mustReconcile,
  readNotification,
  readPage,
  readPreferences,
  rebaseSettings,
  validateSettings,
  type Notification,
  type Settings,
} from "../../src/features/notifications/model";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
const at = "2026-10-23T09:00:00.123456Z";
const n: Notification = {
  id,
  kind: "Custom",
  sourceId: other,
  taskId: null,
  dailyPlanId: null,
  revisionId: null,
  occurredAt: at,
  readyAt: at,
  notBefore: at,
  readAt: null,
  state: "Ready",
  snoozeCount: 0,
  soundEnabled: true,
  version: "9007199254740993",
};
const settings: Settings = {
  enabled: true,
  pushEnabled: true,
  soundEnabled: false,
  scheduleStart: true,
  scheduleEnd: true,
  taskDeadline: true,
  focusTarget: true,
  breakEnd: true,
  returnToTask: true,
  custom: true,
  leadSeconds: 0,
  snoozeSeconds: 300,
  returnAfterSeconds: 0,
  specialDay: true,
  pomodoroSound: "bell",
  reminderSound: "marimba",
  taskEndSound: "digital",
  quietStart: null,
  quietEnd: null,
};
describe("notification facts and page-scoped counts", () => {
  it("does not restore new indicators from a stale list after an acknowledged read, including microsecond boundaries", () => {
    expect(isUnreadAfter(n, null)).toBe(true);
    expect(isUnreadAfter(n, at)).toBe(false);
    expect(isUnreadAfter(n, "2026-10-23T09:00:00.123457Z")).toBe(false);
    expect(isUnreadAfter(n, "2026-10-23T09:00:00.123455Z")).toBe(true);
    expect(isUnreadAfter({ ...n, readAt: at }, null)).toBe(false);
    expect(isUnreadAfter({ ...n, state: "Pending" }, null)).toBe(false);
    expect(n.readAt).toBeNull();
    expect(n.version).toBe("9007199254740993");
  });
  it("keeps microseconds and precise versions; snooze keeps identity while Pending is not an unread ready alert", () => {
    expect(readNotification(n).version).toBe(n.version);
    const snoozed = readNotification({ ...n, snoozeCount: 1, state: "Pending" });
    expect(snoozed.id).toBe(n.id);
    expect(isUnread(snoozed)).toBe(false);
    expect(filterPage([n, snoozed], "unread")).toEqual([n]);
    expect(isUnread({ ...n, readAt: at })).toBe(false);
  });
  it.each([
    { id: "bad" },
    { sourceId: null },
    { taskId: "foreign?" },
    { version: 0 },
    { version: 9007199254740992 },
    { readyAt: null },
    { occurredAt: "tomorrow" },
    { kind: "Unknown" },
    { state: "Delivered" },
    { readAt: undefined },
    { snoozeCount: -1 },
  ])("rejects malformed wire facts %j", patch => {
    expect(() => readNotification({ ...n, ...patch } as never)).toThrow();
  });
  it("never treats total as total unread and rejects duplicate, oversized or mismatched pages", () => {
    const p = { items: [n], offset: 0, limit: 25, total: 500 };
    expect(readPage(p, 0).items.filter(isUnread)).toHaveLength(1);
    expect(() => readPage(p, 25)).toThrow();
    expect(() => readPage({ ...p, items: [n, n] }, 0)).toThrow();
    expect(() => readPage({ ...p, items: Array(26).fill(n) }, 0)).toThrow();
    expect(() => readNotification(n, other)).toThrow();
  });
  it("delivery identity is shared for a repeated receipt and changes for snooze and account", () => {
    expect(deliveryKey(id, n)).toBe(deliveryKey(id, { ...n, version: 3 }));
    expect(deliveryKey(id, n)).not.toBe(deliveryKey(id, { ...n, snoozeCount: 1 }));
    expect(deliveryKey(id, n)).not.toBe(deliveryKey(other, n));
  });
});
describe("notification preference invariants", () => {
  it("accepts first-write version 0 and preserves push settings outside UI-25", () => {
    expect(readPreferences({ settings, version: 0 }).settings.pushEnabled).toBe(true);
    expect(() => readPreferences({ settings, version: -1 })).toThrow();
  });
  it("permits overnight quiet hours and exact range boundaries", () => {
    expect(
      validateSettings({
        ...settings,
        quietStart: "22:00:00",
        quietEnd: "08:00:00",
        snoozeSeconds: 60,
        leadSeconds: 86400,
        returnAfterSeconds: 86400,
      }),
    ).toBeTruthy();
  });
  it.each([
    { snoozeSeconds: 59 },
    { snoozeSeconds: 86401 },
    { leadSeconds: -1 },
    { returnAfterSeconds: 0.1 },
    { enabled: null },
    { quietStart: "22:00", quietEnd: null },
    { quietStart: "08:00", quietEnd: "08:00:00" },
    { quietStart: "24:00", quietEnd: "08:00" },
    { quietStart: 0 },
    { quietStart: "" },
  ])("rejects invalid preference %j", patch => {
    expect(() => validateSettings({ ...settings, ...patch } as never)).toThrow();
  });
  it("rebases only edited fields, preserving remote-only changes and precise versions", () => {
    const remote = { ...settings, pushEnabled: false, soundEnabled: true, leadSeconds: 60 };
    const draft = { ...settings, snoozeSeconds: 600 };
    expect(rebaseSettings(settings, draft, remote)).toEqual({ ...remote, snoozeSeconds: 600 });
  });
  it("unknown, protocol and stale writes require a GET, validation/offline allow a new explicit attempt", () => {
    for (const e of [
      new ApiError("network", "lost", undefined, undefined, {}, undefined, undefined, true),
      new ApiError("protocol", "bad"),
      new ApiError("http", "stale", 409),
    ]) {
      expect(mustReconcile(e)).toBe(true);
      expect(failure(e)).not.toBe("");
    }
    expect(mustReconcile(new ApiError("offline", "offline"))).toBe(false);
  });
});
describe("real endpoint write policies", () => {
  it.each(["read", "snooze"] as const)(
    "%s never retries a keyless lost reply and preserves exact version",
    async action => {
      const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("lost response"));
      const api = createApiClient({
        identity: () => ({ epoch: 1, active: true, verified: true }),
        onUnauthorized: vi.fn(),
        fetch: fetcher,
      });
      const options = { path: { id }, body: { version: n.version } };
      const command =
        action === "read"
          ? api.mutation("/api/notifications/{id}/read", "post", options)
          : api.mutation("/api/notifications/{id}/snooze", "post", options);
      await expect(command.execute()).rejects.toMatchObject({ outcomeUnknown: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).version).toBe(n.version);
      expect(fetcher.mock.calls[0][1]!.headers).not.toHaveProperty("Idempotency-Key");
    },
  );
});

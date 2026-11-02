import { describe, expect, it } from "vitest";
import { alertWindow, readAlertPage } from "../../src/features/notifications/alert-window";
import type { Notification } from "../../src/features/notifications/model";
const at = "2026-10-27T10:00:00.000001Z";
const later = "2026-10-27T10:00:00.000002Z";
const item: Notification = {
  id: "00000000-0000-0000-0000-000000000001",
  sourceId: "00000000-0000-0000-0000-000000000002",
  taskId: null,
  dailyPlanId: null,
  revisionId: null,
  kind: "Custom",
  state: "Ready",
  occurredAt: at,
  readyAt: at,
  notBefore: at,
  readAt: null,
  snoozeCount: 0,
  soundEnabled: true,
  version: 1,
};
describe("server alert playback baseline", () => {
  it("never replays the first observation, retains sub-millisecond precision and obeys effective sound", () => {
    const window = alertWindow();
    expect(window.accept(at, [item])).toEqual([]);
    expect(window.accept(later, [item, { ...item, readyAt: later, soundEnabled: false }])).toEqual([]);
    expect(window.accept(later, [{ ...item, readyAt: later }])).toEqual([{ ...item, readyAt: later }]);
  });
  it("an explicit snooze is a new round even when the first ReadyAt is old", () => {
    const window = alertWindow();
    window.accept(at, []);
    const snoozed = { ...item, snoozeCount: 1, notBefore: later };
    expect(window.accept(later, [snoozed])).toEqual([snoozed]);
    expect(window.accept(later, [{ ...snoozed, notBefore: null }])).toEqual([]);
  });
  it("decodes only ready unread items and validates pagination boundaries", () => {
    const page = { serverNow: at, preferencesVersion: 0, items: [item], nextCursor: null };
    expect(readAlertPage(page)).toBe(page);
    for (const broken of [
      { ...page, serverNow: "tomorrow" },
      { ...page, nextCursor: "" },
      { ...page, nextCursor: "a".repeat(2049) },
      { ...page, preferencesVersion: -1 },
      { ...page, preferencesVersion: "9223372036854775808" },
      { ...page, items: [{ ...item, state: "Pending" }] },
      { ...page, items: [{ ...item, readAt: at }] },
      { ...page, items: [item, item] },
    ])
      expect(() => readAlertPage(broken as typeof page)).toThrow("Hazır bildirimler doğrulanamadı.");
  });
  it("changing sound preferences establishes a new baseline instead of ringing the muted backlog", () => {
    const window = alertWindow();
    window.accept(at, [], 1);
    const muted = { ...item, readyAt: later, soundEnabled: false };
    expect(window.accept(later, [muted], 1)).toEqual([]);
    expect(window.accept(later, [{ ...muted, soundEnabled: true }], 2)).toEqual([]);
    const fresh = { ...item, readyAt: "2026-10-27T10:00:00.000003Z" };
    expect(window.accept(fresh.readyAt!, [fresh], 2)).toEqual([fresh]);
  });
});

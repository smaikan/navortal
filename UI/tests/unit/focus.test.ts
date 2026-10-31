import { describe, expect, it } from "vitest";
import {
  attachment,
  availableActions,
  primaryFocusAction,
  displayFocus,
  focusCommand,
  focusFailure,
  readCurrent,
  readFocus,
  readFocusPage,
  readPreset,
  readPresets,
  readSettings,
  settingsLabel,
  type Focus,
  type Settings,
} from "../../src/features/focus/model";
import type { Work } from "../../src/features/work/model";
import { ApiError } from "../../src/lib/api/errors";
const id = "00000000-0000-0000-0000-000000000001",
  workId = "00000000-0000-0000-0000-000000000002";
export const settings: Settings = {
  workSeconds: 2100,
  shortBreakSeconds: 420,
  longBreakSeconds: 1200,
  longBreakEvery: 3,
  targetBehavior: "ContinueTracking",
  soundEnabled: false,
  notificationsEnabled: true,
};
export const focus: Focus = {
  id,
  workSessionId: workId,
  taskId: null,
  previousFocusId: null,
  cycleNumber: 1,
  state: "Working",
  settings,
  presetId: null,
  presetName: null,
  presetVersion: null,
  startedAt: "2026-10-21T09:00:00Z",
  workEndedAt: null,
  breakStartedAt: null,
  breakEndedAt: null,
  endedAt: null,
  targetReachedAt: null,
  targetObservedAt: null,
  targetEventId: null,
  activeSeconds: "12.125",
  remainingSeconds: "2087.875",
  overtimeSeconds: 0,
  effectiveTargetReached: false,
  breakTargetSeconds: 420,
  breakElapsedSeconds: 0,
  breakRemainingSeconds: 420,
  version: "9007199254740993",
  workSessionVersion: "9007199254740995",
  serverNow: "2026-10-21T09:00:12.125Z",
};
describe("focus settings", () => {
  it("promotes break only on the server effective target, preserving pause and next behavior", () => {
    expect(primaryFocusAction(focus)).toBe("pause");
    expect(primaryFocusAction({ ...focus, remainingSeconds: 0, targetEventId: id })).toBe("pause");
    for (const state of ["Working", "Paused"] as const)
      expect(primaryFocusAction({ ...focus, state, effectiveTargetReached: true })).toBe("break");
    expect(primaryFocusAction({ ...focus, state: "Paused" })).toBe("resume");
    for (const state of ["Break", "AwaitingNext"] as const)
      expect(primaryFocusAction({ ...focus, state, effectiveTargetReached: true })).toBe("next");
    for (const state of ["Finished", "Interrupted"] as const)
      expect(primaryFocusAction({ ...focus, state, effectiveTargetReached: true })).toBeNull();
  });
  it("keeps 35/7, long break frequency and policy independent of task duration", () => {
    expect(readSettings(settings)).toEqual(settings);
    expect(settingsLabel(settings)).toBe("35 dk çalışma / 7 dk mola");
  });
  it("accepts integer-string wire values without rounding", () => {
    expect(readSettings({ ...settings, workSeconds: "3", shortBreakSeconds: "1" })).toEqual({
      ...settings,
      workSeconds: 3,
      shortBreakSeconds: 1,
    });
  });
  it.each([
    { workSeconds: 0 },
    { workSeconds: 86401 },
    { shortBreakSeconds: 14401 },
    { longBreakSeconds: 43201 },
    { longBreakEvery: 21 },
    { longBreakEvery: 0 },
    { workSeconds: 1.5 },
    { targetBehavior: undefined },
    { soundEnabled: undefined },
  ])("rejects invalid settings %j", patch => {
    expect(() => readSettings({ ...settings, ...patch } as never)).toThrow();
  });
});
describe("focus display and explicit transition intent", () => {
  it("projects monotonic elapsed, remaining and overtime without mutating authoritative state", () => {
    const f = { ...focus, activeSeconds: "2.25", remainingSeconds: ".75", overtimeSeconds: 0 };
    expect(displayFocus(f, 1000, 2000)).toEqual({ active: 3.25, remaining: 0, overtime: 0.25, breakRemaining: 420 });
    expect(f.state).toBe("Working");
    expect(f.targetReachedAt).toBeNull();
    expect(f.taskId).toBeNull();
    expect(displayFocus(f, 1000, 500).active).toBe(2.25);
  });
  it.each(["Paused", "Break", "AwaitingNext", "Finished", "Interrupted"] as const)(
    "never consumes target or actual while %s",
    state => {
      const value = displayFocus({ ...focus, state }, 0, 86_400_000);
      expect(value.active).toBe(12.125);
      expect(value.remaining).toBe(2087.875);
      expect(value.overtime).toBe(0);
      expect(value.breakRemaining).toBe(state === "Break" ? 0 : 420);
    },
  );
  it("overtime continues above the target; a break remains a break until server observation", () => {
    expect(
      displayFocus({ ...focus, activeSeconds: 2105, remainingSeconds: 0, overtimeSeconds: 5 }, 1000, 3000).overtime,
    ).toBe(7);
    const f = { ...focus, state: "Break" as const, breakRemainingSeconds: 1 };
    expect(displayFocus(f, 1000, 5000).breakRemaining).toBe(0);
    expect(f.state).toBe("Break");
  });
  it("uses the independent exact focus/work version pair", () => {
    expect(focusCommand(focus, "pause", false)).toEqual({
      version: "9007199254740993",
      workSessionVersion: "9007199254740995",
      skipBreak: false,
    });
  });
  it("requires deliberate skip only for a live break; awaiting next never invents skip intent", () => {
    const f = { ...focus, state: "Break" as const };
    expect(() => focusCommand(f, "next", false)).toThrow();
    expect(focusCommand(f, "next", true).skipBreak).toBe(true);
    expect(focusCommand({ ...f, state: "AwaitingNext" }, "next", true).skipBreak).toBe(false);
    expect(focusCommand(focus, "pause", true).skipBreak).toBe(false);
  });
  it("offers only valid actions and no automatic next for terminal cycles", () => {
    expect(availableActions("Paused")).not.toContain("next");
    expect(availableActions("Break")).toEqual(["next", "finish", "cancel"]);
    expect(availableActions("Finished")).toEqual([]);
    expect(() => focusCommand({ ...focus, state: "Finished" }, "resume", false)).toThrow();
  });
  it("rejects overflowing decimal strings instead of rendering an infinite timer", () => {
    expect(() => readFocus({ ...focus, activeSeconds: "9".repeat(400) })).toThrow();
  });
});
describe("focus server facts", () => {
  it("attachment binds the real work id and exact version; rejects a changed schedule/task or terminal work", () => {
    const work = {
      id: workId,
      taskId: id,
      version: "9007199254740995",
      state: "Paused",
      startedScheduleId: id,
    } as Work;
    expect(attachment(work)).toEqual({ workSessionId: workId, workSessionVersion: "9007199254740995" });
    expect(attachment(work, { taskId: id, scheduleId: id }).workSessionId).toBe(workId);
    expect(() => attachment(work, { taskId: workId, scheduleId: id })).toThrow();
    expect(() => attachment(work, { taskId: id, scheduleId: workId })).toThrow();
    expect(() => attachment({ ...work, state: "Finished" })).toThrow();
  });
  it("preserves the real work id, precise versions and general null task", () => {
    const f = readFocus(focus);
    expect(f.workSessionId).toBe(workId);
    expect(f.taskId).toBeNull();
    expect(f.workSessionVersion).toBe("9007199254740995");
    expect(f.activeSeconds).toBe("12.125");
  });
  it("does not replace historical target events after corrections", () => {
    const f = readFocus({
      ...focus,
      targetReachedAt: focus.serverNow,
      targetObservedAt: focus.serverNow,
      targetEventId: id,
      effectiveTargetReached: false,
    });
    expect(f.targetEventId).toBe(id);
    expect(f.effectiveTargetReached).toBe(false);
  });
  it.each([
    { workSessionId: "bad" },
    { taskId: "bad" },
    { state: "Running" },
    { activeSeconds: "" },
    { remainingSeconds: -1 },
    { workSessionVersion: 0 },
    { serverNow: "yesterday" },
    { breakStartedAt: "no" },
    { targetEventId: "bad" },
  ])("rejects malformed response %j", patch => {
    expect(() => readFocus({ ...focus, ...patch } as never)).toThrow();
  });
  it("distinguishes empty current from malformed current", () => {
    expect(readCurrent({ session: null, serverNow: focus.serverNow }).session).toBeNull();
    expect(() => readCurrent({ session: undefined, serverNow: focus.serverNow } as never)).toThrow();
  });
  it("validates both paginated sources, never converts an incomplete page into an empty success", () => {
    const p = { id, name: "35/7", settings, version: 1 };
    expect(readPreset(p).settings).toEqual(settings);
    expect(readPresets({ items: [p], offset: 0, limit: 25, total: 100, builtIns: [settings] }).total).toBe(100);
    expect(readFocusPage({ items: [focus], offset: 0, limit: 25, total: 26 }).total).toBe(26);
    expect(() => readPresets({ items: [p], offset: 0, limit: 25, total: 1 } as never)).toThrow();
    expect(() => readFocusPage({ items: undefined, offset: 0, limit: 25, total: 0 } as never)).toThrow();
  });
  it("explains current-state conflicts without retrying a command", () => {
    expect(focusFailure(new ApiError("http", "", 409, "focus_already_active"))).toContain("açık bir odak");
    expect(focusFailure(new ApiError("http", "", 409, "focus_break_pending"))).toContain("açıkça");
  });
});

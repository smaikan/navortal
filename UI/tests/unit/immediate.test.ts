import { expect, test } from "vitest";
import { prepareImmediate, readImmediate } from "../../src/features/work/immediate-model";
import type { components } from "../../src/lib/api/generated/schema";
import type { Work } from "../../src/features/work/model";
const a = "00000000-0000-0000-0000-000000000001",
  b = "00000000-0000-0000-0000-000000000002";
const work: Work = {
  id: a,
  taskId: b,
  state: "Running",
  source: "Timer",
  startedAt: "2026-10-20T06:20:00Z",
  endedAt: null,
  timeZoneId: "Europe/Istanbul",
  taskAtStart: null,
  version: 1,
  activeSeconds: 0,
  serverNow: "2026-10-20T06:20:00Z",
  recordedAt: "2026-10-20T06:20:00Z",
  startedScheduleId: null,
  startedRevisionItemId: null,
};
const value = (): components["schemas"]["ImmediateWorkResult"] => ({
  work: {
    session: work,
    pausedSession: null,
    localDate: "2026-10-20",
    planningVersion: 3,
    taskIds: [b],
    resumed: false,
  },
  plan: null,
  planningStatus: "Unavailable",
  planningError: "planning_unavailable",
  replayed: false,
});
test("explicit interruption preserves both expected session fields and the exact planning version", () => {
  const result = prepareImmediate(
    { activeSession: work, planningVersion: "9223372036854775807", serverNow: work.serverNow },
    a,
  );
  expect(result.body).toEqual({
    taskId: a,
    expectedPlanningVersion: "9223372036854775807",
    expectedSessionId: a,
    expectedSessionVersion: 1,
  });
  expect(result.previous).toBe(work);
});
test("no active session means both expected session fields are null, never an invented work session", () => {
  expect(prepareImmediate({ activeSession: null, planningVersion: 0, serverNow: work.serverNow }, b).body).toEqual({
    taskId: b,
    expectedPlanningVersion: 0,
    expectedSessionId: null,
    expectedSessionVersion: null,
  });
  for (const current of [
    { activeSession: undefined, planningVersion: 0 },
    { activeSession: null, planningVersion: 9223372036854776000 },
    { activeSession: { ...work, state: "Paused" }, planningVersion: 1 },
  ])
    expect(() => prepareImmediate(current as never, b)).toThrow();
});
test("Unavailable and NeedsPreview preserve committed work independently from the plan", () => {
  for (const planningStatus of ["Unavailable", "NeedsPreview"]) {
    const result = readImmediate({ ...value(), planningStatus });
    expect(result.receipt.session).toEqual(work);
    expect(result.plan).toBeNull();
    expect(result.planInvalid).toBe(false);
  }
});
test("malformed or absent plan cannot erase a valid work ACK or claim an applied plan", () => {
  for (const planningStatus of ["Applied", "Preview", "FutureStatus"]) {
    const result = readImmediate({ ...value(), planningStatus });
    expect(result.receipt.session).toEqual(work);
    expect(result.plan).toBeNull();
    expect(result.planInvalid).toBe(true);
  }
});
test("a broken work receipt stays unknown rather than claiming a successful switch", () => {
  const v = value();
  for (const receipt of [
    { ...v.work, session: { ...work, state: "Paused" as const } },
    { ...v.work, taskIds: [] },
    { ...v.work, taskIds: [b, b] },
    { ...v.work, pausedSession: work },
    { ...v.work, localDate: "bad" },
    { ...v.work, planningVersion: -1 },
  ])
    expect(() => readImmediate({ ...v, work: receipt })).toThrow();
});
test("resumed/replayed receipt and actual seconds remain server values", () => {
  const v = value();
  const result = readImmediate({
    ...v,
    replayed: true,
    work: { ...v.work, resumed: true, session: { ...work, activeSeconds: "1200.125" } },
  });
  expect(result.replayed).toBe(true);
  expect(result.receipt.resumed).toBe(true);
  expect(result.receipt.session.activeSeconds).toBe("1200.125");
});

import { expect, test } from "vitest";
import {
  distributionBody,
  rangeDates,
  readDistribution,
  readMoved,
  moveTimes,
  multiFailure,
  type Distribution,
} from "../../src/features/planning/distribution-model";
import { canApply } from "../../src/features/planning/proposal-model";
import { ApiError } from "../../src/lib/api/errors";
import type { Day, Result, Schedule } from "../../src/features/planning/model";
import { wallTimeIsAmbiguous } from "../../src/lib/time/wall-time";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  third = "00000000-0000-0000-0000-000000000003";
const daily = (localDate: string): Distribution["days"][number] => ({
  localDate,
  timeZoneId: "Europe/Istanbul",
  blocks: [],
  changes: [],
  unplaced: [{ taskId: id, remainingSeconds: 3600, reason: "InsufficientCapacity" }],
  warnings: [],
  explanations: [],
});
const proposal = (): Distribution => ({
  proposalId: id,
  inputVersion: "9223372036854775807",
  createdAt: "2026-10-25T06:00:00Z",
  expiresAt: "2026-10-25T06:02:00Z",
  planningMode: "Preview",
  algorithmVersion: "distribution-v1",
  status: "Pending",
  canApply: true,
  hasConstraintConflicts: false,
  days: [daily("2026-10-25"), daily("2026-10-26")],
  unplaced: [{ taskId: id, remainingSeconds: null, reason: "NoEstimate" }],
  applied: null,
  reversesChangeSetId: null,
  isPartial: false,
});
test("inclusive 1..31 days use civil dates across DST and reject invalid/reversed/32-day ranges", () => {
  expect(wallTimeIsAmbiguous("2027-03-28T02:30", "Europe/Berlin")).toBe(false);
  expect(wallTimeIsAmbiguous("2027-10-31T02:30", "Europe/Berlin")).toBe(true);
  expect(rangeDates("2026-10-25", "2026-10-25")).toEqual(["2026-10-25"]);
  expect(rangeDates("2026-10-01", "2026-10-31")).toHaveLength(31);
  expect(rangeDates("2026-10-24", "2026-10-26")).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  for (const [a, b] of [
    ["2026-10-01", "2026-11-01"],
    ["2026-10-26", "2026-10-25"],
    ["2026-02-30", "2026-03-01"],
    ["0001-01-01", "0001-01-01"],
    ["9999-01-01", "9999-01-01"],
    ["", "2026-10-25"],
  ])
    expect(() => rangeDates(a, b)).toThrow();
});
test("distribution request preserves exact version, sorts unique ids and never supplies a second scheduling clock", () => {
  const v = distributionBody("2026-10-25", "2026-10-26", [other, id], "9223372036854775807");
  expect(v.taskIds).toEqual([id, other]);
  expect(v.expectedPlanningVersion).toBe("9223372036854775807");
  expect(v).not.toHaveProperty("newWorkNotBefore");
  for (const ids of [[], [id, id], ["bad"], Array(1001).fill(id)])
    expect(() => distributionBody("2026-10-25", "2026-10-26", ids, 1)).toThrow();
  expect(() => distributionBody("2026-10-25", "2026-10-26", [id], -1)).toThrow();
});
test("only the server's final Unplaced is retained; intermediate daily shortages are not added or substituted", () => {
  const p = proposal(),
    parsed = readDistribution(p, { range: { fromDate: "2026-10-25", toDate: "2026-10-26" } });
  expect(parsed).toBe(p);
  expect(parsed.unplaced).toBe(p.unplaced);
  expect(parsed.unplaced[0].remainingSeconds).toBeNull();
  expect(parsed.days[1].unplaced[0].remainingSeconds).toBe(3600);
  expect(canApply(parsed)).toBe(true);
});
test("proposal id, ordered days, request range and frozen zones fail closed", () => {
  const p = proposal();
  expect(() => readDistribution(p, { id: other })).toThrow();
  expect(() => readDistribution(p, { range: { fromDate: "2026-10-25", toDate: "2026-10-27" } })).toThrow();
  for (const days of [
    [],
    Array(32).fill(daily("2026-10-25")),
    [daily("2026-10-25"), daily("2026-10-25")],
    [...p.days].reverse(),
    [{ ...daily("2026-10-25"), timeZoneId: "bad" }],
  ])
    expect(() => readDistribution({ ...p, days })).toThrow();
  expect(() =>
    readDistribution({
      ...p,
      days: [{ ...daily("2026-10-25"), changes: [{ before: null }] }],
    } as unknown as Distribution),
  ).toThrow();
});
test("multi-day undo must match both the source ChangeSet and selected day; normal distribution cannot masquerade as undo", () => {
  const p = { ...proposal(), reversesChangeSetId: other, isPartial: true };
  expect(readDistribution(p, { source: other, day: "2026-10-25" })).toBe(p);
  expect(() => readDistribution(p, { source: id })).toThrow();
  expect(() => readDistribution(p)).toThrow();
  expect(() => readDistribution(p, { source: other, day: "2026-10-27" })).toThrow();
});
test("no-op, applied, stale/expired and hard-conflict gates preserve one common receipt", () => {
  const p = proposal(),
    effect = { proposalId: id, noChanges: true, changeSetId: null, revisionIds: [], planningVersion: 2 };
  expect(readDistribution({ ...p, status: "Applied", canApply: false, applied: effect }).applied).toBe(effect);
  expect(() => readDistribution({ ...p, status: "Applied", canApply: false })).toThrow();
  expect(() => readDistribution({ ...p, status: "Expired" })).toThrow();
  expect(() => readDistribution({ ...p, hasConstraintConflicts: true })).toThrow();
  expect(canApply(readDistribution({ ...p, status: "Expired", canApply: false }))).toBe(false);
});
test("a move needs one unchanged task/block identity and two distinct atomic revisions", () => {
  const b: Schedule = {
    id,
    dailyPlanId: id,
    taskId: null,
    kind: "Break",
    state: "Planned",
    startsAt: "2026-10-25T07:00:00Z",
    endsAt: "2026-10-25T08:00:00Z",
    isFixed: false,
    isLocked: false,
    version: 1,
    splitGroupId: null,
    originScheduleId: null,
    taskSnapshot: null,
    isAutomatic: false,
  };
  const source: Day = {
      id,
      localDate: "2026-10-25",
      timeZoneId: "Europe/Istanbul",
      version: 1,
      planningVersion: 1,
      baselineRevisionId: null,
      currentRevisionId: id,
    },
    target = { ...source, id: other, localDate: "2026-10-26" };
  const result: Result = {
    changeSetId: third,
    planningVersion: 2,
    revisionIds: [id, other],
    schedules: [{ ...b, dailyPlanId: other, version: 2 }],
    warnings: [],
  };
  expect(readMoved(result, b, source, target)).toBe(result);
  expect(
    moveTimes({ ...b, startsAt: "2026-10-25T20:30:00Z", endsAt: "2026-10-25T21:00:00Z" }, source, "2026-10-27"),
  ).toEqual({ start: "2026-10-27T23:30:00", end: "2026-10-28T00:00:00" });
  for (const revisionIds of [[id], [id, id], []])
    expect(() => readMoved({ ...result, revisionIds }, b, source, target)).toThrow();
  for (const s of [
    { ...result.schedules[0], id: third },
    { ...result.schedules[0], dailyPlanId: id },
    { ...result.schedules[0], state: "Removed" as const },
  ])
    expect(() => readMoved({ ...result, schedules: [s] }, b, source, target)).toThrow();
  expect(multiFailure(new ApiError("http", "", 409, "move_active_work"))).toContain("Aktif");
  expect(multiFailure(new ApiError("http", "", 409, "schedule_protected"))).toContain("açık izin");
});

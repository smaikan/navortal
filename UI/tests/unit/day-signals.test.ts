import { expect, test } from "vitest";
import { readSignals, type DaySignals } from "../../src/features/planning/signals-model";
import { readCoverage } from "../../src/features/workspace/read-coverage";
const date = "2026-10-25";
const empty: DaySignals = {
  localDate: date,
  serverNow: "2026-10-25T09:00:00Z",
  returnThresholdSeconds: 1800,
  notifications: [],
  complete: true,
  lastWork: null,
  focusIncluded: false,
  focus: null,
  runningWorkSessionId: null,
  runningTask: null,
};
const id = "11111111-1111-4111-8111-111111111111";
test("day signals distinguish omitted focus and empty receipts from invalid protocol", () => {
  expect(readSignals(empty, date)).toBe(empty);
  expect(readSignals({ ...empty, complete: false }, date).complete).toBe(false);
  for (const patch of [
    { localDate: "2026-10-24" },
    { serverNow: "bad" },
    { complete: undefined },
    { returnThresholdSeconds: -1 },
    { returnThresholdSeconds: 86401 },
    { runningWorkSessionId: "bad" },
    { focus: {} },
    { runningTask: { taskId: id, hasDirectWork: true, directEstimatedSeconds: null } },
  ])
    expect(() => readSignals({ ...empty, ...patch } as DaySignals, date)).toThrow();
});
test("signals preserve unknown estimates and reject duplicate or non-ready receipts", () => {
  const receipt = { id, kind: "ScheduleStart", sourceId: id, readAt: null, state: "Ready" as const, snoozeCount: 0 };
  expect(
    readSignals(
      {
        ...empty,
        notifications: [receipt],
        runningWorkSessionId: id,
        runningTask: { taskId: id, hasDirectWork: true, directEstimatedSeconds: null },
      },
      date,
    ).runningTask?.directEstimatedSeconds,
  ).toBeNull();
  for (const notifications of [
    [receipt, receipt],
    [{ ...receipt, state: "Suppressed" }],
    [{ ...receipt, readAt: empty.serverNow }],
    [{ ...receipt, kind: "Other" }],
  ])
    expect(() => readSignals({ ...empty, notifications } as DaySignals, date)).toThrow();
});
test("coverage accepts missing metadata but never certifies malformed versions or timestamps", () => {
  expect(readCoverage(undefined)).toBeUndefined();
  const coverage = {
    serverNow: empty.serverNow,
    versions: { planning: "9223372036854775807", notes: 0, specialDays: 0 },
  };
  expect(readCoverage(coverage)).toBe(coverage);
  expect(() =>
    readCoverage({ ...coverage, versions: { ...coverage.versions, planning: "9223372036854775808" } }),
  ).toThrow();
  expect(() => readCoverage({ ...coverage, serverNow: "invalid" })).toThrow();
});

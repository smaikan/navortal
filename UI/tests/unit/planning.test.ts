import { describe, expect, test } from "vitest";
import {
  minutes,
  readAllocation,
  readDay,
  readResult,
  readSchedule,
  readSchedules,
  warningText,
  type Schedule,
} from "../../src/features/planning/model";
import { dayWindow, initialDraft, rangeBody } from "../../src/features/planning/time-model";
const id = "00000000-0000-0000-0000-000000000001";
const block: Schedule = {
  id,
  dailyPlanId: id,
  taskId: null,
  kind: "Break",
  state: "Planned",
  startsAt: "2026-10-25T00:30:00Z",
  endsAt: "2026-10-25T01:30:00Z",
  isFixed: true,
  isLocked: false,
  version: 1,
  splitGroupId: null,
  originScheduleId: null,
  taskSnapshot: null,
  isAutomatic: false,
};
describe("manual planning time adapter", () => {
  test("civil day windows follow DST (23 and 25 hours), while instants remain exact", () => {
    for (const [date, length] of [
      ["2026-03-29", 23],
      ["2026-10-25", 25],
    ] as const) {
      const w = dayWindow(date, "Europe/Berlin");
      expect((Date.parse(w.to) - Date.parse(w.from)) / 3600000).toBe(length);
    }
    expect(dayWindow("2026-10-25", "Europe/Istanbul").from).toBe("2026-10-24T21:00:00Z");
    expect(() => dayWindow("2026-02-30", "Europe/Istanbul")).toThrow();
  });
  test("gap is rejected even with a choice; overlap requires a choice and can mean a full hour between identical labels", () => {
    const draft = initialDraft("2026-03-29", "Europe/Berlin");
    draft.start = "2026-03-29T02:30";
    draft.end = "2026-03-29T04:00";
    draft.startChoice = "later";
    expect(() => rangeBody(draft, "2026-03-29", "Europe/Berlin")).toThrow(/bulunmuyor/);
    const overlap = { ...draft, start: "2026-10-25T02:30", end: "2026-10-25T02:30", startChoice: "" as const };
    expect(() => rangeBody(overlap, "2026-10-25", "Europe/Berlin")).toThrow(/iki kez/);
    // Başlangıç ayrı sınanmalı. Belirsiz bitiş, bozuk başlangıç kontrolünü gizlememeli.
    expect(() =>
      rangeBody({ ...overlap, end: "2026-10-25T04:00", endChoice: "" }, "2026-10-25", "Europe/Berlin"),
    ).toThrow(/iki kez/);
    expect(
      rangeBody(
        { ...overlap, startChoice: "later", end: "2026-10-25T04:00", endChoice: "" },
        "2026-10-25",
        "Europe/Berlin",
      ).startsAt,
    ).toBe("2026-10-25T01:30:00Z");
    const resolved = rangeBody(
      { ...overlap, startChoice: "earlier", endChoice: "later" },
      "2026-10-25",
      "Europe/Berlin",
    );
    expect((Date.parse(resolved.endsAt) - Date.parse(resolved.startsAt)) / 1000).toBe(3600);
  });
  test("midnight is kept for the server to split; invalid day, zero/negative, >7d, missing and huge reason never pass", () => {
    const d = { ...initialDraft("2026-10-25", "Europe/Istanbul"), start: "2026-10-25T23:30", end: "2026-10-26T00:30" };
    expect(rangeBody(d, "2026-10-25", "Europe/Istanbul").endsAt).toBe("2026-10-25T21:30:00Z");
    for (const v of [
      { ...d, start: "" },
      { ...d, end: d.start },
      { ...d, end: "2026-10-25T20:00" },
      { ...d, end: "2026-11-03T00:30" },
      { ...d, reason: "x".repeat(2001) },
    ])
      expect(() => rangeBody(v, "2026-10-25", "Europe/Istanbul")).toThrow();
    expect(() => rangeBody(d, "2026-10-26", "Europe/Istanbul")).toThrow(/seçilen/);
  });
  test("initial draft keeps the exact instant across a DST change", () => {
    expect(initialDraft("2026-10-25", "Europe/Berlin", block).start).toBe("2026-10-25T02:30:00");
  });
});
describe("planning wire guards and authoritative allocation", () => {
  test("schedule rejects missing kind/task/interval/version and malformed pages", () => {
    expect(readSchedule(block)).toEqual(block);
    for (const v of [
      { ...block, kind: null },
      { ...block, endsAt: block.startsAt },
      { ...block, kind: "Work" },
      { ...block, version: 0 },
      { ...block, isFixed: undefined },
    ])
      expect(() => readSchedule(v as Schedule)).toThrow();
    expect(() => readSchedules({ items: Array(26).fill(block), offset: 0, total: 26, limit: 25 })).toThrow();
    expect(() =>
      readDay({
        id: null,
        localDate: "2026-01-01",
        timeZoneId: "invalid",
        version: 0,
        planningVersion: 0,
        currentRevisionId: null,
        baselineRevisionId: null,
      }),
    ).toThrow();
    expect(() =>
      readResult({ changeSetId: id, planningVersion: 1, schedules: [block], revisionIds: ["bad"], warnings: [] }),
    ).toThrow();
  });
  test("90-minute work / 60-minute allocation reports the server's missing 30; unknown remains unknown", () => {
    const a = {
      taskId: id,
      from: block.startsAt,
      to: block.endsAt,
      cutoff: block.startsAt,
      directActualSeconds: 0,
      allocatedSeconds: 3600,
      remainingSeconds: 5400,
      unallocatedSeconds: 1800,
      excessAllocatedSeconds: 0,
    };
    expect(minutes(readAllocation(a, id).unallocatedSeconds)).toBe("30 dk");
    expect(minutes(null)).toBe("Bilinmiyor");
    expect(
      readAllocation({ ...a, remainingSeconds: null, unallocatedSeconds: null }, id).unallocatedSeconds,
    ).toBeNull();
    expect(() => readAllocation({ ...a, allocatedSeconds: -1 }, id)).toThrow();
    expect(() => readAllocation(a, "foreign")).toThrow();
    expect(warningText({ code: "manual_overlap_accepted", scheduleIds: [] })).toMatch(/açık onayınla/);
    expect(warningText({ code: "allocation_incomplete", seconds: 1800, scheduleIds: [] })).toMatch(/30 dk/);
  });
});

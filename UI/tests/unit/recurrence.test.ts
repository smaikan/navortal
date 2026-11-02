import { describe, it, expect } from "vitest";
import {
  draftTemplate,
  templateFields,
  validRule,
  windowDates,
  readTemplate,
  readDefinition,
  readOccurrence,
  readPage,
  readEffect,
  readProjection,
  routineState,
  shortSummary,
  ruleSummary,
  weekDaySummary,
  weekDayNames,
  weekdayOf,
  noDaysMessage,
  recurrenceFailure,
  type Template,
  type Occurrence,
  type Effect,
} from "../../src/features/recurrence/model";
import { ApiError } from "../../src/lib/api/errors";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const fields = () => templateFields({ ...draftTemplate("Europe/Istanbul", "2026-10-22"), title: "Su iç" });
const template = (): Template => ({
  id,
  version: "9007199254740993",
  enabled: true,
  definitionId: other,
  definitionNumber: 1,
  effectiveFrom: "2026-10-22",
  createdAt: "2026-10-22T12:00:00Z",
  ...fields(),
});
const occurrence = (): Occurrence => ({
  id,
  templateId: id,
  originalDefinitionId: other,
  appliedDefinitionId: other,
  localDate: "2026-10-22",
  originalTimeZoneId: "Europe/Istanbul",
  originalDueTime: null,
  originalDueAt: null,
  timeAdjusted: false,
  taskId: other,
  taskState: "Pending",
  taskVersion: "9007199254740993",
  taskChangedSinceSync: false,
  state: "Materialized",
  reason: null,
});
const effect = (): Effect => ({
  template: template(),
  occurrences: [occurrence()],
  refreshedTaskIds: [],
  protectedTaskIds: [],
  retractedDayItemCount: 0,
  planningVersion: 0,
  replayed: false,
});
it("keeps start time without inventing an estimate and preserves legacy hidden fields", () => {
  const d = {
    ...draftTemplate("Europe/Istanbul", "2026-10-26"),
    title: "Yeni seri",
    startTime: "10:15",
    autoAddToPlan: true,
  };
  const f = templateFields(d);
  expect(f.rule.startTime).toBe("10:15:00");
  expect(f.task.estimatedSeconds).toBeNull();
  expect(f.rule.autoAddToPlan).toBe(true);
  const old = {
    ...template(),
    rule: { ...template().rule, dueTime: "12:30:00", untilDate: "2026-12-01" },
    task: { ...template().task, description: "Korunan açıklama" },
  };
  const saved = templateFields(draftTemplate("UTC", "2026-10-26", old));
  expect(saved.rule.dueTime).toBe("12:30:00");
  expect(saved.rule.untilDate).toBe("2026-12-01");
  expect(saved.task.description).toBe("Korunan açıklama");
  expect(validRule({ ...f.rule, startTime: "10:15:01" })).toBe(false);
});
describe("recurrence UI boundary", () => {
  it("accepts inclusive 1 and 93 days, leap February; rejects 94 days and reversal", () => {
    expect(windowDates("2028-02-29", "2028-02-29")).toBeTruthy();
    expect(windowDates("2028-01-01", "2028-04-02")).toBeTruthy();
    expect(() => windowDates("2028-01-01", "2028-04-03")).toThrow();
    expect(() => windowDates("2028-01-02", "2028-01-01")).toThrow();
  });
  it("rejects normalized invalid dates and out-of-contract years", () => {
    for (const d of ["2026-02-30", "2026-1-01", "0001-01-01", "9999-01-01"]) expect(() => windowDates(d, d)).toThrow();
  });
  it("does not turn null estimate or absent due into zero/deadline", () => {
    const f = fields();
    expect(f.task.estimatedSeconds).toBeNull();
    expect(f.rule.dueTime).toBeNull();
    expect(f.rule.gap).toBe("Reject");
    expect(f.rule.overlap).toBe("Reject");
  });
  it("retains exact int64 version and estimated seconds strings", () => {
    const t = template();
    t.task.estimatedSeconds = "9007199254740993";
    expect(readTemplate(t).version).toBe("9007199254740993");
    expect(templateFields(draftTemplate("UTC", "2026-10-22", t)).task.estimatedSeconds).toBe("9007199254740993");
  });
  it("rejects unsafe numeric versions and int64 overflow", () => {
    expect(() => readTemplate({ ...template(), version: 9007199254740992 })).toThrow();
    expect(() =>
      templateFields({ ...draftTemplate("UTC", "2026-10-22"), title: "A", estimatedSeconds: "9223372036854775808" }),
    ).toThrow();
  });
  it("validates interval-day bounds without generating occurrences", () => {
    const r = fields().rule;
    expect(validRule({ ...r, frequency: "IntervalDays", interval: 366 })).toBe(true);
    expect(validRule({ ...r, frequency: "IntervalDays", interval: 367 })).toBe(false);
    expect(validRule({ ...r, frequency: "Daily", interval: 2 })).toBe(false);
  });
  it("requires unique weekly weekdays and at most 52 weeks", () => {
    const r = fields().rule;
    expect(validRule({ ...r, frequency: "Weekly", interval: 52, weekDays: [0, 1] })).toBe(true);
    for (const weekDays of [[], [1, 1], [7]]) expect(validRule({ ...r, frequency: "Weekly", weekDays })).toBe(false);
    expect(validRule({ ...r, frequency: "Weekly", interval: 53, weekDays: [1] })).toBe(false);
  });
  it.each([29, 30, 31])("requires explicit month-end policy for day %i", monthDay => {
    const r = { ...fields().rule, frequency: "Monthly" as const, monthDay };
    expect(validRule(r)).toBe(false);
    for (const monthEnd of ["Skip", "ClampToLastDay"] as const) expect(validRule({ ...r, monthEnd })).toBe(true);
  });
  it("accepts day 28 without overflow policy and rejects impossible bounds", () => {
    const r = { ...fields().rule, frequency: "Monthly" as const, monthDay: 28 };
    expect(validRule(r)).toBe(true);
    expect(validRule({ ...r, monthDay: 32 })).toBe(false);
    expect(validRule({ ...r, interval: 25 })).toBe(false);
  });
  it("exposes DST choices and accepts minute precision only", () => {
    const r = fields().rule;
    for (const gap of ["Reject", "Skip", "ShiftForward"] as const)
      for (const overlap of ["Reject", "Earlier", "Later"] as const)
        expect(validRule({ ...r, timeZoneId: "Europe/Berlin", dueTime: "02:30:00", gap, overlap })).toBe(true);
    expect(validRule({ ...r, dueTime: "02:30:01" })).toBe(false);
    expect(validRule({ ...r, timeZoneId: "+03:00" })).toBe(false);
    expect(validRule({ ...r, timeZoneId: "Europe/Missing" })).toBe(false);
  });
  it("summarizes Monday anchor, deadlines and explicit monthly policies", () => {
    const w = ruleSummary({ ...fields().rule, frequency: "Weekly", weekDays: [1, 3] });
    expect(w).toContain("Pzt, Çar");
    expect(w).not.toContain(fields().rule.timeZoneId!);
    expect(w).not.toContain("saat yoksa");
    const s = ruleSummary({
      ...fields().rule,
      frequency: "Monthly",
      monthDay: 31,
      monthEnd: "Skip",
      dueTime: "12:30:00",
    });
    expect(s).toContain("O ayı atla");
    expect(s).toContain("son teslim 12:30");
  });
  it("summarizes selected weekdays compactly in Monday-first order", () => {
    expect(weekDaySummary([0, 3, 1])).toBe("Pzt, Çar, Paz");
    expect(weekDaySummary([5, 4, 3, 2, 1])).toBe("Hafta içi");
    expect(weekDaySummary([0, 6])).toBe("Hafta sonu");
    expect(weekDaySummary([0, 1, 2, 3, 4, 5, 6])).toBe("Her gün");
    expect(weekDayNames([1, 3, 5])).toBe("Pazartesi, Çarşamba ve Cuma");
    expect(weekDayNames([6])).toBe("Cumartesi");
    expect(weekdayOf("2026-11-06")).toBe(5);
    expect(weekdayOf("2026-11-08")).toBe(0);
    expect(weekdayOf("bad")).toBeNull();
  });
  it("requires a weekday for weekly routines and keeps days only for weekly", () => {
    const d = { ...draftTemplate("UTC", "2026-10-22"), title: "A", frequency: "Weekly" as const };
    expect(() => templateFields({ ...d, weekDays: [] })).toThrow(noDaysMessage);
    expect(templateFields({ ...d, weekDays: [1, 3, 5] }).rule.weekDays).toEqual([1, 3, 5]);
    expect(templateFields({ ...d, frequency: "Monthly", weekDays: [1, 3] }).rule.weekDays).toEqual([]);
  });
  it("normalizes only fields belonging to selected frequency", () => {
    const d = {
      ...draftTemplate("UTC", "2026-10-22"),
      title: " A ",
      frequency: "Daily" as const,
      interval: "99",
      weekDays: [1],
      monthDay: "31",
      monthEnd: "Skip",
    };
    expect(templateFields(d).rule).toMatchObject({ interval: 1, weekDays: [], monthDay: null, monthEnd: null });
    expect(templateFields(d).task.title).toBe("A");
  });
  it("rejects invalid defaults and accepts zero estimate separately from unknown", () => {
    const d = { ...draftTemplate("UTC", "2026-10-22"), title: "A" };
    expect(templateFields({ ...d, estimatedSeconds: "0" }).task.estimatedSeconds).toBe("0");
    for (const estimatedSeconds of ["-1", "1.5", "foo"])
      expect(() => templateFields({ ...d, estimatedSeconds })).toThrow();
    expect(() => templateFields({ ...d, title: " " })).toThrow();
    expect(() => templateFields({ ...d, poolId: "bogus" })).toThrow();
  });
  it("rejects wrong template IDs and malformed immutable definitions", () => {
    expect(() => readTemplate(template(), other)).toThrow();
    const t = template();
    expect(() =>
      readDefinition({
        id: t.definitionId,
        number: 0,
        effectiveFrom: t.effectiveFrom,
        rule: t.rule,
        task: t.task,
        createdAt: t.createdAt,
      }),
    ).toThrow();
  });
  it("keeps marker nulls honest and requires task state/version for real tasks", () => {
    expect(
      readOccurrence({ ...occurrence(), taskId: null, taskVersion: null, taskState: null, state: "Skipped" }).taskId,
    ).toBeNull();
    expect(() => readOccurrence({ ...occurrence(), taskId: null })).toThrow();
    expect(() => readOccurrence({ ...occurrence(), taskVersion: null })).toThrow();
    expect(() => readOccurrence(occurrence(), other)).toThrow();
  });
  it("retains changed-since-sync and original/applied definition distinction", () => {
    const o = { ...occurrence(), taskChangedSinceSync: true, appliedDefinitionId: id };
    expect(readOccurrence(o)).toEqual(o);
    expect(readOccurrence(o).originalDefinitionId).not.toBe(o.appliedDefinitionId);
  });
  it("bounds pages and rejects scope/duplicate/mismatched offset", () => {
    const p = { items: [template()], offset: 0, limit: 25, total: 1 };
    expect(
      readPage(
        p,
        0,
        t => readTemplate(t),
        t => t.id,
      ).items,
    ).toHaveLength(1);
    expect(() =>
      readPage(
        { ...p, items: [template(), template()], total: 2 },
        0,
        t => readTemplate(t),
        t => t.id,
      ),
    ).toThrow();
    expect(() =>
      readPage(
        p,
        25,
        t => readTemplate(t),
        t => t.id,
      ),
    ).toThrow();
    expect(() =>
      readPage(
        { ...p, limit: 100 },
        0,
        t => readTemplate(t),
        t => t.id,
      ),
    ).toThrow();
  });
  it("validates effect template/occurrence scope, duplicates and protected overlap", () => {
    expect(readEffect(effect(), id).planningVersion).toBe(0);
    expect(() => readEffect({ ...effect(), occurrences: [{ ...occurrence(), templateId: other }] })).toThrow();
    expect(() => readEffect({ ...effect(), occurrences: [occurrence(), occurrence()] })).toThrow();
    expect(() => readEffect({ ...effect(), refreshedTaskIds: [id], protectedTaskIds: [id] })).toThrow();
  });
  it("distinguishes disabled, conflict, DST, offline and unknown outcomes", () => {
    expect(recurrenceFailure(new ApiError("http", "", 409, "recurrence_disabled"))).toContain("pasif");
    expect(recurrenceFailure(new ApiError("http", "", 409))).toContain("Seçimlerin korundu");
    expect(recurrenceFailure(new ApiError("http", "", 400, "recurrence_local_time_invalid"))).toContain("iki kez");
    expect(recurrenceFailure(new ApiError("offline", "Bağlantı yok"))).toBe("Bağlantı yok");
    expect(recurrenceFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
      "Aynı işlem kimliği",
    );
  });
});
it("rejects an end before the start, keeps an empty end open and shows the end in the summary", () => {
  const d = { ...draftTemplate("Europe/Istanbul", "2026-10-26"), title: "Bitişli" };
  expect(templateFields(d).rule.untilDate).toBeNull();
  expect(() => templateFields({ ...d, untilDate: "2026-10-25" })).toThrow(
    "Bitiş tarihi başlangıç gününden önce olamaz.",
  );
  const rule = templateFields({ ...d, untilDate: "2026-12-31" }).rule;
  expect(rule.untilDate).toBe("2026-12-31");
  expect(shortSummary(rule)).toBe("Her gün · bitiş 31 Ara 2026");
  expect(routineState({ ...template(), enabled: true, rule }, "2027-01-01")).toBe("Sona erdi");
  expect(routineState({ ...template(), enabled: true, rule }, "2026-12-31")).toBe("Etkin");
  expect(routineState({ ...template(), enabled: false, rule }, "2026-12-31")).toBe("Pasif");
});
it("rejects a projection outside the requested range", () => {
  const item = {
    templateId: template().id,
    templateVersion: 1,
    localDate: "2026-12-02",
    title: "Rutin",
    startTime: null,
    estimatedSeconds: null,
  };
  const view = { fromDate: "2026-12-01", toDate: "2026-12-03", items: [item] };
  expect(readProjection(view, "2026-12-01", "2026-12-03")).toBe(view);
  expect(() => readProjection(view, "2026-12-03", "2026-12-03")).toThrow();
});

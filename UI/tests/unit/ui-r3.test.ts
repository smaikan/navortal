import { describe, expect, test } from "vitest";
import { calibratedMinutes, calibrationText } from "../../src/features/planning/calibration";
import { matches } from "../../src/components/layout/command-palette";
import { browserFamily, maskReport } from "../../src/lib/errors/reporter";
import { hyperRatio, leadMinutes, pickNudge } from "../../src/features/planning/nudges";
import { dumpLimit, dumpLines } from "../../src/features/tasks/brain-dump";
import { mayShowTip } from "../../src/components/ui/new-tip";
import { glanceHints, readGlance, span, type Glance } from "../../src/features/planning/glance";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { occurrenceName, toBody, toDraft } from "../../src/features/special-days/model";
import { readyHintKeys } from "../../src/features/planning/notification-hints";
import type { Notification } from "../../src/features/notifications/model";
import { acceptDayItemBatch } from "../../src/features/planning/day-item-batch";
import { alreadyPresented, presentResume, presentedResume } from "../../src/features/push/presentation";
import { continueQuick, quickContinued } from "../../src/features/focus/quick-intent";

test("visible presentation and Continue intent stay owner scoped and survive server cache GC without stale cleanup", () => {
  const scope = new QueryClient(),
    other = new QueryClient();
  const old = presentResume(scope, "owner-a", "work-a");
  const latest = presentResume(scope, "owner-a", "work-b");
  old();
  scope.clear();
  expect(presentedResume(scope, "owner-a")).toBe("work-b");
  expect(presentedResume(scope, "owner-b")).toBeUndefined();
  expect(presentedResume(other, "owner-a")).toBeUndefined();
  latest();
  expect(presentedResume(scope, "owner-a")).toBeUndefined();
  const newClaim = presentResume(scope, "owner-a", "work-c");
  old();
  latest();
  expect(presentedResume(scope, "owner-a")).toBe("work-c");
  newClaim();
  continueQuick(scope, "owner-a", "focus-a:1");
  scope.clear();
  expect(quickContinued(scope, "owner-a")).toBe("focus-a:1");
  expect(quickContinued(scope, "owner-b")).toBeUndefined();
  continueQuick(scope, "owner-a", "focus-a:2");
  expect(quickContinued(scope, "owner-a")).toBe("focus-a:2");
});

describe("R3 return card replaces only its own foreground notification", () => {
  const n = { kind: "ReturnToTask", sourceId: "work-a" };
  test("same session on Bugün replaces the toast", () =>
    expect(alreadyPresented(n, { pathname: "/planning", resumeWorkId: "work-a" })).toBe(true));
  test("another session is not swallowed", () =>
    expect(alreadyPresented(n, { pathname: "/planning", resumeWorkId: "work-b" })).toBe(false));
  test("a stale card marker on another route is not a presentation", () =>
    expect(alreadyPresented(n, { pathname: "/tasks", resumeWorkId: "work-a" })).toBe(false));
  test("a card never suppresses a different kind", () =>
    expect(alreadyPresented({ ...n, kind: "ScheduleStart" }, { pathname: "/planning", resumeWorkId: "work-a" })).toBe(
      false,
    ));
  test("an unread or disabled card has no marker", () =>
    expect(alreadyPresented(n, { pathname: "/planning" })).toBe(false));
  test("the real inbox is already the notification presentation", () =>
    expect(alreadyPresented(n, { pathname: "/notifications" })).toBe(true));
});

test("minute glance updates notify the day bar but not plan rows until a task hint actually changes", async () => {
  const client = new QueryClient();
  const queryKey = ["owner", "plan-glance", "2026-10-25"];
  const data: Glance = {
    planningVersion: 1,
    localDate: "2026-10-25",
    workingRemainingSeconds: 3600,
    plannedRemainingSeconds: 1200,
    actualSeconds: 0,
    unknownEstimateCount: 0,
    unboundedItemCount: 0,
    completedItemCount: 0,
    openItemCount: 1,
    overCapacity: false,
    hints: [],
    serverNow: "2026-10-25T10:00:00Z",
  };
  client.setQueryData(queryKey, data);
  const rows = new QueryObserver(client, {
    queryKey,
    select: glanceHints,
    enabled: false,
    notifyOnChangeProps: ["data"],
  });
  const bar = new QueryObserver(client, { queryKey, enabled: false, notifyOnChangeProps: ["data"] });
  let rowUpdates = 0,
    barUpdates = 0;
  const stopRows = rows.subscribe(() => rowUpdates++),
    stopBar = bar.subscribe(() => barUpdates++);
  try {
    client.setQueryData(queryKey, {
      ...data,
      hints: [],
      workingRemainingSeconds: 3540,
      serverNow: "2026-10-25T10:01:00Z",
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rowUpdates).toBe(0);
    expect(barUpdates).toBe(1);
    client.setQueryData(queryKey, {
      ...data,
      hints: [{ taskId: "59b9875e-e8b7-4ee5-9da3-3f4d187c6f71", energyDemand: "Low", nextStep: null }],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rowUpdates).toBe(1);
    expect(barUpdates).toBe(2);
  } finally {
    stopRows();
    stopBar();
    client.clear();
  }
});

describe("UI-R3 calibration", () => {
  test("own estimate times the server median, rounded to 5 minutes, only when meaningfully longer", () => {
    expect(calibratedMinutes(30 * 60, 1.4)).toBe(40);
    expect(calibratedMinutes("1800", "1.4")).toBe(40);
    expect(calibratedMinutes(30 * 60, 1.1)).toBeNull();
    expect(calibratedMinutes(10 * 60, 1.2)).toBeNull(); // Yalnız 2 dakika fark.
    expect(calibratedMinutes(30 * 60, 0.8)).toBeNull();
    expect(calibratedMinutes(null, 1.5)).toBeNull();
    expect(calibratedMinutes(0, 1.5)).toBeNull();
    expect(calibratedMinutes(30 * 60, null)).toBeNull();
  });
  test("the text is a soft question, never a multiplier", () => {
    expect(calibrationText(42)).toBe("Benzer işler genelde biraz daha uzun sürüyor; 42 dk ayırmak ister misin?");
    expect(calibrationText(42)).not.toMatch(/×|x1|kat/);
  });
});

describe("UI-R3 command palette filter", () => {
  test("every word, case and Turkish accents ignored", () => {
    expect(matches("bugun", "Bugünü hafiflet")).toBe(true);
    expect(matches("HAF bug", "Bugünü hafiflet")).toBe(true);
    expect(matches("ozel", "Özel günler")).toBe(true);
    expect(matches("kafa bos", "Kafamı boşalt")).toBe(true);
    expect(matches("takvim gün", "Özel günler")).toBe(false);
    expect(matches("", "Herhangi")).toBe(true);
  });
});

describe("UI-R3 error reporter masking", () => {
  test("JWTs, bearer values, e-mails and long secret-like runs never leave the browser", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123_-";
    const text = maskReport(`TypeError: ${jwt} for ayse@example.test Bearer abc.def secret=${"A".repeat(30)}`);
    expect(text).not.toContain("eyJ");
    expect(text).not.toContain("ayse@example.test");
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("A".repeat(30));
    expect(text).toContain("TypeError");
    expect(maskReport("x".repeat(900)).length).toBeLessThanOrEqual(500);
  });
  test("browser family is coarse", () => {
    expect(browserFamily("Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge");
    expect(browserFamily("Mozilla/5.0 Firefox/141.0")).toBe("Firefox");
    expect(browserFamily("Mozilla/5.0 AppleWebKit Version/18 Safari/605")).toBe("Safari");
    expect(browserFamily("curl/8")).toBe("Other");
  });
});

describe("UI-R3 nudges", () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const block = (id: string, start: number, end: number) => ({
    id,
    startsAt: at(start),
    endsAt: at(end),
    completedAt: null,
    kind: "Work" as const,
    taskSnapshot: { task: { title: `İş ${id}` } } as never,
  });
  const base = { now, work: null, dismissed: new Set<string>(), notify: new Set<string>() };
  test("a calm strip shortly before a block starts and when it is about to end", () => {
    expect(pickNudge({ ...base, blocks: [block("a", 8, 60)] })?.text).toBe("8 dk sonra: İş a");
    expect(pickNudge({ ...base, blocks: [block("a", leadMinutes + 1, 60)] })).toBeNull();
    expect(pickNudge({ ...base, blocks: [block("b", -30, 4)] })?.text).toBe("İş b için ayrılan süre bitmek üzere.");
  });
  test("one alert rule: only the same Ready unread event suppresses its strip", () => {
    const rows = [
      { kind: "ScheduleStart", sourceId: "a", state: "Ready", readAt: null },
      { kind: "ScheduleEnd", sourceId: "b", state: "Ready", readAt: null },
      { kind: "ScheduleStart", sourceId: "c", state: "Pending", readAt: null },
      { kind: "ScheduleStart", sourceId: "d", state: "Ready", readAt: at(-1) },
      { kind: "ScheduleStart", sourceId: "e", state: "Obsolete", readAt: null },
    ] as Notification[];
    const notify = readyHintKeys(rows);
    expect(pickNudge({ ...base, notify, blocks: [block("a", 8, 60)] })).toBeNull();
    expect(pickNudge({ ...base, notify, blocks: [block("b", -30, 4)] })).toBeNull();
    for (const id of ["c", "d", "e", "another-block"])
      expect(pickNudge({ ...base, notify, blocks: [block(id, 8, 60)] })?.key).toBe(`start:${id}`);
  });
  test("dismissed strips do not ask again; completed blocks never nudge", () => {
    expect(pickNudge({ ...base, dismissed: new Set(["start:a"]), blocks: [block("a", 8, 60)] })).toBeNull();
    expect(pickNudge({ ...base, blocks: [{ ...block("a", 8, 60), completedAt: at(0) }] })).toBeNull();
  });
  test("hyperfocus asks only past the planned end or 1.5× own estimate, and never inside a focus session", () => {
    const work = { id: "w", activeSeconds: 1800, estimateSeconds: 1800, plannedEnd: null, focus: false };
    expect(pickNudge({ ...base, blocks: [], work })).toBeNull();
    const over = { ...work, activeSeconds: 1800 * hyperRatio };
    expect(pickNudge({ ...base, blocks: [], work: over })?.kind).toBe("hyper");
    expect(pickNudge({ ...base, blocks: [], work: { ...over, focus: true } })).toBeNull();
    expect(pickNudge({ ...base, blocks: [], work: { ...work, plannedEnd: at(-1) } })?.kind).toBe("hyper");
    expect(pickNudge({ ...base, blocks: [], work: over, dismissed: new Set(["hyper:w"]) })).toBeNull();
  });
});

describe("UI-R3 brain dump lines", () => {
  test("one task per non-empty line; trimmed; case-insensitive duplicates dropped; 50 at most", () => {
    expect(dumpLines("  Fatura öde \n\n fatura ÖDE\nSüt al\r\n  ")).toEqual({
      titles: ["Fatura öde", "Süt al"],
      skipped: 1,
      over: 0,
    });
    const many = Array.from({ length: dumpLimit + 5 }, (_, i) => `İş ${i}`).join("\n");
    const result = dumpLines(many);
    expect(result.titles).toHaveLength(dumpLimit);
    expect(result.over).toBe(5);
    expect(dumpLines("x".repeat(400)).titles[0]).toHaveLength(200);
  });
});

describe("UI-R3 gradual introduction", () => {
  test("at most one new tip per session and never after it was dismissed", () => {
    expect(mayShowTip("a", [], [])).toBe(true);
    expect(mayShowTip("a", [], ["a"])).toBe(true);
    expect(mayShowTip("b", [], ["a"])).toBe(false);
    expect(mayShowTip("a", ["a"], [])).toBe(false);
  });
});

describe("UI-R3 day glance", () => {
  const glance = {
    localDate: "2026-10-24",
    workingRemainingSeconds: 3600,
    plannedRemainingSeconds: "5400",
    unknownEstimateCount: 1,
    completedItemCount: 2,
    openItemCount: 3,
    actualSeconds: 0,
    overCapacity: true,
    hints: [{ taskId: "t", energyDemand: "Low", nextStep: { noteId: "n", text: "Dosyayı aç" } }],
    planningVersion: 4,
    serverNow: "2026-10-24T10:00:00Z",
  } as never;
  test("server numbers are accepted as given; a wrong day or shape is a protocol error", () => {
    expect(readGlance(glance, "2026-10-24")).toBe(glance);
    expect(() => readGlance(glance, "2026-10-25")).toThrow();
    expect(() => readGlance({ ...(glance as object), overCapacity: "yes" } as never, "2026-10-24")).toThrow();
    expect(() => readGlance({ ...(glance as object), openItemCount: -1 } as never, "2026-10-24")).toThrow();
  });
  test("spans are whole minutes", () => {
    expect(span(3600 * 4 + 20 * 60 + 59)).toBe("4 sa 20 dk");
    expect(span(35 * 60)).toBe("35 dk");
    expect(span(7200)).toBe("2 sa");
    expect(span(-5)).toBe("0 dk");
  });
});

describe("UI-R3 batch receipts", () => {
  const id = "00000000-0000-4000-8000-000000000001",
    taskId = "00000000-0000-4000-8000-000000000002";
  const expected = [{ id, taskId }],
    date = "2026-10-25";
  const receipt = {
    changeSetId: "00000000-0000-4000-8000-000000000003",
    planningVersion: 4,
    items: [{ id, taskId, localDate: date, completedAt: null }],
  } as never;
  test("only the same identities moved to the requested day establish success", () => {
    expect(acceptDayItemBatch(receipt, expected, date)).toBe(receipt);
    for (const value of [{}, { ...(receipt as object), items: [] }, { ...(receipt as object), planningVersion: null }])
      expect(() => acceptDayItemBatch(value as never, expected, date)).toThrow();
    expect(() => acceptDayItemBatch(receipt, [{ id, taskId: id }], date)).toThrow();
    expect(() => acceptDayItemBatch(receipt, expected, "2026-10-26")).toThrow();
  });
});

describe("UI-R3 special days", () => {
  test("the accessible name never relies on colour", () => {
    expect(occurrenceName({ kind: "Birthday", title: "Annem", nonWorking: false })).toBe("doğum günü: Annem");
    expect(occurrenceName({ kind: "Holiday", title: "Bayram", nonWorking: true })).toBe("tatil: Bayram (çalışma dışı)");
  });
  test("a new draft round-trips to a create body", () => {
    const draft = toDraft(undefined, "2026-11-03");
    expect(() => toBody({ ...draft, title: "" }, 2026)).toThrow();
    expect(toBody({ ...draft, title: "Annem" }, 2026)).toMatchObject({ title: "Annem" });
  });
});

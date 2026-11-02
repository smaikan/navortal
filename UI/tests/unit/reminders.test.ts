import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../src/lib/api/client";
import {
  canRetry,
  dueInput,
  readJob,
  readJobs,
  readReminder,
  readReminders,
  reminderFields,
  type Job,
  type Reminder,
} from "../../src/features/reminders/model";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002",
  at = "2027-01-12T09:00:00.123456Z";
const r: Reminder = { id, title: "Bir adım", taskId: null, dueAt: at, canceled: false, version: "9007199254740993" };
const job: Job = {
  id,
  kind: "NotificationReady",
  sourceId: other,
  sourceVersion: 0,
  state: "Failed",
  attempts: 5,
  occurredAt: at,
  availableAt: at,
  leaseUntil: null,
  completedAt: null,
  lastErrorCode: "push_retry",
  version: r.version,
};
describe("custom reminder wire and intent", () => {
  it("weekly repetition is explicit, uses selected days and keeps task binding empty", () => {
    const repeat = { timeZoneId: "Europe/Istanbul", localTime: "12:00:00", weekDays: [1, 4] };
    expect(readReminder({ ...r, repeat }).repeat).toEqual(repeat);
    const precise = { ...r, dueAt: "2027-01-12T09:00:37.123456Z" };
    expect(
      reminderFields("Su iç", dueInput(precise.dueAt, "Europe/Istanbul"), "Europe/Istanbul", "", "", precise, repeat)
        .dueAt,
    ).toBe("2027-01-12T09:00:00Z");
    expect(reminderFields("Su iç", "2027-01-12T12:00", "Europe/Istanbul", "", "", undefined, repeat)).toMatchObject({
      taskId: null,
      repeat,
    });
    expect(reminderFields("Bir kez", "2027-01-12T12:00", "Europe/Istanbul", "", "", undefined, null)).toHaveProperty(
      "repeat",
      null,
    );
    expect(() =>
      reminderFields("Su iç", "2027-01-12T12:00", "Europe/Istanbul", "", "", undefined, { ...repeat, weekDays: [] }),
    ).toThrow();
    for (const patch of [
      { weekDays: [1, 1] },
      { weekDays: [] },
      { localTime: "25:99:00" },
      { timeZoneId: "unknown/zone" },
    ])
      expect(() => readReminder({ ...r, repeat: { ...repeat, ...patch } })).toThrow();
  });
  it("keeps precise version/instant and full PUT fields even for a title-only edit", () => {
    expect(readReminder(r)).toEqual(r);
    const fields = reminderFields(" Yeni başlık ", dueInput(at, "Europe/Istanbul"), "Europe/Istanbul", "", "", r);
    expect(fields).toEqual({ title: "Yeni başlık", dueAt: at, taskId: null, version: r.version });
  });
  it("create does not invent a version, task or instant; DST ambiguity/gap are explicit", () => {
    const fields = reminderFields("Hatırla", "2027-01-12T12:00:00", "Europe/Istanbul", "", "");
    expect(fields).toEqual({ title: "Hatırla", dueAt: "2027-01-12T09:00:00Z", taskId: null });
    expect(() => reminderFields("Hatırla", "2026-10-25T02:30:00", "Europe/Berlin", "", "")).toThrow();
    expect(() => reminderFields("Hatırla", "2026-03-29T02:30:00", "Europe/Berlin", "", "")).toThrow();
    expect(reminderFields("Hatırla", "2026-10-25T02:30:00", "Europe/Berlin", "later", other).dueAt).toBe(
      "2026-10-25T01:30:00Z",
    );
  });
  it.each([
    { title: " " },
    { title: "a".repeat(201) },
    { version: 0 },
    { version: 9007199254740992 },
    { canceled: null },
    { dueAt: "yarın" },
    { taskId: "bad" },
  ])("rejects malformed reminder %j", patch => {
    expect(() => readReminder({ ...r, ...patch } as never)).toThrow();
  });
  it("bounded arrays reject duplicate IDs; missing totals are never invented", () => {
    expect(readReminders([r])).toEqual([r]);
    expect(() => readReminder(r, other)).toThrow();
    expect(() => readReminders([r, r])).toThrow();
    expect(() => readReminders(Array(27).fill(r))).toThrow();
  });
  it.each(["", "a".repeat(201)])("rejects empty/long titles before writes", title => {
    expect(() => reminderFields(title, "2027-01-12T12:00", "Europe/Istanbul", "", "")).toThrow();
  });
});
describe("owner job recovery", () => {
  it.each(["Pending", "Processing", "Completed", "Obsolete", "Failed"] as const)(
    "only Failed can retry (%s)",
    state => {
      expect(canRetry(readJob({ ...job, state }))).toBe(state === "Failed");
    },
  );
  it.each([
    { state: "Ready" },
    { version: 0 },
    { sourceId: null },
    { attempts: -1 },
    { availableAt: null },
    { lastErrorCode: "a".repeat(101) },
  ])("rejects malformed job %j", patch => {
    expect(() => readJob({ ...job, ...patch } as never)).toThrow();
  });
  it("checks page scope/identity instead of displaying a foreign retry target", () => {
    const p = { items: [job], offset: 0, limit: 25, total: 1 };
    expect(readJobs(p, 0, "Failed")).toEqual(p);
    expect(() => readJobs(p, 25, "Failed")).toThrow();
    expect(() => readJobs(p, 0, "Pending")).toThrow();
    expect(() => readJob(job, other)).toThrow();
  });
});
describe("endpoint-specific replay", () => {
  it("a lost create reuses exactly the key/body and makes no automatic second request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(r), { status: 201, headers: { "Content-Type": "application/json" } }),
      );
    const api = createApiClient({
      identity: () => ({ epoch: 1, active: true, verified: true }),
      onUnauthorized: vi.fn(),
      fetch: fetcher,
      newKey: () => "same-intent",
    });
    const c = api.mutation("/api/notifications/reminders", "post", {
      body: { title: r.title, dueAt: at, taskId: null },
    });
    await expect(c.execute()).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(c.execute()).rejects.toMatchObject({ outcomeUnknown: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readReminder(await c.execute({ retryUnknownResult: true })).id).toBe(id);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]!.body).toBe(fetcher.mock.calls[0][1]!.body);
    expect(fetcher.mock.calls[1][1]!.headers).toMatchObject({ "Idempotency-Key": "same-intent" });
  });
  it("cancel and job retry are keyless and cannot replay an unknown response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("lost"));
    const api = createApiClient({
      identity: () => ({ epoch: 1, active: true, verified: true }),
      onUnauthorized: vi.fn(),
      fetch: fetcher,
    });
    for (const c of [
      api.mutation("/api/notifications/reminders/{id}/cancel", "post", { path: { id }, body: { version: r.version } }),
      api.mutation("/api/jobs/outbox/{id}/retry", "post", { path: { id }, body: { version: job.version } }),
    ]) {
      await expect(c.execute()).rejects.toMatchObject({ outcomeUnknown: true });
      await expect(c.execute({ retryUnknownResult: true })).rejects.toMatchObject({ outcomeUnknown: true });
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

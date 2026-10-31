import { describe, expect, it } from "vitest";
import {
  clock,
  coveredSeconds,
  displaySeconds,
  readSegments,
  readSync,
  readWork,
  resyncAfter,
  spoken,
  workFailure,
  type Segment,
  type Work,
} from "../../src/features/work/model";
import { ApiError } from "../../src/lib/api/errors";

const id = "00000000-0000-0000-0000-000000000001";
const work: Work = {
  id,
  taskId: "00000000-0000-0000-0000-000000000002",
  state: "Running",
  source: "Timer",
  startedAt: "2026-10-18T06:00:00Z",
  endedAt: null,
  timeZoneId: "Europe/Istanbul",
  taskAtStart: null,
  version: 3,
  activeSeconds: "120.5",
  serverNow: "2026-10-18T06:02:00Z",
  recordedAt: "2026-10-18T06:00:00Z",
  startedScheduleId: null,
  startedRevisionItemId: null,
};
const segment = (n: number, start: string, end: string | null, isVoided = false): Segment => ({
  id: `00000000-0000-0000-0000-00000000010${n}`,
  startedAt: start,
  endedAt: end,
  isVoided,
  version: 1,
});

describe("timer display", () => {
  it("adds only monotonic time since the server value for a running session", () => {
    expect(displaySeconds(work, 1000, 1000)).toBe(120.5);
    expect(displaySeconds(work, 1000, 6000)).toBe(125.5);
    // Değer gelmeden önce alınan monoton saat, gelen süreyi azaltmamalı.
    expect(displaySeconds(work, 1000, 500)).toBe(120.5);
  });
  it("does not grow while paused, whatever the clock says", () => {
    expect(displaySeconds({ ...work, state: "Paused" }, 1000, 3_600_000)).toBe(120.5);
  });
  it("formats and speaks durations without rounding up", () => {
    expect([clock(0), clock(59.9), clock(61), clock(3600), clock(3725)]).toEqual([
      "0:00",
      "0:59",
      "1:01",
      "1:00:00",
      "1:02:05",
    ]);
    expect(spoken(3725)).toBe("1 saat 2 dakika 5 saniye");
    expect(spoken(0)).toBe("0 saniye");
    expect(spoken(3600)).toBe("1 saat");
  });
});

describe("active versus covered", () => {
  it("09:00–09:20 and 09:50–10:30 are 60 active and 90 covered minutes", () => {
    const segments = [
      segment(1, "2026-10-17T06:00:00Z", "2026-10-17T06:20:00Z"),
      segment(2, "2026-10-17T06:50:00Z", "2026-10-17T07:30:00Z"),
    ];
    expect(coveredSeconds(segments, "2026-10-17T08:00:00Z")).toBe(90 * 60);
  });
  it("ignores voided segments and extends an open segment with the server's now plus elapsed time", () => {
    expect(
      coveredSeconds(
        [
          segment(1, "2026-10-17T05:00:00Z", "2026-10-17T05:10:00Z", true),
          segment(2, "2026-10-17T06:00:00Z", "2026-10-17T06:05:00Z"),
        ],
        "2026-10-17T08:00:00Z",
      ),
    ).toBe(300);
    expect(coveredSeconds([segment(1, "2026-10-17T06:00:00Z", null)], "2026-10-17T06:01:00Z", 30)).toBe(90);
    expect(
      coveredSeconds([segment(1, "2026-10-17T06:00:00Z", "2026-10-17T06:01:00Z", true)], "2026-10-17T07:00:00Z"),
    ).toBeNull();
  });
});

describe("work responses", () => {
  it("accepts decimal-string seconds and exact versions; rejects malformed states and times", () => {
    expect(readWork(work).activeSeconds).toBe("120.5");
    for (const changes of [
      { state: "Stopped" },
      { activeSeconds: "-1" },
      { serverNow: "dün" },
      { version: 0 },
      { taskId: "bad" },
    ])
      expect(() => readWork({ ...work, ...changes } as Work)).toThrow();
  });
  it("accepts a sync without a session and rejects a malformed one", () => {
    expect(
      readSync({
        serverNow: work.serverNow,
        planningVersion: "9007199254740993",
        workSessionId: null,
        focusSessionId: null,
      }).workSessionId,
    ).toBeNull();
    expect(() =>
      readSync({ serverNow: work.serverNow, planningVersion: 1, workSessionId: "x", focusSessionId: null }),
    ).toThrow();
  });
  it("validates segment pages", () => {
    expect(readSegments({ items: [segment(1, work.startedAt, null)], offset: 0, limit: 100, total: 1 }).total).toBe(1);
    expect(() =>
      readSegments({
        items: [{ ...segment(1, work.startedAt, null), isVoided: "no" as never }],
        offset: 0,
        limit: 100,
        total: 1,
      }),
    ).toThrow();
  });
});

describe("work failures", () => {
  it("explains conflicts and tells finish apart from task completion", () => {
    expect(workFailure(new ApiError("http", "", 409, "work_already_running"))).toContain("Başka bir çalışma");
    expect(workFailure(new ApiError("http", "", 409, "session_paused"))).toContain("duraklatılmış");
    expect(workFailure(new ApiError("http", "", 409, "predecessor_incomplete"))).toContain("ön koşul");
    expect(workFailure(new ApiError("http", "", 404, "session_not_found"))).toContain("bu hesaba ait olmayabilir");
  });
  it("resolves definitive conflicts by reading, and never treats an uncertain write as one", () => {
    expect(resyncAfter(new ApiError("http", "", 409, "version_conflict"))).toBe(true);
    expect(resyncAfter(new ApiError("network", "", 0, "version_conflict", {}, undefined, undefined, true))).toBe(false);
    expect(workFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
      "otomatik tekrar gönderilmedi",
    );
  });
});

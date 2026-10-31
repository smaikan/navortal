import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/lib/api/errors";
import { resolveWallTime, wallTimeIsAmbiguous } from "../../src/lib/time/wall-time";
import { resolveDeadline } from "../../src/features/tasks/deadline";
import {
  correctionFailure,
  dayRangeText,
  emptyRange,
  localInput,
  rangeBody,
  rangeText,
  readCorrections,
  readWorkPage,
  reasonLimit,
} from "../../src/features/work/journal";

const ny = "America/New_York";
const ist = "Europe/Istanbul";
const draft = (start: string, end: string, reason = "Unutulan çalışma") => ({ ...emptyRange, start, end, reason });
const id = (n: number) => `01a14299-80c6-764d-8ddb-2c053ad737${String(n).padStart(2, "0")}`;
const segment = {
  id: id(1),
  startedAt: "2026-10-15T06:00:00+00:00",
  endedAt: "2026-10-15T07:00:00+00:00",
  isVoided: false,
  version: 1,
};

describe("wall time resolution", () => {
  it("rejects a local time inside a DST gap and asks for a choice inside an overlap", () => {
    expect(() => resolveWallTime("2026-03-08T02:30:00", ny, "")).toThrow("yaz saati geçişinde bulunmuyor");
    expect(wallTimeIsAmbiguous("2026-11-01T01:30:00", ny)).toBe(true);
    expect(wallTimeIsAmbiguous("2026-11-01T03:30:00", ny)).toBe(false);
    expect(wallTimeIsAmbiguous("not-a-time", ny)).toBe(false);
    expect(() => resolveWallTime("2026-11-01T01:30:00", ny, "")).toThrow("iki kez yaşanıyor");
    expect(resolveWallTime("2026-11-01T01:30:00", ny, "earlier")).toBe("2026-11-01T05:30:00Z");
    expect(resolveWallTime("2026-11-01T01:30:00", ny, "later")).toBe("2026-11-01T06:30:00Z");
  });
  it("keeps seconds and the deadline rules unchanged", () => {
    expect(resolveWallTime("2026-10-15T09:00:05", ist, "")).toBe("2026-10-15T06:00:05Z");
    expect(resolveDeadline("", ist, "")).toBeNull();
    expect(() => resolveDeadline("9999-01-01T00:00", ist, "")).toThrow("2–9998");
    expect(localInput("2026-10-15T06:00:05+00:00", ist)).toBe("2026-10-15T09:00:05");
    expect(localInput("2026-10-15T06:00:00+00:00", ist)).toBe("2026-10-15T09:00");
  });
});

describe("manual/correction range body", () => {
  it("requires start, end (unless the segment may stay open), an increasing range and a reason", () => {
    expect(() => rangeBody(draft("", "2026-10-15T10:00:00"), ist, false)).toThrow("Başlangıç");
    expect(() => rangeBody(draft("2026-10-15T09:00:00", ""), ist, false)).toThrow("Bitiş zamanını gir");
    expect(rangeBody(draft("2026-10-15T09:00:00", ""), ist, true).endedAt).toBeNull();
    expect(() => rangeBody(draft("2026-10-15T09:00:00", "2026-10-15T09:00:00"), ist, false)).toThrow(
      "başlangıçtan sonra",
    );
    expect(() => rangeBody(draft("2026-10-15T09:00:00", "2026-10-15T08:59:59"), ist, false)).toThrow(
      "başlangıçtan sonra",
    );
    expect(() => rangeBody(draft("2026-10-15T09:00:00", "2026-10-15T09:00:01", "   "), ist, false)).toThrow(
      "Neden gerekli",
    );
    expect(() =>
      rangeBody(draft("2026-10-15T09:00:00", "2026-10-15T09:00:01", "a".repeat(reasonLimit + 1)), ist, false),
    ).toThrow("Neden gerekli");
    expect(
      rangeBody(draft("2026-10-15T09:00:00", "2026-10-15T09:00:01", ` ${"a".repeat(reasonLimit)} `), ist, false),
    ).toEqual({ startedAt: "2026-10-15T06:00:00Z", endedAt: "2026-10-15T06:00:01Z", reason: "a".repeat(reasonLimit) });
  });
  it("compares instants, not wall labels, across a DST change", () => {
    // İlk 01:50 EDT'den ikinci 01:10 EST'ye 20 dakika vardır, yazı geriye gidiyor gibi görünse de.
    expect(
      rangeBody(
        { ...draft("2026-11-01T01:50:00", "2026-11-01T01:10:00"), startChoice: "earlier", endChoice: "later" },
        ny,
        false,
      ),
    ).toMatchObject({ startedAt: "2026-11-01T05:50:00Z", endedAt: "2026-11-01T06:10:00Z" });
  });
});

describe("work log decoding and messages", () => {
  it("rejects malformed journal and work pages", () => {
    const entry = {
      id: id(2),
      sessionId: id(3),
      segmentId: segment.id,
      sequence: 2,
      kind: "Adjusted",
      reason: "x",
      createdAt: "2026-10-15T09:00:00+00:00",
      previousValues: segment,
      newValues: { ...segment, isVoided: true, version: 2 },
      previousSession: null,
      newSession: { startedAt: segment.startedAt, endedAt: segment.endedAt, state: "Finished" as const, version: 2 },
    };
    expect(readCorrections({ items: [entry], offset: 0, limit: 50, total: 1 }).total).toBe(1);
    expect(() => readCorrections({ items: [{ ...entry, sequence: 0 }], offset: 0, limit: 50, total: 1 })).toThrow();
    expect(() =>
      readCorrections({
        items: [{ ...entry, newValues: { ...segment, startedAt: "dün" } }],
        offset: 0,
        limit: 50,
        total: 1,
      }),
    ).toThrow();
    expect(() => readWorkPage({ items: [], offset: 0, limit: 25, total: -1 })).toThrow();
  });
  it("maps correction codes and never claims a write for an unknown result", () => {
    const code = (value: string, status = 409) => new ApiError("http", "x", status, value, {});
    expect(correctionFailure(code("work_overlap"))).toContain("çakışıyor");
    expect(correctionFailure(code("correction_cannot_resume"))).toContain("Devam et");
    expect(correctionFailure(code("version_conflict"))).toContain("taslağın korundu");
    expect(correctionFailure(code("work_range_invalid", 400))).toContain("gelecekte olamaz");
    expect(correctionFailure(new ApiError("network", "x", 0, undefined, {}, undefined, undefined, true))).toContain(
      "Kaydedilmiş olabilir",
    );
    expect(correctionFailure(new RangeError("Bitiş zamanını gir."))).toBe("Bitiş zamanını gir.");
  });
});

describe("day-scoped work range", () => {
  const segment = (startedAt: string, endedAt: string | null, isVoided = false) => ({
    id: "s",
    startedAt,
    endedAt,
    isVoided,
    version: 1,
  });
  it("shows only clock times inside one local day and the full range across midnight or while running", () => {
    expect(dayRangeText(segment("2026-10-26T07:00:00Z", "2026-10-26T09:30:00Z"), "Europe/Istanbul")).toBe(
      "10:00–12:30",
    );
    const overnight = segment("2026-10-26T20:30:00Z", "2026-10-26T21:30:00Z");
    expect(dayRangeText(overnight, "Europe/Istanbul")).toBe(rangeText(overnight, "Europe/Istanbul"));
    const running = segment("2026-10-26T07:00:00Z", null);
    expect(dayRangeText(running, "Europe/Istanbul")).toBe(rangeText(running, "Europe/Istanbul"));
  });
});

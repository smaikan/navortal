import { describe, expect, it } from "vitest";
import type { Settings } from "../../src/features/focus/model";
import {
  clockAt,
  cycleSegments,
  cyclePosition,
  longBreakLabel,
  rhythmName,
  rhythmSummary,
  roundSeconds,
  shortTime,
  spanText,
} from "../../src/features/focus/rhythm";

const base: Settings = {
  workSeconds: 1500,
  shortBreakSeconds: 300,
  longBreakSeconds: 900,
  longBreakEvery: 4,
  targetBehavior: "ContinueTracking",
  soundEnabled: true,
  notificationsEnabled: true,
};

describe("focus rhythm display", () => {
  it("names the three built-ins and falls back to durations for anything else", () => {
    expect(rhythmName({ ...base, workSeconds: 900 })).toBe("Kısa adım");
    expect(rhythmName(base)).toBe("Klasik");
    expect(rhythmName({ ...base, workSeconds: 2700, shortBreakSeconds: 600 })).toBe("Derin odak");
    // Yalnız mola farklıysa hazır ad verilmez.
    expect(rhythmName({ ...base, shortBreakSeconds: 600 })).toBe("25 dk / 10 dk");
    expect(rhythmName({ ...base, workSeconds: 3, shortBreakSeconds: 1 })).toBe("3 sn / 1 sn");
  });
  it("keeps seconds visible when a duration is not whole minutes", () => {
    expect(shortTime(1200)).toBe("20 dk");
    expect(shortTime(90)).toBe("90 sn");
    expect(longBreakLabel({ ...base, longBreakEvery: 3, longBreakSeconds: 1200 })).toBe(
      "3 döngüde bir 20 dk uzun mola",
    );
    expect(rhythmSummary(base)).toBe("25 dk çalışma / 5 dk mola · 4 döngüde bir 15 dk uzun mola");
  });
  it("builds one round with a single long break at the end", () => {
    const segments = cycleSegments({ ...base, longBreakEvery: 3 });
    expect(segments.map(s => s.kind)).toEqual(["work", "short", "work", "short", "work", "long"]);
    expect(segments.at(-1)!.seconds).toBe(900);
    expect(cycleSegments({ ...base, longBreakEvery: 1 }).map(s => s.kind)).toEqual(["work", "long"]);
    expect(cycleSegments({ ...base, longBreakEvery: 20 })).toHaveLength(40);
  });
  it("sums a round without adding a short break before the long one", () => {
    // 4 × 25 + 3 × 5 + 15 = 130 dk
    expect(roundSeconds(base)).toBe(7800);
    expect(spanText(7800)).toBe("2 sa 10 dk");
    expect(spanText(3600)).toBe("1 sa");
    expect(spanText(45)).toBe("45 sn");
  });
  it("places the cycle within its long-break group", () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(n => cyclePosition(n, 4))).toEqual([1, 2, 3, 4, 1, 4, 1]);
    expect(cyclePosition(7, 1)).toBe(1);
  });
  it("formats the end time in the user's zone, not the browser's", () => {
    const at = Date.UTC(2026, 10, 7, 12, 5);
    expect(clockAt(at, "Europe/Istanbul")).toBe("15:05");
    expect(clockAt(at, "UTC")).toBe("12:05");
  });
});

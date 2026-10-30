import { afterEach, expect, test, vi } from "vitest";
import { dateFormat } from "../../src/lib/date-format";
import { localToday } from "../../src/features/preferences/model";
import { minutes, timeText } from "../../src/features/planning/model";

afterEach(() => vi.useRealTimers());

test("reused presentation formatters preserve DST, seconds, zone and hour format", () => {
  expect(timeText("2026-03-29T00:30:15Z", "Europe/Berlin")).toBe("01:30:15");
  expect(timeText("2026-03-29T01:30:45Z", "Europe/Berlin")).toBe("03:30:45");
  expect(timeText("2026-03-29T01:30:45Z", "UTC")).toBe("01:30:45");
  expect(timeText("2026-03-29T13:30:45Z", "UTC", "12h")).toBe(
    new Intl.DateTimeFormat("tr-TR", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date("2026-03-29T13:30:45Z")),
  );
  expect(minutes(null)).toBe("Bilinmiyor");
  expect(minutes(0)).toBe("0 dk");
  expect(minutes(90)).toBe("1,5 dk");
});

test("caching a formatter never caches today's date across local midnight or a zone change", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T20:59:59Z"));
  expect(localToday("Europe/Istanbul")).toBe("2026-10-25");
  vi.setSystemTime(new Date("2026-10-25T21:00:00Z"));
  expect(localToday("Europe/Istanbul")).toBe("2026-10-26");
  expect(localToday("UTC")).toBe("2026-10-25");
});

test("invalid zones still fail closed and do not poison another formatter", () => {
  for (let i = 0; i < 2; i++) expect(() => localToday("Invalid/Place")).toThrow(RangeError);
  expect(localToday("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("the shared formatter working set stays bounded when many zones are visited", () => {
  const options = { timeZone: "UTC", year: "numeric" } as const;
  const first = dateFormat("en", options);
  expect(dateFormat("en", { ...options })).toBe(first);
  for (const timeZone of Intl.supportedValuesOf("timeZone").slice(0, 40)) dateFormat("en", { ...options, timeZone });
  expect(dateFormat("en", options)).not.toBe(first);
});

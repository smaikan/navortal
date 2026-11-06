import { expect, test } from "vitest";
import { phaseOf, shortTime } from "../../src/features/planning/agenda-blocks";
import { shiftDate } from "../../src/features/planning/day-nav";
import { isTheme, themeBootstrap } from "../../src/lib/theme";
import type { Schedule } from "../../src/features/planning/model";

const block = (startsAt: string, endsAt: string) => ({ startsAt, endsAt }) as Schedule;

test("day arrows are civil-date arithmetic across month, leap day, year and DST boundaries", () => {
  expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
  expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
  expect(shiftDate("2027-03-28", 1)).toBe("2027-03-29");
  expect(shiftDate("2027-10-31", -1)).toBe("2027-10-30");
  expect(shiftDate("0002-01-02", -1)).toBe("0002-01-01");
});

test("short time drops only a zero seconds tail; real seconds and 12h format stay exact", () => {
  expect(shortTime("2026-10-22T06:00:00Z", "Europe/Istanbul", "24h")).toBe("09:00");
  expect(shortTime("2026-10-22T06:00:30Z", "Europe/Istanbul", "24h")).toBe("09:00:30");
  expect(shortTime("2026-10-22T21:00:00Z", "Europe/Istanbul", "24h")).toBe("00:00");
  expect(shortTime("2026-10-22T06:00:00Z", "Europe/Istanbul", "12h")).not.toMatch(/:00:00/);
});

test("block phase uses half-open intervals: the end instant is already past, the start instant is current", () => {
  const b = block("2026-10-22T06:00:00Z", "2026-10-22T07:00:00Z");
  expect(phaseOf(b, Date.parse("2026-10-22T05:59:59Z"))).toBe("next");
  expect(phaseOf(b, Date.parse("2026-10-22T06:00:00Z"))).toBe("current");
  expect(phaseOf(b, Date.parse("2026-10-22T06:59:59Z"))).toBe("current");
  expect(phaseOf(b, Date.parse("2026-10-22T07:00:00Z"))).toBe("past");
});

test("theme values are a closed set and the head bootstrap never trusts an unknown stored value", () => {
  expect(["light", "dark", "system"].every(isTheme)).toBe(true);
  for (const bad of ["", "Dark", "blue", null, undefined, 1]) expect(isTheme(bad)).toBe(false);
  const run = (stored: string | null) => {
    const root = { dataset: {} as Record<string, string> };
    new Function("localStorage", "document", themeBootstrap)({ getItem: () => stored }, { documentElement: root });
    return root.dataset.theme;
  };
  expect(run("dark")).toBe("dark");
  expect(run("system")).toBe("system");
  expect(run("<script>")).toBe("light");
  expect(run(null)).toBe("light");
  const blocked = { dataset: {} as Record<string, string> };
  new Function("localStorage", "document", themeBootstrap)(
    {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    { documentElement: blocked },
  );
  expect(blocked.dataset.theme).toBe("light");
});

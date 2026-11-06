import { expect, test } from "vitest";
import { nextHourZone } from "../e2e/helpers/fixture-zone";
test("every UTC hour changes the fixture's zone by one hour without crossing the civil date", () => {
  for (let hour = 0; hour < 24; hour++) {
    const now = new Date(Date.UTC(2026, 9, 21, hour, 15));
    let offset = 9 - hour;
    if (offset < -12) offset += 24;
    const frozen = offset === 0 ? "Etc/UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`,
      next = nextHourZone(frozen);
    const date = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short" }).format(now);
    expect(next).not.toBe(frozen);
    expect(date(next)).toBe(date(frozen));
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: next, hour: "2-digit", hourCycle: "h23" }).format(now)).toBe(
      "10",
    );
  }
  expect(nextHourZone("Etc/GMT-11")).toBe("Etc/GMT-12");
  expect(() => nextHourZone("Europe/Istanbul")).toThrow();
});

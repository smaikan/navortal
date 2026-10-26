import { Temporal } from "temporal-polyfill";
import { resolveWallTime } from "../../lib/time/wall-time";
export function deadlineLocal(instant: string | null, zone: string) {
  return instant === null
    ? ""
    : Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "second" });
}
export function resolveDeadline(local: string, zone: string, choice: "" | "earlier" | "later"): string | null {
  if (!local) return null;
  const wall = Temporal.PlainDateTime.from(local);
  if (wall.year < 2 || wall.year > 9998) throw new RangeError("Son teslim yılı 2–9998 arasında olmalı.");
  return resolveWallTime(local, zone, choice);
}

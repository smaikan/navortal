import { Temporal } from "temporal-polyfill";
import { resolveWallTime } from "../../lib/time/wall-time";

/** Plan gününde HH:MM başlangıç/bitiş. Bitiş başlangıçtan erken veya eşitse ertesi gün; gece yarısını backend böler. */
export function timeRange(date: string, zone: string, start: string, end: string) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end))
    throw new RangeError("Başlangıç ve bitiş saatini gir.");
  const nextDay = end <= start;
  const endDate = nextDay ? Temporal.PlainDate.from(date).add({ days: 1 }).toString() : date;
  return {
    startsAt: resolveWallTime(`${date}T${start}:00`, zone, ""),
    endsAt: resolveWallTime(`${endDate}T${end}:00`, zone, ""),
    nextDay,
  };
}
export function partialTimeRange(date: string, zone: string, start: string, end: string) {
  if (end) return timeRange(date, zone, start, end);
  if (!start) return { startsAt: null, endsAt: null, nextDay: false };
  if (!/^\d{2}:\d{2}$/.test(start)) throw new RangeError("Geçerli başlangıç saati gir.");
  return { startsAt: resolveWallTime(`${date}T${start}:00`, zone, ""), endsAt: null, nextDay: false };
}

import { Temporal } from "temporal-polyfill";

/** Tek gün girilirse bir günlük aralık olur. İkisi boşsa aralık temizlenir. */
export function rangeBody(from: string, to: string): { plannedFrom: string | null; plannedTo: string | null } {
  if (!from && !to) return { plannedFrom: null, plannedTo: null };
  const start = from || to,
    end = to || from;
  try {
    if (![start, end].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) throw new Error();
    if ([start, end].some(value => Temporal.PlainDate.from(value).year < 1)) throw new Error();
  } catch {
    throw new RangeError("Geçerli bir tarih gir.");
  }
  if (start > end) throw new RangeError("Bitiş günü başlangıçtan önce olamaz.");
  if (Temporal.PlainDate.from(start).until(end).days > 366) throw new RangeError("Aralık en çok 367 gün olabilir.");
  return { plannedFrom: start, plannedTo: end };
}

import { Temporal } from "temporal-polyfill";
import { resolveWallTime } from "../../lib/time/wall-time";
import { type Draft, type Schedule } from "./model";

export function localInput(value: string, zone: string) {
  return Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "second" });
}
export function dayWindow(date: string, zone: string) {
  const start = Temporal.PlainDate.from(date).toZonedDateTime(zone);
  return { from: start.toInstant().toString(), to: start.add({ days: 1 }).toInstant().toString() };
}
export function initialDraft(date: string, zone: string, block?: Schedule): Draft {
  return {
    start: block ? localInput(block.startsAt, zone) : `${date}T09:00:00`,
    end: block ? localInput(block.endsAt, zone) : `${date}T10:00:00`,
    startChoice: "",
    endChoice: "",
    kind: block?.kind ?? "Work",
    fixed: block?.isFixed ?? false,
    locked: block?.isLocked ?? false,
    conflicts: false,
    protected: false,
    reason: "",
  };
}
export function rangeBody(draft: Draft, date: string, zone: string) {
  if (!draft.start || !draft.end) throw new RangeError("Başlangıç ve bitiş zamanlarını gir.");
  const startsAt = resolveWallTime(draft.start, zone, draft.startChoice),
    endsAt = resolveWallTime(draft.end, zone, draft.endChoice);
  if (Temporal.Instant.compare(startsAt, endsAt) >= 0) throw new RangeError("Bitiş başlangıçtan sonra olmalı.");
  if (
    Temporal.Instant.from(endsAt).epochMilliseconds - Temporal.Instant.from(startsAt).epochMilliseconds >
    7 * 86400000
  )
    throw new RangeError("Bir blok en çok 7 gün olabilir.");
  if (Temporal.PlainDateTime.from(draft.start).toPlainDate().toString() !== date)
    throw new RangeError("Başlangıç seçilen plan gününde olmalı.");
  if (draft.reason.length > 2000) throw new RangeError("Neden en çok 2000 karakter olabilir.");
  return {
    startsAt,
    endsAt,
    isFixed: draft.fixed,
    isLocked: draft.locked,
    allowConflicts: draft.conflicts,
    reason: draft.reason.trim() || null,
  };
}

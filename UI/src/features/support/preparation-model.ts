import { ApiError } from "../../lib/api/errors";
import { readTask } from "../tasks/model";
import { readCalendarDay } from "../calendar/model";
import type { EndPreparation } from "./model";
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
function invalid(): never {
  throw new ApiError("protocol", "Destek yanıtı doğrulanamadı. Güncel durumu yeniden oku.");
}
export function readPreparation(v: EndPreparation, date: string, offset: number): EndPreparation {
  if (
    !v ||
    !v.openWork ||
    v.openWork.localDate !== date ||
    !Array.isArray(v.openWork.items) ||
    v.openWork.items.length > 25 ||
    !integer(v.openWork.total) ||
    Number(v.openWork.total) < v.openWork.items.length ||
    Number(v.openWork.offset) !== offset ||
    Number(v.openWork.limit) !== 25 ||
    !integer(v.openWork.planningVersion) ||
    !Array.isArray(v.availableActions) ||
    !v.availableActions.every(x => typeof x === "string")
  )
    invalid();
  readCalendarDay(v.day, date, { plan: 0, actual: 0, completions: 0 }, undefined, 50);
  if (String(v.openWork.planningVersion) !== String(v.day.summary.planningVersion)) invalid();
  v.openWork.items.forEach(t => {
    readTask(t);
    if (
      t.archivedAt !== null ||
      !t.hasDirectWork ||
      !["Pending", "InProgress", "Paused"].includes(t.state) ||
      t.directWorkCompleted
    )
      invalid();
  });
  return v;
}

import type { components } from "../../lib/api/generated/schema";
import { validTaskId } from "../../components/layout/task-panel-url";
import { ApiError } from "../../lib/api/errors";
export type Revision = components["schemas"]["RevisionView"];
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) >= BigInt(min) && BigInt(v) <= 9223372036854775807n;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApiError("protocol", "Geçmiş yanıtı doğrulanamadı. Başka bir kaydın verisiyle tamamlanmadı; yeniden oku.");
}
export function readRevision(v: Revision, expectedId?: string, dayId?: string | null): Revision {
  if (
    !v ||
    !id(v.id) ||
    (expectedId && v.id !== expectedId) ||
    !id(v.dailyPlanId) ||
    (dayId !== undefined && v.dailyPlanId !== dayId) ||
    !integer(v.number, 1) ||
    !nullableId(v.previousRevisionId) ||
    !id(v.changeSetId) ||
    typeof v.reason !== "string" ||
    typeof v.trigger !== "string" ||
    !instant(v.createdAt) ||
    !instant(v.effectiveAt) ||
    typeof v.algorithmVersion !== "string" ||
    !integer(v.snapshotSchemaVersion, 1) ||
    (v.reversesChangeSetId !== undefined && !nullableId(v.reversesChangeSetId))
  )
    invalid();
  return v;
}

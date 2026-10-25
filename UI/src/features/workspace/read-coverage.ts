import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";

export type ReadCoverage = components["schemas"]["ReadCoverage"];
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
export function readCoverage(value: ReadCoverage | null | undefined) {
  if (value == null) return value;
  if (
    !value.versions ||
    ![value.versions.planning, value.versions.notes, value.versions.specialDays].every(integer) ||
    typeof value.serverNow !== "string" ||
    !/(?:Z|[+-]\d\d:\d\d)$/.test(value.serverNow) ||
    !Number.isFinite(Date.parse(value.serverNow))
  )
    throw new ApiError("protocol", "Okuma sürümleri doğrulanamadı. Yeniden yükle.");
  return value;
}

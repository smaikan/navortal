import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { readSync, readWork } from "../work/model";
import { readCurrent } from "../focus/model";
import { validZone } from "../preferences/model";

export type WorkspaceSnapshot = components["schemas"]["WorkspaceSnapshotView"];
export type DisplayPreferences = components["schemas"]["WorkspacePreferencesView"];
export type DayReadVersions = components["schemas"]["DayReadVersions"];
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;

export function readWorkspace(v: WorkspaceSnapshot): WorkspaceSnapshot {
  const p = v?.preferences;
  if (
    !p ||
    !integer(p.version) ||
    !validZone(p.timeZoneId) ||
    !["12h", "24h"].includes(p.timeFormat) ||
    !integer(p.weekStartsOn) ||
    Number(p.weekStartsOn) < 0 ||
    Number(p.weekStartsOn) > 6 ||
    typeof p.supportEnabled !== "boolean" ||
    typeof p.hasWorkingWindows !== "boolean" ||
    !p.uiSupports ||
    ![
      p.uiSupports.calmView,
      p.uiSupports.dayBar,
      p.uiSupports.calibrationHints,
      p.uiSupports.nudges,
      p.uiSupports.resumeCard,
      p.uiSupports.openTodayAsOneThing,
    ].every(x => typeof x === "boolean") ||
    typeof v.focusIncluded !== "boolean" ||
    (!v.focusIncluded && v.activeFocus !== null)
  )
    throw new ApiError("protocol", "Çalışma alanı yanıtı doğrulanamadı. Yeniden yükle.");
  readSync({
    serverNow: v.serverNow,
    planningVersion: v.planningVersion,
    workSessionId: v.activeWork?.id ?? null,
    focusSessionId: v.focusSessionId,
  });
  readVersions(v.versions);
  if (BigInt(v.planningVersion) !== BigInt(v.versions.planning))
    throw new ApiError("protocol", "Çalışma alanı sürümleri tutarsız. Yeniden yükle.");
  if (v.activeWork !== null) {
    readWork(v.activeWork);
    if (v.activeWork.serverNow !== v.serverNow)
      throw new ApiError("protocol", "Çalışma alanının saatleri tutarsız. Yeniden yükle.");
  }
  if (v.focusIncluded) readCurrent({ session: v.activeFocus, serverNow: v.serverNow });
  return v;
}

export function readVersions(v: DayReadVersions): DayReadVersions {
  if (!v || ![v.planning, v.notes, v.specialDays].every(integer))
    throw new ApiError("protocol", "Görünüm sürümleri doğrulanamadı. Yeniden yükle.");
  return v;
}

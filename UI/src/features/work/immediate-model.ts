import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { validDate } from "../preferences/model";
import { readProposal, type Proposal } from "../planning/proposal-model";
import { readWork, type Work } from "./model";

import type { Immediate, ImmediateRequest } from "./immediate-types";
export type { Immediate, ImmediateRequest, Receipt } from "./immediate-types";
const version = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^\d+$/.test(v) && BigInt(v) <= 9223372036854775807n;
function invalid(): never {
  throw new ApiError(
    "protocol",
    "Geçiş yanıtı doğrulanamadı. Çalışma başlamış olabilir; aynı istekle sonucu kontrol et.",
  );
}
export function prepareImmediate(
  v: components["schemas"]["CurrentWork"],
  taskId: string,
): { body: ImmediateRequest; previous: Work | null } {
  if (!v || !version(v.planningVersion) || !validTaskId(taskId) || v.activeSession === undefined) invalid();
  const previous = v.activeSession === null ? null : readWork(v.activeSession);
  if (previous && previous.state !== "Running") invalid();
  return {
    previous,
    body: {
      taskId,
      expectedPlanningVersion: v.planningVersion,
      expectedSessionId: previous?.id ?? null,
      expectedSessionVersion: previous?.version ?? null,
    },
  };
}
/** Ayrı plan çözülemese bile geçerli çalışma makbuzu onaylı kalır. */
export function readImmediate(v: components["schemas"]["ImmediateWorkResult"]): Immediate {
  const r = v?.work;
  if (
    !r ||
    !validDate(r.localDate) ||
    !version(r.planningVersion) ||
    typeof r.resumed !== "boolean" ||
    typeof v.replayed !== "boolean" ||
    !Array.isArray(r.taskIds) ||
    !r.taskIds.length ||
    r.taskIds.length > 1000 ||
    !r.taskIds.every(validTaskId) ||
    new Set(r.taskIds).size !== r.taskIds.length
  )
    invalid();
  readWork(r.session);
  if (r.session.state !== "Running" || !r.session.taskId || !r.taskIds.includes(r.session.taskId)) invalid();
  if (r.pausedSession !== null) {
    readWork(r.pausedSession);
    if (r.pausedSession.state !== "Paused" || r.pausedSession.id === r.session.id) invalid();
  }
  let plan: Proposal | null = null,
    planInvalid = false;
  try {
    if (
      !["Preview", "Applied", "NeedsPreview", "Unavailable"].includes(v.planningStatus) ||
      !(v.planningError === null || typeof v.planningError === "string")
    )
      throw new Error();
    if (v.planningStatus === "Preview" || v.planningStatus === "Applied") {
      if (!v.plan) throw new Error();
      plan = readProposal(v.plan);
      if ((v.planningStatus === "Applied") !== (plan.status === "Applied")) throw new Error();
    } else if (v.plan !== null) throw new Error();
  } catch {
    plan = null;
    planInvalid = true;
  }
  return { receipt: r, plan, status: v.planningStatus, error: v.planningError, replayed: v.replayed, planInvalid };
}

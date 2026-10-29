import { expect, test, vi } from "vitest";
import {
  canApply,
  messageText,
  proposalFailure,
  readApplied,
  readBlock,
  readProposal,
  requestBody,
  unplacedReasons,
  unplacedText,
  type Applied,
  type Block,
  type Proposal,
} from "../../src/features/planning/proposal-model";
import { ApiError } from "../../src/lib/api/errors";
const id = "00000000-0000-0000-0000-000000000001",
  other = "00000000-0000-0000-0000-000000000002";
const block: Block = {
  existingScheduleId: null,
  taskId: id,
  kind: "Work",
  startsAt: "2026-10-25T06:01:00Z",
  endsAt: "2026-10-25T07:01:00Z",
  isFixed: false,
  isLocked: false,
  isActive: false,
  isPreserved: false,
  isAutomatic: true,
};
const proposal = (): Proposal => ({
  proposalId: id,
  inputVersion: "9223372036854775807",
  createdAt: "2026-10-25T06:00:01Z",
  expiresAt: "2026-10-25T06:02:01Z",
  anchorAt: "2026-10-25T06:00:01Z",
  planningMode: "Preview",
  algorithmVersion: "heuristic-v2",
  hasConstraintConflicts: false,
  canApply: true,
  status: "Pending",
  blocks: [block],
  changes: [{ type: "Added", taskId: id, scheduleId: null, before: null, after: block }],
  unplaced: [],
  warnings: [],
  explanations: [],
  applied: null,
  isPartial: false,
});
test("requests have 1..1000 unique tasks, preserve exact version and leave the server's notBefore clock alone", () => {
  expect(requestBody("2026-10-25", [other, id], "9223372036854775807")).toEqual({
    date: "2026-10-25",
    taskIds: [id, other],
    expectedPlanningVersion: "9223372036854775807",
  });
  for (const ids of [[], [id, id], ["bad"], Array(1001).fill(id)])
    expect(() => requestBody("2026-10-25", ids, 0)).toThrow();
  expect(requestBody("2026-10-25", [id], 0)).not.toHaveProperty("newWorkNotBefore");
});
test("only Pending + canApply + no hard conflict is actionable; capacity shortage remains actionable", () => {
  const p = proposal();
  expect(canApply(readProposal(p))).toBe(true);
  expect(canApply({ ...p, hasConstraintConflicts: true })).toBe(false);
  expect(canApply({ ...p, canApply: false })).toBe(false);
  for (const status of ["Applied", "Expired"]) expect(canApply({ ...p, status })).toBe(false);
  expect(
    canApply(
      readProposal({ ...p, unplaced: [{ taskId: other, remainingSeconds: 1800, reason: "InsufficientCapacity" }] }),
    ),
  ).toBe(true);
});
test("a successful HTTP shape must not claim Applied without an effect; expired/conflicting responses cannot enable apply", () => {
  const p = proposal();
  for (const v of [
    { ...p, status: "Applied", canApply: false },
    { ...p, status: "Expired" },
    { ...p, hasConstraintConflicts: true },
    { ...p, inputVersion: 9223372036854776000 },
    { ...p, planningMode: "invented" },
  ])
    expect(() => readProposal(v)).toThrow();
  expect(() => readProposal(p, other)).toThrow();
});
test("noChanges is a no-revision outcome and a changed outcome requires its own revision and ChangeSet", () => {
  const noOp: Applied = { proposalId: id, noChanges: true, changeSetId: null, revisionIds: [], planningVersion: 3 };
  expect(readApplied(noOp)).toEqual(noOp);
  expect(readProposal({ ...proposal(), status: "Applied", canApply: false, applied: noOp }).applied?.noChanges).toBe(
    true,
  );
  for (const value of [
    { ...noOp, noChanges: false },
    { ...noOp, revisionIds: [id] },
    { ...noOp, changeSetId: id },
    { ...noOp, proposalId: other },
  ])
    expect(() => readApplied(value, id)).toThrow();
  expect(readApplied({ ...noOp, noChanges: false, changeSetId: other, revisionIds: [id] })).toHaveProperty(
    "noChanges",
    false,
  );
});
test("unknown remaining seconds and future message codes survive; invalid amounts and schedule projections fail closed", () => {
  const p = proposal();
  expect(
    readProposal({
      ...p,
      unplaced: [{ taskId: other, remainingSeconds: null, reason: "NoEstimate" }],
      warnings: [{ code: "FutureCode", seconds: null }],
    }).unplaced[0].remainingSeconds,
  ).toBeNull();
  expect(messageText("FutureCode")).toContain("FutureCode");
  expect(unplacedText("FutureReason")).toContain("FutureReason");
  expect(Object.keys(unplacedReasons)).toHaveLength(10);
  for (const value of [
    { ...p, unplaced: [{ taskId: id, remainingSeconds: -1, reason: "NoEstimate" }] },
    { ...p, warnings: [{ code: "X", seconds: "" }] },
  ])
    expect(() => readProposal(value as Proposal)).toThrow();
  for (const v of [
    { ...block, taskId: null },
    { ...block, endsAt: block.startsAt },
    { ...block, isPreserved: undefined },
    { ...block, kind: "Break" },
  ])
    expect(() => readBlock(v as Block)).toThrow();
});
test("server expiry/status wins over a wrong browser wall clock and proposed UTC instants are kept unchanged", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2090-01-01T00:00:00Z"));
  try {
    const p = readProposal(proposal());
    expect(canApply(p)).toBe(true);
    expect(p.blocks[0].startsAt).toBe(block.startsAt);
    expect(p.anchorAt).toBe(proposal().anchorAt);
    expect(canApply(readProposal({ ...p, status: "Expired", canApply: false }))).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
test("specific global-work, stale, owner, protocol and offline errors have truthful next steps", () => {
  expect(proposalFailure(new ApiError("http", "", 409, "general_work_active"))).toContain("Önce duraklat");
  expect(proposalFailure(new ApiError("http", "", 409, "proposal_stale"))).toContain("yeni önizleme");
  expect(proposalFailure(new ApiError("http", "", 404))).toContain("bu hesapta");
  expect(proposalFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true))).toContain(
    "tamamlanmış olabilir",
  );
  expect(proposalFailure(new ApiError("offline", "Bağlantı yok"))).toBe("Bağlantı yok");
});

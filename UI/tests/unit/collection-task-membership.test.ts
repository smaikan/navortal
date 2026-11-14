import { describe, expect, it } from "vitest";
import { membershipBody, membershipField, detachMembershipBody } from "../../src/features/collections/task-membership";
import type { Classification } from "../../src/features/tasks/classification/model";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const latest: Classification = {
  taskId: uuid(1),
  version: "9007199254740993",
  planningVersion: 19,
  values: { projectId: uuid(2), poolId: uuid(3), categoryId: uuid(4), tagIds: [uuid(6), uuid(5)] },
};
describe("direct collection membership", () => {
  it.each(["projects", "pools", "categories"] as const)(
    "preserves every other link, tags, exact version and descendants for %s",
    kind => {
      const field = membershipField[kind];
      expect(membershipBody(latest, kind, uuid(7), latest.values[field], true)).toEqual({
        ...latest.values,
        [field]: uuid(7),
        tagIds: [uuid(5), uuid(6)],
        version: latest.version,
        applyToSubtree: false,
        expectedPlanningVersion: null,
      });
      expect(latest.values[field]).toBe(kind === "projects" ? uuid(2) : kind === "pools" ? uuid(3) : uuid(4));
    },
  );
  it.each(["projects", "pools", "categories"] as const)("removes only the selected %s link", kind => {
    const field = membershipField[kind];
    const id = latest.values[field]!;
    expect(membershipBody(latest, kind, id, id, false)).toMatchObject({
      ...latest.values,
      [field]: null,
      tagIds: [uuid(5), uuid(6)],
      applyToSubtree: false,
    });
  });
  it("does not issue another write when the desired link is already stored", () => {
    expect(membershipBody(latest, "projects", uuid(2), null, true)).toBeNull();
    expect(
      membershipBody({ ...latest, values: { ...latest.values, poolId: null } }, "pools", uuid(3), uuid(3), false),
    ).toBeNull();
  });
  it("requires a fresh user choice when another client changed the membership", () => {
    expect(() => membershipBody(latest, "projects", uuid(7), null, true)).toThrow(
      expect.objectContaining({ status: 409, code: "version_conflict" }),
    );
    expect(() => membershipBody(latest, "pools", uuid(7), uuid(7), false)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });
});

describe("collection removal", () => {
  it.each(["projects", "pools", "categories"] as const)("keeps other links and guards the subtree for %s", kind => {
    const body = detachMembershipBody(latest, kind, uuid(9));
    expect(body).toEqual({
      ...latest.values,
      [membershipField[kind]]: null,
      tagIds: [uuid(5), uuid(6)],
      version: latest.version,
      expectedPlanningVersion: latest.planningVersion,
      applyToSubtree: false,
      detachKind: kind,
      detachResourceId: uuid(9),
    });
  });
});

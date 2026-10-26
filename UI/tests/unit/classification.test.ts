import { describe, expect, it } from "vitest";
import {
  classificationBody,
  classificationDraft,
  classificationFailure,
  maxTags,
  readClassification,
  rebaseClassification,
  sameDraft,
  fieldKinds,
  type Classification,
} from "../../src/features/tasks/classification/model";
import { resourceKinds, resourceOrder } from "../../src/features/collections/model";
import { ApiError } from "../../src/lib/api/errors";

const id = "00000000-0000-0000-0000-000000000001";
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const view: Classification = {
  taskId: id,
  version: 3,
  planningVersion: "9007199254740993",
  values: { projectId: uuid(10), poolId: null, categoryId: uuid(30), tagIds: [uuid(42), uuid(41)] },
};

describe("classification responses", () => {
  it("accepts exact large planning versions and rejects foreign or malformed replies", () => {
    expect(readClassification(view, id).planningVersion).toBe("9007199254740993");
    for (const bad of [
      { ...view, taskId: uuid(2) },
      { ...view, version: 0 },
      { ...view, values: { ...view.values, projectId: "x" } },
      { ...view, values: { ...view.values, tagIds: [uuid(1), uuid(1)] } },
      { ...view, values: { ...view.values, tagIds: Array.from({ length: 51 }, (_, n) => uuid(100 + n)) } },
    ]) {
      expect(() => readClassification(bad as Classification, id)).toThrow();
    }
  });
});

describe("classification draft", () => {
  it("treats tags as a set so reordering is not an unsaved change", () => {
    const draft = classificationDraft(view);
    expect(draft.tagIds).toEqual([uuid(41), uuid(42)]);
    expect(sameDraft(draft, { ...draft, tagIds: [uuid(42), uuid(41)] })).toBe(true);
    expect(sameDraft(draft, { ...draft, tagIds: [uuid(41)] })).toBe(false);
  });
  it("always sends the full document; clearing a link sends null and an empty tag set", () => {
    const body = classificationBody(view, { projectId: null, poolId: null, categoryId: uuid(30), tagIds: [] }, false);
    expect(body).toEqual({
      version: 3,
      projectId: null,
      poolId: null,
      categoryId: uuid(30),
      tagIds: [],
      applyToSubtree: false,
      expectedPlanningVersion: null,
    });
    expect(Object.keys(body)).toEqual([
      "version",
      "projectId",
      "poolId",
      "categoryId",
      "tagIds",
      "applyToSubtree",
      "expectedPlanningVersion",
    ]);
  });
  it("sends the read planning version only for an explicit subtree intent", () => {
    expect(classificationBody(view, classificationDraft(view), true)).toMatchObject({
      applyToSubtree: true,
      expectedPlanningVersion: "9007199254740993",
    });
  });
  it("enforces the 50 tag limit before sending", () => {
    expect(() =>
      classificationBody(
        view,
        { ...classificationDraft(view), tagIds: Array.from({ length: maxTags + 1 }, (_, n) => uuid(200 + n)) },
        false,
      ),
    ).toThrow(`${maxTags}`);
    expect(
      classificationBody(
        view,
        { ...classificationDraft(view), tagIds: Array.from({ length: maxTags }, (_, n) => uuid(200 + n)) },
        false,
      ).tagIds,
    ).toHaveLength(maxTags);
  });
  it("rebases only locally changed fields; remote-only edits survive", () => {
    const latest: Classification = {
      ...view,
      version: 4,
      values: { projectId: uuid(11), poolId: uuid(20), categoryId: uuid(31), tagIds: [uuid(43)] },
    };
    const draft = { ...classificationDraft(view), categoryId: null };
    expect(rebaseClassification(view, draft, latest)).toEqual({
      projectId: uuid(11),
      poolId: uuid(20),
      categoryId: null,
      tagIds: [uuid(43)],
    });
    const tagsOnly = { ...classificationDraft(view), tagIds: [uuid(41)] };
    expect(rebaseClassification(view, tagsOnly, latest)).toEqual({
      projectId: uuid(11),
      poolId: uuid(20),
      categoryId: uuid(31),
      tagIds: [uuid(41)],
    });
  });
  it("names subtree conflicts, missing resources and uncertain writes distinctly", () => {
    expect(classificationFailure(new ApiError("http", "", 409, "planning_version_conflict"))).toContain("Alt görevler");
    expect(classificationFailure(new ApiError("http", "", 404, "resource_not_found"))).toContain("erişilemiyor");
    expect(classificationFailure(new ApiError("http", "", 409, "task_archived"))).toContain("Arşivlenmiş");
    expect(
      classificationFailure(new ApiError("network", "", 0, "version_conflict", {}, undefined, undefined, true)),
    ).toContain("kaydedilmiş olabilir");
  });
});

describe("resource kinds share one contract", () => {
  it("maps every classification field to a resource kind with its own route and task filter", () => {
    expect(resourceOrder).toEqual(["projects", "pools", "categories"]);
    expect(Object.values(fieldKinds).sort()).toEqual([...resourceOrder, "tags"].sort());
    expect(resourceOrder.map(kind => resourceKinds[kind].taskFilter)).toEqual([
      "projectId",
      "poolId",
      "categoryId",
    ]);
    expect(new Set(resourceOrder.map(kind => resourceKinds[kind].route)).size).toBe(3);
  });
});

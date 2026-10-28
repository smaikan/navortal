import { describe, expect, it } from "vitest";
import {
  nameIssue,
  readResource,
  readResourcePage,
  readWorkload,
  rebaseResourceDraft,
  resourceDraft,
  resourceFailure,
  resourceFields,
  resourceFilters,
  resourceKinds,
  type Resource,
} from "../../src/features/collections/model";
import { ApiError } from "../../src/lib/api/errors";

const id = "00000000-0000-0000-0000-000000000001";
const resource: Resource = {
  id,
  name: "Ev işleri",
  description: null,
  createdAt: "2026-10-18T08:00:00Z",
  updatedAt: "2026-10-18T08:00:00+03:00",
  archivedAt: null,
  version: 1,
};

describe("shared resource model", () => {
  it("uses one component contract for projects and pools with their own task filter", () => {
    expect(resourceKinds.projects.taskFilter).toBe("projectId");
    expect(resourceKinds.pools.taskFilter).toBe("poolId");
    expect(resourceKinds.projects.route).toBe("/projects");
    expect(resourceKinds.pools.route).toBe("/pool");
    expect(resourceKinds.pools.intro).toContain("kopyası oluşmaz");
    expect(resourceKinds.projects.intro).toContain("kopyalanmaz");
  });
  it("accepts long names and exact large versions; rejects malformed records", () => {
    expect(readResource({ ...resource, name: "x".repeat(200), version: "9007199254740993" }).version).toBe(
      "9007199254740993",
    );
    for (const changes of [
      { name: "" },
      { name: " " },
      { name: "x".repeat(201) },
      { description: undefined },
      { archivedAt: "dün" },
      { version: 0 },
      { id: "bad" },
    ]) {
      expect(() => readResource({ ...resource, ...changes } as Resource)).toThrow();
    }
  });
  it("validates pages without trusting item count as total", () => {
    const other = { ...resource, id: "00000000-0000-0000-0000-000000000002" };
    expect(readResourcePage({ items: [resource, other], offset: "25", limit: 25, total: "27" }, 25)).toMatchObject({
      offset: 25,
      total: 27,
    });
    for (const changes of [
      { offset: 0 },
      { limit: 50 },
      { total: 1 },
      { items: [resource, resource] },
      { total: null },
    ]) {
      expect(() =>
        readResourcePage(
          { items: [resource, other], offset: 25, limit: 25, total: 27, ...changes } as Parameters<
            typeof readResourcePage
          >[0],
          25,
        ),
      ).toThrow();
    }
  });
  it("keeps an unknown workload total null instead of zero", () => {
    const values = {
      taskCount: 2,
      directComponentCount: 2,
      openComponentCount: 1,
      knownEstimatedSeconds: "1800",
      unknownEstimateCount: 1,
      calculatedTotalSeconds: null,
    };
    expect(readWorkload({ resourceId: id, values }, id).values.calculatedTotalSeconds).toBeNull();
    expect(() => readWorkload({ resourceId: "00000000-0000-0000-0000-000000000002", values }, id)).toThrow();
    expect(() => readWorkload({ resourceId: id, values: { ...values, openComponentCount: 3 } }, id)).toThrow();
  });
});

describe("resource form", () => {
  it("always sends description and trims the name", () => {
    expect(resourceFields({ name: "  Proje  ", description: "" })).toEqual({ name: "Proje", description: null });
    expect(resourceFields({ name: "Proje", description: "Bağlam" })).toEqual({ name: "Proje", description: "Bağlam" });
    expect(nameIssue("   ")).toBe("Bir ad yaz.");
    expect(nameIssue(` ${"a".repeat(200)} `)).toBeUndefined();
    expect(nameIssue("a".repeat(201))).toContain("200");
    expect(() => resourceFields({ name: "Proje", description: "x".repeat(10001) })).toThrow();
  });
  it("rebases only locally edited fields onto the server copy", () => {
    const latest = { ...resource, name: "Sunucu adı", description: "Sunucu açıklaması", version: 2 };
    expect(rebaseResourceDraft(resource, { name: "Benim adım", description: "" }, latest)).toEqual({
      name: "Benim adım",
      description: "Sunucu açıklaması",
    });
    expect(resourceDraft(latest)).toEqual({ name: "Sunucu adı", description: "Sunucu açıklaması" });
  });
  it("names conflicts, foreign records and uncertain creates", () => {
    expect(resourceFailure(new ApiError("http", "", 409, "version_conflict"))).toContain("Taslağın korundu");
    expect(resourceFailure(new ApiError("http", "", 404, "resource_not_found"))).toContain("bu hesaba ait olmayabilir");
    expect(resourceFailure(new ApiError("http", "", 409, "resource_archived"))).toContain("Arşivlenmiş");
    expect(resourceFailure(new ApiError("network", "", 0, undefined, {}, undefined, undefined, true), true)).toContain(
      "ikinci bir kayıt",
    );
  });
});

describe("resource URL state", () => {
  it("reads known filters and keeps an invalid id from reaching the API", () => {
    expect(resourceFilters(new URLSearchParams(`search=Ev&includeArchived=true&offset=25&id=${id}&taskId=x`))).toEqual({
      query: { offset: 25, limit: 25, includeArchived: true, search: "Ev" },
      id,
    });
    expect(resourceFilters(new URLSearchParams("id=bad")).issue).toBeTruthy();
    expect(resourceFilters(new URLSearchParams("offset=-1")).issue).toBeTruthy();
    expect(resourceFilters(new URLSearchParams(`search=${"a".repeat(201)}`)).issue).toBeTruthy();
  });
});

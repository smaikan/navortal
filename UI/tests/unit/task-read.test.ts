import { expect, test } from "vitest";
import { readTaskDetail, readAncestorPage, type TaskDetailView } from "../../src/features/tasks/read-model";
const id = "11111111-1111-4111-8111-111111111111",
  parent = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-25T09:00:00Z";
const view: TaskDetailView = {
  task: {
    id,
    title: "Unknown own work",
    description: null,
    state: "Pending",
    priority: "Normal",
    deadlineAt: null,
    canSplit: true,
    directEstimatedSeconds: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    version: 1,
    parentTaskId: null,
    sortOrder: 1024,
    hasDirectWork: true,
    targetBudgetSeconds: 600,
    directWorkCompleted: false,
    requiredForParent: true,
    completionOrigin: null,
    completedAt: null,
    projectId: null,
    poolId: null,
    categoryId: null,
    autoCompleteFromChildren: true,
  },
  rowSummary: {
    rangeFromChildren: false,
    taskId: id,
    childCount: 0,
    completedChildCount: 0,
    knownEstimatedSeconds: 0,
    unknownEstimateCount: 1,
  },
  workload: {
    taskId: id,
    knownEstimatedSeconds: 0,
    unknownEstimateCount: 1,
    calculatedTotalSeconds: null,
    targetBudgetSeconds: 600,
    targetDifferenceSeconds: null,
  },
  time: {
    taskId: id,
    directActualSeconds: 0,
    subtreeActualSeconds: 0,
    knownRemainingSeconds: 0,
    unknownRemainingCount: 1,
    remainingSeconds: null,
    knownOvertimeSeconds: 0,
    unknownEstimateCount: 1,
    serverNow: now,
  },
  progress: {
    taskId: id,
    totalTaskCount: 1,
    completedTaskCount: 0,
    componentCount: 1,
    completedComponentCount: 0,
    countProgress: 0,
    knownEstimatedSeconds: 0,
    knownCompletedEstimatedSeconds: 0,
    unknownEstimateCount: 1,
    durationProgress: null,
    requiredChildCount: 0,
    incompleteRequiredChildCount: 0,
    hasOpenChildren: false,
    hasOpenDescendants: false,
  },
  classification: {
    taskId: id,
    version: 1,
    planningVersion: 1,
    values: { projectId: null, poolId: null, categoryId: null, tagIds: [] },
  },
  labels: [],
  parent: null,
  planningVersion: 1,
  serverNow: now,
};
test("detail keeps complete authoritative projections and rejects mixed task/version/time responses", () => {
  expect(readTaskDetail(view, id)).toBe(view);
  for (const patch of [
    { planningVersion: 2 },
    { time: { ...view.time, serverNow: "2026-10-24T09:00:00Z" } },
    { task: { ...view.task, id: parent } },
    { labels: [{ kind: "tags", id: parent, name: "foreign", version: 1, archivedAt: null }] },
    { classification: { ...view.classification, values: { ...view.classification.values, tagIds: [parent] } } },
  ])
    expect(() => readTaskDetail({ ...view, ...patch } as TaskDetailView, id)).toThrow();
});
test("ancestor pages validate order, owner resource identity, cursor boundaries and duplicate links", () => {
  const page = {
    taskId: id,
    planningVersion: "9223372036854775807",
    items: [{ id: parent, title: "Parent", parentTaskId: null, version: 1 }],
    nextCursor: null,
  };
  expect(readAncestorPage(page, id)).toBe(page);
  expect(() => readAncestorPage({ ...page, taskId: parent }, id)).toThrow();
  expect(() => readAncestorPage({ ...page, items: [...page.items, ...page.items] }, id)).toThrow();
  expect(() => readAncestorPage({ ...page, nextCursor: "more" }, id)).toThrow();
  expect(() => readAncestorPage({ ...page, items: [{ ...page.items[0], parentTaskId: id }] }, id)).toThrow();
});

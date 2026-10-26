import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { readTask } from "./model";
import { readSummary as readRow } from "./tree/model";
import { readSummary, readTime, readProgress } from "./work/model";
import { readClassification } from "./classification/model";
export type TaskDetailView = components["schemas"]["TaskDetailView"];
export type TaskAncestorPage = components["schemas"]["TaskAncestorPage"];
const integer = (v: unknown) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= 0
    : typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApiError("protocol", "Görev görünümü doğrulanamadı. Yeniden yükle.");
}
function ancestor(row: components["schemas"]["TaskAncestorRow"]) {
  if (
    !row ||
    !validTaskId(row.id) ||
    typeof row.title !== "string" ||
    !row.title.trim() ||
    !integer(row.version) ||
    Number(row.version) < 1 ||
    !(row.parentTaskId === null || validTaskId(row.parentTaskId))
  )
    invalid();
}
export function readTaskDetail(value: TaskDetailView, id: string) {
  if (!value || !integer(value.planningVersion) || !instant(value.serverNow)) invalid();
  readTask(value.task);
  readRow(value.rowSummary);
  readSummary(value.workload, id);
  readTime(value.time, id);
  readProgress(value.progress, id);
  readClassification(value.classification, id);
  if (
    value.task.id !== id ||
    value.rowSummary.taskId !== id ||
    value.time.serverNow !== value.serverNow ||
    String(value.classification.version) !== String(value.task.version) ||
    String(value.classification.planningVersion) !== String(value.planningVersion) ||
    !Array.isArray(value.labels) ||
    value.labels.length > 53
  )
    invalid();
  if (value.parent !== null) {
    ancestor(value.parent);
    if (value.parent.id !== value.task.parentTaskId) invalid();
  }
  const expected = new Set([
    ...(["projectId", "poolId", "categoryId"] as const).flatMap((key, i) =>
      value.classification.values[key]
        ? [`${["projects", "pools", "categories"][i]}:${value.classification.values[key]}`]
        : [],
    ),
    ...value.classification.values.tagIds.map(id => `tags:${id}`),
  ]);
  for (const label of value.labels) {
    if (
      !label ||
      !validTaskId(label.id) ||
      !expected.delete(`${label.kind}:${label.id}`) ||
      typeof label.name !== "string" ||
      !label.name.trim() ||
      !integer(label.version) ||
      Number(label.version) < 1 ||
      !(label.archivedAt === null || instant(label.archivedAt))
    )
      invalid();
  }
  if (expected.size) invalid();
  return value;
}
export function readAncestorPage(value: TaskAncestorPage, id: string, limit = 16) {
  if (
    !value ||
    value.taskId !== id ||
    !integer(value.planningVersion) ||
    !Array.isArray(value.items) ||
    value.items.length > limit ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === "string" && value.nextCursor.length > 0 && value.nextCursor.length <= 4096)
    ) ||
    (value.nextCursor !== null && value.items.length !== limit)
  )
    invalid();
  const seen = new Set([id]);
  value.items.forEach((row, i) => {
    ancestor(row);
    if (seen.has(row.id) || (i > 0 && value.items[i - 1].parentTaskId !== row.id)) invalid();
    seen.add(row.id);
  });
  if (value.nextCursor === null && value.items.length && value.items.at(-1)!.parentTaskId !== null) invalid();
  return value;
}

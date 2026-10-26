import type { components } from "../../lib/api/generated/schema";
import { deadlineLocal, resolveDeadline } from "./deadline";
import { titleIssue, type Task } from "./model";
export function taskDraft(task: Task, zone: string) {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    deadline: deadlineLocal(task.deadlineAt, zone),
    canSplit: task.canSplit,
    choice: "" as "" | "earlier" | "later",
  };
}
export type TaskDraft = ReturnType<typeof taskDraft>;
export function taskUpdate(base: Task, draft: TaskDraft, zone: string): components["schemas"]["UpdateTaskRequest"] {
  const issue = titleIssue(draft.title);
  if (issue) throw new RangeError(issue);
  if (draft.description.length > 10000) throw new RangeError("Açıklama en fazla 10.000 karakter olabilir.");
  return {
    version: base.version,
    title: draft.title,
    description: draft.description === (base.description ?? "") ? base.description : draft.description || null,
    priority: draft.priority,
    canSplit: draft.canSplit,
    deadlineAt:
      draft.deadline === deadlineLocal(base.deadlineAt, zone) && !draft.choice
        ? base.deadlineAt
        : resolveDeadline(draft.deadline, zone, draft.choice),
  };
}

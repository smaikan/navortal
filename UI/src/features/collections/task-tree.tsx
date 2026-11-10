"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, openRowMenu } from "../../components/ui/menu";
import { ChevronRight, Play } from "lucide-react";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useTaskCache } from "../tasks/queries";
import { estimateText, priorities, states, readTask, taskFailure, type Task } from "../tasks/model";
import { useWork } from "../work/coordinator";
import { resourceKinds, type ResourceKind } from "./model";

export function useCollectionTasks(kind: ResourceKind, id: string, offset: number, limit: number) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "collection-task-tree", { kind, id, offset, limit }),
    queryFn: async ({ signal }) => {
      const page = await session.api.read("/api/{kind}/{id}/task-tree", {
        path: { kind, id },
        query: { offset, limit },
        signal,
      });
      page.nodes.forEach(readTask);
      page.roots.forEach(readTask);
      return { ...page, items: page.roots };
    },
    networkMode: "always",
  });
}
export function ResourceTaskTree({
  kind,
  roots,
  nodes,
  parents,
  archived,
  onPlan,
}: {
  kind: ResourceKind;
  roots: Task[];
  nodes: Task[];
  parents: { id: string; title: string }[];
  archived: boolean;
  onPlan: (task: Task, trigger: HTMLElement, subtree: boolean) => void;
}) {
  const { session } = useSession(),
    cache = useTaskCache(),
    open = useTaskPanel(),
    work = useWork();
  const [pending, setPending] = useState<string | null>(null),
    [failure, setFailure] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed(before => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  async function complete(task: Task) {
    if (pending) return;
    setPending(task.id);
    setFailure("");
    try {
      await session.api
        .mutation("/api/tasks/{id}/state", "post", {
          path: { id: task.id },
          body: {
            version: task.version,
            action: task.state === "Completed" ? "Reopen" : "Complete",
            parentCompletionChoice: "CompleteSubtree",
          },
        })
        .execute();
    } catch (error) {
      if (cache.current()) setFailure(taskFailure(error));
    } finally {
      if (cache.current()) {
        setPending(null);
        void cache.manyChanged();
      }
    }
  }
  const node = (task: Task, nested = false): React.ReactNode => {
    const children = nodes
      .filter(x => x.parentTaskId === task.id)
      .sort(
        (a, b) =>
          Number(a.state === "Completed") - Number(b.state === "Completed") ||
          Number(a.sortOrder) - Number(b.sortOrder),
      );
    const done = task.state === "Completed",
      expanded = !collapsed.has(task.id);
    const parent = !nested && task.parentTaskId ? parents.find(x => x.id === task.parentTaskId) : undefined;
    return (
      <li key={task.id}>
        <div className="resource-task-line" onContextMenu={kind === "pools" ? openRowMenu : undefined}>
          {children.length > 0 && (
            <button
              type="button"
              className="resource-tree-toggle ghost icon"
              aria-label={`${task.title} alt görevleri`}
              aria-expanded={expanded}
              onClick={() => toggle(task.id)}
            >
              <ChevronRight size={14} aria-hidden style={{ transform: expanded ? "rotate(90deg)" : undefined }} />
            </button>
          )}
          <label className="r2-square-hit">
            <input
              className="r2-square"
              type="checkbox"
              checked={done}
              disabled={archived || !!pending || ["Deferred", "Canceled", "Skipped"].includes(task.state)}
              aria-label={`${task.title} tamamlandı`}
              onChange={() => void complete(task)}
            />
          </label>
          <button
            className={`task-row${done ? " completed" : ""}`}
            onClick={e => open(task.id, e.currentTarget)}
            aria-label={`${task.title} ayrıntısını aç`}
          >
            <span className="task-row-title">{task.title}</span>
            <span className="task-row-meta">
              {parent && <span>{parent.title} ›</span>}
              <span>{states[task.state]}</span>
              <span>{priorities[task.priority]} öncelik</span>
              <span>
                {estimateText(task.directEstimatedSeconds) ||
                  (children.length
                    ? `${children.filter(x => x.state === "Completed").length}/${children.length} alt görev`
                    : "Tahmin yok")}
              </span>
            </span>
          </button>
          {!done && (
            <button
              type="button"
              className="ghost icon resource-tree-start"
              aria-label={`Başlat: ${task.title}`}
              disabled={archived || work.busy || !!work.uncertain || !work.online || work.work?.state === "Running"}
              onClick={() => void work.start(task.id)}
            >
              <Play size={14} aria-hidden />
            </button>
          )}
          {kind === "pools" && (
            <Menu
              label={`${task.title} havuz görevi menüsü`}
              items={[
                {
                  label: "Güne planla",
                  disabled: archived || !!pending || ["Completed", "Skipped", "Canceled"].includes(task.state),
                  onSelect: trigger => onPlan(task, trigger, children.length > 0),
                },
              ]}
            />
          )}
        </div>
        {children.length > 0 && expanded && (
          <ul className="resource-tree-children">{children.map(child => node(child, true))}</ul>
        )}
      </li>
    );
  };
  const active = roots.filter(x => x.state !== "Completed"),
    done = roots.filter(x => x.state === "Completed");
  return (
    <>
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
      {active.length > 0 && (
        <ul className="task-list resource-task-list" aria-label={`${resourceKinds[kind].singular} görevleri`}>
          {active.map(x => node(x))}
        </ul>
      )}
      {done.length > 0 && (
        <section className="resource-tree-completed" aria-label="Bitmiş görevler">
          <h4>Bitmiş görevler</h4>
          <ul className="task-list resource-task-list">{done.map(x => node(x))}</ul>
        </section>
      )}
    </>
  );
}

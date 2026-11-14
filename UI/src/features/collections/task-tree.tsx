"use client";
import { useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, openRowMenu } from "../../components/ui/menu";
import { ChevronRight, Play } from "lucide-react";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useTaskCache } from "../tasks/queries";
import {
  estimateText,
  priorities,
  states,
  readTask,
  taskFailure,
  isOffline,
  offlineWrite,
  type Task,
} from "../tasks/model";
import { useWork } from "../work/coordinator";
import { resourceKinds, type ResourceKind } from "./model";
import { readClassification, classificationFailure } from "../tasks/classification/model";
import { detachMembershipBody, membershipField } from "./task-membership";

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
  id,
  contextTaskIds,
  roots,
  nodes,
  parents,
  archived,
  onPlan,
}: {
  kind: ResourceKind;
  id: string;
  contextTaskIds: string[];
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
  const busy = useRef(false);
  const tree = useRef<HTMLDivElement>(null);
  const [uncertain, setUncertain] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed(before => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  async function complete(task: Task) {
    if (busy.current || uncertain) return;
    busy.current = true;
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
      if (!cache.current()) return;
      if (error instanceof ApiError && error.outcomeUnknown) {
        // Yanıt kaybolsa da yazı commit edilmiş olabilir. Yazıyı tekrarlamadan doğrula.
        setUncertain(task);
        try {
          const expected = task.state === "Completed" ? "Pending" : "Completed";
          // İlk okuma henüz commit edilmemiş eski kaydı görebilir. Yalnız okumayı sınırlı olarak tekrarla.
          for (const delay of [0, 350, 1000]) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            if (!cache.current()) return;
            const saved = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
            if (!cache.current()) return;
            if (saved.id === task.id && BigInt(saved.version) > BigInt(task.version) && saved.state === expected) {
              setUncertain(null);
              return;
            }
          }
          setFailure(taskFailure(error));
        } catch {
          if (cache.current()) setFailure(taskFailure(error));
        }
      } else setFailure(taskFailure(error));
    } finally {
      try {
        // Yeni sürümler gelmeden ikinci tıklama eski sürümle gönderilmesin.
        if (cache.current()) await cache.manyChanged();
      } finally {
        busy.current = false;
        if (cache.current()) setPending(null);
      }
    }
  }
  async function checkUncertain() {
    if (!uncertain || busy.current) return;
    busy.current = true;
    setPending(uncertain.id);
    try {
      readTask(await session.api.read("/api/tasks/{id}", { path: { id: uncertain.id } }));
      await cache.manyChanged();
      if (cache.current()) {
        setUncertain(null);
        setFailure("");
      }
    } catch (error) {
      if (cache.current()) setFailure(taskFailure(error));
    } finally {
      busy.current = false;
      if (cache.current()) setPending(null);
    }
  }
  async function remove(task: Task) {
    if (kind === "tags" || busy.current || uncertain) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    busy.current = true;
    setPending(task.id);
    setFailure("");
    let before = task.version;
    let removed = false;
    const row = tree.current?.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
    const fallback =
      row?.nextElementSibling?.querySelector<HTMLButtonElement>(":scope > .resource-task-line > .task-row") ??
      row?.parentElement?.closest("li")?.querySelector<HTMLButtonElement>(":scope > .resource-task-line > .task-row") ??
      tree.current?.closest("section")?.querySelector<HTMLElement>("h3");
    try {
      const latest = readClassification(
        await session.api.read("/api/tasks/{id}/classification", { path: { id: task.id } }),
        task.id,
      );
      if (!cache.current()) return;
      before = latest.version;
      await session.api
        .mutation("/api/tasks/{id}/classification", "put", {
          path: { id: task.id },
          body: detachMembershipBody(latest, kind, id),
        })
        .execute();
      removed = true;
    } catch (error) {
      if (!cache.current()) return;
      if (error instanceof ApiError && error.outcomeUnknown) {
        setUncertain(task);
        try {
          for (const delay of [0, 350, 1000]) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            if (!cache.current()) return;
            const saved = readClassification(
              await session.api.read("/api/tasks/{id}/classification", { path: { id: task.id } }),
              task.id,
            );
            if (!cache.current()) return;
            if (BigInt(saved.version) > BigInt(before) && saved.values[membershipField[kind]] === null) {
              setUncertain(null);
              removed = true;
              return;
            }
          }
        } catch {
          /* Belirsiz işlem yalnız başarılı bir okumadan sonra yeniden açılır. */
        }
      }
      setFailure(classificationFailure(error));
    } finally {
      try {
        if (cache.current()) await cache.manyChanged();
      } finally {
        busy.current = false;
        if (cache.current()) {
          setPending(null);
          if (removed)
            requestAnimationFrame(() => {
              if (cache.current() && document.activeElement === document.body && fallback?.isConnected)
                fallback.focus({ preventScroll: true });
            });
        }
      }
    }
  }
  const contextIds = new Set(contextTaskIds);
  const node = (task: Task, depth = 0): React.ReactNode => {
    const children = nodes
      .filter(x => x.parentTaskId === task.id)
      .sort(
        (a, b) =>
          Number(a.state === "Completed") - Number(b.state === "Completed") ||
          Number(a.sortOrder) - Number(b.sortOrder),
      );
    const done = task.state === "Completed",
      expanded = !collapsed.has(task.id);
    const context = contextIds.has(task.id);
    const parent = depth === 0 && task.parentTaskId ? parents.find(x => x.id === task.parentTaskId) : undefined;
    return (
      <li key={task.id} data-task-id={task.id}>
        <div
          className={`resource-task-line${context ? " resource-task-context" : ""}`}
          style={{ "--resource-depth": depth } as CSSProperties}
          onContextMenu={openRowMenu}
        >
          {children.length > 0 ? (
            <button
              type="button"
              className="resource-tree-toggle ghost icon"
              aria-label={`${task.title} alt görevleri`}
              aria-expanded={expanded}
              onClick={() => toggle(task.id)}
            >
              <ChevronRight size={14} aria-hidden style={{ transform: expanded ? "rotate(90deg)" : undefined }} />
            </button>
          ) : (
            <span className="resource-tree-spacer" aria-hidden="true" />
          )}
          <label className="r2-square-hit">
            <input
              className="r2-square"
              type="checkbox"
              checked={done}
              disabled={
                archived ||
                context ||
                !!pending ||
                !!uncertain ||
                ["Deferred", "Canceled", "Skipped"].includes(task.state)
              }
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
              {context && <span>Üst görev · Bu {resourceKinds[kind].locative} değil</span>}
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
          {!done && !context && (
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
          {kind !== "tags" && !context && (
            <Menu
              label={`${task.title} ${resourceKinds[kind].lower} görevi menüsü`}
              floating
              items={[
                kind === "pools" && {
                  label: "Güne planla",
                  disabled:
                    archived || !!pending || !!uncertain || ["Completed", "Skipped", "Canceled"].includes(task.state),
                  onSelect: trigger => onPlan(task, trigger, children.length > 0),
                },
                {
                  label: { projects: "Projeden kaldır", pools: "Havuzdan kaldır", categories: "Kategoriden kaldır" }[
                    kind
                  ],
                  disabled: archived || !!pending || !!uncertain,
                  onSelect: () => void remove(task),
                },
              ]}
            />
          )}
        </div>
        {children.length > 0 && expanded && (
          <ul className="resource-tree-children" aria-label={`${task.title} alt görevleri`}>
            {children.map(child => node(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  const active = roots.filter(x => x.state !== "Completed"),
    done = roots.filter(x => x.state === "Completed");
  return (
    <div ref={tree}>
      {failure && (
        <div role="alert" className="form-error">
          <p>{failure}</p>
          {uncertain && (
            <button type="button" disabled={!!pending} onClick={() => void checkUncertain()}>
              {pending ? "Kontrol ediliyor…" : "Güncel görev durumunu kontrol et"}
            </button>
          )}
        </div>
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
    </div>
  );
}

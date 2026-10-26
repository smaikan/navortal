"use client";
import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, ChevronLeft } from "lucide-react";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useCurrentTask, useTaskPanel } from "../../components/layout/task-panel";
import { useDisplayPreferences } from "../workspace/queries";
import { readPage, type Task } from "./model";
import { useTreeActions } from "./tree/actions";

const pageSize = 25;
/** Tamamlanma anının kullanıcı saat dilimindeki günü. Yalnız listeyi gruplamak için. */
export function completionDay(at: string, zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(at),
  );
}
export function dayLabel(day: string, today: string, yesterday: string) {
  if (day === today) return "Bugün";
  if (day === yesterday) return "Dün";
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    ...(y !== Number(today.slice(0, 4)) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(Date.UTC(y, m - 1, d));
}

/** Biten görevler en yeni önce, gün gruplarıyla listelenir. Yeniden açılan görev ağaca döner. */
export function CompletedTasksPage() {
  const { session, state } = useSession();
  const prefs = useDisplayPreferences();
  const open = useTaskPanel();
  const currentTaskId = useCurrentTask();
  const actions = useTreeActions();
  const [now] = useState(() => Date.now());
  const list = useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "tasks", { kind: "completed", excludeRecurring: true }),
    networkMode: "always",
    initialPageParam: 0,
    getNextPageParam: (last: ReturnType<typeof readPage>) =>
      Number(last.offset) + last.items.length < Number(last.total) && Number(last.offset) + pageSize <= 100000
        ? Number(last.offset) + pageSize
        : undefined,
    queryFn: async ({ pageParam, signal }) =>
      readPage(
        await session.api.read("/api/tasks", {
          query: {
            state: "Completed",
            orderBy: "CompletedDesc",
            offset: pageParam,
            limit: pageSize,
            excludeRecurring: true,
          },
          signal,
        }),
      ),
  });
  const zone = prefs.data?.values.timeZoneId ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = completionDay(new Date(now).toISOString(), zone),
    yesterday = completionDay(new Date(now - 86400000).toISOString(), zone);
  const groups: { label: string; items: Task[] }[] = [];
  for (const task of list.data?.pages.flatMap(page => page.items) ?? []) {
    const label = task.completedAt ? dayLabel(completionDay(task.completedAt, zone), today, yesterday) : "Tarihsiz";
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(task);
  }
  const time = (at: string) =>
    new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(at));
  return (
    <main id="main" className="workspace-main r2-tasks" tabIndex={-1}>
      <header className="r2-head">
        <div>
          <Link href="/tasks" prefetch={false} className="back-link">
            <ChevronLeft aria-hidden="true" size={16} />
            Görevler
          </Link>
          <h1 tabIndex={-1}>Biten görevler</h1>
        </div>
      </header>
      {list.isPending ? (
        <p role="status">Biten görevler okunuyor…</p>
      ) : list.isError && !list.data ? (
        <div role="alert" className="form-error">
          <p>Biten görevler alınamadı.</p>
          <button onClick={() => void list.refetch()}>Yeniden yükle</button>
        </div>
      ) : !groups.length ? (
        <p className="r2-empty">Henüz biten görev yok. Bir görevi bitirdiğinde burada görünür.</p>
      ) : (
        groups.map(group => (
          <section key={group.label} className="r2-day" aria-label={group.label}>
            <h2>{group.label}</h2>
            <ul className="r2-list">
              {group.items.map(task => (
                <li key={task.id} className="r2-node">
                  <div className="r2-row done" data-task-panel-target>
                    <span className="r2-leaf" aria-hidden="true">
                      <Check size={14} />
                    </span>
                    <button
                      type="button"
                      className="r2-title"
                      onClick={event => open(task.id, event.currentTarget)}
                      aria-label={`${task.title} ayrıntısını aç`}
                      aria-current={currentTaskId === task.id || undefined}
                    >
                      <span className="r2-text">{task.title}</span>
                      {task.parentTaskId && <span className="r2-sub">alt görev</span>}
                    </button>
                    {task.completedAt && (
                      <time className="r2-when" dateTime={task.completedAt}>
                        {time(task.completedAt)}
                      </time>
                    )}
                    <button
                      type="button"
                      className="r2-reopen"
                      disabled={actions.pending === task.id}
                      onClick={() => void actions.reopen(task)}
                      aria-label={`Yeniden aç: ${task.title}`}
                    >
                      Yeniden aç
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {list.hasNextPage && (
        <button
          type="button"
          className="r2-more"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Daha fazla göster
        </button>
      )}
    </main>
  );
}

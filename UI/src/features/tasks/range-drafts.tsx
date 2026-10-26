"use client";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import type { Task } from "./model";

type Snapshot = {
  draft: { from: string; to: string };
  busy: boolean;
  failure: string;
  needsCheck: boolean;
  remote: Task | null;
};
/** Taslak responsive Surface'ın üstünde. Boyut değişince ana öğe değişse de niyet kalır. */
export function createTaskRangeDraft(task: Task) {
  const draft = { from: task.plannedFrom ?? "", to: task.plannedTo ?? "" };
  let snapshot: Snapshot = { draft, busy: false, failure: "", needsCheck: false, remote: null };
  const listeners = new Set<() => void>();
  const base = { current: task },
    latestDraft = { current: draft };
  const sending = { current: false },
    blocked = { current: false };
  function patch(next: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }
  return {
    base,
    draft: latestDraft,
    sending,
    blocked,
    setBase(value: Task) {
      base.current = value;
    },
    setDraft(value: Snapshot["draft"]) {
      latestDraft.current = value;
      patch({ draft: value });
    },
    setSending(value: boolean) {
      sending.current = value;
    },
    setBlocked(value: boolean) {
      blocked.current = value;
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patch,
  };
}
type Record = ReturnType<typeof createTaskRangeDraft>;
const Context = createContext<Map<string, Record> | null>(null);
export function TaskRangeDrafts({ children }: { children: React.ReactNode }) {
  const [records] = useState(() => new Map<string, Record>());
  return <Context value={records}>{children}</Context>;
}
export function useTaskRangeDraft(task: Task) {
  const records = useContext(Context);
  if (!records) throw new Error("TaskRangeDrafts gerekli.");
  const [record] = useState(() => {
    const existing = records.get(task.id);
    if (existing) return existing;
    const created = createTaskRangeDraft(task);
    records.set(task.id, created);
    return created;
  });
  return { record, snapshot: useSyncExternalStore(record.subscribe, record.getSnapshot, record.getSnapshot) };
}

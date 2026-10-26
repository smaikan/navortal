"use client";
import { lazy, Suspense } from "react";
import type { Task } from "../model";
import type { RelationKind } from "./model";
// İçerik bölüm açılınca gerekir. Görev panelinin ilk modülüne eklemiyoruz.
const RelationsContent = lazy(() => import("./content").then(module => ({ default: module.RelationsContent })));

/** Açıklık Surface üstünde tutuluyor, aside/dialog değişimi bölümü kapatmıyor. */
export function TaskRelationsSection({
  task,
  add,
  open,
  setOpen,
}: {
  task: Task;
  add: (kind: RelationKind, trigger: HTMLElement) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <details className="task-relations" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Ön koşullar ve sıra</summary>
      {open && (
        <Suspense fallback={<p role="status">Ön koşullar açılıyor…</p>}>
          <RelationsContent task={task} add={add} />
        </Suspense>
      )}
    </details>
  );
}

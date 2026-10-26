"use client";
import { lazy, Suspense } from "react";
import type { Task } from "../model";
import type { ClassificationField, ClassificationState } from "./model";
import "../styles.css";
const ClassificationContent = lazy(() =>
  import("./content").then(module => ({ default: module.ClassificationContent })),
);

/** Açıklık ve taslak Surface üstündeki TaskEditor'a ait. */
export function TaskClassificationSection({
  task,
  state,
  pick,
  open,
  setOpen,
}: {
  task: Task;
  state: ClassificationState;
  pick: (field: ClassificationField, trigger: HTMLElement) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  void open;
  void setOpen;
  return (
    <section className="r2-section task-classification" aria-label="Proje, havuz ve kategori">
      <Suspense fallback={<p role="status">Sınıflandırma açılıyor…</p>}>
        <ClassificationContent task={task} state={state} pick={pick} />
      </Suspense>
    </section>
  );
}

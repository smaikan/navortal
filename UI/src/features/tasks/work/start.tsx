"use client";
import { Play } from "lucide-react";
import { useOptionalWork } from "../../work/coordinator";
import { stateLabels } from "../../work/model";
import { WorkFeedback } from "../../work/player";
import type { Task } from "../model";
import "../styles.css";

/** Bu göreve gerçek çalışma başlatır. Çalışan/durmuş oturum denetimi kalıcı oynatıcıdadır. */
export function WorkStartControl({ task }: { task: Task }) {
  const work = useOptionalWork();
  if (!work || task.archivedAt || task.state === "Completed") return null;
  const session = work.work;
  const feedback = work.origin === "panel" && <WorkFeedback className="work-start-feedback" />;
  if (session?.taskId === task.id)
    return (
      <>
        <p className="r2-working" role="status">
          Bu görevde: {stateLabels[session.state]}
        </p>
        {feedback}
      </>
    );
  const otherRunning = session?.state === "Running";
  const blocked = otherRunning
    ? "Başka bir görevde çalışma sürüyor; önce onu duraklat veya bitir."
    : !work.online
      ? "Bağlantı yok; çalışma başlatılamaz."
      : "";
  return (
    <>
      <button
        type="button"
        className="primary r2-start"
        disabled={work.busy || !!work.uncertain || otherRunning || !work.online}
        aria-label="Çalışmayı başlat"
        aria-describedby={blocked ? `work-start-help-${task.id}` : undefined}
        onClick={() => void work.start(task.id)}
      >
        <Play size={14} aria-hidden="true" />
        {work.busy ? "İşleniyor…" : "Başlat"}
      </button>
      {feedback}
      {blocked && (
        <p id={`work-start-help-${task.id}`} className="r2-hint r2-start-help">
          {blocked}
        </p>
      )}
    </>
  );
}

"use client";
import type { Task } from "../model";
import { actionNames, stateAlreadyMatches, type LifeCommand } from "./model";
import { useCompletionScope } from "./queries";
export function TaskLifecycleActions({ task, open }: { task: Task; open: (command: LifeCommand) => void }) {
  const inactive = ["Deferred", "Skipped", "Canceled"].includes(task.state);
  const scope = useCompletionScope(task.id, task.state === "Completed");
  return (
    <section aria-label="Durum ve tamamlanma" className="task-lifecycle">
      <label className="support-toggle">
        <input
          type="checkbox"
          checked={task.state === "Completed"}
          disabled={!!task.archivedAt || inactive}
          aria-describedby="task-completion-help"
          onChange={event =>
            open({
              kind: "state",
              action: task.state === "Completed" ? "Reopen" : "Complete",
              trigger: event.currentTarget,
            })
          }
        />{" "}
        Görev tamamlandı
      </label>
      <p id="task-completion-help" className="muted form-hint">
        Seçince karar penceresi açılır; durum kayıttan sonra değişir. Görevi tamamlamak açık çalışmayı kapatır. Yalnız
        oturumu bitirmek görevi tamamlamaz.
      </p>
      {inactive && (
        <button
          disabled={!!task.archivedAt}
          onClick={event => open({ kind: "state", action: "Reopen", trigger: event.currentTarget })}
        >
          Görevi yeniden aç
        </button>
      )}
      {task.state === "Completed" && scope.data?.hasOpenDescendants && (
        <p className="form-notice">Bu üst görev tamamlandı; altında açık görevler duruyor.</p>
      )}
      {task.state === "Completed" && scope.isPending && <p role="status">Alt işlerin tamamlanma durumu okunuyor…</p>}
      {task.state === "Completed" && scope.isError && (
        <div role="alert" className="form-error">
          <p>Alt işlerin güncel durumu alınamadı. Üstün tamamlanması bütün altların kapandığı anlamına gelmez.</p>
          <button onClick={() => void scope.refetch()}>Tamamlanma kapsamını yeniden yükle</button>
        </div>
      )}
      <details>
        <summary>Tamamlama ayrıntıları</summary>
        {task.hasDirectWork && (
          <label className="support-toggle">
            <input
              type="checkbox"
              checked={task.directWorkCompleted}
              disabled={!!task.archivedAt || inactive}
              aria-describedby="task-completion-help direct-completion-help"
              onChange={event =>
                open({
                  kind: "state",
                  action: task.directWorkCompleted ? "ReopenDirectWork" : "CompleteDirectWork",
                  trigger: event.currentTarget,
                })
              }
            />{" "}
            Yalnız kendi işi tamamlandı
          </label>
        )}
        {task.hasDirectWork && (
          <p id="direct-completion-help" className="muted form-hint">
            Alt görevleri değiştirmez. Kendi işi ve zorunlu altları tamamlanınca üst görev otomatik tamamlanabilir.
          </p>
        )}
        {task.parentTaskId && (
          <label className="support-toggle">
            <input
              type="checkbox"
              checked={task.requiredForParent}
              disabled={!!task.archivedAt}
              aria-describedby="task-completion-help"
              onChange={event =>
                open({ kind: "required", required: !task.requiredForParent, trigger: event.currentTarget })
              }
            />{" "}
            Üst görevin tamamlanması için zorunlu
          </label>
        )}
        {task.state === "Completed" && (
          <p className="muted form-hint">
            Tamamlama:{" "}
            {task.completionOrigin === "Automatic" ? "zorunlu işler hazır olduğunda otomatik" : "manuel karar"}. Yeniden
            açmak bitmiş çalışma oturumlarını açmaz.
          </p>
        )}
      </details>
      <details>
        <summary>Diğer durumlar</summary>
        <p className="muted form-hint">
          Erteleme, atlama ve iptal tamamlanma sayılmaz. Seçtiğin göreve uygulanır; alt görevler ve geçmiş çalışma
          korunur. Üstlerin ilerlemesi yeniden değerlendirilir.
        </p>
        <div className="actions">
          {(["Defer", "Skip", "Cancel"] as const).map(action => (
            <button
              key={action}
              disabled={!!task.archivedAt || stateAlreadyMatches(task, action)}
              onClick={event => open({ kind: "state", action, trigger: event.currentTarget })}
            >
              {actionNames[action]}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

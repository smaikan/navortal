"use client";
import { useTaskDetail } from "./read-queries";
import { TaskReadContext } from "./read-context";
import { taskFailure } from "./model";
import { useDisplayPreferences } from "../workspace/queries";
import { TaskEditor } from "./editor";

export function TaskDetail({
  id,
  surface,
}: {
  id: string;
  surface: (content: React.ReactNode, pending?: boolean) => React.ReactNode;
}) {
  const task = useTaskDetail(id);
  const preferences = useDisplayPreferences();
  if (task.isError && !task.data)
    return surface(
      <div role="alert" className="form-error">
        <p>{taskFailure(task.error)}</p>
        <button onClick={() => void task.refetch()}>Görevi yeniden yükle</button>
      </div>,
    );
  if (preferences.isError && !preferences.data)
    return surface(
      <div role="alert" className="form-error">
        <p>Tercihlerin alınamadı. Görev bilgilerini düzenlemek için yeniden yükle.</p>
        <button onClick={() => void preferences.refetch()}>Tercihleri yeniden yükle</button>
      </div>,
    );
  if (!task.data || !preferences.data) return surface(<p role="status">Görev okunuyor…</p>, true);
  return (
    <TaskReadContext.Provider
      value={{
        view: task.data,
        refresh: async () => {
          const next = await task.refetch();
          if (next.isError || !next.data) throw next.error;
          return next.data;
        },
      }}
    >
      <TaskEditor initial={task.data.task} zone={preferences.data.values.timeZoneId} surface={surface} />
    </TaskReadContext.Provider>
  );
}

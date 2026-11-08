import { useOptionalWork } from "./coordinator";

/** Şu an sayacı çalışan (duraklatılmamış) görevin kimliği; yoksa null. */
export function useRunningTaskId() {
  const work = useOptionalWork()?.work;
  return work && work.state === "Running" && work.taskId ? work.taskId : null;
}

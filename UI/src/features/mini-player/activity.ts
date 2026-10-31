import type { Focus } from "../focus/model";
import type { Work } from "../work/model";

/** Eski odağın sayacı yeni görevin üstüne geçmez; doğrulanmış duraklama da eski Running yanıtını bastırır. */
export function miniActivity(work: Work | null, focus: Focus | null | undefined) {
  const linked = focus && (!work || focus.workSessionId === work.id) ? focus : null;
  const runningFocus = linked && (linked.state === "Working" || linked.state === "Break") ? linked : null;
  const runningWork = work?.state === "Running" && linked?.state !== "Paused" ? work : null;
  return { runningFocus, runningWork };
}

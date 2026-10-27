import type { components } from "../../../lib/api/generated/schema";
import { ApiError } from "../../../lib/api/errors";
import { readTask, taskFailure, type Task } from "../model";
export type Summary = components["schemas"]["WorkloadSummary"];
export type Time = components["schemas"]["TaskTimeView"];
export type Progress = components["schemas"]["TaskProgress"];
export type ComponentPage = components["schemas"]["WorkComponentPage"];
export type WorkDraft = {
  hasDirectWork: boolean;
  minutes: string;
  seconds: string;
  budgetMinutes: string;
  budgetSeconds: string;
};
const max = 9223372036854775807n;
const int = (v: unknown, signed = false): boolean =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && (signed || v >= 0)
    : typeof v === "string" &&
      (signed ? /^-?\d+$/ : /^\d+$/).test(v) &&
      BigInt(v) <= max &&
      BigInt(v) >= (signed ? -max : 0n);
const decimal = (v: unknown): boolean =>
  (typeof v === "number" || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0;
const maybe = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const ratio = (v: unknown) => maybe(v, x => decimal(x) && Number(x) <= 1);
function invalid(): never {
  throw new ApiError("protocol", "Süre veya ilerleme yanıtı eksik. Yeniden yükle.");
}
export function readWorkTask(task: Task): Task {
  readTask(task);
  if (
    !maybe(task.targetBudgetSeconds, int) ||
    typeof task.directWorkCompleted !== "boolean" ||
    typeof task.requiredForParent !== "boolean"
  )
    invalid();
  return task;
}
export function readSummary(v: Summary, id: string): Summary {
  if (
    !v ||
    v.taskId !== id ||
    !int(v.knownEstimatedSeconds) ||
    !int(v.unknownEstimateCount) ||
    !maybe(v.calculatedTotalSeconds, int) ||
    !maybe(v.targetBudgetSeconds, int) ||
    !maybe(v.targetDifferenceSeconds, x => int(x, true))
  )
    invalid();
  return v;
}
export function readTime(v: Time, id: string): Time {
  if (
    !v ||
    v.taskId !== id ||
    ![v.directActualSeconds, v.subtreeActualSeconds, v.knownRemainingSeconds, v.knownOvertimeSeconds].every(decimal) ||
    !int(v.unknownRemainingCount) ||
    !int(v.unknownEstimateCount) ||
    !maybe(v.remainingSeconds, decimal) ||
    typeof v.serverNow !== "string" ||
    !Number.isFinite(Date.parse(v.serverNow))
  )
    invalid();
  return v;
}
export function readProgress(v: Progress, id: string): Progress {
  if (
    !v ||
    v.taskId !== id ||
    ![
      v.totalTaskCount,
      v.completedTaskCount,
      v.componentCount,
      v.completedComponentCount,
      v.knownEstimatedSeconds,
      v.knownCompletedEstimatedSeconds,
      v.unknownEstimateCount,
      v.requiredChildCount,
      v.incompleteRequiredChildCount,
    ].every(x => int(x)) ||
    !ratio(v.countProgress) ||
    !ratio(v.durationProgress) ||
    typeof v.hasOpenChildren !== "boolean" ||
    typeof v.hasOpenDescendants !== "boolean"
  )
    invalid();
  return v;
}
export function readComponents(v: ComponentPage, offset: number): ComponentPage {
  if (
    !v ||
    !Array.isArray(v.items) ||
    v.items.length > 25 ||
    Number(v.offset) !== offset ||
    Number(v.limit) !== 25 ||
    !int(v.total) ||
    new Set(v.items.map(x => x.taskId)).size !== v.items.length ||
    !v.items.every(x => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(x.taskId) && maybe(x.estimatedSeconds, int))
  )
    invalid();
  return v;
}
/** Yalnız biçimlendirme. Bu değerlerden kalan süre, ilerleme veya toplam türetmiyoruz. */
export function duration(value: number | string): string {
  const text =
    typeof value === "number"
      ? value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
      : value;
  const negative = text.startsWith("-");
  const whole = BigInt(text.split(".")[0]);
  const abs = whole < 0n ? -whole : whole;
  const fraction = text.split(".")[1]?.replace(/0+$/, "");
  const seconds = `${abs % 60n}${fraction ? `,${fraction}` : ""}`;
  return `${negative ? "−" : ""}${abs / 60n} dk${abs % 60n || fraction ? ` ${seconds} sn` : ""}`;
}
export function percentage(value: number | string | null) {
  return value === null
    ? "Hesaplanamıyor"
    : new Intl.NumberFormat("tr", { style: "percent", maximumFractionDigits: 1 }).format(Number(value));
}
function split(value: number | string | null): [string, string] {
  return value === null ? ["", ""] : [String(BigInt(value) / 60n), String(BigInt(value) % 60n)];
}
export function workDraft(task: Task): WorkDraft {
  const [minutes, seconds] = split(task.directEstimatedSeconds);
  const [budgetMinutes, budgetSeconds] = split(task.targetBudgetSeconds);
  return { hasDirectWork: task.hasDirectWork, minutes, seconds, budgetMinutes, budgetSeconds };
}
function parse(minutes: string, seconds: string): string | null {
  if (minutes === "" && seconds === "") return null;
  if (![minutes, seconds].every(x => x === "" || /^\d+$/.test(x)) || (seconds && BigInt(seconds) > 59n))
    throw new Error("Dakika sıfır veya pozitif tam sayı, saniye 0–59 olmalı. Boş süre belirtilmemiş demektir.");
  const value = BigInt(minutes || "0") * 60n + BigInt(seconds || "0");
  if (value > max) throw new Error("Süre desteklenen en büyük değeri aşıyor.");
  return String(value);
}
export function workBody(task: Task, draft: WorkDraft): components["schemas"]["WorkDefinitionRequest"] {
  return {
    version: task.version,
    hasDirectWork: draft.hasDirectWork,
    directEstimatedSeconds: draft.hasDirectWork ? parse(draft.minutes, draft.seconds) : null,
    targetBudgetSeconds: parse(draft.budgetMinutes, draft.budgetSeconds),
  };
}
/** Sürenin dakika/saniye parçalarıyla iş türü tek düzenleme niyetidir. */
export function rebaseWorkDraft(base: Task, draft: WorkDraft, latest: Task): WorkDraft {
  const original = workDraft(base);
  const remote = workDraft(latest);
  const ownChanged =
    draft.hasDirectWork !== original.hasDirectWork ||
    draft.minutes !== original.minutes ||
    draft.seconds !== original.seconds;
  const budgetChanged =
    draft.budgetMinutes !== original.budgetMinutes || draft.budgetSeconds !== original.budgetSeconds;
  return {
    hasDirectWork: ownChanged ? draft.hasDirectWork : remote.hasDirectWork,
    minutes: ownChanged ? draft.minutes : remote.minutes,
    seconds: ownChanged ? draft.seconds : remote.seconds,
    budgetMinutes: budgetChanged ? draft.budgetMinutes : remote.budgetMinutes,
    budgetSeconds: budgetChanged ? draft.budgetSeconds : remote.budgetSeconds,
  };
}
export function workFailure(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      work_history_exists: "Gerçek çalışma geçmişi var. Kendi işini koru; geçmiş silinemez.",
      task_has_schedule: "Gelecekte kendi işine ayrılmış bloklar var. Önce bu blokları düzenle.",
      work_completed_reopen: "İş niteliğini değiştirmeden önce görevi yeniden aç.",
      work_budget_required: "Kapsayıcıya çevirirken hedef toplam bütçeyi açıkça belirt. Eski tahmin otomatik taşınmaz.",
      workload_overflow: "Bu süre alt ağacın desteklenen toplamını aşıyor. Daha küçük bir değer gir.",
      work_definition_invalid: "İş türünü ve süreleri kontrol et. Kapsayıcı kendi iş tahminini taşıyamaz.",
    };
    if (!error.outcomeUnknown && error.code && messages[error.code]) return messages[error.code];
    if (!error.outcomeUnknown && error.status === 400)
      return "Sunucu süre veya bütçe değerlerini kabul etmedi. Alanları kontrol et; taslağın korundu.";
    return taskFailure(error);
  }
  return error instanceof Error ? error.message : "Süreler kaydedilemedi. Taslağın korundu.";
}

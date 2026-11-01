import { Temporal } from "temporal-polyfill";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { validTaskId } from "../../components/layout/task-panel-url";
import { resolveWallTime, type WallChoice } from "../../lib/time/wall-time";
import { readTask, taskFailure } from "../tasks/model";
export type Note = components["schemas"]["NoteView"];
export type Kind = Note["kind"];
export type Display = components["schemas"]["NoteDisplay"];
export type Category = components["schemas"]["NoteCategoryView"];
export type CategoryList = components["schemas"]["NoteCategoryList"];
export type CategoryColor = components["schemas"]["NoteCategoryColor"];
export type ViewMode = components["schemas"]["NoteViewMode"];
export type Context = { taskId?: string; workSessionId?: string };
export type ReturnContext = components["schemas"]["ReturnContext"];
const kindNames: Record<Kind, true> = { Task: true, Distraction: true, NextStep: true, Daily: true, General: true };
const displays: Record<Display, true> = { Short: true, Detailed: true, Toggle: true };
const viewModes: Record<ViewMode, true> = { Cards: true, List: true };
/** Kategori renk anahtarları palet sırasında. Asıl CSS renkleri globals.css'te. */
export const colors: Record<CategoryColor, string> = {
  Gray: "Gri",
  Blue: "Mavi",
  Teal: "Turkuaz",
  Green: "Yeşil",
  Red: "Kırmızı",
  Pink: "Pembe",
  Purple: "Mor",
};
export const pageSize = 25;
export const titleLimit = 200;
export const textLimit = 10000;
export const categoryNameLimit = 40;
const id = (v: unknown) => typeof v === "string" && validTaskId(v);
const nullableId = (v: unknown) => v === null || id(v);
const integer = (v: unknown, min = 0) =>
  typeof v === "number"
    ? Number.isSafeInteger(v) && v >= min
    : typeof v === "string" &&
      /^(0|[1-9]\d*)$/.test(v) &&
      BigInt(v) >= BigInt(min) &&
      BigInt(v) <= 9223372036854775807n;
const instant = (v: unknown) => {
  try {
    return typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && !!Temporal.Instant.from(v);
  } catch {
    return false;
  }
};
const bounded = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && v.length <= max;
function invalid(): never {
  throw new ApiError("protocol", "Not yanıtı eksik veya geçersiz. Güncel notları yeniden oku.");
}
export function localDate(v: string) {
  const d = Temporal.PlainDate.from(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || d.year < 2 || d.year > 9998) throw new RangeError("Geçerli bir yerel gün seç.");
  return d.toString();
}
export function readNote(n: Note): Note {
  if (
    !n ||
    !id(n.id) ||
    !Object.hasOwn(kindNames, n.kind) ||
    !Object.hasOwn(displays, n.display) ||
    !bounded(n.text, textLimit) ||
    (n.display === "Short" ? n.title !== null : !bounded(n.title, titleLimit)) ||
    !nullableId(n.taskId) ||
    !nullableId(n.workSessionId) ||
    !nullableId(n.convertedTaskId) ||
    !nullableId(n.categoryId) ||
    !(n.taskTitle === null || (typeof n.taskTitle === "string" && n.taskTitle.length <= 300)) ||
    (n.taskTitle !== null && !n.taskId) ||
    !integer(n.version, 1) ||
    ![n.createdAt, n.updatedAt].every(instant) ||
    ![n.dueAt, n.deletedAt].every(v => v === null || instant(v)) ||
    (n.kind === "Daily" ? typeof n.localDate !== "string" : n.localDate !== null) ||
    (["Task", "NextStep"].includes(n.kind) && !n.taskId)
  )
    invalid();
  try {
    if (n.localDate) localDate(n.localDate);
    if (typeof n.timeZoneId !== "string" || !n.timeZoneId) invalid();
    Temporal.Now.zonedDateTimeISO(n.timeZoneId);
  } catch {
    invalid();
  }
  return n;
}
export type NoteScope = {
  taskId?: string;
  kind?: Kind;
  date?: string;
  categoryId?: string;
  taskLinked?: boolean;
};
export function readNotes(p: components["schemas"]["NotePage"], limit = pageSize, scope: NoteScope = {}) {
  if (!p || !Array.isArray(p.items) || p.items.length > limit || !integer(p.total) || !integer(p.offset)) invalid();
  p.items.forEach(n => {
    readNote(n);
    if (
      n.deletedAt !== null ||
      (scope.taskId && n.taskId !== scope.taskId) ||
      (scope.kind ? n.kind !== scope.kind : n.kind === "NextStep") ||
      (scope.date && n.localDate !== scope.date) ||
      (scope.categoryId && n.categoryId !== scope.categoryId) ||
      (scope.taskLinked && !n.taskId)
    )
      invalid();
  });
  return p;
}
export function readCategory(c: Category): Category {
  if (
    !c ||
    !id(c.id) ||
    !bounded(c.name, categoryNameLimit) ||
    !Object.hasOwn(colors, c.color) ||
    typeof c.showInBar !== "boolean" ||
    typeof c.pinInAll !== "boolean" ||
    !Object.hasOwn(viewModes, c.viewMode) ||
    ![c.createdAt, c.updatedAt].every(instant) ||
    !(c.removedAt === null || instant(c.removedAt)) ||
    !integer(c.version, 1)
  )
    invalid();
  return c;
}
export function readCategoryList(l: CategoryList): CategoryList {
  if (
    !l ||
    !Array.isArray(l.items) ||
    l.items.length > 1000 ||
    !Object.hasOwn(viewModes, l.allViewMode) ||
    !Object.hasOwn(viewModes, l.taskViewMode) ||
    !integer(l.notesVersion)
  )
    invalid();
  l.items.forEach(readCategory);
  if (new Set(l.items.map(c => c.id)).size !== l.items.length) invalid();
  return l;
}
/** Kaldırılmış kategori listede kalır, notun bağı korunur. Yeni seçim olarak sunulmaz. */
export const activeCategories = (l: CategoryList | undefined) => l?.items.filter(c => c.removedAt === null) ?? [];
export function readSystemViews(v: components["schemas"]["NoteSystemViews"]) {
  if (!v || !Object.hasOwn(viewModes, v.allViewMode) || !Object.hasOwn(viewModes, v.taskViewMode)) invalid();
  return v;
}
/** Eski tek metinli not gövdesi; Sıkıştım adımı ve çalışma dikkat notu için. */
export function noteFields(kind: Kind, text: string, context: Context, date: string, dueAt: string | null) {
  if (!text.trim() || text.trim().length > textLimit) throw new RangeError("Not 1–10000 karakter olmalı.");
  if (!Object.hasOwn(kindNames, kind) || kind === "Daily") throw new RangeError("Geçerli bir not türü seç.");
  if (["Task", "NextStep"].includes(kind) && !context.taskId && !context.workSessionId)
    throw new RangeError("Bu not türü için bir görev seç.");
  if ((context.taskId && !id(context.taskId)) || (context.workSessionId && !id(context.workSessionId)))
    throw new RangeError("Not bağlamını yeniden seç.");
  void date;
  return {
    kind,
    text: text.trim(),
    taskId: context.taskId ?? null,
    workSessionId: context.workSessionId ?? null,
    localDate: null,
    dueAt,
  };
}
export type Draft = {
  text: string;
  title: string;
  detailed: boolean;
  toggle: boolean;
  categoryId: string | null;
  taskId: string | null;
  dueAt: string | null;
};
export const draftDisplay = (d: Pick<Draft, "detailed" | "toggle">): Display =>
  !d.detailed ? "Short" : d.toggle ? "Toggle" : "Detailed";
/** Alan hatası kendi alanının yanında. API ayrıca kontrol ediyor. */
export function draftIssues(d: Draft) {
  const issues: { text?: string; title?: string } = {};
  if (!d.text.trim()) issues.text = d.detailed ? "Açıklama yaz." : "Notunu yaz.";
  else if (d.text.trim().length > textLimit) issues.text = "Not en çok 10000 karakter olabilir.";
  if (d.detailed && !d.title.trim()) issues.title = "Ayrıntılı not için başlık yaz.";
  else if (d.detailed && d.title.trim().length > titleLimit) issues.title = "Başlık en çok 200 karakter olabilir.";
  return issues;
}
export function draftFields(d: Draft, dayDate?: string): components["schemas"]["NoteFields"] {
  const issues = draftIssues(d);
  if (issues.title || issues.text) throw new RangeError(issues.title ?? issues.text);
  if ((d.categoryId && !id(d.categoryId)) || (d.taskId && !id(d.taskId)))
    throw new RangeError("Not bağlamını yeniden seç.");
  return {
    ...(dayDate ? { kind: "Daily", localDate: localDate(dayDate) } : { kind: "General" }),
    text: d.text.trim(),
    title: d.detailed ? d.title.trim() : null,
    display: draftDisplay(d),
    categoryId: d.categoryId,
    taskId: d.taskId,
    dueAt: d.dueAt,
  };
}
export function editFields(note: Note, d: Draft): components["schemas"]["EditNoteRequest"] {
  const body = draftFields(d);
  if (note.kind === "NextStep" && (body.display !== "Short" || body.categoryId))
    throw new RangeError("Sonraki adım notu kısa ve kategorisiz kalır.");
  return {
    version: note.version,
    text: body.text,
    dueAt: d.dueAt,
    display: body.display,
    title: body.title,
    categoryId: body.categoryId,
  };
}
export const noteDraft = (n: Note): Draft => ({
  text: n.text,
  title: n.title ?? "",
  detailed: n.display !== "Short",
  toggle: n.display === "Toggle",
  categoryId: n.categoryId,
  taskId: n.taskId,
  dueAt: n.dueAt,
});
/** Seçilen gün ve varsa saat, hesabın saat diliminde tek ana çevrilir. Saatsiz tarih yerel gece yarısıdır. */
export function dueAt(date: string, time: string, zone: string) {
  if (!date) return null;
  return resolveWallTime(`${localDate(date)}T${time || "00:00"}`, zone, "earlier");
}
export function dueParts(value: string | null, zone: string) {
  if (!value) return { date: "", time: "" };
  const local = Temporal.Instant.from(value).toZonedDateTimeISO(zone);
  const time = local.toPlainTime();
  return {
    date: local.toPlainDate().toString(),
    time: time.hour || time.minute ? time.toString({ smallestUnit: "minute" }) : "",
  };
}
export function dueLabel(value: string | null, zone: string, today: string) {
  if (!value) return "";
  const parts = dueParts(value, zone);
  const day = Temporal.PlainDate.from(parts.date);
  const diff = day.since(Temporal.PlainDate.from(today), { largestUnit: "days" }).days;
  const name =
    diff === 0
      ? "Bugün"
      : diff === 1
        ? "Yarın"
        : new Intl.DateTimeFormat("tr-TR", {
            timeZone: "UTC",
            day: "numeric",
            month: "long",
            ...(day.year !== Temporal.PlainDate.from(today).year && { year: "numeric" }),
          }).format(new Date(`${parts.date}T12:00:00Z`));
  return parts.time ? `${name} ${parts.time}` : name;
}
export function dueInput(value: string | null, zone: string) {
  return value
    ? Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "second" })
    : "";
}
export function resolveDue(value: string, zone: string, choice: WallChoice, original: string | null, edited: boolean) {
  return !edited ? original : value ? resolveWallTime(value, zone, choice) : null;
}
export function readConversion(v: components["schemas"]["ConvertedNote"], expectedId: string) {
  if (
    !v ||
    v.noteId !== expectedId ||
    !id(v.taskId) ||
    !integer(v.noteVersion, 1) ||
    !integer(v.planningVersion) ||
    typeof v.replayed !== "boolean"
  )
    invalid();
  return v;
}
export function readReturn(v: ReturnContext, taskId: string): ReturnContext {
  if (
    !v ||
    v.taskId !== taskId ||
    !integer(v.planningVersion) ||
    !integer(v.openDirectTaskCount) ||
    !instant(v.serverNow)
  )
    invalid();
  if (v.lastNote !== null) readNote(v.lastNote);
  if (v.nextStepNote !== null && readNote(v.nextStepNote).kind !== "NextStep") invalid();
  if (v.suggestedStep !== null) readTask(v.suggestedStep);
  if (v.lastWork !== null) {
    const w = v.lastWork;
    if (
      !w ||
      !id(w.workSessionId) ||
      !id(w.taskId) ||
      !id(w.segmentId) ||
      !instant(w.startedAt) ||
      !(w.endedAt === null || instant(w.endedAt)) ||
      (w.endedAt && Temporal.Instant.compare(w.startedAt, w.endedAt) > 0)
    )
      invalid();
  }
  if (v.lastCompletion !== null) {
    const c = v.lastCompletion;
    if (!c || !id(c.taskId) || !instant(c.completedAt) || !integer(c.eventSequence, 1)) invalid();
  }
  return v;
}
export function noteFailure(e: unknown) {
  if (e instanceof ApiError) {
    if (e.kind === "protocol") return e.message;
    if (e.outcomeUnknown)
      return "Not işleminin sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Güncel notları kontrol et.";
    const messages: Record<string, string> = {
      version_conflict: "Not başka bir sekmede değişmiş. Taslağın korundu; güncel notu kontrol et.",
      note_already_converted: "Bu not zaten başka bir görev dönüşümüne bağlanmış. Güncel notu kontrol et.",
      note_not_found: "Nota erişilemiyor. Silinmiş veya bu hesaba ait olmayabilir.",
      note_context_mismatch: "Seçilen çalışma ve görev eşleşmiyor. Not bağlamını yeniden seç.",
      note_task_required: "Bu not türü gerçek bir görev gerektirir.",
      note_text_invalid: "Not 1–10000 karakter olmalı.",
      note_title_invalid: "Ayrıntılı not başlığı 1–200 karakter olmalı.",
      note_display_invalid: "Not gösterimini yeniden seç.",
      note_kind_retired: "Günlük not artık oluşturulmuyor; genel not ekle.",
      note_next_step_shape: "Sonraki adım notu kısa ve kategorisiz kalır.",
      note_not_deleted: "Not zaten listede. Güncel notları kontrol et.",
      note_search_invalid: "Arama en çok 200 karakter olabilir.",
      note_invalid: "Notun bağlamını kontrol et.",
      note_category_not_found: "Kategoriye erişilemiyor. Güncel kategorileri kontrol et.",
      note_category_removed: "Bu kategori kaldırılmış. Başka bir kategori seç ya da kategoriyi geri getir.",
      note_category_name_taken: "Bu adla bir kategori zaten var.",
      note_category_name_invalid: "Kategori adı 1–40 karakter olmalı.",
      note_category_limit: "En çok 100 etkin kategori olabilir.",
      note_category_not_removed: "Kategori zaten etkin. Güncel listeyi kontrol et.",
      note_category_move_invalid: "Kategori sırası değiştirilemedi. Güncel listeyi kontrol et.",
      pool_not_found: "Seçilen havuza erişilemiyor. Güncel havuzları kontrol et.",
    };
    if (e.code && messages[e.code]) return messages[e.code];
  }
  return e instanceof RangeError ? e.message : taskFailure(e);
}

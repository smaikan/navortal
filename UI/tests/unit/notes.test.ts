import { describe, expect, it } from "vitest";
import {
  dueInput,
  noteFields,
  readConversion,
  readNote,
  readNotes,
  readReturn,
  resolveDue,
  type Note,
  type ReturnContext,
} from "../../src/features/notes/model";
const id = "00000000-0000-0000-0000-000000000001",
  taskId = "00000000-0000-0000-0000-000000000002";
const note: Note = {
  id,
  kind: "Task",
  text: "Bir sonraki küçük adım",
  taskId,
  workSessionId: null,
  localDate: null,
  timeZoneId: "Europe/Istanbul",
  dueAt: "2026-10-22T09:00:00.123456Z",
  createdAt: "2026-10-21T09:00:00Z",
  updatedAt: "2026-10-21T09:00:00Z",
  deletedAt: null,
  convertedTaskId: null,
  version: "9007199254740993",
  title: null,
  categoryId: null,
  display: "Short",
  taskTitle: "Ana görev",
};
const empty: ReturnContext = {
  taskId,
  planningVersion: 1,
  lastWork: null,
  lastNote: null,
  nextStepNote: null,
  lastCompletion: null,
  suggestedStep: null,
  openDirectTaskCount: 0,
  serverNow: note.createdAt,
};
describe("note context and wire facts", () => {
  it("preserves precise versions and dates, including taskless distraction notes", () => {
    expect(readNote(note).version).toBe("9007199254740993");
    expect(readNote({ ...note, kind: "Distraction", taskId: null, taskTitle: null }).taskId).toBeNull();
  });
  it.each([
    { kind: "Task", taskId: null },
    { kind: "Daily", localDate: null },
    { localDate: "2026-10-21" },
    { timeZoneId: undefined },
    { timeZoneId: "unknown" },
    { version: 0 },
    { text: " " },
    { convertedTaskId: "bad" },
    { dueAt: "yarın" },
  ])("rejects malformed or mismatched note %j", patch => {
    expect(() => readNote({ ...note, ...patch } as never)).toThrow();
  });
  it("checks bounded pages and expected task/kind/date without inventing missing rows", () => {
    const p = { items: [note], offset: 0, limit: 25, total: 100 };
    expect(readNotes(p, 25, { taskId }).total).toBe(100);
    expect(() => readNotes(p, 25, { taskId: id })).toThrow();
    expect(() => readNotes(p, 25, { kind: "Daily" })).toThrow();
    expect(() => readNotes({ ...p, items: [{ ...note, kind: "NextStep" }] })).toThrow();
    expect(readNotes({ ...p, items: [{ ...note, kind: "NextStep" }] }, 25, { kind: "NextStep" }).items).toHaveLength(1);
    expect(() => readNotes(p, 25, { date: "2026-10-21" })).toThrow();
    expect(() => readNotes({ ...p, items: [{ ...note, deletedAt: note.updatedAt }] })).toThrow();
  });
  it("legacy single-text notes never create Daily; general focus is not assigned a fabricated task", () => {
    const fields = noteFields("Distraction", "  Dikkat  ", { workSessionId: id }, "invalid", null);
    expect(fields).toEqual({
      kind: "Distraction",
      text: "Dikkat",
      taskId: null,
      workSessionId: id,
      localDate: null,
      dueAt: null,
    });
    expect(() => noteFields("Daily", "Bugün", {}, "2026-10-21", null)).toThrow();
    expect(() => noteFields("Task", "Adım", {}, "", null)).toThrow();
    expect(noteFields("NextStep", "Dosyayı aç", { taskId }, "", null).kind).toBe("NextStep");
  });
  it("rejects an unrelated conversion receipt and preserves exact independent versions", () => {
    const r = { noteId: id, taskId, noteVersion: note.version, planningVersion: "9007199254740995", replayed: true };
    expect(readConversion(r, id)).toEqual(r);
    expect(() => readConversion(r, taskId)).toThrow();
  });
});
describe("note dates and return context", () => {
  it("a text-only edit preserves the original microsecond instant", () => {
    const input = dueInput(note.dueAt, note.timeZoneId);
    expect(input).toBe("2026-10-22T12:00:00");
    expect(resolveDue(input, note.timeZoneId, "", note.dueAt, false)).toBe(note.dueAt);
    expect(resolveDue("", note.timeZoneId, "", note.dueAt, true)).toBeNull();
  });
  it("explicit time changes respect DST gaps and require an overlap choice", () => {
    expect(() => resolveDue("2026-03-29T02:30", "Europe/Berlin", "", null, true)).toThrow();
    expect(() => resolveDue("2026-10-25T02:30", "Europe/Berlin", "", null, true)).toThrow();
    expect(resolveDue("2026-10-25T02:30", "Europe/Berlin", "later", null, true)).toBe("2026-10-25T01:30:00Z");
  });
  it("empty return context remains empty; a task id mismatch is a protocol failure", () => {
    expect(readReturn(empty, taskId)).toEqual(empty);
    expect(() => readReturn(empty, id)).toThrow();
  });
  it("accepts genuine sub-millisecond work and descendant notes without inventing a subtree engine", () => {
    const r = {
      ...empty,
      lastWork: {
        workSessionId: id,
        taskId: id,
        segmentId: taskId,
        startedAt: "2026-10-21T09:00:00.000001Z",
        endedAt: "2026-10-21T09:00:00.000002Z",
      },
      lastNote: note,
      nextStepNote: { ...note, kind: "NextStep" as const },
    };
    expect(readReturn(r, taskId).lastWork!.taskId).toBe(id);
    expect(() => readReturn({ ...r, nextStepNote: note }, taskId)).toThrow();
    expect(() => readReturn({ ...r, lastWork: { ...r.lastWork, endedAt: "2026-10-21T09:00:00Z" } }, taskId)).toThrow();
  });
});

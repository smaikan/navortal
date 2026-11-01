import { describe, expect, it } from "vitest";
import {
  activeCategories,
  colors,
  draftDisplay,
  draftFields,
  draftIssues,
  dueAt,
  dueLabel,
  dueParts,
  editFields,
  noteDraft,
  readCategoryList,
  readNote,
  readNotes,
  readSystemViews,
  type Category,
  type CategoryList,
  type Draft,
  type Note,
} from "../../src/features/notes/model";

const id = "00000000-0000-0000-0000-000000000011",
  other = "00000000-0000-0000-0000-000000000012",
  taskId = "00000000-0000-0000-0000-000000000013";
const category: Category = {
  id,
  name: "Uyarı",
  color: "Red",
  showInBar: true,
  pinInAll: true,
  viewMode: "Cards",
  createdAt: "2026-10-28T06:00:00Z",
  updatedAt: "2026-10-28T06:00:00Z",
  removedAt: null,
  version: 1,
};
const note: Note = {
  id: other,
  kind: "General",
  text: "H0: fark yok.\nH1: fark var.",
  taskId: null,
  workSessionId: null,
  localDate: null,
  timeZoneId: "Europe/Istanbul",
  dueAt: null,
  createdAt: "2026-10-28T06:00:00Z",
  updatedAt: "2026-10-28T06:00:00Z",
  deletedAt: null,
  convertedTaskId: null,
  version: 2,
  title: "Hipotez testleri",
  categoryId: id,
  display: "Detailed",
  taskTitle: null,
};
const draft: Draft = {
  text: "  Adaptör\nSu  ",
  title: "  Kontrol listesi ",
  detailed: true,
  toggle: true,
  categoryId: id,
  taskId,
  dueAt: null,
};

describe("note shapes", () => {
  it("accepts titled detailed/toggle notes and rejects titles on short ones or missing titles", () => {
    expect(readNote(note).display).toBe("Detailed");
    expect(readNote({ ...note, display: "Toggle" }).title).toBe("Hipotez testleri");
    expect(() => readNote({ ...note, display: "Short" })).toThrow();
    expect(() => readNote({ ...note, title: null })).toThrow();
    expect(() => readNote({ ...note, title: "x".repeat(201) })).toThrow();
    expect(() => readNote({ ...note, display: "Wide" as never })).toThrow();
    expect(() => readNote({ ...note, categoryId: "bad" })).toThrow();
    expect(() => readNote({ ...note, taskTitle: "Görev" })).toThrow();
  });
  it("scopes category and task-linked pages without trusting stray rows", () => {
    const page = { items: [note], offset: 0, limit: 25, total: 1 };
    expect(readNotes(page, 25, { categoryId: id }).total).toBe(1);
    expect(() => readNotes(page, 25, { categoryId: taskId })).toThrow();
    expect(() => readNotes(page, 25, { taskLinked: true })).toThrow();
  });
  it("builds a General note body; the text survives short ↔ detailed switching", () => {
    expect(draftFields(draft)).toEqual({
      kind: "General",
      text: "Adaptör\nSu",
      title: "Kontrol listesi",
      display: "Toggle",
      categoryId: id,
      taskId,
      dueAt: null,
    });
    const short = { ...draft, detailed: false };
    expect(draftFields(short)).toMatchObject({ text: "Adaptör\nSu", title: null, display: "Short" });
    expect(draftFields({ ...short, detailed: true })).toMatchObject({ text: "Adaptör\nSu", title: "Kontrol listesi" });
    expect(draftDisplay({ detailed: true, toggle: false })).toBe("Detailed");
    expect(draftDisplay({ detailed: false, toggle: true })).toBe("Short");
  });
  it("names the missing title or text instead of sending an empty note", () => {
    expect(draftIssues({ ...draft, title: " " })).toEqual({ title: "Ayrıntılı not için başlık yaz." });
    expect(draftIssues({ ...draft, text: "", detailed: false })).toEqual({ text: "Notunu yaz." });
    expect(() => draftFields({ ...draft, title: "" })).toThrow("başlık");
    expect(() => draftFields({ ...draft, title: "x".repeat(201) })).toThrow();
  });
  it("edits keep the version and round-trip an existing note; NextStep stays short and uncategorised", () => {
    const back = editFields(note, noteDraft(note));
    expect(back).toEqual({
      version: 2,
      text: note.text,
      dueAt: null,
      display: "Detailed",
      title: "Hipotez testleri",
      categoryId: id,
    });
    const step: Note = {
      ...note,
      kind: "NextStep",
      display: "Short",
      title: null,
      categoryId: null,
      taskId,
      taskTitle: "İş",
    };
    expect(editFields(step, noteDraft(step)).display).toBe("Short");
    expect(() => editFields(step, { ...noteDraft(step), categoryId: id })).toThrow();
  });
});

describe("categories", () => {
  const list: CategoryList = {
    items: [category],
    allViewMode: "Cards",
    taskViewMode: "List",
    notesVersion: "9007199254740993",
  };
  it("reads the owner list exactly and offers only active categories", () => {
    const removed = { ...category, id: other, name: "Ev", color: "Purple" as const, removedAt: "2026-10-28T07:00:00Z" };
    const read = readCategoryList({ ...list, items: [category, removed] });
    expect(read.notesVersion).toBe("9007199254740993");
    expect(activeCategories(read).map(c => c.name)).toEqual(["Uyarı"]);
    expect(activeCategories(undefined)).toEqual([]);
  });
  it.each([
    { name: "" },
    { name: "x".repeat(41) },
    { color: "Amber" },
    { viewMode: "Grid" },
    { showInBar: "yes" },
    { version: 0 },
    { removedAt: "dün" },
  ])("rejects a malformed category %j", patch => {
    expect(() => readCategoryList({ ...list, items: [{ ...category, ...patch } as never] })).toThrow();
  });
  it("rejects duplicate ids and unknown view modes", () => {
    expect(() => readCategoryList({ ...list, items: [category, category] })).toThrow();
    expect(() => readCategoryList({ ...list, allViewMode: "Grid" as never })).toThrow();
    expect(readSystemViews({ allViewMode: "List", taskViewMode: "Cards" }).allViewMode).toBe("List");
    expect(() => readSystemViews({ allViewMode: "List", taskViewMode: "Wide" as never })).toThrow();
  });
  it("names all seven palette colours in order", () => {
    expect(Object.keys(colors)).toEqual(["Gray", "Blue", "Teal", "Green", "Red", "Pink", "Purple"]);
  });
});

describe("note dates", () => {
  it("a picked day is local midnight in the account zone and reads back without a time", () => {
    const value = dueAt("2026-10-29", "", "Europe/Istanbul");
    expect(value).toBe("2026-10-28T21:00:00Z");
    expect(dueParts(value, "Europe/Istanbul")).toEqual({ date: "2026-10-29", time: "" });
    expect(dueLabel(value, "Europe/Istanbul", "2026-10-28")).toBe("Yarın");
    expect(dueLabel(value, "Europe/Istanbul", "2026-10-29")).toBe("Bugün");
  });
  it("keeps an explicit time and labels other days by date", () => {
    const value = dueAt("2026-11-03", "14:30", "Europe/Istanbul");
    expect(dueParts(value, "Europe/Istanbul")).toEqual({ date: "2026-11-03", time: "14:30" });
    expect(dueLabel(value, "Europe/Istanbul", "2026-10-28")).toBe("3 Kasım 14:30");
    expect(dueAt("", "10:00", "Europe/Istanbul")).toBeNull();
    expect(() => dueAt("2026-03-29", "02:30", "Europe/Berlin")).toThrow();
  });
});

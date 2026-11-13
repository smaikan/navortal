import { describe, expect, it } from "vitest";
import { groupReminders, reminderWhen, type Reminder } from "../../src/features/reminders/model";
import { activeFilters } from "../../src/features/tasks/filter-panel";

const zone = "Europe/Istanbul";
const today = "2026-11-14";
const at = (iso: string) => new Date(iso).toISOString();
const reminder = (id: string, dueAt: string) => ({ id, title: id, dueAt }) as unknown as Reminder;

describe("reminder grouping and relative time", () => {
  it("groups by local day: today (including overdue), tomorrow, later", () => {
    // 14 Kasım 16:00 İstanbul = 13:00Z; 15 Kasım 09:00 = 06:00Z; 20 Kasım 14:00 = 11:00Z
    const items = [
      reminder("overdue", at("2026-11-14T05:00:00Z")),
      reminder("today", at("2026-11-14T13:00:00Z")),
      reminder("tomorrow", at("2026-11-15T06:00:00Z")),
      reminder("later", at("2026-11-20T11:00:00Z")),
    ];
    const groups = groupReminders(items, zone, today);
    expect(groups.map(g => [g.key, g.rows.map(r => r.reminder.id)])).toEqual([
      ["today", ["overdue", "today"]],
      ["tomorrow", ["tomorrow"]],
      ["later", ["later"]],
    ]);
    expect(groups[0].rows.map(r => r.index)).toEqual([0, 1]);
  });
  it("omits empty groups and keeps the day boundary in the user's zone", () => {
    // 14 Kasım 23:30Z = 15 Kasım 02:30 İstanbul → yarın
    expect(groupReminders([reminder("night", at("2026-11-14T23:30:00Z"))], zone, today).map(g => g.key)).toEqual([
      "tomorrow",
    ]);
    expect(groupReminders([], zone, today)).toEqual([]);
  });
  it("describes today in minutes and hours, tomorrow by weekday, later by short date", () => {
    const now = Date.parse("2026-11-14T13:00:00Z");
    expect(reminderWhen(at("2026-11-14T13:12:00Z"), now, zone, today)).toEqual({
      time: "16:12",
      text: "12 dk sonra",
      soon: true,
    });
    expect(reminderWhen(at("2026-11-14T14:45:00Z"), now, zone, today).text).toBe("1 sa 45 dk sonra");
    expect(reminderWhen(at("2026-11-14T15:00:00Z"), now, zone, today)).toMatchObject({
      text: "2 sa sonra",
      soon: false,
    });
    expect(reminderWhen(at("2026-11-14T12:59:00Z"), now, zone, today)).toMatchObject({
      text: "Zamanı geldi",
      soon: true,
    });
    expect(reminderWhen(at("2026-11-15T06:00:00Z"), now, zone, today)).toEqual({
      time: "09:00",
      text: "Pazar",
      soon: false,
    });
    expect(reminderWhen(at("2026-11-20T11:00:00Z"), now, zone, today).text).toBe("Cum 20 Kas");
  });
});

describe("task filter chips", () => {
  it("lists only the active filters with readable labels and how to clear each", () => {
    const params = new URLSearchParams("priority=High&estimate=short&dateFrom=2026-11-14&dateTo=2026-11-14");
    const chips = activeFilters(params, today);
    expect(chips.map(c => c.label)).toEqual(["Bugün", "Yüksek öncelik", "30 dk ve altı"]);
    expect(chips[0].clear).toEqual({ dateFrom: null, dateTo: null });
    expect(activeFilters(new URLSearchParams(), today)).toEqual([]);
    expect(activeFilters(new URLSearchParams("state=Completed"), today).map(c => c.label)).toEqual(["Biten"]);
  });
});

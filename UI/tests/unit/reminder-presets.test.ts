import { describe, expect, it } from "vitest";
import {
  defaultPresets,
  parsePresets,
  presetDue,
  presetLabel,
  presetValid,
} from "../../src/features/reminders/presets";

describe("reminder presets", () => {
  it("labels presets", () => {
    expect(defaultPresets.map(presetLabel)).toEqual(["10 dk sonra", "1 saat sonra", "Yarın sabah"]);
    expect(presetLabel({ kind: "after", minutes: 90 })).toBe("1 saat 30 dk sonra");
    expect(presetLabel({ kind: "tomorrow", time: "18:30" })).toBe("Yarın 18:30");
  });
  it("validates ranges", () => {
    expect(presetValid({ kind: "after", minutes: 0 })).toBe(false);
    expect(presetValid({ kind: "after", minutes: 1441 })).toBe(false);
    expect(presetValid({ kind: "after", minutes: 1.5 })).toBe(false);
    expect(presetValid({ kind: "tomorrow", time: "24:00" })).toBe(false);
    expect(presetValid({ kind: "tomorrow", time: "07:05" })).toBe(true);
  });
  it("falls back to defaults on missing or broken storage and drops invalid rows", () => {
    expect(parsePresets(null)).toEqual(defaultPresets);
    expect(parsePresets("{oops")).toEqual(defaultPresets);
    expect(parsePresets('{"a":1}')).toEqual(defaultPresets);
    expect(parsePresets('[{"kind":"after","minutes":5},{"kind":"after","minutes":-1},{"x":1}]')).toEqual([
      { kind: "after", minutes: 5 },
    ]);
  });
  it("keeps an empty saved list empty and caps at six", () => {
    expect(parsePresets("[]")).toEqual([]);
    const many = JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ kind: "after", minutes: i + 1 })));
    expect(parsePresets(many)).toHaveLength(6);
  });
  it("computes the due time", () => {
    const due = presetDue({ kind: "tomorrow", time: "08:15" }, "Europe/Istanbul");
    expect(due).toMatch(/^\d{4}-\d{2}-\d{2}T08:15$/);
    expect(presetDue({ kind: "after", minutes: 15 }, "Europe/Istanbul")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

import { Temporal } from "temporal-polyfill";
import { reminderAfter, reminderToday } from "./model";

/** Hatırlatma kısayolu: şimdiden N dakika sonra ya da yarın belirli saatte. Cihaza özel, hesapla senkronlanmaz. */
export type ReminderPreset = { kind: "after"; minutes: number } | { kind: "tomorrow"; time: string };

export const defaultPresets: ReminderPreset[] = [
  { kind: "after", minutes: 10 },
  { kind: "after", minutes: 60 },
  { kind: "tomorrow", time: "09:00" },
];
export const maxPresets = 6;
export const maxMinutes = 1440;
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

export function presetLabel(preset: ReminderPreset) {
  if (preset.kind === "tomorrow") return preset.time === "09:00" ? "Yarın sabah" : `Yarın ${preset.time}`;
  const hours = Math.floor(preset.minutes / 60);
  const minutes = preset.minutes % 60;
  if (!hours) return `${minutes} dk sonra`;
  return `${hours} saat${minutes ? ` ${minutes} dk` : ""} sonra`;
}

export function presetDue(preset: ReminderPreset, zone: string) {
  return preset.kind === "after"
    ? reminderAfter(preset.minutes, zone)
    : `${Temporal.PlainDate.from(reminderToday(zone)).add({ days: 1 }).toString()}T${preset.time}`;
}

export function presetValid(preset: ReminderPreset) {
  return preset.kind === "after"
    ? Number.isInteger(preset.minutes) && preset.minutes >= 1 && preset.minutes <= maxMinutes
    : clock.test(preset.time);
}

/** Kayıtlı değer bozuksa varsayılana dönülür; geçersiz satırlar atılır. */
export function parsePresets(raw: string | null): ReminderPreset[] {
  if (!raw) return defaultPresets;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return defaultPresets;
    const list = value
      .filter(
        (item): item is ReminderPreset => !!item && typeof item === "object" && presetValid(item as ReminderPreset),
      )
      .map(item =>
        item.kind === "after"
          ? { kind: "after" as const, minutes: item.minutes }
          : { kind: "tomorrow" as const, time: item.time },
      )
      .slice(0, maxPresets);
    return list;
  } catch {
    return defaultPresets;
  }
}

import type { Settings } from "./model";

/** Ritim kartı, başlatma özeti ve sayaç aynı küçük hesapları kullanıyor. Sunucu kuralı değil, yalnız görünüm. */
export const shortTime = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} dk` : `${seconds} sn`);

// Hazır ritimler API'den adsız geliyor. Adlar yalnız arayüz metni.
const builtInNames: Record<string, string> = {
  "900/300": "Kısa adım",
  "1500/300": "Klasik",
  "2700/600": "Derin odak",
};
export function rhythmName(s: Settings) {
  return (
    builtInNames[`${s.workSeconds}/${s.shortBreakSeconds}`] ??
    `${shortTime(s.workSeconds)} / ${shortTime(s.shortBreakSeconds)}`
  );
}
export function longBreakLabel(s: Settings) {
  return `${s.longBreakEvery} döngüde bir ${shortTime(s.longBreakSeconds)} uzun mola`;
}
export function rhythmSummary(s: Settings) {
  return `${shortTime(s.workSeconds)} çalışma / ${shortTime(s.shortBreakSeconds)} mola · ${longBreakLabel(s)}`;
}

export type Segment = { kind: "work" | "short" | "long"; seconds: number };
/** Bir tur: her döngüde çalışma ve kısa mola, son döngüde uzun mola. */
export function cycleSegments(s: Settings): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i <= s.longBreakEvery; i++) {
    out.push({ kind: "work", seconds: s.workSeconds });
    out.push(
      i === s.longBreakEvery
        ? { kind: "long", seconds: s.longBreakSeconds }
        : { kind: "short", seconds: s.shortBreakSeconds },
    );
  }
  return out;
}
export const roundSeconds = (s: Settings) =>
  s.longBreakEvery * s.workSeconds + (s.longBreakEvery - 1) * s.shortBreakSeconds + s.longBreakSeconds;

export function spanText(seconds: number) {
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.round(seconds / 60),
    h = Math.floor(minutes / 60),
    m = minutes % 60;
  return [h && `${h} sa`, m && `${m} dk`].filter(Boolean).join(" ");
}

/** Saat dilimi kullanıcı tercihinden geliyor; tarayıcının saat dilimi farklı olabilir. */
export function clockAt(epochMs: number, zone: string) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(epochMs);
}

/** Uzun molaya kadar olan sıra: 1..longBreakEvery. */
export function cyclePosition(cycleNumber: number, every: number) {
  return ((Math.max(1, cycleNumber) - 1) % Math.max(1, every)) + 1;
}

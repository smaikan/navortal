import { readCoverage } from "../workspace/read-coverage";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { Temporal } from "temporal-polyfill";

export type SpecialDay = components["schemas"]["SpecialDayView"];
export type SpecialDayPage = components["schemas"]["SpecialDayPage"];
export type Occurrence = components["schemas"]["SpecialDayOccurrence"];
export type OccurrencePage = components["schemas"]["SpecialDayOccurrencePage"];
export type Kind = SpecialDay["kind"];
export type Reminder = SpecialDay["reminder"];

/** Türün Türkçe adı, kendi renk tokenı ve simgesi var. Yalnız renkle anlatmıyoruz. */
export const kinds: Record<Kind, string> = {
  Birthday: "Doğum günü",
  Anniversary: "Yıldönümü",
  Holiday: "Tatil",
  Other: "Diğer",
};
export const reminders: Record<Reminder, string> = {
  None: "Hatırlatma yok",
  SameDay: "Aynı gün 09:00",
  OneDayBefore: "Bir gün önce 09:00",
  OneWeekBefore: "Bir hafta önce 09:00",
};
export const kindClass = (kind: Kind) => `special-${kind.toLowerCase()}`;
export const pageSize = 50;
export const months = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
export const monthName = (month: number) => months[month - 1] ?? "";
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const id = (v: unknown) => typeof v === "string" && v.length > 0;
const invalid = (): never => {
  throw new ApiError("protocol", "Özel günler okunamadı. Yeniden dene.");
};
export function readSpecialDay(v: SpecialDay): SpecialDay {
  if (
    !v ||
    !id(v.id) ||
    typeof v.title !== "string" ||
    !Object.hasOwn(kinds, v.kind) ||
    !Object.hasOwn(reminders, v.reminder) ||
    !["Yearly", "Once"].includes(v.recurrence) ||
    typeof v.nonWorking !== "boolean" ||
    !(v.nextOccurrence === null || date(v.nextOccurrence))
  )
    invalid();
  return v;
}
export function readPage(v: SpecialDayPage, offset: number): SpecialDayPage {
  if (!v || !Array.isArray(v.items) || Number(v.offset) !== offset || v.items.length > pageSize) invalid();
  v.items.forEach(readSpecialDay);
  return v;
}
export function readOccurrences(v: OccurrencePage, from: string, to: string): OccurrencePage {
  readCoverage(v.coverage);
  if (!v || v.fromDate !== from || v.toDate !== to || !Array.isArray(v.items)) invalid();
  for (const o of v.items)
    if (!o || !id(o.specialDayId) || !date(o.date) || o.date < from || o.date > to || !Object.hasOwn(kinds, o.kind))
      invalid();
  return v;
}
/** Tekrarlar YYYY-MM-DD gününe göre gruplanıyor. */
export function byDate(items: Occurrence[]) {
  const map = new Map<string, Occurrence[]>();
  for (const o of items) map.set(o.date, [...(map.get(o.date) ?? []), o]);
  return map;
}
/** Erişilebilir ad renge dayanmaz; doğum günü: Annem gibi. */
export const occurrenceName = (o: Pick<Occurrence, "kind" | "title" | "nonWorking">) =>
  `${kinds[o.kind].toLocaleLowerCase("tr-TR")}: ${o.title}${o.nonWorking ? " (çalışma dışı)" : ""}`;

export type Draft = {
  title: string;
  kind: Kind;
  month: string;
  day: string;
  yearly: boolean;
  /** Kayıtlı yıl/başlangıç sınırı korunur. Yeni yıllık kayıtta yıl yok. */
  year: number | null;
  reminder: Reminder;
  nonWorking: boolean;
};
export function toDraft(day?: SpecialDay, fallback = ""): Draft {
  if (!day)
    return {
      title: "",
      kind: "Birthday",
      month: fallback ? String(Number(fallback.slice(5, 7))) : "",
      day: fallback ? String(Number(fallback.slice(8, 10))) : "",
      yearly: true,
      year: null,
      reminder: "SameDay",
      nonWorking: false,
    };
  return {
    title: day.title,
    kind: day.kind,
    month: String(day.month),
    day: String(day.day),
    yearly: day.recurrence === "Yearly",
    year: day.year === null ? null : Number(day.year),
    reminder: day.reminder,
    nonWorking: day.nonWorking,
  };
}
/** İstek gövdesini hazırlar. Burada yalnız alan sınırları, kalanını sunucu kontrol eder. */
export function toBody(d: Draft, currentYear: number) {
  const title = d.title.trim();
  if (!title) throw new RangeError("Bir ad yaz.");
  if (title.length > 120) throw new RangeError("Ad en çok 120 karakter olabilir.");
  if (!/^\d{1,2}$/.test(d.month) || !/^\d{1,2}$/.test(d.day)) throw new RangeError("Gün ve ay seç.");
  const month = Number(d.month),
    day = Number(d.day);
  const year = d.yearly ? d.year : (d.year ?? currentYear);
  if (!Number.isInteger(currentYear) || currentYear < 1 || currentYear > 9998)
    throw new RangeError("Gün bilgisi alınamadı. Yeniden dene.");
  try {
    Temporal.PlainDate.from({ year: d.yearly ? 2000 : year!, month, day }, { overflow: "reject" });
  } catch {
    throw new RangeError(
      !d.yearly && month === 2 && day === 29
        ? `${year} yılında 29 Şubat yok. Başka bir gün veya Her yıl seç.`
        : "Geçerli bir gün ve ay seç.",
    );
  }
  return {
    title,
    kind: d.kind,
    month,
    day,
    year,
    recurrence: d.yearly ? ("Yearly" as const) : ("Once" as const),
    nonWorking: d.nonWorking,
    reminder: d.reminder,
  };
}

/** Gün sayısı kullanıcının takvimine göre. Artık gün ve yıllık tekrarı sunucunun nextOccurrence değeri çözer. */
export const soonWindowDays = 30;
export function whenLabel(days: number) {
  return days === 0 ? "Bugün" : days === 1 ? "Yarın" : `${days} gün sonra`;
}
export type Arranged = {
  soon: { day: SpecialDay; days: number }[];
  later: { label: string; items: SpecialDay[] }[];
  past: SpecialDay[];
};
/** Önce yaklaşan 30 gün, sonrası aylık, geçmiş tek seferlikler ayrı. Sıra sunucudan gelir. */
export function arrange(items: SpecialDay[], today: string): Arranged {
  const start = Temporal.PlainDate.from(today);
  const result: Arranged = { soon: [], later: [], past: [] };
  const groups = new Map<string, Arranged["later"][number]>();
  for (const day of items) {
    if (day.nextOccurrence === null) {
      result.past.push(day);
      continue;
    }
    const next = Temporal.PlainDate.from(day.nextOccurrence);
    const days = start.until(next, { largestUnit: "days" }).days;
    if (days >= 0 && days <= soonWindowDays) {
      result.soon.push({ day, days });
      continue;
    }
    const key = next.toString().slice(0, 7);
    if (!groups.has(key)) groups.set(key, { label: `${monthName(next.month)} ${next.year}`, items: [] });
    groups.get(key)!.items.push(day);
  }
  const byNext = (a: SpecialDay, b: SpecialDay) => (a.nextOccurrence! < b.nextOccurrence! ? -1 : 1);
  result.soon.sort((a, b) => a.days - b.days);
  result.later = [...groups.keys()].sort().map(key => {
    const group = groups.get(key)!;
    return { label: group.label, items: group.items.sort(byNext) };
  });
  return result;
}

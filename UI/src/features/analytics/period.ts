import { Temporal } from "temporal-polyfill";
import { dimensions, readFilters, type Filters } from "./model";

/** Analiz ekranının tarih ve yazı seçimi burada. Gösterilen bütün sayılar sunucudan geliyor. */
export const periods = { week: "Bu hafta", lastWeek: "Geçen hafta", month: "Bu ay", lastMonth: "Geçen ay" } as const;
export type Period = keyof typeof periods | "custom";
export type Range = { fromDate: string; toDate: string };
export type View = Range & {
  period: Period;
  bucket: Filters["bucket"];
  dimension: Filters["dimension"];
  /** Önceki dönemin de aynı geçen kısmını alıyoruz. Bitmemiş hafta tam haftayla karşılaştırılmasın. */
  previous: Range | null;
  ongoing: boolean;
};
const own = (map: object, key: string) => Object.hasOwn(map, key);
const date = (value: string) => Temporal.PlainDate.from(value);
const usable = (d: Temporal.PlainDate) => d.year >= 2 && d.year <= 9998;
const range = (from: Temporal.PlainDate, to: Temporal.PlainDate): Range | null =>
  usable(from) && usable(to) ? { fromDate: from.toString(), toDate: to.toString() } : null;

/** weekStartsOn ayarlardaki gibi: 0 pazar, 6 cumartesi. */
export function weekStart(today: string, weekStartsOn: number) {
  const d = date(today);
  return d.subtract({ days: (d.dayOfWeek - weekStartsOn + 7) % 7 });
}
/** İki aya kadar günlük veri kullanılıyor. Daha uzun özel aralıkları sunucu grupluyor. */
export function bucketFor(r: Range): Filters["bucket"] {
  const days = date(r.fromDate).until(date(r.toDate)).days + 1;
  return days <= 62 ? "Day" : days <= 183 ? "Week" : "Month";
}

export function readView(params: URLSearchParams, today: string, weekStartsOn: number): View {
  for (const key of ["period", "fromDate", "toDate", "dimension"])
    if (params.getAll(key).length > 1) throw new RangeError("Aynı analiz seçimi birden fazla kez verilmiş.");
  const period = params.get("period") ?? (params.has("fromDate") || params.has("toDate") ? "custom" : "week"),
    dimension = params.get("dimension") ?? "Project";
  if (period !== "custom" && !own(periods, period)) throw new RangeError("Geçerli bir dönem seç.");
  if (!own(dimensions, dimension)) throw new RangeError("Geçerli bir kırılım seç.");
  const t = date(today);
  let current: Range, previous: Range | null, ongoing: boolean;
  if (period === "week" || period === "lastWeek") {
    const thisWeek = weekStart(today, weekStartsOn),
      start = period === "week" ? thisWeek : thisWeek.subtract({ days: 7 }),
      end = period === "week" ? t : start.add({ days: 6 }),
      before = start.subtract({ days: 7 });
    current = { fromDate: start.toString(), toDate: end.toString() };
    previous = range(before, before.add({ days: start.until(end).days }));
    ongoing = period === "week" && t.dayOfWeek !== start.add({ days: 6 }).dayOfWeek;
  } else if (period === "month" || period === "lastMonth") {
    const start = period === "month" ? t.with({ day: 1 }) : t.with({ day: 1 }).subtract({ months: 1 }),
      end = period === "month" ? t : start.with({ day: start.daysInMonth }),
      before = start.subtract({ months: 1 });
    current = { fromDate: start.toString(), toDate: end.toString() };
    // Bu ayın 31'i, kısa olan önceki ayın son günüyle eşleşiyor.
    previous = range(before, before.with({ day: Math.min(end.day, before.daysInMonth) }));
    ongoing = period === "month" && t.day < t.daysInMonth;
  } else {
    const picked = new URLSearchParams();
    for (const key of ["fromDate", "toDate"]) if (params.has(key)) picked.set(key, params.get(key)!);
    const { fromDate, toDate } = readFilters(picked, today),
      length = date(fromDate).until(date(toDate)).days;
    current = { fromDate, toDate };
    previous = range(date(fromDate).subtract({ days: length + 1 }), date(fromDate).subtract({ days: 1 }));
    ongoing = fromDate <= today && today < toDate;
  }
  return {
    ...current,
    period: period as Period,
    bucket: period === "custom" ? bucketFor(current) : "Day",
    dimension: dimension as View["dimension"],
    previous,
    ongoing,
  };
}
export function viewUrl(v: Pick<View, "period" | "fromDate" | "toDate" | "dimension">) {
  const params = new URLSearchParams({ period: v.period });
  if (v.period === "custom") {
    params.set("fromDate", v.fromDate);
    params.set("toDate", v.toDate);
  }
  if (v.dimension !== "Project") params.set("dimension", v.dimension);
  return `/analytics?${params}`;
}

/** Başlıkta dakika yeterli. Tam saniyeler ayrıntı tablosunda duruyor. */
export function roughDuration(value: number | string) {
  const seconds = Number(value);
  if (seconds === 0) return "0 dk";
  if (seconds < 60) return "1 dk’dan az";
  const minutes = Math.round(seconds / 60),
    h = Math.floor(minutes / 60),
    m = minutes % 60;
  return [h && `${h} sa`, m && `${m} dk`].filter(Boolean).join(" ");
}
export const subject: Record<Period, string> = {
  week: "Bu hafta",
  lastWeek: "Geçen hafta",
  month: "Bu ay",
  lastMonth: "Geçen ay",
  custom: "Bu aralıkta",
};
const against: Record<Period, string> = {
  week: "geçen haftanın aynı günlerine",
  lastWeek: "önceki haftaya",
  month: "geçen ayın aynı günlerine",
  lastMonth: "önceki aya",
  custom: "önceki eşit süreye",
};
export const previousTitle: Record<Period, string> = {
  week: "Geçen haftanın aynı günleri",
  lastWeek: "Önceki hafta",
  month: "Geçen ayın aynı günleri",
  lastMonth: "Önceki ay",
  custom: "Önceki eşit süre",
};
/** Ok ve başarı/başarısızlık sözü kullanmadan nötr bir cümle gösteriyoruz. */
export function leadSentence(period: Period, current: number | string, previous: number | string | null) {
  const c = Number(current);
  if (c === 0) return `${subject[period]} kayıtlı çalışma yok. Bu, yaptığın bütün emeği ölçmez.`;
  const head = `${subject[period]} ${roughDuration(c)} çalıştın`;
  if (previous === null) return `${head}.`;
  const diff = c - Number(previous);
  if (Math.abs(diff) < 60) return `${head}; ${against[period]} göre aynı düzeyde.`;
  return `${head}; ${against[period]} göre ${roughDuration(Math.abs(diff))} ${diff > 0 ? "fazla" : "az"}.`;
}
export const minimumAccuracySamples = 3;
export function accuracySentence(sampleCount: number | string, meanErrorSeconds: number | string | null) {
  const n = Number(sampleCount);
  if (n < minimumAccuracySamples || meanErrorSeconds === null)
    return `Henüz yeterli örnek yok. Karşılaştırma için tahmini olan ve üzerinde çalışılmış en az ${minimumAccuracySamples} iş gerekiyor; şu an ${n} var.`;
  const m = Number(meanErrorSeconds);
  if (Math.abs(m) < 60) return `Tahminlerin gerçeğe çok yakın (${n} işe göre).`;
  return m > 0
    ? `İşler tahmininden ortalama ${roughDuration(m)} daha uzun sürüyor (${n} işe göre). Yeni bir iş planlarken payını biraz geniş tutabilirsin.`
    : `İşler tahmininden ortalama ${roughDuration(-m)} daha kısa sürüyor (${n} işe göre).`;
}

const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const short = (d: Temporal.PlainDate) => `${d.day} ${months[d.month - 1]}`;
/** Sunucudan gelen tek grubun eksen etiketi. */
export function bucketLabel(b: Range, bucket: Filters["bucket"], count: number) {
  const from = date(b.fromDate),
    to = date(b.toDate);
  if (bucket === "Day") return count <= 7 ? weekdays[from.dayOfWeek - 1] : String(from.day);
  if (bucket === "Week") return from.month === to.month ? `${from.day}–${to.day} ${months[to.month - 1]}` : short(from);
  return months[from.month - 1];
}
export function longDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  });
}
export function rangeText(r: Range) {
  const from = date(r.fromDate),
    to = date(r.toDate);
  if (r.fromDate === r.toDate) return `${short(to)} ${to.year}`;
  return `${short(from)}${from.year === to.year ? "" : ` ${from.year}`} – ${short(to)} ${to.year}`;
}

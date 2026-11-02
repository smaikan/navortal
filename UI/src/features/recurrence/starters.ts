import type { Draft } from "./model";

/** Bu yalnız başlangıç formu. Kaydedilmiş rutin veya üretilmiş tekrar değil. */
export type RecurrenceStarter = Pick<Draft, "title" | "frequency" | "weekDays" | "monthDay">;
export const recurrenceStarters: { label: string; hint: string; draft: RecurrenceStarter }[] = [
  {
    label: "Kitap oku",
    hint: "Her gün",
    draft: { title: "Kitap oku", frequency: "Daily", weekDays: [], monthDay: "1" },
  },
  {
    label: "Haftayı gözden geçir",
    hint: "Her pazartesi",
    draft: { title: "Haftayı gözden geçir", frequency: "Weekly", weekDays: [1], monthDay: "1" },
  },
  {
    label: "Spor",
    hint: "Pzt, Çar, Cum",
    draft: { title: "Spor", frequency: "Weekly", weekDays: [1, 3, 5], monthDay: "1" },
  },
  {
    label: "Ayın planını yap",
    hint: "Her ayın 1’inde",
    draft: { title: "Ayın planını yap", frequency: "Monthly", weekDays: [], monthDay: "1" },
  },
];

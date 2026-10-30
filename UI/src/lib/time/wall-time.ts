import { Temporal } from "temporal-polyfill";

/** Yalnız tarih değeri takvim günü kalır, Date nesnesinin UTC günü yapılmaz. */
export function civilDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Yerel tarih YYYY-MM-DD olmalı.");
  return Temporal.PlainDate.from(value).toString();
}

/** Yaz saati kuralını çağıran açıkça seçmeli. Boşluk veya belirsiz saat sessizce kabul edilmez. */
export function wallTimeToInstant(localDateTime: string, zone: string, choice: "reject" | "earlier" | "later"): string {
  return Temporal.PlainDateTime.from(localDateTime)
    .toZonedDateTime(zone, { disambiguation: choice })
    .toInstant()
    .toString();
}

export type WallChoice = "" | "earlier" | "later";
/** Geri saat geçişinde iki kere oluşan saat için önce/sonra seçimi gerekir. */
export function wallTimeIsAmbiguous(local: string, zone: string) {
  try {
    const wall = Temporal.PlainDateTime.from(local);
    const earlier = wall.toZonedDateTime(zone, { disambiguation: "earlier" }),
      later = wall.toZonedDateTime(zone, { disambiguation: "later" });
    return earlier.toPlainDateTime().equals(wall) && later.toPlainDateTime().equals(wall) && !earlier.equals(later);
  } catch {
    return false;
  }
}
/** Yerel saati ana çevirir. Yaz saati boşluğu reddedilir, üst üste binen saatte choice gerekir. */
export function resolveWallTime(local: string, zone: string, choice: WallChoice): string {
  const wall = Temporal.PlainDateTime.from(local);
  const earlier = wall.toZonedDateTime(zone, { disambiguation: "earlier" });
  const later = wall.toZonedDateTime(zone, { disambiguation: "later" });
  if (!earlier.toPlainDateTime().equals(wall) || !later.toPlainDateTime().equals(wall))
    throw new RangeError("Bu yerel saat yaz saati geçişinde bulunmuyor. Başka bir saat seç.");
  if (!earlier.equals(later) && !choice)
    throw new RangeError("Bu saat iki kez yaşanıyor. İlk veya ikinci oluşumu seç.");
  return (choice === "later" ? later : earlier).toInstant().toString();
}

export function instantToLocal(instant: string, zone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
}

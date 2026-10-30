/** Yalnız takvim günü gezinmesi. UTC hesabı yerel saat veya plan aralığı çözmez. */
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

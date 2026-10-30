// Yalnız değişmez biçimlendirme ayarı paylaşılır. Tarih, kullanıcı veya API sonucu paylaşılmaz.
// Saat dilimi ve görünüm değiştikçe süreç/sekme önbelleği sınırlı kalsın.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, options]);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value!);
    formatters.set(key, formatter);
  }
  return formatter;
}

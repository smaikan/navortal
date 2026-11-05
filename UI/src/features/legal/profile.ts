/** Açık işletmeci bilgileri. Ortamda başka bir değer verilirse o kullanılır; boş bırakılan alan sayfaları taslağa döndürür.
 * Burada yalnız herkese açık bilgi var. Kimlik anahtarı veya özel ayar yazmayın. */
const operator = {
  name: "Navortal",
  address: "info@navortal.com.tr",
  email: "info@navortal.com.tr",
  hosting: "Uygulama sunucusu ve veritabanı Türkiye'de barındırılır.",
  mail: "Parola yenileme e-postaları Gmail SMTP hizmetiyle gönderilir. Gmail bir Google hizmetidir; e-posta adresin ve iletinin içeriği Türkiye dışında işlenebilir.",
  retention:
    "Hesabın ve kaydettiğin içerikler otomatik olarak silinmez; hesabın açık kaldığı sürece saklanır. Belirli bir süre sonunda kullanılmayan hesapları silen bir işlem yoktur. Silme talebin kanundaki şartlara göre değerlendirilir.",
};

export function legalProfile(env: Record<string, string | undefined> = process.env) {
  const read = (value: string | undefined, fallback: string) => (value ?? fallback).trim() || undefined;
  const name = read(env.LEGAL_CONTROLLER_NAME, operator.name);
  const address = read(env.LEGAL_CONTROLLER_ADDRESS, operator.address);
  const candidate = read(env.LEGAL_CONTACT_EMAIL, operator.email);
  const email = candidate && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate) ? candidate : undefined;
  const hosting = read(env.LEGAL_HOSTING_DESCRIPTION, operator.hosting);
  const mail = read(env.LEGAL_EMAIL_DESCRIPTION, operator.mail);
  const retention = read(env.LEGAL_RETENTION_DESCRIPTION, operator.retention);
  return {
    name,
    address,
    email,
    hosting,
    mail,
    retention,
    ready: Boolean(name && address && email && hosting && mail && retention),
  };
}

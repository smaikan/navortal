export const legalLinks = [
  { href: "/privacy-notice", label: "KVKK Aydınlatma Metni" },
  { href: "/privacy", label: "Gizlilik" },
  { href: "/cookies", label: "Çerezler" },
  { href: "/terms", label: "Kullanım Koşulları" },
  { href: "/contact", label: "İletişim ve KVKK başvurusu" },
] as const;

export type LegalPath = (typeof legalLinks)[number]["href"];

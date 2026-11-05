import type { MetadataRoute } from "next";
import { siteSettings } from "../lib/seo";
export default function robots(): MetadataRoute.Robots {
  const { origin, index } = siteSettings();
  // Tarayıcı robotları özel sayfalardaki ve giriş ekranındaki noindex bilgisini okuyabilsin.
  return { rules: { userAgent: "*", allow: "/" }, ...(origin && index ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}

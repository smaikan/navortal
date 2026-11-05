import type { Metadata } from "next";
import { legalLinks } from "../features/legal/links";
import { legalProfile } from "../features/legal/profile";

export const publicPaths = ["/", "/features", "/how-it-works", "/help", ...legalLinks.map(link => link.href)] as const;
export type PublicPath = (typeof publicPaths)[number];
type Environment = Record<string, string | undefined>;

export function isIndexablePublicPath(path: string, env: Environment = process.env) {
  return (
    publicPaths.some(candidate => candidate === path) &&
    (!legalLinks.some(link => link.href === path) || legalProfile(env).ready)
  );
}

/** Yayın ayarları Host başlığından veya tarayıcı kimliğinden türetilmez. */
export function siteSettings(env: Environment = process.env) {
  const value = env.SITE_URL?.trim();
  let origin: string | undefined;
  if (value) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("SITE_URL must be a public HTTPS origin.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.includes(".") ||
      url.hostname.endsWith(".localhost") ||
      url.hostname.endsWith(".local") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    ) {
      throw new Error("SITE_URL must be a public HTTPS origin without a path or credentials.");
    }
    origin = url.origin;
  }
  if (env.SITE_INDEXING && !["true", "false"].includes(env.SITE_INDEXING))
    throw new Error("SITE_INDEXING must be true or false.");
  if (env.SITE_INDEXING === "true" && !origin) throw new Error("Indexing requires SITE_URL.");
  const index = Boolean(
    origin &&
    env.SITE_INDEXING === "true" &&
    env.NODE_ENV === "production" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production"),
  );
  return { origin, index };
}

const shareImage = "/og-navortal.png";

/** Arama motorları ve yapay zekâ araçları için ürün özeti; alan adı yoksa üretilmez. */
export function structuredData(description: string, env: Environment = process.env) {
  const { origin } = siteSettings(env);
  if (!origin) return null;
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Navortal",
    url: `${origin}/`,
    description,
    image: `${origin}${shareImage}`,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    inLanguage: "tr",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
    publisher: { "@type": "Organization", name: "Navortal", url: `${origin}/`, email: "info@navortal.com.tr" },
  };
  // Metin kapanış etiketi gibi yorumlanamasın.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function publicMetadata(
  path: PublicPath,
  title: string,
  description: string,
  env: Environment = process.env,
): Metadata {
  const { origin, index: deploymentIndex } = siteSettings(env);
  const index = deploymentIndex && isIndexablePublicPath(path, env);
  const fullTitle = path === "/" ? `${title} — Görev ve gün planı` : `${title} | Navortal`;
  return {
    title: { absolute: fullTitle },
    description,
    robots: { index, follow: index },
    ...(origin
      ? {
          metadataBase: new URL(origin),
          alternates: { canonical: new URL(path, origin).href },
          openGraph: {
            type: "website",
            locale: "tr_TR",
            siteName: "Navortal",
            title: fullTitle,
            description,
            url: new URL(path, origin).href,
            images: [{ url: shareImage, width: 1200, height: 630, alt: "Navortal: Görev ve gün planı" }],
          },
          twitter: { card: "summary_large_image", title: fullTitle, description, images: [shareImage] },
        }
      : {}),
  };
}

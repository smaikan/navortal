import type { MetadataRoute } from "next";
import { isIndexablePublicPath, publicPaths, siteSettings } from "../lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  const { origin, index } = siteSettings();
  return origin && index
    ? publicPaths.filter(path => isIndexablePublicPath(path)).map(path => ({ url: new URL(path, origin).href }))
    : [];
}

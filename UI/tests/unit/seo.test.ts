import { legalLinks } from "../../src/features/legal/links";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  isIndexablePublicPath,
  publicMetadata,
  publicMetadataAssetPaths,
  publicPaths,
  siteDescription,
  siteSettings,
  structuredData,
  websiteData,
} from "../../src/lib/seo";
import robots from "../../src/app/robots";
import sitemap from "../../src/app/sitemap";
import { proxy } from "../../src/proxy";

const production = { SITE_URL: "https://planner.example.test", SITE_INDEXING: "true", NODE_ENV: "production" };
afterEach(() => vi.unstubAllEnvs());
function settings(env: Record<string, string | undefined>) {
  for (const key of ["SITE_URL", "SITE_INDEXING", "NODE_ENV", "VERCEL_ENV", "UI_E2E_CHECKS"]) vi.stubEnv(key, env[key]);
}
describe("public deployment opt-in", () => {
  it("fails closed without a domain or explicit production opt-in", () => {
    expect(siteSettings({})).toEqual({ origin: undefined, index: false });
    expect(siteSettings({ SITE_URL: production.SITE_URL, NODE_ENV: "production" }).index).toBe(false);
    expect(siteSettings({ ...production, SITE_INDEXING: "false" }).index).toBe(false);
    expect(siteSettings(production).index).toBe(true);
  });
  it.each(["development", "test"])("never indexes a %s build", mode =>
    expect(siteSettings({ ...production, NODE_ENV: mode }).index).toBe(false),
  );
  it.each(["preview", "development"])("never indexes a %s deployment even with opt-in", mode =>
    expect(siteSettings({ ...production, VERCEL_ENV: mode }).index).toBe(false),
  );
  it.each([
    "http://example.test",
    "https://localhost",
    "https://app.localhost",
    "https://planner.local",
    "https://127.0.0.1",
    "https://[::1]",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test/?token=secret",
    "https://example.test/#secret",
    "invalid",
  ])("rejects an unsafe origin without echoing its value", origin => {
    expect(() => siteSettings({ SITE_URL: origin })).toThrow(/SITE_URL must/);
    try {
      siteSettings({ SITE_URL: origin });
    } catch (error) {
      expect(String(error)).not.toContain(origin);
    }
  });
  it("rejects missing-domain opt-in and misspelled flags", () => {
    expect(() => siteSettings({ SITE_INDEXING: "true" })).toThrow("Indexing requires SITE_URL");
    expect(() => siteSettings({ SITE_INDEXING: "yes" })).toThrow("SITE_INDEXING must");
  });
  it("does not invent localhost canonical or social URLs", () => {
    const meta = publicMetadata("/", "Başlangıç", "Açıklama", {});
    expect(meta.robots).toEqual({ index: false, follow: false });
    for (const field of ["alternates", "metadataBase", "openGraph", "twitter"]) expect(meta).not.toHaveProperty(field);
  });
  it("shares a full title and a wide card, and summarizes the product only with a domain", () => {
    const meta = publicMetadata("/help", "Kullanım yardımı", "Açıklama", production);
    expect(meta.openGraph).toMatchObject({ title: "Kullanım yardımı | Navortal" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["/og-navortal.png"] });
    expect(structuredData("Açıklama", {})).toBeNull();
    const data = structuredData("<b>", production)!;
    expect(data).not.toContain("<");
    expect(JSON.parse(data)).toMatchObject({ name: "Navortal", url: `${production.SITE_URL}/`, description: "<b>" });
  });
  it("describes the home page consistently and identifies the brand rather than offering the domain as its name", () => {
    const meta = publicMetadata("/", "Navortal", siteDescription, production);
    expect(meta.title).toEqual({ absolute: "Navortal | Görev Yönetimi, Gün Planlama ve Pomodoro" });
    expect(meta.description).toBe(siteDescription);
    expect(meta.openGraph).toMatchObject({ siteName: "Navortal", description: siteDescription });
    expect(meta.twitter).toMatchObject({ description: siteDescription });
    const website = JSON.parse(websiteData(production)!);
    const app = JSON.parse(structuredData(siteDescription, production)!);
    expect(website).toMatchObject({ "@type": "WebSite", name: "Navortal", url: `${production.SITE_URL}/` });
    expect(website.alternateName).not.toContain("navortal.com.tr");
    expect(website.publisher["@id"]).toBe(app.publisher["@id"]);
    expect(websiteData({})).toBeNull();
  });
  it.each(publicPaths)("uses the exact reviewed route for %s", path => {
    const meta = publicMetadata(path, "Başlık", "Açıklama", production);
    expect(meta.alternates?.canonical).toBe(new URL(path, production.SITE_URL).href);
    expect(meta.openGraph).toMatchObject({ url: new URL(path, production.SITE_URL).href, locale: "tr_TR" });
    const index = isIndexablePublicPath(path, production);
    expect(meta.robots).toEqual({ index, follow: index });
  });
});
describe("crawl boundaries", () => {
  it.each(publicMetadataAssetPaths)("does not send page noindex directives on public crawler asset %s", path => {
    settings(production);
    expect(proxy(new NextRequest(`https://host.example.test${path}?v=stable`)).headers.get("X-Robots-Tag")).toBeNull();
    // Public assets must not be added to the sitemap's list of pages.
    expect(publicPaths.some(page => page === String(path))).toBe(false);
  });
  it("lists only public product and legal pages, never auth, private, query state or fake dates", () => {
    settings(production);
    expect(
      sitemap()
        .map(entry => entry.url)
        .sort(),
    ).toEqual(
      ["/", "/features", "/how-it-works", "/help", ...legalLinks.map(link => link.href)]
        .map(path => new URL(path, production.SITE_URL).href)
        .sort(),
    );
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: `${production.SITE_URL}/sitemap.xml` });
  });
  it.each([{}, { ...production, VERCEL_ENV: "preview" }])(
    "keeps an unindexable deployment out of sitemap without blocking noindex crawls",
    env => {
      settings(env);
      expect(sitemap()).toEqual([]);
      expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
    },
  );
  it.each([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/app",
    "/tasks",
    "/analytics/plan",
    "/missing",
    "/tasks/export.png",
    "/missing.svg",
  ])("sends noindex headers on %s in indexable production", path => {
    settings(production);
    expect(proxy(new NextRequest(`https://host.example.test${path}`)).headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
  });
  it("does not turn a Host header into a canonical or suppress preview headers", () => {
    settings({ ...production, VERCEL_ENV: "preview" });
    expect(proxy(new NextRequest("https://forged.example.test/help")).headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
    settings(production);
    expect(proxy(new NextRequest("https://forged.example.test/help")).headers.get("X-Robots-Tag")).toBeNull();
  });
  it("preserves reset query stripping and the disabled fixture gate", () => {
    settings(production);
    const reset = proxy(new NextRequest("https://host.example.test/reset-password?code=synthetic-only"));
    expect(reset.status).toBe(303);
    expect(reset.headers.get("location")).toBe("https://host.example.test/reset-password");
    expect(reset.headers.get("cache-control")).toContain("no-store");
    expect(reset.headers.get("referrer-policy")).toBe("no-referrer");
    expect(proxy(new NextRequest("https://host.example.test/internal-checks/error")).status).toBe(404);
  });
});

it("redirects legacy pages with query preserved and strips reset query secrets before routing", () => {
  const moved = proxy(new NextRequest("https://host.example.test/app/gorevler?taskId=123"));
  expect(moved.status).toBe(308);
  expect(moved.headers.get("location")).toBe("https://host.example.test/tasks?taskId=123");
  const reset = proxy(new NextRequest("https://host.example.test/parola-yenile?token=synthetic-only"));
  expect(reset.status).toBe(303);
  expect(reset.headers.get("location")).toBe("https://host.example.test/reset-password");
  expect(reset.headers.get("referrer-policy")).toBe("no-referrer");
});

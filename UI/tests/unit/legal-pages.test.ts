import { afterEach, describe, expect, it, vi } from "vitest";
import { legalProfile } from "../../src/features/legal/profile";
import { legalLinks } from "../../src/features/legal/links";
import { isIndexablePublicPath, publicMetadata } from "../../src/lib/seo";
import sitemap from "../../src/app/sitemap";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";

const profile = {
  LEGAL_CONTROLLER_NAME: "Synthetic Operator",
  LEGAL_CONTROLLER_ADDRESS: "Synthetic address",
  LEGAL_CONTACT_EMAIL: "legal@example.test",
  LEGAL_HOSTING_DESCRIPTION: "Synthetic hosting, Türkiye",
  LEGAL_EMAIL_DESCRIPTION: "Disabled",
  LEGAL_RETENTION_DESCRIPTION: "Synthetic retention policy",
};
const production = { SITE_URL: "https://planner.example.test", SITE_INDEXING: "true", NODE_ENV: "production" };
afterEach(() => vi.unstubAllEnvs());

describe("unfinished legal identity cannot be silently published as final", () => {
  it.each(Object.keys(profile))("remains a draft without %s", name => {
    expect(legalProfile({ ...profile, [name]: "  " }).ready).toBe(false);
  });
  it("publishes the operator details by default, and keeps Gmail outside the Türkiye hosting statement", () => {
    const details = legalProfile({});
    expect(details.ready).toBe(true);
    expect(details.mail).toContain("Türkiye dışında");
    expect(details.retention).toContain("kanundaki şartlara göre");
  });
  it("does not use the VAPID contact as the legal contact", () => {
    expect(legalProfile({ Push__Subject: "mailto:vapid@example.test" }).email).toBe("info@navortal.com.tr");
    expect(legalProfile({ ...profile, LEGAL_CONTACT_EMAIL: "bad\r\nmail@example.test" }).ready).toBe(false);
  });
  it("keeps every draft route noindex and out of the sitemap even with deployment indexing enabled", () => {
    for (const [name, value] of Object.entries(production)) vi.stubEnv(name, value);
    for (const name of Object.keys(profile)) vi.stubEnv(name, "");
    const draft = { ...production, ...Object.fromEntries(Object.keys(profile).map(name => [name, ""])) };
    const urls = sitemap().map(entry => entry.url);
    for (const { href } of legalLinks) {
      expect(isIndexablePublicPath(href, draft)).toBe(false);
      expect(publicMetadata(href, "Title", "Description", draft).robots).toEqual({ index: false, follow: false });
      expect(urls).not.toContain(`${production.SITE_URL}${href}`);
      expect(proxy(new NextRequest(`${production.SITE_URL}${href}`)).headers.get("X-Robots-Tag")).toBe(
        "noindex, nofollow",
      );
    }
    expect(urls).toContain(`${production.SITE_URL}/help`);
  });
  it("only permits configured public pages into the sitemap after deployment opt-in", () => {
    for (const [name, value] of Object.entries({ ...production, ...profile })) vi.stubEnv(name, value);
    expect(legalProfile(profile).ready).toBe(true);
    const urls = sitemap().map(entry => entry.url);
    for (const { href } of legalLinks) {
      expect(urls).toContain(`${production.SITE_URL}${href}`);
      expect(proxy(new NextRequest(`${production.SITE_URL}${href}`)).headers.get("X-Robots-Tag")).toBeNull();
    }
    expect(urls).not.toContain(`${production.SITE_URL}/register`);
    vi.stubEnv("SITE_INDEXING", "false");
    expect(sitemap()).toEqual([]);
  });
});

import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EVIDENCE } from "./helpers/evidence";
import { publicPaths, siteSettings } from "../../src/lib/seo";
import { FocusFixture } from "./helpers/focus-fixture";
import { expectDecorOnly } from "./helpers/decor-contrast";

const pages = [
  ["/", "Navortal", "Görevden güne, üç adımda"],
  ["/features", "Özellikler", "Sayaç bitmesi görevi tamamlamaz"],
  ["/how-it-works", "Nasıl çalışır?", "Oturumu bitirmek ve görevi tamamlamak ayrı"],
  ["/help", "Kullanım yardımı", "Bilinmeyen süre sıfır değildir"],
];
const site = siteSettings({ ...process.env, NODE_ENV: "production" });
test("the bare domain moves to www, www stays, and the AI summary is public", async ({ request }) => {
  const moved = await request.get("/features?from=x", {
    headers: { Host: "navortal.com.tr" },
    maxRedirects: 0,
  });
  expect(moved.status()).toBe(308);
  expect(moved.headers().location).toBe("https://www.navortal.com.tr/features?from=x");
  const main = await request.get("/features", { headers: { Host: "www.navortal.com.tr" }, maxRedirects: 0 });
  expect(main.status()).toBe(200);
  const summary = await request.get("/llms.txt");
  expect(summary.status()).toBe(200);
  expect(await summary.text()).toContain("# Navortal");
});
for (const [path, title, meaningful] of pages) {
  test(`public source, metadata, keyboard and accessible content: ${path}`, async ({
    page,
    request,
    browser,
  }, info) => {
    const heading = path === "/" ? "Zihnin dağınık olabilir, planın olmasın." : title;
    if (path === "/" && info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 1180 });
    const source = await request.get(path);
    expect(source.status()).toBe(200);
    const html = await source.text();
    // Bağlanmış DOM veya RSC metni değil, scriptleri çıkarılmış gerçek kaynak kontrol edilir.
    const content = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    expect(content).toContain(meaningful);
    expect(content.match(/<h1\b/g)).toHaveLength(1);
    expect(content).toContain('lang="tr"');
    expect(content).not.toContain("Çalışma alanı hazırlanıyor");
    if (site.index) expect(source.headers()["x-robots-tag"]).toBeUndefined();
    else expect(source.headers()["x-robots-tag"]).toContain("noindex");
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(title.replace("?", "\\?")));
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      site.index ? /^index, follow$/ : /noindex/,
    );
    if (site.origin) {
      // Next adresin son eğik çizgisini normalleştirir. URL'nin tüm anlamını karşılaştırıyoruz.
      expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).href).toBe(
        new URL(path, site.origin).href,
      );
      expect(new URL((await page.locator('meta[property="og:url"]').getAttribute("content"))!).href).toBe(
        new URL(path, site.origin).href,
      );
      const image = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect(image).toBe(`${site.origin}/og-navortal.png`);
      expect((await request.get("/og-navortal.png")).status()).toBe(200);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Navortal/);
      if (path === "/") {
        const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
        expect(data).toMatchObject({ "@type": "WebApplication", name: "Navortal", isAccessibleForFree: true });
      }
    } else {
      await expect(page.locator('link[rel="canonical"], meta[property="og:url"]')).toHaveCount(0);
    }
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "İçeriğe geç" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const stem = path === "/" ? "home" : path.slice(1);
    writeFileSync(`${EVIDENCE}/axe-${info.project.name}-${stem}.json`, JSON.stringify(axe, null, 2));
    expect(axe.violations).toEqual([]);
    await expectDecorOnly(page, axe.incomplete);
    // axe önceki atlama bağlantısı odağını geri getiriyor. Normal içerik görüntüsü alıyoruz.
    await page.getByRole("main").focus();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-${stem}.png`, fullPage: true });
    if (path === "/") {
      const tablist = page.getByRole("tablist", { name: "Örnek sayfa" });
      await tablist.getByRole("tab", { name: "Gün Planlama", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(tablist.getByRole("tab", { name: "Takvim", exact: true })).toBeFocused();
      const calendar = page.getByRole("tabpanel", { name: "Takvim", exact: true });
      await expect(calendar).toContainText("Kasım 2026");
      // Takvim gerçek ay oranında: altı eşit hafta, dışarı taşma yok.
      const rows = await calendar.locator("[class*='dayCell']").evaluateAll(cells => ({
        count: cells.length,
        heights: [...new Set(cells.map(cell => Math.round(cell.getBoundingClientRect().height)))],
        spill: cells.some(cell => cell.scrollWidth > cell.clientWidth + 1),
      }));
      expect(rows.count).toBe(42);
      expect(rows.heights).toHaveLength(1);
      expect(rows.spill).toBe(false);
      await page.keyboard.press("End");
      await expect(tablist.getByRole("tab", { name: "Rutin analizi", exact: true })).toBeFocused();
      for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowLeft");
      await expect(page.getByRole("tabpanel", { name: "Notlar", exact: true })).toContainText("Sunum için fikirler");
      // Seçim değişince örnek menü genişlikten veya basma hareketinden kaymamalı.
      const navBoxes = () =>
        page
          .locator("[class*='bottomItem']:visible, [class*='mockNav']:visible")
          .evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().left)));
      const before = await navBoxes();
      await page.keyboard.press("Home");
      await expect(page.getByRole("tabpanel", { name: "Gün Planlama", exact: true })).toBeVisible();
      expect(await navBoxes()).toEqual(before);
      await page.keyboard.press("End");
      for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowLeft");
      await expect(page.getByRole("tabpanel", { name: "Notlar", exact: true })).toBeVisible();
      // 180ms sahne geçişi bilinçli. Yarım saydam kareyi değil oturmuş renkleri ölçüyoruz.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .filter(animation => animation.timeline instanceof DocumentTimeline)
          .every(animation => animation.playState !== "running"),
      );
      const notesAudit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(notesAudit.violations).toEqual([]);
      await expectDecorOnly(page, notesAudit.incomplete);
      await page.keyboard.press("Home");
      await expect(tablist.getByRole("tab", { name: "Gün Planlama", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      if (info.project.name === "chromium") {
        for (const [width, height] of [
          [320, 800],
          [768, 1024],
          [1920, 1080],
          [640, 320],
        ]) {
          await page.setViewportSize({ width, height });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: EVIDENCE + "/home-" + width + "x" + height + ".png", fullPage: true });
        }
      }
    }
    if (path === "/" && info.project.name === "chromium") {
      await page.setViewportSize({ width: 1440, height: 1180 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: EVIDENCE + "/home-desktop-hero.png", fullPage: false });
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      const tab = await noJs.newPage();
      await tab.goto(new URL(path, info.project.use.baseURL ?? "http://127.0.0.1:3400").href);
      await expect(tab.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    } finally {
      await noJs.close();
    }
  });
}
test("discovery to help, recovery and registration; real 404 and crawl allowlist", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Ürün" }).getByRole("link", { name: "Nasıl çalışır?" }).click();
  await page.getByRole("link", { name: /Giriş, çalışma kaydı/ }).click();
  await page.getByRole("link", { name: "Parola yenileme bağlantısı iste." }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.goto("/");
  await page
    .getByRole("region", { name: "Başlangıç", exact: true })
    .getByRole("link", { name: "Ücretsiz başla", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Kendi alanını oluştur" })).toBeVisible();
  const missing = await page.goto("/olmayan-urun");
  expect(missing?.status()).toBe(404);
  const directives = await page
    .locator('meta[name="robots"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute("content")));
  expect(directives.length).toBeGreaterThan(0);
  expect(directives.every(value => value?.split(/,\s*/).includes("noindex"))).toBe(true);
  expect(missing?.headers()["x-robots-tag"]).toContain("noindex");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).not.toContain("Disallow:");
  const xml = await (await request.get("/sitemap.xml")).text();
  expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1])).toEqual(
    site.index ? publicPaths.map(path => new URL(path, site.origin).href) : [],
  );
  expect(xml).not.toMatch(/localhost|127\.0\.0\.1|\/app|\/login|\/register|taskId|email/);
});
test("private/auth HTML remains generic for anonymous and authenticated visitors", async ({ request, page }) => {
  const fixture = await FocusFixture.create();
  try {
    const task = await fixture.task();
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/app",
      "/tasks",
      "/analytics/plan",
    ]) {
      const response = await request.get(path);
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      const html = await response.text();
      expect(html).toMatch(/name="robots" content="noindex/);
      expect(html).not.toContain(task.title);
      expect(html).not.toContain(fixture.token);
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('property="og:url"');
    }
    await fixture.login(page);
    await page.goto("/tasks");
    await expect(page.getByText(task.title, { exact: true }).first()).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Zihnin dağınık olabilir, planın olmasın.", exact: true, level: 1 }),
    ).toBeVisible();
    const html = await (await request.get("/", { headers: { Authorization: `Bearer ${fixture.token}` } })).text();
    expect(html).not.toContain(task.title);
    expect(html).not.toContain(fixture.token);
  } finally {
    await fixture.api.dispose();
  }
});
test("public help remains readable at 320px and with the stored dark preference", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("ui-theme", "dark"));
  await page.goto("/help");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  writeFileSync(`${EVIDENCE}/axe-${info.project.name}-narrow-dark.json`, JSON.stringify(axe, null, 2));
  expect(axe.violations).toEqual([]);
  expect(axe.incomplete).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-narrow-dark.png`, fullPage: true });
});
for (const [label, stem] of [
  ["Gün Planlama", "plan"],
  ["Takvim", "calendar"],
  ["Notlar", "notes"],
  ["Rutin", "routines"],
  ["Projeler", "projects"],
  ["Analiz", "analytics"],
  ["Rutin analizi", "routine-analytics"],
]) {
  test(`landing preview screen: ${stem}`, async ({ page }, info) => {
    const privateReads: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/")) privateReads.push(path);
    });
    if (info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("tab", { name: label, exact: true }).click();
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter(animation => animation.timeline instanceof DocumentTimeline)
        .every(animation => animation.playState !== "running"),
    );
    const preview = page.getByRole("figure");
    const panel = page.getByRole("tabpanel", { name: label, exact: true });
    if (stem === "notes") {
      await expect(panel.locator("[class*='notesFilters']").getByText("Uyarı", { exact: true })).toBeVisible();
      const warning = panel.getByRole("region", { name: "Uyarı", exact: true });
      const rest = panel.getByRole("region", { name: "Tüm notlar", exact: true });
      await expect(warning).toContainText("Teslimden önce");
      await expect(rest).not.toContainText("Teslimden önce");
      await expect(rest).toContainText("Sunum için fikirler");
      await expect(rest.locator("[data-note-display]")).toHaveCount(4);
      if (info.project.name === "chromium") await expect(rest.locator("[data-note-display]:visible")).toHaveCount(4);
      const warningBox = (await warning.boundingBox())!;
      expect((await rest.boundingBox())!.y).toBeGreaterThanOrEqual(warningBox.y + warningBox.height);
    }
    if (stem === "calendar") {
      await expect(panel.locator('[data-special-kind="Birthday"] svg.lucide-gift')).toBeVisible();
      await expect(panel.locator('[data-special-kind="Anniversary"] svg.lucide-calendar-heart')).toBeVisible();
    }
    if (stem === "analytics") {
      await expect(preview.getByRole("tab", { name: /analiz/i })).toHaveText(["Analiz", "Rutin analizi"]);
      await expect(panel).toContainText("Geçen hafta 18 sa 40 dk çalıştın");
      await expect(panel.getByRole("heading", { name: "Ritim" })).toBeVisible();
      // Menüde Analiz iki sekmede de seçili kalır.
      await expect(preview.locator("[class*='mockNavActive']")).toHaveText("Analiz");
    }
    if (stem === "routine-analytics") {
      // Bütün rutinler listelenir, hiçbiri açık değil; liste sahnenin içinde kayar.
      await expect(panel.locator("li [class*='routineRow']")).toHaveCount(8);
      await expect(panel.locator("[aria-expanded]")).toHaveCount(0);
      await expect(panel).toContainText("Geçen ay 8 rutinde 89 görevden 68 tanesi yapıldı.");
      expect(
        await panel.evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto"),
      ).toBe(true);
      if (info.project.name === "chromium") await expect(panel.locator("[class*='routineHead']")).toBeVisible(); // geniş, tek satırlık liste
      await expect(preview.locator("[class*='mockNavActive']")).toHaveText("Analiz");
    }
    const frame = preview.locator("[class*='productWindow']");
    expect((await frame.boundingBox())!.height).toBe(info.project.name === "chromium" ? 560 : 600); // Masaüstünde bölüm %87,5 küçültülür.
    const fit = await preview.locator("[class*='mockMain']").evaluate(el => ({
      scrollable: getComputedStyle(el).overflowY === "auto" || getComputedStyle(el).overflowY === "scroll",
      fits: el.scrollHeight <= el.clientHeight + 1,
    }));
    // Rutin, Projeler ve Analiz gerçek sayfadaki gibi uzundur; pencerenin altında kesilir.
    expect(fit.scrollable).toBe(false);
    if (!["routines", "projects", "analytics"].includes(stem)) expect(fit.fits).toBe(true);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
      expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      writeFileSync(
        `${EVIDENCE}/axe-preview-${info.project.name}-${stem}-${theme}.json`,
        JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
      );
      expect(result.violations).toEqual([]);
      await expectDecorOnly(page, result.incomplete);
      await preview.screenshot({ path: `${EVIDENCE}/preview-${info.project.name}-${stem}-${theme}.png` });
    }
    expect(privateReads).toEqual([]);
  });
}

import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EVIDENCE } from "./evidence";

/** axe bütün sayfada açık. Kırpılmış tablo bulgularını tek tek görünür yapıp ölçüyoruz. */
export async function auditAnalytics(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {})),
    );
  });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const reviewed: unknown[] = [],
    path = `${EVIDENCE}/axe-analytics-${test.info().project.name}-${name}.json`;
  const record = () =>
    writeFileSync(
      path,
      JSON.stringify({ violations: result.violations, incomplete: result.incomplete, reviewed }, null, 2),
    );
  record();
  expect(result.violations).toEqual([]);
  for (const finding of result.incomplete) {
    expect(finding.id).toBe("color-contrast");
    for (const node of finding.nodes) {
      expect(node.target).toHaveLength(1);
      const selector = node.target[0];
      if (typeof selector !== "string") throw new Error("Unexpected shadow table target");
      // Sabit alt menünün etiketi kaydırılan içeriğin üstünde durur; axe arka planı seçemez. Menü
      // zemini opak olduğundan kontrastı etiket ile menü zemini arasında ölçüyoruz.
      if (node.any.some(check => check.data?.messageKey === "elmPartiallyObscuring")) {
        const ratio = await page.locator(selector).evaluate(el => {
          const nav = el.closest(".mobile-navigation");
          if (!nav) return null;
          const luminance = (color: string) => {
            const rgb = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          };
          const bg = getComputedStyle(nav).backgroundColor;
          if (bg === "rgba(0, 0, 0, 0)") return null;
          const a = luminance(getComputedStyle(el).color),
            b = luminance(bg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        expect(ratio, `${selector} must be a mobile navigation label on an opaque bar`).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(4.5);
        reviewed.push({ selector, reason: "mobile-navigation-overlay", ratio });
        record();
        continue;
      }
      expect(
        node.any.some(check => ["elmPartiallyObscured", "shortTextContent"].includes(check.data?.messageKey)),
      ).toBe(true);
      const element = page.locator(selector);
      const context = await element.evaluate(el => {
        const region = el.closest('[role="region"]');
        return {
          cell: !!el.closest("th,td"),
          label: region?.getAttribute("aria-label"),
          scrollable: !!region && region.scrollWidth > region.clientWidth,
        };
      });
      expect(context.cell).toBe(true);
      expect(["Dönem tablosu", "Plan karşılaştırması", "Öneri örnekleri tablosu"]).toContain(context.label);
      expect(context.scrollable).toBe(true);
      await element.evaluate(el => el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
      const measured = await element.evaluate(el => {
        const style = getComputedStyle(el),
          region = el.closest('[role="region"]')!.getBoundingClientRect();
        let background: Element | null = el;
        while (background && getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)")
          background = background.parentElement;
        if (!background) throw new Error("No opaque table background");
        const bg = getComputedStyle(background),
          luminance = (color: string) => {
            const rgb = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          };
        const a = luminance(style.color),
          b = luminance(bg.backgroundColor),
          range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter(r => r.width && r.height);
        const fullyVisible = rects.every(
          r =>
            r.left >= Math.max(0, region.left) &&
            r.right <= Math.min(innerWidth, region.right) &&
            r.top >= 0 &&
            r.bottom <= innerHeight,
        );
        const hits = rects.flatMap(r =>
          [r.left + 1, r.left + r.width / 2, r.right - 1].map(x => {
            const hit = document.elementFromPoint(x, r.top + r.height / 2);
            return hit === el || (hit !== null && el.contains(hit));
          }),
        );
        return {
          foreground: style.color,
          background: bg.backgroundColor,
          opacity: style.opacity,
          backgroundOpacity: bg.opacity,
          backgroundImage: bg.backgroundImage,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          fullyVisible,
          hits,
        };
      });
      reviewed.push({ target: node.target, context, measured, verified: false });
      record();
      expect(measured.opacity).toBe("1");
      expect(measured.backgroundOpacity).toBe("1");
      expect(measured.backgroundImage).toBe("none");
      expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
      expect(measured.fullyVisible).toBe(true);
      expect(measured.hits.length).toBeGreaterThan(0);
      expect(measured.hits.every(Boolean)).toBe(true);
      reviewed[reviewed.length - 1] = { target: node.target, context, measured, verified: true };
      record();
    }
  }
  // Ekran görüntüsü ve klavye kontrolü için tabloları okuma başlangıcına döndürüyoruz.
  await page.locator('#main [role="region"]').evaluateAll(rows =>
    rows.forEach(el => {
      el.scrollLeft = 0;
    }),
  );
}

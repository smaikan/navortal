import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EVIDENCE } from "./evidence";
export async function auditTask(page: Page, name: string, prefix = "work", theme: "light" | "dark" = "light") {
  const path = new URL(page.url()).pathname;
  await expect(page).toHaveTitle(
    path === "/planning" ? /^Gün Planlama/ : path === "/work" ? /^Çalışma kayıtları/ : /\S/,
  );
  // Tema değişince renk tokenları değişir. Sonlu CSS geçişleri bitince, ekran görüntüsü gibi ölçüyoruz.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {})),
    );
  });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const reviewed: {
    target: unknown;
    reason: string;
    context: { nativeModal: boolean; ownedPlayerOverlap: boolean };
    measured: unknown;
    verified: boolean;
  }[] = [];
  const record = () =>
    writeFileSync(
      `${EVIDENCE}/axe-${prefix}-${test.info().project.name}-${name}.json`,
      JSON.stringify({ violations: r.violations, incomplete: r.incomplete, reviewed }, null, 2),
    );
  record(); // Alttaki ölçüm hata verse bile ilk bulguyu koruyoruz.
  for (const item of r.incomplete) {
    expect(item.id).toBe("color-contrast");
    for (const node of item.nodes) {
      expect(
        node.any.some(check => ["elmPartiallyObscuring", "elmPartiallyObscured"].includes(check.data?.messageKey)),
      ).toBe(true);
      expect(node.target).toHaveLength(1);
      const selector = node.target[0];
      if (typeof selector !== "string") throw new Error("Unexpected shadow selector in native modal review");
      const element = page.locator(selector);
      const context = await element.evaluate(el => {
        const a = el.getBoundingClientRect(),
          b = document.querySelector("#work-player-slot")?.getBoundingClientRect();
        return {
          nativeModal: !!el.closest("dialog")?.matches(":modal"),
          ownedPlayerOverlap:
            !!b &&
            (!!el.closest("#work-player-slot") ||
              (!!el.closest("#main") && a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right)),
        };
      });
      // Kaydırma metni gerçekten göstermeli, sabit oynatıcı yerinde kalır. Alttaki tıklanabilirlik ölçümü de geçmeli.
      if (context.nativeModal) await element.scrollIntoViewIfNeeded();
      else await element.evaluate(el => el.scrollIntoView({ block: "center" }));
      const measured = await element.evaluate(el => {
        let background: Element | null = el;
        while (background && getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)")
          background = background.parentElement;
        if (!background) throw new Error("No opaque background for contrast review");
        const fg = getComputedStyle(el).color;
        const bg = getComputedStyle(background).backgroundColor;
        const luminance = (color: string) => {
          const channels = color
            .match(/[\d.]+/g)!
            .map(Number)
            .slice(0, 3)
            .map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const front = luminance(fg);
        const back = luminance(bg);
        const range = document.createRange();
        range.selectNodeContents(el);
        const clip = el.closest(".surface-body")?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
        const samples = [...range.getClientRects()]
          .filter(
            rect =>
              rect.height &&
              rect.width &&
              rect.top >= Math.max(0, clip.top) &&
              rect.bottom <= Math.min(innerHeight, clip.bottom),
          )
          .flatMap(rect =>
            [rect.left + 1, rect.left + rect.width / 2, rect.right - 1].map(x => {
              const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
              return hit === el || (hit !== null && el.contains(hit));
            }),
          );
        return {
          foreground: fg,
          background: bg,
          ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
          samples,
          nativeModal: el.closest("dialog")?.matches(":modal"),
          backgroundImage: getComputedStyle(background).backgroundImage,
          opacity: getComputedStyle(background).opacity,
        };
      });
      const entry = {
        target: node.target,
        reason:
          "Native modal or measured workspace player overlap; actual contrast and visible text-line hit tests; rule remains enabled.",
        context,
        measured,
        verified: false,
      };
      reviewed.push(entry);
      record();
      const darkPalette = [
        "rgb(24, 25, 28)",
        "rgb(34, 35, 39)",
        "rgb(61, 28, 31)",
        "rgb(58, 42, 18)",
        "rgb(13, 37, 64)",
      ];
      const lightPalette = [
        "rgb(255, 255, 255)",
        "rgb(242, 242, 242)",
        "rgb(253, 236, 238)",
        "rgb(255, 244, 229)",
        "rgb(235, 244, 255)",
      ];
      const allowed = theme === "dark" ? darkPalette : lightPalette;
      expect(context.nativeModal || context.ownedPlayerOverlap).toBe(true);
      expect(
        context.nativeModal ? allowed : [...allowed, theme === "dark" ? "rgb(17, 18, 20)" : "rgb(250, 250, 250)"],
      ).toContain(measured.background);
      expect(measured.backgroundImage).toBe("none");
      expect(measured.opacity).toBe("1");
      expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
      expect(measured.samples.length).toBeGreaterThan(0);
      expect(measured.samples.every(Boolean)).toBe(true);
      entry.verified = true;
    }
  }
  record();
  expect(r.violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) }))).toEqual([]);
}

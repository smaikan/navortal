import { expect, type Page } from "@playwright/test";
import type { AxeResults } from "axe-core";

// Karşılama ve girişteki renk geçişi ile yaylar süstür; axe bu zeminde rengi seçemez ve sonucu belirsiz bırakır.
// Yalnız bu nedenleri kabul ediyor, metni zeminin bütün tonlarına karşı ölçüyoruz.
const reasons = [
  "bgGradient",
  "bgOverlap",
  "bgImage",
  "elmPartiallyObscured",
  "elmPartiallyObscuring",
  "shortTextContent",
];
const grounds = ["#dff5f4", "#fafafa", "#f7f9fc", "#f4f2f9", "#ffffff"];

const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const hex = (value: string) => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));

export async function expectDecorOnly(page: Page, incomplete: AxeResults["incomplete"]) {
  for (const finding of incomplete) {
    expect(finding.id).toBe("color-contrast");
    for (const node of finding.nodes) {
      const key = node.any.map(check => check.data?.messageKey as string | undefined);
      expect(
        key.some(k => !!k && reasons.includes(k)),
        String(node.target),
      ).toBe(true);
      const selector = node.target[0];
      if (typeof selector !== "string") throw new Error("Unexpected shadow target");
      const seen = await page
        .locator(selector)
        .first()
        .evaluate(el => {
          // Kendi düz zemini olan öğe (kart, düğme) o zemine karşı ölçülür; süslü zemine gelince bütün tonlara.
          let node: Element | null = el;
          while (node) {
            const style = getComputedStyle(node);
            if (style.backgroundImage !== "none") return { color: getComputedStyle(el).color, solid: null };
            if (!style.backgroundColor.startsWith("rgba("))
              return { color: getComputedStyle(el).color, solid: style.backgroundColor };
            node = node.parentElement;
          }
          return { color: getComputedStyle(el).color, solid: null };
        });
      const channels = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const text = luminance(channels(seen.color));
      if (seen.solid) {
        const bg = luminance(channels(seen.solid));
        expect((Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05), selector).toBeGreaterThanOrEqual(4.5);
        continue;
      }
      for (const ground of grounds) {
        const bg = luminance(hex(ground));
        const ratio = (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05);
        expect(ratio, `${selector} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
}

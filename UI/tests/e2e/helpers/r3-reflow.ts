import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { EVIDENCE } from "./evidence";

/** Gerçek görünür R3 ekranını UI-31 ölçülerinde kontrol eder. Eylem sabit menü/oynatıcının üstünde ulaşılır kalmalı. */
export async function assertR3Reflow(page: Page, action: Locator, name: string, info: TestInfo) {
  const original = page.viewportSize();
  const sizes =
    info.project.name === "chromium"
      ? [
          [320, 900],
          [390, 844],
          [640, 900],
          [768, 1024],
          [1920, 1080],
          [640, 320],
        ]
      : [
          [390, 844],
          [640, 320],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await action.evaluate(element =>
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
    );
    await expect(action).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await action.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const points = [
          [rect.left + rect.width / 2, rect.top + 5],
          [rect.left + rect.width / 2, rect.bottom - 5],
          [rect.left + 10, rect.top + rect.height / 2],
          [rect.right - 10, rect.top + rect.height / 2],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
        ];
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          points.every(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return !!hit && element.contains(hit);
          })
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `${EVIDENCE}/r3-${name}-${info.project.name}-${width}x${height}.png`,
      fullPage: false,
    });
  }
  if (original) await page.setViewportSize(original);
}

import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";

test("planning menu: calm view is first with normal weight and Matrix follows Pomodoro", async ({ page }, info) => {
  const fx = await FocusFixture.create(),
    faults: string[] = [];
  trackFaults(page, faults);
  try {
    await fx.login(page);
    await page.goto("/planning");
    await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Plan menüsü", exact: true });
    await expect(menu.getByRole("menuitem").first()).toHaveAccessibleName("Sakin görünüm: kapalı, aç");
    expect(await menu.locator(".calm-toggle").evaluate(el => getComputedStyle(el).fontWeight)).toBe("400");
    await page.screenshot({ path: `${EVIDENCE}/calm-menu-${info.project.name}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    if (info.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    } else {
      const links = await page
        .getByRole("navigation", { name: "Çalışma alanı", exact: true })
        .getByRole("link")
        .evaluateAll(all => all.map(link => link.getAttribute("href")));
      const focus = links.indexOf("/focus");
      expect(focus).toBeGreaterThanOrEqual(0);
      expect(links[focus + 1]).toBe("/matrix");
    }
    await page.getByRole("link", { name: "Eisenhower Matrisi", exact: true }).click();
    await expect(page).toHaveURL(/\/matrix$/);
    await expect(page.getByRole("heading", { name: "Eisenhower Matrisi", exact: true })).toBeVisible();
    expect(faults).toEqual([]);
  } finally {
    await fx.api.dispose();
  }
});

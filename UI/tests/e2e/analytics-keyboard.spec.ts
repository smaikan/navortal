import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";

test("period links, disclosures and the exact table are reachable by keyboard; mobile table scrolls with arrows", async ({
  page,
}, info) => {
  const fx = await FocusFixture.create();
  try {
    await fx.login(page);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/analytics?period=custom&fromDate=2026-01-14&toDate=2026-01-15");
    await expect(page.getByText(/^Bu aralıkta/)).toBeVisible();
    const lastWeek = page
      .getByRole("navigation", { name: "Dönem", exact: true })
      .getByRole("link", { name: "Geçen hafta" });
    await lastWeek.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/period=lastWeek/);
    await expect(lastWeek).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Geçen hafta (kayıtlı|\d)/)).toBeVisible();
    const summary = page.locator("#main details summary", { hasText: /^Ayrıntılar$/ });
    await summary.focus();
    await page.keyboard.press("Enter");
    const region = page.getByRole("region", { name: "Dönem tablosu", exact: true });
    await expect(region).toBeVisible();
    await region.focus();
    await expect(region).toBeFocused();
    const scrollable = await region.evaluate(el => el.scrollWidth > el.clientWidth);
    if (info.project.name === "mobile-chromium") expect(scrollable).toBe(true);
    if (scrollable) {
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    const scroll = await region.evaluate(el => ({
      left: el.scrollLeft,
      viewport: el.clientWidth,
      content: el.scrollWidth,
    }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    writeFileSync(
      `${EVIDENCE}/analytics-keyboard-${info.project.name}.json`,
      JSON.stringify(
        {
          kind: "real-api-keyboard",
          periodLinkByEnter: true,
          detailsByEnter: true,
          tableArrowKeyScroll: scroll,
          horizontalDocumentOverflow: false,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: `${EVIDENCE}/analytics-keyboard-${info.project.name}.png` });
  } finally {
    await fx.api.dispose();
  }
});

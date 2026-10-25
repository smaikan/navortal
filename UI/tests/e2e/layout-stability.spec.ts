import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
import { writeFileSync } from "node:fs";
async function observe(page: Page) {
  await page.addInitScript(() => {
    const shifts: number[] = [];
    Object.assign(window, { __layoutShifts: shifts });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) shifts.push(shift.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}
async function check(page: Page, name: string, project: string) {
  const shifts = await page.evaluate(() => (window as unknown as { __layoutShifts: number[] }).__layoutShifts);
  const total = shifts.reduce((sum, n) => sum + n, 0);
  writeFileSync(
    `${EVIDENCE}/layout-${name}-${project}.json`,
    JSON.stringify({ kind: "observed-controlled-initial-read-not-field-CWV", shifts, total }, null, 2),
  );
  expect(total).toBeLessThanOrEqual(0.1);
}
test("first focus read settles without shifting history; a held refetch keeps the working controls", async ({
  page,
  browserName,
}, info) => {
  expect(browserName).toBe("chromium");
  const fx = await FocusFixture.create();
  let release!: () => void;
  let gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let waiting = 0;
  try {
    await fx.start(undefined, (await fx.task()).id);
    await fx.login(page);
    await observe(page);
    await page.route("**/api/focus-sessions/current", async route => {
      const response = await route.fetch();
      waiting++;
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.goto("/focus");
    await expect.poll(() => waiting).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    release();
    await expect(page.getByRole("button", { name: "Odak işlemleri", exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    await check(page, "focus", info.project.name);
    gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const previous = waiting;
    await page.getByRole("button", { name: "Odak işlemleri", exact: true }).click();
    await page.getByRole("menuitem", { name: "Güncel odağı kontrol et", exact: true }).click();
    await expect.poll(() => waiting).toBeGreaterThan(previous);
    await expect(page.getByRole("button", { name: "Odak işlemleri", exact: true })).toBeEnabled();
    release();
  } finally {
    release?.();
    // Sayfanın bıraktığı isteği tutan işleyici testi bekletmesin.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await fx.clean();
    await fx.api.dispose();
  }
});
test("a delayed actual summary does not displace a visible breakdown; stale data survives refresh", async ({
  page,
  browserName,
}, info) => {
  expect(browserName).toBe("chromium");
  const fx = await FocusFixture.create();
  let release!: () => void;
  let gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let waiting = 0;
  try {
    const task = await fx.task();
    expect(
      (
        await fx.api.post("/api/work-sessions/manual", {
          headers: { "Idempotency-Key": randomUUID() },
          data: {
            taskId: task.id,
            startedAt: "2026-01-14T06:00:00Z",
            endedAt: "2026-01-14T06:20:00Z",
            reason: "UI33 controlled report",
          },
        })
      ).status(),
    ).toBe(201);
    await fx.login(page);
    await observe(page);
    await page.route(/\/api\/analytics\/actual\?/, async route => {
      const response = await route.fetch();
      waiting++;
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.goto("/analytics?period=custom&fromDate=2026-01-14&toDate=2026-01-15");
    await expect.poll(() => waiting).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    release();
    await expect(page.getByText(/^Bu aralıkta 20 dk çalıştın/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Proje dağılımı", exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    await check(page, "actual", info.project.name);
    gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const previous = waiting;
    await page.locator("#main details summary", { hasText: /^Ayrıntılar$/ }).click();
    await page.getByRole("button", { name: "Raporu yenile", exact: true }).click();
    await expect.poll(() => waiting).toBeGreaterThan(previous);
    // Yenileme tutulurken eski veri görünür kalır.
    await expect(page.getByText(/^Bu aralıkta 20 dk çalıştın/)).toBeVisible();
    release();
  } finally {
    release?.();
    // Sayfanın bıraktığı isteği tutan işleyici testi bekletmesin.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await fx.clean();
    await fx.api.dispose();
  }
});

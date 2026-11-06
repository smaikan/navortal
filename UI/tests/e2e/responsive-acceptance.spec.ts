import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditTask } from "./helpers/task-audit";
import { auditAnalytics } from "./helpers/analytics-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";

const families = {
  definitions: ["/tasks", "/tasks/completed", "/pool", "/projects", "/categories"],
  planning: ["/planning", "/calendar"],
  work: ["/focus", "/work", "/notes"],
  notifications: ["/notifications", "/reminders", "/reminders/preferences", "/reminders/preferences"],
  // Ayarlar sayfa değil penceredir; pencere düzeni preferences testinde denetlenir.
  overview: ["/recurrences", "/analytics", "/analytics/plan"],
};
async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  const measured = await control.evaluate(el => {
    const r = el.getBoundingClientRect(),
      hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      name: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 80),
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      hit: hit?.tagName,
      reachable:
        r.width > 0 &&
        r.height > 0 &&
        r.left >= 0 &&
        r.right <= innerWidth + 1 &&
        r.top >= 0 &&
        r.bottom <= innerHeight + 1 &&
        !!hit &&
        (hit === el || el.contains(hit)),
    };
  });
  expect(measured, JSON.stringify(measured)).toMatchObject({ reachable: true });
}
async function edges(page: Page) {
  const actions = page.locator(
    "#main :is(a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)):visible",
  );
  if (await actions.count()) {
    await reachable(actions.first());
    await reachable(actions.last());
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
for (const [family, routes] of Object.entries(families)) {
  test(`screen family reflow, keyboard, contrast and reduced motion: ${family}`, async ({ page }, info) => {
    test.setTimeout(120_000); // Birden çok adres, boyut ve axe denetimi var. Bu süre tekrar deneme bütçesi değil.
    const fx = await FocusFixture.create(),
      faults: string[] = [],
      geometry: unknown[] = [];
    trackFaults(page, faults);
    try {
      const created = await fx.api.post("/api/tasks", {
        data: { title: "Uzun Türkçe görev başlığı ve küçük sonraki adım — ".repeat(7).slice(0, 300) },
      });
      expect(created.status()).toBe(201);
      await fx.login(page);
      const dark = info.project.name === "mobile-chromium";
      await page.addInitScript(theme => localStorage.setItem("ui-theme", theme), dark ? "dark" : "light");
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const path of routes) {
        await page.goto(path);
        await expect(page.locator("#main h1").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        for (const viewport of info.project.name === "chromium"
          ? [
              { width: 320, height: 740 },
              { width: 768, height: 900 },
              { width: 1920, height: 1080 },
            ]
          : [
              { width: 390, height: 844 },
              { width: 640, height: 320 },
            ]) {
          await page.setViewportSize(viewport);
          await edges(page);
          geometry.push({
            path,
            viewport,
            theme: dark ? "dark" : "light",
            ...(await page.evaluate(() => ({
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: innerWidth,
              runningAnimations: document.getAnimations().filter(a => a.playState === "running").length,
            }))),
          });
        }
        const stem = path.slice(5).replaceAll("/", "-");
        await page.setViewportSize({ width: info.project.name === "chromium" ? 320 : 390, height: 844 });
        if (path.startsWith("/analytics")) await auditAnalytics(page, `responsive-${stem}`);
        else await auditTask(page, stem, "responsive", dark ? "dark" : "light");
        await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-${stem}.png`, fullPage: true });
      }
      expect(faults).toEqual([]);
    } finally {
      writeFileSync(`${EVIDENCE}/geometry-${info.project.name}-${family}.json`, JSON.stringify(geometry, null, 2));
      await fx.api.dispose();
    }
  });
}
test("long task autosave, panel return and last actions remain reachable with an active player and reduced viewport", async ({
  page,
}, info) => {
  const fx = await FocusFixture.create();
  try {
    const task = await fx.task();
    const start = await fx.api.post("/api/work-sessions/start", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { taskId: task.id },
    });
    expect(start.status()).toBe(201);
    await fx.login(page);
    await page.setViewportSize({ width: 320, height: 360 });
    await page.goto("/tasks");
    const trigger = page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true });
    await trigger.click();
    const title = page.getByLabel("Görev başlığı", { exact: true });
    await expect(title).toHaveValue(task.title);
    const updated = "Kaldığım yeri ve sonraki küçük adımı hatırlatan uzun Türkçe görev — ".repeat(5).slice(0, 300);
    await title.fill(updated);
    await title.press("Tab");
    await expect.poll(async () => (await (await fx.api.get(`/api/tasks/${task.id}`)).json()).title).toBe(updated);
    await reachable(page.getByLabel("Açıklama", { exact: true }));
    await page.keyboard.press("Escape");
    await expect(title).toHaveCount(0);
    const restored = page.getByRole("button", { name: `${updated} ayrıntısını aç`, exact: true });
    await expect(restored).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("region", { name: "Çalışma denetimleri", exact: true })).toBeVisible();
    await edges(page);
    await auditTask(page, "player-panel-return", "responsive");
    await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-player-panel-return.png`, fullPage: true });
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});
test("same fixture before and after focus visibility repair", async ({ page }, info) => {
  const fx = await FocusFixture.create();
  try {
    await fx.task();
    await fx.login(page);
    await page.setViewportSize({ width: 640, height: 320 });
    await page.goto("/tasks");
    const add = page.getByRole("button", { name: "Görev ekle", exact: true });
    await expect(add).toBeVisible();
    const before = await page.addStyleTag({
      content:
        "html { scroll-padding-block-end: 0 !important; } .workspace-shell :is(a,button,input,select,textarea,summary,[tabindex]) { scroll-margin-block: 0 !important; }",
    });
    await add.scrollIntoViewIfNeeded();
    await add.focus();
    const beforeHit = await add.evaluate(el => {
      const r = el.getBoundingClientRect(),
        hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    // UI-31 hatası burada Chromium'da görülmüştü. Kısa R3 ağaç başlığı artık düğmeyi
    // çubuğun altına koymuyor. Önceki değer yalnız kanıt olarak tutulur, düzelmiş durum altta doğrulanır.
    writeFileSync(
      `${EVIDENCE}/${info.project.name}-focus-comparison.json`,
      JSON.stringify({ beforeHit, expectedAfterHit: true }),
    );
    await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-focus-before.png` });
    await before.evaluate(el => {
      el.parentNode?.removeChild(el);
    });
    await page.evaluate(() => scrollTo(0, 0));
    await reachable(add);
    await page.screenshot({ path: `${EVIDENCE}/${info.project.name}-focus-after.png` });
  } finally {
    await fx.api.dispose();
  }
});

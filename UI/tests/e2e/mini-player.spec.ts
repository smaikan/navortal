import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { openAccountMenu, signOutFromMenu } from "./helpers/session";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { miniPlayerKey } from "../../src/features/mini-player/controller";

type PipParent = Window & { documentPictureInPicture?: { window: Window | null } };
const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const text = (page: Page) =>
  page.evaluate(() => (window as PipParent).documentPictureInPicture?.window?.document.body.innerText ?? "");
const opened = (page: Page) =>
  page.evaluate(
    () =>
      !!(window as PipParent).documentPictureInPicture?.window &&
      !(window as PipParent).documentPictureInPicture!.window!.closed,
  );
const player = (page: Page) => page.getByRole("region", { name: "Çalışma denetimleri" });
async function enable(page: Page) {
  await page.goto("/tasks?settings=appearance");
  const toggle = page.getByRole("checkbox", { name: "Mini sayaç", exact: true });
  await expect(toggle).toBeVisible();
  // Telefonda mini sayaç kapalıdır (8 Kasım kullanıcı kararı).
  const supported = await page.evaluate(
    () =>
      !!(window as PipParent).documentPictureInPicture &&
      !(matchMedia("(hover: none) and (pointer: coarse)").matches && Math.min(screen.width, screen.height) < 768),
  );
  if (!supported) {
    await expect(toggle).toBeDisabled();
    return false;
  }
  await toggle.check();
  const user = await (await fx.api.get("/api/auth/me")).json();
  expect(await page.evaluate(key => localStorage.getItem(key), miniPlayerKey(user.id))).toBe("true");
  await expect.poll(() => opened(page)).toBe(false);
  return true;
}
async function auditMini(page: Page, name: string) {
  const nativePage = page
    .context()
    .pages()
    .find(p => p !== page);
  // Playwright ana sayfanın viewport'unu PiP hedefine de verir. Gerçek küçük görünümü ayrıca ölçüyoruz.
  if (nativePage) await nativePage.setViewportSize({ width: 240, height: 84 });
  const result = await page.evaluate(async script => {
    const pip = (window as PipParent).documentPictureInPicture!.window!;
    const child = pip as Window & {
      eval: (code: string) => void;
      axe: { run: (root: Document, options: unknown) => Promise<{ violations: unknown[]; incomplete: unknown[] }> };
    };
    child.eval(script);
    const audit = await child.axe.run(child.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    });
    return {
      violations: audit.violations,
      incomplete: audit.incomplete,
      width: child.innerWidth,
      height: child.innerHeight,
      overflow: child.document.documentElement.scrollWidth > child.innerWidth,
      verticalOverflow: child.document.documentElement.scrollHeight > child.innerHeight,
      buttons: [...child.document.querySelectorAll("button")].map(button => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      })),
    };
  }, axe);
  writeFileSync(`${EVIDENCE}/mini-${test.info().project.name}-${name}.json`, JSON.stringify(result, null, 2));
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
  expect(result.overflow).toBe(false);
  expect(result.verticalOverflow).toBe(false);
  expect(result.buttons.every(b => b.width >= 32 && b.height >= 32)).toBe(true);
  const child = page
    .context()
    .pages()
    .find(p => p !== page);
  if (child) await child.screenshot({ path: `${EVIDENCE}/mini-${test.info().project.name}-${name}.png` });
}

test.beforeAll(async () => {
  fx = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.clean();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as PipParent).documentPictureInPicture?.window?.close()).catch(() => {});
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("mini player: opt-in only, real native task timer, themes, pause and logout", async ({ page }) => {
  const supported = await enable(page);
  await auditTask(page, "mini-setting", "mini");
  await page.screenshot({ path: `${EVIDENCE}/mini-settings-${test.info().project.name}.png` });
  const task = await fx.task();
  await page.goto(`/tasks?taskId=${task.id}`);
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  await expect(player(page)).toContainText("Çalışılıyor");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeHidden();
  if (!supported) {
    expect(await opened(page)).toBe(false);
    return;
  }
  await expect.poll(() => text(page)).toContain(task.title);
  await expect.poll(() => text(page)).toContain("Çalışma");
  await expect.poll(() => text(page)).toMatch(/\d+:\d{2}/);
  await auditMini(page, "work-light");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditMini(page, "work-dark");
  const first = await text(page);
  await expect.poll(() => text(page)).not.toBe(first);
  await page.evaluate(() =>
    (window as PipParent)
      .documentPictureInPicture!.window!.document.querySelector<HTMLButtonElement>("button")!
      .click(),
  );
  await expect(player(page)).toContainText("Duraklatıldı");
  await expect.poll(() => opened(page)).toBe(false);
  await player(page).getByRole("button", { name: "Devam et", exact: true }).click();
  await expect.poll(() => text(page)).toContain(task.title);
  await signOutFromMenu(page);
  await expect.poll(() => opened(page)).toBe(false);
});

test("mini player: native Pomodoro, running break, close preference and no unsolicited reopen", async ({ page }) => {
  const supported = await enable(page);
  await page.goto("/focus");
  await page.locator("button.focus-rhythm").filter({ hasText: "Kısa adım" }).click();
  const start = page.getByRole("region", { name: "Pomodoro başlat", exact: true });
  await start.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(start).toBeHidden();
  await expect(page.locator(".focus-state")).toContainText("Odaklanılıyor");
  if (!supported) {
    expect(await opened(page)).toBe(false);
    return;
  }
  await expect.poll(() => text(page)).toContain("Pomodoro");
  await auditMini(page, "focus");
  await page
    .getByRole("region", { name: "Güncel pomodoro", exact: true })
    .getByRole("button", { name: "Molaya geç", exact: true })
    .click();
  await expect.poll(() => text(page)).toContain("Mola");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Ayar bölümleri" })
    .getByRole("button", { name: "Görünüm", exact: true })
    .click();
  await expect.poll(() => opened(page)).toBe(true);
  await page.getByRole("checkbox", { name: "Mini sayaç", exact: true }).uncheck();
  await expect.poll(() => opened(page)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator(".focus-state")).toContainText("Moladasın");
  await expect.poll(() => opened(page)).toBe(false);
});

test("mini player unsupported: setting explains absence and work still starts", async ({ page }, info) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "documentPictureInPicture", { value: undefined, configurable: true }),
  );
  await page.goto("/tasks?settings=appearance");
  await expect(page.getByRole("checkbox", { name: "Mini sayaç", exact: true })).toBeDisabled();
  // Telefonda neden farklıdır: mini sayaç orada hiç sunulmaz.
  const reason = info.project.name.startsWith("mobile")
    ? "Mini sayaç telefonda kullanılmıyor."
    : "Bu tarayıcı mini pencereyi desteklemiyor.";
  await expect(page.getByText(reason, { exact: false })).toBeVisible();
  const task = await fx.task();
  await page.goto(`/tasks?taskId=${task.id}`);
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  await expect(player(page)).toContainText("Çalışılıyor");
  expect(await opened(page)).toBe(false);
});

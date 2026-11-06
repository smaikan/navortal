import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";

// Tema, hızlı ekleme, menüler ve gün okları gerçek kayıt JWT'si/me başlangıcıyla deneniyor.
test.beforeEach(async ({ page, request }) => {
  const response = await request.post("http://127.0.0.1:5181/api/auth/register", {
    data: { email: `ui-r1-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(response.status()).toBe(201);
  const auth = (await response.json()) as { accessToken: string };
  await signIn(page, auth.accessToken);
});
const page_ = (page: Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor,
  }));
async function noContrastViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}

test("light by default; dark and system persist on this device without a light flash and keep AA contrast", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await page.goto("/settings?section=appearance");
  await expect(page.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
  expect(await page_(page)).toEqual({ theme: "light", background: "rgb(250, 250, 250)" });
  await expect(page.getByRole("radio", { name: "Açık", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Koyu", exact: true }).check();
  expect(await page_(page)).toEqual({ theme: "dark", background: "rgb(17, 18, 20)" });
  // Başlıktaki başlangıç scripti kayıtlı seçimi React'ten önce uygular.
  await page.goto("/planning", { waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await noContrastViolations(page);
  await page.screenshot({ path: `${EVIDENCE}/ui-r1-dark-today-${info.project.name}.png`, fullPage: true });
  // Ana ekranlar koyu temada da AA kontrastını korumalı.
  for (const [path, heading] of [
    ["/tasks", "Görevler"],
    ["/calendar", "Takvim"],
    ["/focus", "Odak"],
    ["/notes", "Notlar"],
    ["/projects", "Projeler"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await noContrastViolations(page);
  }
  // Ayarlar sayfa değil penceredir; koyu temada pencerenin kontrastı ayrıca denetlenir.
  await page.goto("/settings?section=appearance");
  await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
  await noContrastViolations(page);
  await page.getByRole("radio", { name: "Sistem", exact: true }).check();
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await page_(page)).background).toBe("rgb(17, 18, 20)");
  await page.emulateMedia({ colorScheme: "light" });
  expect((await page_(page)).background).toBe("rgb(250, 250, 250)");
  await page.getByRole("radio", { name: "Açık", exact: true }).check();
  expect(await page_(page)).toEqual({ theme: "light", background: "rgb(250, 250, 250)" });
  expect(faults).toEqual([]);
});

test("N opens quick capture in its field from anywhere but never while typing; Escape returns to the trigger", async ({
  page,
}) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await page.goto("/planning");
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await page.getByLabel("Plan günü", { exact: true }).focus();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Hızlı görev ekle" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Gün Planlama", level: 1 }).focus();
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Hızlı görev ekle", exact: true });
  await expect(dialog).toBeVisible();
  const field = dialog.getByLabel("Aklındaki işi yaz", { exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.type("n");
  await expect(field).toHaveValue("n");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Görev", exact: true })).toBeFocused();
  expect(faults).toEqual([]);
});

test("closing quick capture preserves a newer explicit keyboard focus", async ({ page }) => {
  await page.goto("/planning");
  await page.getByRole("button", { name: "Görev", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hızlı görev ekle", exact: true });
  await expect(dialog.getByLabel("Aklındaki işi yaz", { exact: true })).toBeFocused();
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => {
      frames.push(callback);
      return 1_000_000 + frames.length;
    };
    (window as Window & { resumeSurfaceFrames?: () => void }).resumeSurfaceFrames = () => {
      window.requestAnimationFrame = original;
      for (const frame of frames) frame(performance.now());
      delete (window as Window & { resumeSurfaceFrames?: () => void }).resumeSurfaceFrames;
    };
  });
  try {
    await dialog
      .getByRole("button", { name: "Hızlı görev ekle panelini kapat", exact: true })
      .evaluate(button => (button as HTMLButtonElement).click());
    await expect(dialog).toHaveCount(0);
    const next = page.getByRole("button", { name: /^Bildirimler/ });
    await next.focus();
    await page.evaluate(() => (window as Window & { resumeSurfaceFrames?: () => void }).resumeSurfaceFrames?.());
    await expect(next).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Bildirimler", exact: true })).toBeVisible();
  } finally {
    await page.evaluate(() => (window as Window & { resumeSurfaceFrames?: () => void }).resumeSurfaceFrames?.());
  }
});

test("plan menu is a keyboard menu: first item focused, arrows wrap, Escape and Tab close, focus returns to its trigger", async ({
  page,
}) => {
  await page.goto("/planning");
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Plan menüsü", exact: true });
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Plan menüsü", exact: true });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("menuitem", { name: "Görev Ertele", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Gün sonunu gözden geçir", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Acil işe geç", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.getByRole("heading", { name: "Gün Planlama", level: 1 }).click();
  await expect(menu).toBeHidden();
});

test("day arrows move one calendar day and Bugün returns; only the date changes, no write is sent", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", r => {
    if (
      r.method() !== "GET" &&
      new URL(r.url()).pathname.startsWith("/api/") &&
      !new URL(r.url()).pathname.startsWith("/api/hubs/")
    )
      writes++;
  });
  await page.goto("/planning");
  const input = page.getByLabel("Plan günü", { exact: true });
  await expect(input).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  const today = await input.inputValue();
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await page.getByRole("button", { name: "Sonraki gün", exact: true }).click();
  await expect(input).toHaveValue(next.toISOString().slice(0, 10));
  await expect(page.locator(".r2-dayplan")).toHaveAttribute("data-plan-date", next.toISOString().slice(0, 10));
  // Tek başlık var. Bugüne dön yalnız başka günde çıkar.
  await expect(page.getByRole("button", { name: "Bugüne dön", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Önceki gün", exact: true }).click();
  await page.getByRole("button", { name: "Önceki gün", exact: true }).click();
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  await expect(input).toHaveValue(previous.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Bugüne dön", exact: true }).click();
  await expect(input).toHaveValue(today);
  await expect(page.getByRole("button", { name: "Bugüne dön", exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

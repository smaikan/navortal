import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";

let fixture: FocusFixture;
test.beforeAll(async () => {
  fixture = await FocusFixture.create();
});
test.afterAll(async () => {
  await fixture?.api.dispose();
});

test("N opens a compact centered capture, keeps typing safe and offers a small Çoklu görev action", async ({
  page,
}) => {
  const errors: string[] = [];
  trackFaults(page, errors);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture.login(page);
  await page.goto("/tasks");
  const heading = page.getByRole("heading", { name: "Görevler", exact: true });
  await expect(heading).toBeVisible();
  await heading.focus();
  const quick = page.getByRole("dialog", { name: "Hızlı görev ekle", exact: true });
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(quick).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  const input = quick.getByRole("textbox", { name: "Aklındaki işi yaz", exact: true });
  await expect(input).toBeFocused();
  const geometry = await quick.evaluate(d => {
    const box = d.getBoundingClientRect();
    const action = d.querySelector(".quick-dump-entry")!.getBoundingClientRect();
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      width: box.width,
      height: box.height,
      actionWidth: action.width,
      actionHeight: action.height,
      overflow: d.scrollWidth > d.clientWidth,
    };
  });
  const viewport = page.viewportSize()!;
  expect(Math.abs(geometry.centerX - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(geometry.centerY - viewport.height / 2)).toBeLessThan(2);
  expect(geometry.width).toBeLessThanOrEqual(560);
  expect(geometry.height).toBeLessThan(viewport.height * 0.75);
  expect(geometry.actionWidth).toBeLessThan(180);
  expect(geometry.actionHeight).toBeLessThanOrEqual(44);
  expect(geometry.overflow).toBe(false);
  await page.screenshot({ path: test.info().outputPath("quick-capture.png") });
  await input.press("n");
  await expect(input).toHaveValue("n");
  const title = `Hızlı kayıt ${randomUUID()}`;
  await input.fill(title);
  await input.press("Enter");
  await expect(quick.getByRole("status")).toContainText("Görev eklendi.");
  await expect(input).toBeFocused();
  await quick.getByRole("button", { name: "Çoklu görev", exact: true }).click();
  const multiple = page.getByRole("dialog", { name: "Çoklu görev", exact: true });
  const text = multiple.getByRole("textbox", { name: "Aklındakileri alt alta yaz", exact: true });
  await expect(text).toBeFocused();
  let batches = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/tasks/batch") batches++;
  });
  const marker = randomUUID();
  await text.fill(`Birinci ${marker}\nİkinci ${marker}\nBirinci ${marker}`);
  await expect(multiple).toContainText("2 görev eklenecek · 1 tekrar satırı atlandı");
  await multiple.getByRole("button", { name: "Görevleri ekle", exact: true }).click();
  await expect(multiple.getByRole("status")).toHaveText("2 görev eklendi.");
  expect(batches).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".quick-open")).toBeFocused();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Komut paleti", exact: true });
  await palette.getByRole("combobox").fill("çoklu görev");
  await expect(palette.getByRole("option", { name: "Çoklu görev", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(multiple).toBeVisible();
  await page.keyboard.press("Escape");
  const search = page.getByRole("searchbox", { name: "Görevlerde ara" });
  await search.focus();
  await search.press("n");
  await expect(search).toHaveValue("n");
  await expect(quick).toHaveCount(0);
  expect(errors).toEqual([]);
});

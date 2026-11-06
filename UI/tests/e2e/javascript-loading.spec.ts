import { readdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { localToday } from "../../src/features/preferences/model";

test("Today opens without Temporal; a cold time editor can be cancelled and reopened before its chunk finishes", async ({
  page,
}) => {
  const fx = await FocusFixture.create();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const files = new Set(
    readdirSync(".local/next-e2e/static/chunks").filter(name => {
      if (!name.endsWith(".js")) return false;
      const s = readFileSync(`.local/next-e2e/static/chunks/${name}`, "utf8");
      return s.includes("getTimeZoneTransition") && s.includes("PlainDateTime") && s.includes("toZonedDateTime");
    }),
  );
  expect(files.size).toBeGreaterThan(0);
  let temporalReads = 0,
    writes = 0;
  try {
    const task = await fx.task();
    const date = localToday("Europe/Istanbul");
    expect((await fx.api.post(`/api/daily-plans/${date}/items`, { data: { taskId: task.id } })).status()).toBe(201);
    await fx.login(page);
    page.on("request", r => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/schedules") writes++;
    });
    await page.route("**/_next/static/chunks/*.js", async route => {
      if (files.has(new URL(route.request().url()).pathname.split("/").at(-1)!)) {
        temporalReads++;
        await gate;
      }
      await route.continue();
    });
    await page.goto("/planning", { waitUntil: "domcontentloaded" });
    const row = page.locator(".r2-plan-list > li").filter({ hasText: task.title });
    await expect(row).toBeVisible();
    await expect(page.locator('[data-sync-state="connected"]')).toBeVisible();
    expect(temporalReads).toBe(0);
    const edit = row.getByRole("button", { name: /Saati düzenle$/ });
    await edit.click();
    await expect.poll(() => temporalReads).toBeGreaterThan(0);
    await expect(row.getByRole("status")).toContainText("Saat düzenleyicisi hazırlanıyor");
    await row.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(row.getByRole("form", { name: "Saat aralığı" })).toHaveCount(0);
    expect(writes).toBe(0);
    await edit.click();
    release();
    const form = row.getByRole("form", { name: "Saat aralığı" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Başlangıç saati")).toBeFocused();
    await form.getByLabel("Başlangıç saati").fill("09:00");
    await form.getByLabel("Bitiş saati").fill("10:00");
    await form.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(row).toContainText("09:00–10:00");
    expect(writes).toBe(1);
    expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).toBe("Pending");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await fx.clean();
    await fx.api.dispose();
  }
});

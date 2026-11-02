import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Reminder } from "../../src/features/reminders/model";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";

async function create(fx: FocusFixture, title: string, seconds: number) {
  const response = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title, dueAt: new Date(Date.now() + seconds * 1000).toISOString() },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Reminder;
}

test("active reminders: past and canceled rows are hidden; header actions stay beside the title and cancel removes the row", async ({
  page,
}, info) => {
  const fx = await FocusFixture.create(),
    faults: string[] = [];
  trackFaults(page, faults);
  try {
    const past = await create(fx, "Zamanı geçmiş", 2);
    const canceled = await create(fx, "İptal edilmiş", 3600);
    const active = await create(fx, "Aktif hatırlatma", 7200);
    expect(
      (
        await fx.api.post(`/api/notifications/reminders/${canceled.id}/cancel`, { data: { version: canceled.version } })
      ).status(),
    ).toBe(200);
    await expect
      .poll(async () => {
        const rows = (await (await fx.api.get("/api/notifications/reminders?activeOnly=true")).json()) as Reminder[];
        return rows.some(r => r.id === past.id);
      })
      .toBe(false);
    await fx.login(page);
    const read = page.waitForRequest(
      r =>
        new URL(r.url()).pathname === "/api/notifications/reminders" &&
        new URL(r.url()).searchParams.get("activeOnly") === "true",
    );
    await page.goto("/reminders");
    await read;
    const list = page.getByRole("list", { name: "Özel hatırlatmalar", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText(active.title);
    await expect(list).not.toContainText(past.title);
    await expect(list).not.toContainText(canceled.title);
    const heading = (await page.getByRole("heading", { name: "Hatırlatmalar", exact: true }).boundingBox())!;
    const add = (await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).boundingBox())!;
    expect(Math.abs(heading.y + heading.height / 2 - add.y - add.height / 2)).toBeLessThan(4);
    expect(heading.x + heading.width).toBeLessThanOrEqual(add.x);
    await expect(page.locator(".reminders-toolbar")).toHaveCount(0);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
      await auditTask(page, theme, "reminder-active", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${EVIDENCE}/active-reminders-${theme}-${info.project.name}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: `${active.title} hatırlatma işlemleri`, exact: true }).click();
    await page.getByRole("menuitem", { name: "İptal et", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Hatırlatmayı iptal et", exact: true });
    await dialog.getByRole("button", { name: "Hatırlatmayı iptal et", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(list.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("Aktif hatırlatma yok.", { exact: true })).toBeVisible();
    const history = (await (await fx.api.get("/api/notifications/reminders")).json()) as Reminder[];
    expect(history.find(r => r.id === active.id)?.canceled).toBe(true);
    expect(history.some(r => r.id === past.id)).toBe(true);
    expect(faults).toEqual([]);
  } finally {
    await fx.api.dispose();
  }
});

test("active reminders: an open list rereads the server when a one-off time arrives", async ({ page }) => {
  const fx = await FocusFixture.create(),
    faults: string[] = [];
  trackFaults(page, faults);
  try {
    await fx.login(page);
    await page.goto("/reminders");
    await expect(page.getByText("Aktif hatırlatma yok.", { exact: true })).toBeVisible();
    const reminder = await create(fx, "Birazdan zamanı dolacak", 4);
    await page.getByRole("button", { name: "Hatırlatmaları yenile", exact: true }).click();
    const row = page.locator(`[data-reminder-id="${reminder.id}"]`);
    await expect(row).toBeVisible();
    // Gerçek API zamanı da geçer. Yalnız tarayıcı saatini ilerletmek sunucu filtresini kanıtlamaz.
    await expect(row).toHaveCount(0, { timeout: 7000 });
    const history = (await (await fx.api.get("/api/notifications/reminders")).json()) as Reminder[];
    expect(history.find(r => r.id === reminder.id)?.canceled).toBe(false);
    expect(faults).toEqual([]);
  } finally {
    await fx.api.dispose();
  }
});

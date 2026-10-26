import { expect, test } from "@playwright/test";
import { outboxDrained } from "./helpers/live-sync";
import { FocusFixture } from "./helpers/focus-fixture";

test("leaf panel shares one complete detail read; estimate save refreshes the view without legacy initial GETs", async ({
  page,
}) => {
  const fx = await FocusFixture.create();
  try {
    const task = await fx.task();
    await outboxDrained(fx.api);
    await fx.login(page);
    const legacy: string[] = [],
      detail: string[] = [];
    page.on("request", r => {
      if (r.method() !== "GET") return;
      const path = new URL(r.url()).pathname;
      if (path === `/api/tasks/${task.id}/detail-view`) detail.push(path);
      if (
        [
          "",
          "/summary",
          "/workload",
          "/time",
          "/progress",
          "/classification",
          "/dependencies",
          "/ordering",
          "/notes",
        ].some(s => path === `/api/tasks/${task.id}${s}`)
      )
        legacy.push(path);
    });
    await page.goto(`/tasks?taskId=${task.id}`);
    const panel = page.locator(".r2-panel");
    await expect(panel.getByRole("textbox", { name: "Görev başlığı" })).toHaveValue(task.title);
    await expect(panel.getByRole("heading", { name: "Tahmini süre", exact: true })).toBeVisible();
    await expect(panel.locator(".r2-facts")).not.toContainText("…");
    expect(detail).toHaveLength(1);
    expect(legacy).toEqual([]);
    const minutes = panel.getByRole("spinbutton", { name: "Tahmini süre (dakika)" });
    await minutes.fill("25");
    const saved = page.waitForResponse(
      r =>
        new URL(r.url()).pathname === `/api/tasks/${task.id}/work-definition` &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    );
    await minutes.press("Tab");
    await saved;
    await expect
      .poll(async () => (await (await fx.api.get(`/api/tasks/${task.id}`)).json()).directEstimatedSeconds)
      .toBe(1500);
    await expect(minutes).toHaveValue("25");
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});

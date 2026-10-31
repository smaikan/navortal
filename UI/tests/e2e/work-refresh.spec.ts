import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
const player = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Çalışma denetimleri", exact: true });
test("task completion during an older work read retains a fresh authoritative reconciliation", async ({ page }) => {
  const fx = await FocusFixture.create();
  let release!: () => void;
  try {
    const task = await fx.task();
    const started = await fx.api.post("/api/work-sessions/start", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { taskId: task.id },
    });
    expect(started.status()).toBe(201);
    const work = await started.json();
    await fx.login(page);
    await page.goto(`/tasks?taskId=${task.id}`);
    await expect(player(page)).toContainText("Çalışılıyor");
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "connected");
    await page.waitForLoadState("networkidle");
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let reads = 0;
    await page.route(`**/api/work-sessions/${work.id}`, async route => {
      if (route.request().method() !== "GET" || ++reads !== 1) return route.continue();
      const response = await route.fetch();
      expect((await response.json()).state).toBe("Running");
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBe(1);
    await page.getByRole("button", { name: "Görevi bitir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Yeniden aç", exact: true })).toBeVisible();
    // Diğer sekmenin desteklenen sinyali eski Running yanıtı bırakılmadan gelir.
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          const observer = new BroadcastChannel("adhd.work.changes.v1"),
            sender = new BroadcastChannel("adhd.work.changes.v1");
          observer.onmessage = () =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                observer.close();
                sender.close();
                resolve();
              }),
            );
          sender.postMessage({ version: 1, kind: "work-changed" });
        }),
    );
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(player(page)).toHaveCount(0);
    expect((await fx.work(work.id)).state).toBe("Finished");
    expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).toBe("Completed");
  } finally {
    release?.();
    await page.unrouteAll({ behavior: "wait" });
    await fx.clean();
    await fx.api.dispose();
  }
});

test("local work transitions cannot be replaced by an older read while the live hub is unavailable", async ({
  page,
}) => {
  const fx = await FocusFixture.create();
  try {
    const task = await fx.task();
    const response = await fx.api.post("/api/work-sessions/start", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { taskId: task.id },
    });
    expect(response.status()).toBe(201);
    const work = await response.json();
    await fx.login(page);
    await page.route("**/api/hubs/planner/negotiate**", route => route.abort("failed"));
    await page.goto("/planning");
    await expect(player(page)).toContainText("Çalışılıyor");
    await page.waitForLoadState("networkidle");
    let syncReads = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/workspace/snapshot") syncReads++;
    });
    const url = `**/api/work-sessions/${work.id}`;
    for (const [label, state] of [
      ["Duraklat", "Duraklatıldı"],
      ["Devam et", "Çalışılıyor"],
      ["Oturumu bitir", "Finished"],
    ]) {
      let release!: () => void,
        reads = 0;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const handler = async (route: import("@playwright/test").Route) => {
        if (route.request().method() !== "GET" || ++reads !== 1) return route.continue();
        const old = await route.fetch();
        await gate;
        await route.fulfill({ response: old }).catch(() => {});
      };
      await page.route(url, handler);
      try {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect.poll(() => reads).toBe(1);
        const syncBefore = syncReads;
        await player(page).getByRole("button", { name: label, exact: true }).click();
        release();
        await expect.poll(() => syncReads).toBeGreaterThan(syncBefore);
        if (state !== "Finished") await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
        if (state === "Finished") {
          expect((await fx.work(work.id)).state).toBe("Finished");
          await expect(player(page).getByRole("button", { name: "Duraklat", exact: true })).toHaveCount(0);
        } else await expect(player(page)).toContainText(state);
      } finally {
        release();
        await page.unroute(url, handler);
      }
    }
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await fx.clean();
    await fx.api.dispose();
  }
});

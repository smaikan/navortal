import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { planMenu } from "./helpers/menu";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture;
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
});
test.afterEach(async () => {
  await fx.clean();
  await fx.api.dispose();
});

test("R4 existing urgent task preserves active focus and keeps its estimate separate from the open end", async ({
  page,
}, info) => {
  const runningTask = await fx.task(),
    target = await fx.task();
  const focus = await fx.start(undefined, runningTask.id);
  await page.goto("/planning");
  await expect(page.getByLabel("Plan günü", { exact: true })).toBeVisible();
  const date = await page.getByLabel("Plan günü", { exact: true }).inputValue();
  const before = await (await fx.api.get("/api/work-sessions/current")).json();
  const count = (await (await fx.api.get("/api/tasks?limit=1")).json()).total;
  const starts: string[] = [];
  page.on("request", r => {
    if (r.method() !== "GET" && /\/api\/(work-sessions|focus-sessions)/.test(r.url()))
      starts.push(new URL(r.url()).pathname);
  });
  await planMenu(page, "Acil işe geç");
  const modal = page.getByRole("dialog", { name: "Acil işe geç", exact: true });
  await modal.getByRole("combobox").fill(target.title);
  await modal.getByRole("option", { name: new RegExp(target.title) }).click();
  await expect(modal).toHaveCount(0);
  const items = (await (await fx.api.get(`/api/daily-plans/${date}/items`)).json()).items;
  const item = items.find((x: { taskId: string }) => x.taskId === target.id);
  expect(item.isUrgent).toBe(true);
  expect(item.startsAt).toBeTruthy();
  expect(item.endsAt).toBeNull();
  const active = (await (await fx.api.get("/api/work-sessions/current")).json()).activeSession;
  expect(active).toMatchObject({
    id: before.activeSession.id,
    state: before.activeSession.state,
    version: before.activeSession.version,
    startedAt: before.activeSession.startedAt,
    endedAt: null,
  });
  expect(Number(active.activeSeconds)).toBeGreaterThanOrEqual(Number(before.activeSession.activeSeconds));
  const after = await fx.current();
  expect(after?.id).toBe(focus.id);
  expect(after?.state).toBe("Working");
  expect(after?.version).toBe(focus.version);
  expect(starts).toEqual([]);
  expect((await (await fx.api.get("/api/tasks?limit=1")).json()).total).toBe(count);
  await page.goto("/tasks");
  const row = page.locator("[data-task-row]").filter({ hasText: target.title });
  await expect(row.getByText("Acil iş", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/r4-urgent-task-${info.project.name}.png` });
});

for (const urgent of [false, true])
  test(`R4 ${urgent ? "urgent" : "normal"} lost receipt retries only its original key and creates one task and plan entry`, async ({
    page,
  }) => {
    await page.goto("/planning");
    await expect(page.getByLabel("Plan günü", { exact: true })).toBeVisible();
    const date = await page.getByLabel("Plan günü", { exact: true }).inputValue();
    const keys: string[] = [],
      bodies: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let received = false;
    await page.route("**/api/daily-plans/*/entries", async route => {
      keys.push(route.request().headers()["idempotency-key"]);
      bodies.push(route.request().postData()!);
      if (keys.length === 1) {
        expect((await route.fetch()).status()).toBe(200);
        if (urgent) {
          received = true;
          await gate;
        }
        await route.abort("failed");
      } else await route.continue();
    });
    if (urgent) await planMenu(page, "Acil işe geç");
    const scope = urgent ? page.getByRole("dialog", { name: "Acil işe geç", exact: true }) : page.getByRole("main");
    await scope.getByRole("combobox").fill("Beklenmeyen tek iş");
    await scope
      .getByRole("option", {
        name: urgent ? "“Beklenmeyen tek iş” görevine başla" : "“Beklenmeyen tek iş” görevini oluştur ve plana ekle",
        exact: true,
      })
      .click();
    if (urgent) {
      await expect.poll(() => received).toBe(true);
      try {
        expect(
          await page.evaluate(() => window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }))),
        ).toBe(false);
      } finally {
        release();
      }
    }
    await expect(scope.getByRole("alert")).toContainText("sonucu alınamadı");
    expect(keys).toHaveLength(1);
    await scope.getByRole("button", { name: "Aynı eklemeyi güvenle yeniden dene", exact: true }).click();
    if (urgent) await expect(scope).toHaveCount(0);
    else
      await expect(
        page.getByRole("checkbox", { name: "Beklenmeyen tek iş plan öğesi bitti", exact: true }),
      ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(new Set(bodies).size).toBe(1);
    expect((await (await fx.api.get(`/api/daily-plans/${date}/items`)).json()).items).toHaveLength(1);
    expect((await (await fx.api.get("/api/tasks?limit=1")).json()).total).toBe(1);
    expect(await fx.current()).toBeNull();
  });

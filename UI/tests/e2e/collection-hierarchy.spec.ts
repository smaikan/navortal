import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import type { Task } from "../../src/features/tasks/model";

for (const [kind, route, singular, removal] of [
  ["projects", "/projects", "Proje", "Projeden kaldır"],
  ["pools", "/pool", "Havuz", "Havuzdan kaldır"],
  ["categories", "/categories", "Kategori", "Kategoriden kaldır"],
] as const) {
  test(`${kind}: hierarchy, leaf counts and removal preserve other classifications across reload`, async ({
    page,
  }, info) => {
    const fx = await FocusFixture.create();
    const errors: string[] = [];
    trackFaults(page, errors);
    try {
      const suffix = randomUUID().slice(-8);
      const resourceResponse = await fx.api.post(`/api/${kind}`, { data: { name: `Ağaç ${suffix}` } });
      expect(resourceResponse.status()).toBe(201);
      const resource = await resourceResponse.json();
      async function task(title: string, parentId?: string): Promise<Task> {
        const parent = parentId ? await (await fx.api.get(`/api/tasks/${parentId}`)).json() : null;
        const response = await fx.api.post(parentId ? `/api/tasks/${parentId}/children` : "/api/tasks", {
          data: { title: `${title} ${suffix}`, ...(parent && { parentVersion: parent.version }) },
        });
        expect(response.status()).toBe(201);
        return response.json();
      }
      const root = await task("Üst görev");
      const branch = await task("Bağlı ana görev", root.id);
      const first = await task("Birinci alt görev", branch.id);
      const second = await task("İkinci alt görev", branch.id);
      const outside = await task("Bölüm dışındaki kardeş", root.id);
      const field = { projects: "projectId", pools: "poolId", categories: "categoryId" }[kind];
      const classification = await (await fx.api.get(`/api/tasks/${branch.id}/classification`)).json();
      expect(
        (
          await fx.api.put(`/api/tasks/${branch.id}/classification`, {
            data: { version: classification.version, ...classification.values, [field]: resource.id },
          })
        ).status(),
      ).toBe(200);
      const firstBefore = await (await fx.api.get(`/api/tasks/${first.id}/classification`)).json();
      await fx.login(page);
      await page.goto(`${route}?id=${resource.id}`);
      const row = (id: string) => page.locator(`[data-task-id="${id}"]`);
      const count = page
        .locator(".resource-metrics > div")
        .filter({ has: page.getByText("Görev", { exact: true }) })
        .locator("dd");
      await expect(row(root.id)).toBeVisible();
      await expect(
        row(root.id).getByText(
          `Üst görev · Bu ${kind === "projects" ? "projede" : kind === "pools" ? "havuzda" : "kategoride"} değil`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(row(root.id).locator(`:scope > ul > li[data-task-id="${branch.id}"]`)).toBeVisible();
      await expect(row(branch.id).locator(`:scope > ul > li[data-task-id="${first.id}"]`)).toBeVisible();
      await expect(row(outside.id)).toHaveCount(0);
      await expect(count).toHaveText("2");
      await expect(page.locator(".resource-task-count")).toHaveText("2");
      const indent = await page.evaluate(
        ({ rootId, childId }) => {
          const at = (id: string) =>
            document.querySelector(`[data-task-id="${id}"] > .resource-task-line > .task-row`)!.getBoundingClientRect()
              .left;
          return at(childId) - at(rootId);
        },
        { rootId: root.id, childId: first.id },
      );
      expect(indent).toBeGreaterThan(20);
      const expand = page.getByRole("button", { name: `${branch.title} alt görevleri`, exact: true });
      await expand.click();
      await expect(row(first.id)).toHaveCount(0);
      await expand.click();
      await expect(row(first.id)).toBeVisible();
      await page.getByRole("checkbox", { name: `${first.title} tamamlandı`, exact: true }).click();
      if (kind !== "categories")
        await expect(page.locator(".resource-progress").filter({ hasText: "1/2" })).toHaveCount(1);
      const beforeRemove = await (await fx.api.get(`/api/tasks/${first.id}/classification`)).json();
      let writes = 0;
      // Kaydedilen kaldırma yanıtı kaybolduğunda yalnız GET ile doğrulanmalı.
      await page.route(`**/api/tasks/${first.id}/classification`, async route => {
        if (route.request().method() !== "PUT") return route.continue();
        writes++;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      });
      await page
        .getByRole("button", {
          name: `${first.title} ${singular.toLocaleLowerCase("tr-TR")} görevi menüsü`,
          exact: true,
        })
        .click();
      await page.getByRole("menuitem", { name: removal, exact: true }).click();
      await expect(row(first.id)).toHaveCount(0);
      await expect(row(second.id)).toBeVisible();
      // Biten son çocuk çıkarılınca odak kalan kardeşe veya üst göreve dönebilir.
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
        .toMatch(new RegExp(`^(?:${second.title}|${branch.title}) ayrıntısını aç$`));
      await expect(count).toHaveText("1");
      expect(writes).toBe(1);
      const after = await (await fx.api.get(`/api/tasks/${first.id}/classification`)).json();
      expect(after.values).toEqual(firstBefore.values);
      expect(BigInt(after.version)).toBeGreaterThan(BigInt(beforeRemove.version));
      await page.reload();
      await expect(row(first.id)).toHaveCount(0);
      await expect(row(second.id)).toBeVisible();
      await expect(count).toHaveText("1");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({
        path: `/opt/navortal/UI/.local/collection-hierarchy-${kind}-${info.project.name}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: `${branch.title} ${singular.toLocaleLowerCase("tr-TR")} görevi menüsü`,
          exact: true,
        })
        .click();
      await page.getByRole("menuitem", { name: removal, exact: true }).click();
      await expect(row(root.id)).toHaveCount(0);
      await expect(row(second.id)).toHaveCount(0);
      await expect(count).toHaveText("0");
      expect((await fx.api.get(`/api/tasks/${second.id}`)).status()).toBe(200);
      expect(errors).toEqual([]);
    } finally {
      await fx.api.dispose();
    }
  });
}

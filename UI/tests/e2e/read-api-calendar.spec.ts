import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { outboxDrained } from "./helpers/live-sync";
import { FocusFixture } from "./helpers/focus-fixture";

test("month reads previews only; day and week expose explicit continuation past 300 items", async ({ page }) => {
  const fx = await FocusFixture.create();
  try {
    const root = await fx.task();
    const date = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
    const r = await fx.api.post(`/api/daily-plans/${date}/items`, { data: { taskId: root.id } });
    expect(r.status()).toBe(201);
    const item = await r.json();
    const owner = (await (await fx.api.get("/api/auth/me")).json()).id;
    const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
    expect(run).toMatch(/^[a-f0-9]{32}$/);
    expect(process.env.PGDATABASE).toBe(`adhd_ui_test_${run}`);
    expect(process.env.PGHOST).toBe("127.0.0.1");
    execFileSync(
      process.env.ADHD_UI_TEST_PSQL!,
      [
        "--no-psqlrc",
        "--set=ON_ERROR_STOP=1",
        `--set=owner=${owner}`,
        `--set=root=${root.id}`,
        `--set=item=${item.id}`,
      ],
      {
        input: `WITH generated AS (SELECT n,gen_random_uuid() AS id FROM generate_series(1,300) n), inserted AS (
        INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks,to_jsonb(t)||jsonb_build_object('Id',g.id,'ParentTaskId',t."Id",'Title','Takvim öğesi '||lpad(g.n::text,4,'0')))).*
        FROM tasks t CROSS JOIN generated g WHERE t."UserId"=:'owner'::uuid AND t."Id"=:'root'::uuid RETURNING "Id")
        INSERT INTO day_items SELECT (jsonb_populate_record(NULL::day_items,to_jsonb(d)||jsonb_build_object('Id',gen_random_uuid(),'TaskId',g.id,'SortOrder',(g.n+1)*1024))).*
        FROM day_items d CROSS JOIN generated g JOIN inserted i ON i."Id"=g.id WHERE d."UserId"=:'owner'::uuid AND d."Id"=:'item'::uuid;`,
        stdio: "pipe",
        windowsHide: true,
      },
    );
    await outboxDrained(fx.api);
    await fx.login(page);
    let itemReads = 0;
    page.on("request", r => {
      if (r.method() === "GET" && new URL(r.url()).pathname === "/api/calendar/items") itemReads++;
    });
    await page.goto(`/calendar?date=${date}`);
    const day = page.getByRole("button", { name: /1 ana görev, bugün$/ });
    await expect(day).toContainText(root.title);
    expect(itemReads).toBe(0);
    await day.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("301 plan öğesi");
    await expect(dialog.getByText("Takvim öğesi 0300", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Günün kalan öğelerini yükle" }).click();
    await expect(dialog.getByText("Takvim öğesi 0300", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /kapat/i }).click();
    await page.getByRole("button", { name: "Hafta", exact: true }).click();
    await page.getByRole("button", { name: "Kalan plan öğelerini yükle" }).click();
    await expect(page.getByText("Takvim öğesi 0300", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kalan plan öğelerini yükle" })).toHaveCount(0);
    await page.goto(`/planning?date=${date}`);
    const rows = page.locator(".r2-plan-list > li");
    await expect(rows).toHaveCount(100);
    await expect(page.getByText("Takvim öğesi 0300", { exact: true })).toHaveCount(0);
    for (const count of [200, 300, 301]) {
      await page.getByRole("button", { name: "Kalan saatsiz öğeleri yükle" }).click();
      await expect(rows).toHaveCount(count);
    }
    await expect(page.getByRole("button", { name: "Kalan saatsiz öğeleri yükle" })).toHaveCount(0);
    const last = page.getByRole("checkbox", { name: "Takvim öğesi 0300 plan öğesi bitti", exact: true });
    await expect(last).toBeVisible();
    const reread = page.waitForResponse(
      r =>
        new URL(r.url()).pathname.endsWith("/overview") &&
        new URL(r.url()).searchParams.get("ItemOffset") === "300" &&
        r.status() === 200,
    );
    await last.check();
    await expect
      .poll(async () => {
        const page = await (await fx.api.get(`/api/daily-plans/${date}/items?offset=300&limit=100`)).json();
        return !!page.items[0]?.completedAt;
      })
      .toBe(true);
    await (await reread).finished();
    await expect(rows).toHaveCount(301);
    await expect(last).toBeChecked();
    const leaf = (await (await fx.api.get("/api/tasks?search=Takvim%20öğesi%200300&limit=1")).json()).items[0];
    expect(leaf.state).toBe("Pending");
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});

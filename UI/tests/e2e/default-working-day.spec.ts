import { expect, test } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";

let fixture: FocusFixture;
test.beforeAll(async () => {
  fixture = await FocusFixture.create();
});
test.afterAll(async () => {
  await fixture?.api.dispose();
});

test("without configured hours the day bar uses time until local midnight and explicit closures still win", async ({
  page,
}) => {
  const errors: string[] = [];
  trackFaults(page, errors);
  await fixture.login(page);
  const date = Temporal.Now.plainDateISO("Europe/Istanbul");
  const path = `/api/daily-plans/${date}/glance`;
  const hours = await (await fixture.api.get(`/api/preferences/working-hours?date=${date}`)).json();
  expect(hours.localIntervals).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  const glance = await (await fixture.api.get(path)).json();
  const midnight = date.add({ days: 1 }).toZonedDateTime("Europe/Istanbul").epochMilliseconds;
  const remaining = (midnight - Date.parse(glance.serverNow)) / 1000;
  expect(Number(glance.workingRemainingSeconds)).toBeGreaterThan(0);
  expect(Math.abs(Number(glance.workingRemainingSeconds) - remaining)).toBeLessThan(1);
  const task = await fixture.task();
  expect((await fixture.api.post(`/api/daily-plans/${date}/items`, { data: { taskId: task.id } })).status()).toBe(201);
  await page.goto(`/planning?date=${date}`);
  const time = page.getByRole("region", { name: "Günün zamanı", exact: true });
  const left = time.getByText("Günün kalanı", { exact: true }).locator("..").locator("strong");
  await expect(left).toBeVisible();
  await expect(left).not.toHaveText("0 dk");
  let prefs = await (await fixture.api.get("/api/preferences")).json();
  expect(prefs.version).toBe(0);
  expect(prefs.values.weekly).toEqual([]);
  await page.goto("/settings?section=hours");
  await expect(page.getByRole("heading", { name: "Haftalık çalışma saatleri", exact: true })).toBeVisible();
  await expect(page.getByText("Tüm gün (varsayılan)", { exact: true })).toHaveCount(7);
  const response = await fixture.api.put("/api/preferences", {
    data: {
      version: prefs.version,
      values: { ...prefs.values, exceptions: [{ date: date.toString(), intervals: [] }] },
    },
  });
  expect(response.status()).toBe(200);
  await page.goto(`/planning?date=${date}`);
  await expect(left).toHaveText("0 dk");
  prefs = await (await fixture.api.get("/api/preferences")).json();
  expect(
    (
      await fixture.api.put("/api/preferences", {
        data: { version: prefs.version, values: { ...prefs.values, exceptions: [] } },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(left).toBeVisible();
  await expect(left).not.toHaveText("0 dk");
  expect(errors).toEqual([]);
});

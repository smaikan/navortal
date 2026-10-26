import { expect, test, type Page } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import type { Task } from "../../src/features/tasks/model";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const day = (plus = 1) => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: plus }).toString();
const closeButton = (page: Page) => page.getByRole("button", { name: "Görev ayrıntısı panelini kapat", exact: true });
const from = (page: Page) => page.getByLabel("başlangıç tarihi", { exact: true });
const to = (page: Page) => page.getByLabel("bitiş tarihi", { exact: true });
const saved = async (id: string): Promise<Task> => (await fx.api.get("/api/tasks/" + id)).json();
const open = async (page: Page, id: string) => {
  await page.goto("/tasks?taskId=" + id);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
};
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
  const errors: string[] = [];
  faults.set(page, errors);
  trackFaults(page, errors);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("task dates: closing saves a single day, survives resize, preserves stored deadline and never waits for follow-up reads", async ({
  page,
}, info) => {
  const task = await fx.task();
  const seeded = await fx.api.put("/api/tasks/" + task.id, {
    data: {
      version: task.version,
      title: task.title,
      description: null,
      priority: task.priority,
      canSplit: true,
      deadlineAt: "2026-10-25T01:30:00.1234567Z",
    },
  });
  expect(seeded.status()).toBe(200);
  const original = await saved(task.id);
  await open(page, task.id);
  await expect(page.getByLabel("Son teslim", { exact: true })).toHaveCount(0);
  let writes = 0,
    hold = false,
    release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/tasks/" + task.id + "**", async route => {
    if (route.request().method() === "PUT" && new URL(route.request().url()).pathname.endsWith("/planned-range")) {
      writes++;
      const response = await route.fetch();
      hold = true;
      await route.fulfill({ response });
      return;
    }
    if (hold && route.request().method() === "GET") await gate;
    await route.continue();
  });
  try {
    await from(page).fill(day());
    expect(writes).toBe(0);
    expect((await saved(task.id)).plannedFrom).toBeNull();
    if (info.project.name === "chromium") {
      await page.setViewportSize({ width: 1000, height: 900 });
      await expect(from(page)).toHaveValue(day());
    }
    await closeButton(page).click();
    await expect(closeButton(page)).toHaveCount(0);
    expect(await saved(task.id)).toMatchObject({
      plannedFrom: day(),
      plannedTo: day(),
      deadlineAt: original.deadlineAt,
    });
    expect(writes).toBe(1);
  } finally {
    release();
  }
  await page.unrouteAll({ behavior: "wait" });
  await open(page, task.id);
  await expect(from(page)).toHaveValue(day());
  await expect(to(page)).toHaveValue(day());
});

test("task dates: invalid ranges keep the panel open; Escape and outside close save corrected dates", async ({
  page,
}) => {
  const task = await fx.task();
  await open(page, task.id);
  await from(page).fill(day(3));
  await to(page).fill(day(1));
  await page.keyboard.press("Escape");
  await expect(closeButton(page)).toBeVisible();
  await expect(page.locator(".r2-range-fields").getByRole("alert")).toContainText("başlangıçtan önce");
  expect((await saved(task.id)).plannedFrom).toBeNull();
  await to(page).fill(day(4));
  await page.keyboard.press("Escape");
  await expect(closeButton(page)).toHaveCount(0);
  expect(await saved(task.id)).toMatchObject({ plannedFrom: day(3), plannedTo: day(4) });
  await open(page, task.id);
  await page.getByRole("button", { name: "tarih aralığını temizle", exact: true }).click();
  await to(page).fill(day(5));
  if (await page.locator("aside[data-workspace-surface]").count()) await page.mouse.click(1, 1);
  else await page.keyboard.press("Escape");
  await expect(closeButton(page)).toHaveCount(0);
  expect(await saved(task.id)).toMatchObject({ plannedFrom: day(5), plannedTo: day(5) });
});

test("task dates: Back saves the draft before leaving the panel", async ({ page }) => {
  const task = await fx.task();
  await page.goto("/tasks");
  await page.getByRole("button", { name: task.title + " ayrıntısını aç", exact: true }).click();
  await from(page).fill(day());
  await page.goBack();
  await expect(closeButton(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/taskId=/);
  expect(await saved(task.id)).toMatchObject({ plannedFrom: day(), plannedTo: day() });
});

test("task dates: a lost save response keeps the draft and never repeats the write; a GET confirms the saved date", async ({
  page,
}) => {
  const task = await fx.task();
  await open(page, task.id);
  let writes = 0;
  await page.route("**/api/tasks/" + task.id + "/planned-range", async route => {
    writes++;
    await route.fetch();
    await route.abort("failed");
  });
  await from(page).fill(day());
  await closeButton(page).click();
  await expect(page.locator(".r2-range-fields").getByRole("alert")).toContainText("sonucu alınamadı");
  await expect(from(page)).toHaveValue(day());
  expect(writes).toBe(1);
  await closeButton(page).click();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Güncel tarihleri kontrol et", exact: true }).click();
  await expect(page.locator(".r2-range-fields").getByRole("alert")).toHaveCount(0);
  await expect(to(page)).toHaveValue(day());
  await closeButton(page).click();
  await expect(closeButton(page)).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await saved(task.id)).plannedFrom).toBe(day());
});

test("task dates: concurrent remote dates are kept until the user explicitly keeps the local draft", async ({
  page,
}) => {
  const task = await fx.task();
  await open(page, task.id);
  await from(page).fill(day());
  const current = await saved(task.id);
  expect(
    (
      await fx.api.put("/api/tasks/" + task.id + "/planned-range", {
        data: {
          version: current.version,
          plannedFrom: day(4),
          plannedTo: day(4),
        },
      })
    ).status(),
  ).toBe(200);
  let writes = 0;
  page.on("request", request => {
    if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/planned-range")) writes++;
  });
  await closeButton(page).click();
  await expect(page.locator(".r2-range-fields").getByRole("alert")).toContainText("tarihleri değişmiş");
  expect(writes).toBe(0);
  expect((await saved(task.id)).plannedFrom).toBe(day(4));
  await expect(from(page)).toHaveValue(day());
  await page.getByRole("button", { name: "Tarihlerimi koru", exact: true }).click();
  await closeButton(page).click();
  await expect(closeButton(page)).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await saved(task.id)).plannedFrom).toBe(day());
});

test("task dates: child date drafts save and clear on close while the derived parent remains read-only", async ({
  page,
}) => {
  const parent = await fx.task();
  const response = await fx.api.post("/api/tasks/" + parent.id + "/children", {
    data: {
      parentVersion: parent.version,
      title: "Tarihli alt görev",
      parentWorkDisposition: "PreserveDirect",
    },
  });
  expect(response.status()).toBe(201);
  const child = (await response.json()) as Task;
  await open(page, parent.id);
  await page.getByLabel(child.title + " başlangıç tarihi", { exact: true }).fill(day());
  await page.getByLabel(child.title + " bitiş tarihi", { exact: true }).fill(day(3));
  await closeButton(page).click();
  await expect(closeButton(page)).toHaveCount(0);
  expect(await saved(child.id)).toMatchObject({ plannedFrom: day(), plannedTo: day(3) });
  expect((await saved(parent.id)).plannedFrom).toBeNull();
  await open(page, parent.id);
  await expect(page.getByText("alt görevlerden", { exact: true })).toBeVisible();
  await expect(from(page)).toHaveCount(0);
  await page.getByRole("button", { name: child.title + " tarih aralığını temizle", exact: true }).click();
  await closeButton(page).click();
  await expect(closeButton(page)).toHaveCount(0);
  expect(await saved(child.id)).toMatchObject({ plannedFrom: null, plannedTo: null });
});

import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Locator } from "@playwright/test";
import type { Reminder } from "../../src/features/reminders/model";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { seedFailedJob } from "./helpers/owned-jobs";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture, foreign: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const base = "/reminders";
const f = (p: Page, title = "Hatırlatma ekle") => p.getByRole("dialog", { name: title, exact: true });
const future = (days = 1) => new Date(Date.now() + days * 86400000).toISOString();
const local = (at: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(at))
    .replace(" ", "T")
    .replace(/:00$/, "");
async function fillDue(form: Locator, value: string) {
  await form.getByLabel("Tarih", { exact: true }).fill(value.slice(0, 10));
  await form.getByLabel("Saat", { exact: true }).selectOption(value.slice(11, 13));
  await form.getByLabel("Dakika", { exact: true }).selectOption(value.slice(14, 16));
}
async function list() {
  const r = await fx.api.get("/api/notifications/reminders?limit=100");
  expect(r.status()).toBe(200);
  return (await r.json()) as Reminder[];
}
async function create(taskId?: string, days = 1) {
  const r = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: `Hatırlat ${randomUUID()}`, dueAt: future(days), taskId },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as Reminder;
}
async function openEdit(page: Page, r: Reminder, cancel = false) {
  await page.goto(base);
  const row = page.locator(`[data-reminder-id="${r.id}"]`);
  await row.getByRole("button", { name: `${r.title} hatırlatma işlemleri`, exact: true }).click();
  await page.getByRole("menuitem", { name: cancel ? "İptal et" : "Düzenle", exact: true }).click();
  return f(page, cancel ? "Hatırlatmayı iptal et" : "Hatırlatmayı düzenle");
}
async function close(page: Page, name = "Hatırlatma ekle") {
  await f(page, name)
    .getByRole("button", { name: `${name} panelini kapat`, exact: true })
    .click();
  await expect(f(page, name)).toBeHidden();
}
test.beforeAll(async () => {
  fx = await FocusFixture.create();
  foreign = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
  await foreign?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.login(page);
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});

test("create unbound reminder, edit title without losing instant, cancel invalidates its source", async ({
  page,
}, info) => {
  await page.goto("/reminders/preferences");
  await page
    .getByRole("navigation", { name: "Hatırlatma bölümleri" })
    .getByRole("link", { name: "Hatırlatmalar", exact: true })
    .click();
  await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
  const form = f(page),
    title = `Benim hatırlatmam ${randomUUID()}`;
  await form.getByLabel("Hatırlatma başlığı", { exact: true }).fill(title);
  await fillDue(form, local(future()));
  await expect(form.getByRole("combobox", { name: "Görev bağla", exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(form).toBeHidden();
  const r = (await list()).find(x => x.title === title)!;
  expect(r.taskId).toBeNull();
  const edit = await openEdit(page, r);
  await edit.getByLabel("Hatırlatma başlığı", { exact: true }).fill(`${title} güncel`);
  await edit.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(edit).toBeHidden();

  const updated = (await list()).find(x => x.id === r.id)!;
  expect(updated.dueAt).toBe(r.dueAt);
  expect(updated.taskId).toBeNull();
  const cancel = await openEdit(page, updated, true);
  await cancel.getByRole("button", { name: "Hatırlatmayı iptal et", exact: true }).click();
  await expect(cancel).toBeHidden();
  expect((await list()).find(x => x.id === r.id)!.canceled).toBe(true);
  const notifications = (await (await fx.api.get("/api/notifications?limit=100")).json()).items as {
    sourceId: string;
    state: string;
  }[];
  expect(notifications.filter(n => n.sourceId === r.id)).toEqual([]);
  await auditTask(page, "cancelled", "reminders");
  await page.screenshot({ path: `${EVIDENCE}/reminders-list-${info.project.name}.png` });
});

test("reminder row menu escapes clipping, fits the viewport and returns keyboard focus", async ({ page }, info) => {
  const reminder = await create();
  await page.goto(base);
  const row = page.locator(`[data-reminder-id="${reminder.id}"]`);
  const trigger = row.getByRole("button", { name: `${reminder.title} hatırlatma işlemleri`, exact: true });
  const menu = page.getByRole("menu", { name: `${reminder.title} hatırlatma işlemleri`, exact: true });
  // Kırpılmış satır bırakarak menünün atasına sıkışmadığını kontrol ediyoruz.
  await row.evaluate(el => (el.style.overflow = "hidden"));
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await trigger.click();
    await expect(menu.getByRole("menuitem", { name: "Düzenle", exact: true })).toBeFocused();
    expect(await menu.evaluate(el => el.matches(":popover-open"))).toBe(true);
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "İptal et", exact: true })).toBeFocused();
    await menu.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
          .map(a => a.finished.catch(() => {})),
      );
    });
    const box = (await menu.boundingBox())!,
      view = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    for (const item of await menu.getByRole("menuitem").all()) {
      expect(
        await item.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
      ).toBe(true);
    }
    expect(await menu.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE}/reminder-menu-${theme}-${info.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  await expect(f(page, "Hatırlatmayı düzenle")).toBeVisible();
  await close(page, "Hatırlatmayı düzenle");
  await trigger.click();
  await page.getByRole("heading", { name: "Hatırlatmalar", exact: true }).click();
  await expect(menu).toBeHidden();
  await auditTask(page, "menu", "reminders");
});

test("lost create and update responses replay the exact key/body once without duplicates", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
  const form = f(page),
    title = `Tek kayıt ${randomUUID()}`;
  await form.getByLabel("Hatırlatma başlığı", { exact: true }).fill(title);
  await fillDue(form, local(future()));
  const keys: string[] = [],
    bodies: string[] = [];
  let lost = false;
  await page.route("**/api/notifications/reminders", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("sonucu alınamadı");
  await form.getByRole("button", { name: "Aynı isteği ve anahtarı yeniden dene", exact: true }).click();
  await expect(form).toBeHidden();
  expect(new Set(keys).size).toBe(1);
  expect(new Set(bodies).size).toBe(1);
  expect(keys).toHaveLength(2);
  await page.unrouteAll({ behavior: "wait" });
  const matching = (await list()).filter(x => x.title === title);
  expect(matching).toHaveLength(1);
  const r = matching[0],
    edit = await openEdit(page, r);
  await edit.getByLabel("Hatırlatma başlığı", { exact: true }).fill(`${title} değişti`);
  let count = 0;
  await page.route(`**/api/notifications/reminders/${r.id}`, async route => {
    count++;
    if (count === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await edit.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText("sonucu alınamadı");
  await edit.getByRole("button", { name: "Aynı isteği ve anahtarı yeniden dene", exact: true }).click();
  await expect(edit).toBeHidden();
  expect(count).toBe(2);
  expect((await list()).find(x => x.id === r.id)!.version).toBe(Number(r.version) + 1);
});

test("real 409 keeps a title draft and rebases the remote-only time before explicit save", async ({ page }) => {
  const r = await create(),
    edit = await openEdit(page, r);
  await edit.getByLabel("Hatırlatma başlığı", { exact: true }).fill("Taslağım");
  const dueAt = future(2);
  expect(
    (
      await fx.api.put(`/api/notifications/reminders/${r.id}`, {
        headers: { "Idempotency-Key": randomUUID() },
        data: { title: r.title, dueAt, taskId: r.taskId, version: r.version },
      })
    ).status(),
  ).toBe(200);
  await edit.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText("Kayıt değişmiş");
  await expect(edit.getByLabel("Hatırlatma başlığı", { exact: true })).toHaveValue("Taslağım");
  await edit.getByRole("button", { name: "Güncel hatırlatmaları kontrol et", exact: true }).click();
  await edit.getByRole("button", { name: "Taslağımı güncel kayıtla birleştir", exact: true }).click();
  await edit.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(edit).toBeHidden();
  const after = (await list()).find(x => x.id === r.id)!;
  expect(after.title).toBe("Taslağım");
  expect(Date.parse(after.dueAt)).toBe(Date.parse(dueAt));
});

test("lost cancel uses GET to confirm cancellation and never sends a second command", async ({ page }) => {
  const r = await create(),
    cancel = await openEdit(page, r, true);
  let posts = 0;
  await page.route(`**/api/notifications/reminders/${r.id}/cancel`, async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await cancel.getByRole("button", { name: "Hatırlatmayı iptal et", exact: true }).click();
  await expect(cancel.getByRole("alert")).toContainText("sonucu alınamadı");
  await cancel.getByRole("button", { name: "Güncel hatırlatmaları kontrol et", exact: true }).click();
  await expect(cancel.getByRole("status")).toHaveText("Hatırlatma iptal edildi.");
  expect(posts).toBe(1);
});

test("400 future-time validation, offline writes and foreign mutation preserve the real data boundary", async ({
  page,
  context,
}) => {
  await page.goto(base);
  await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
  const form = f(page);
  await form.getByLabel("Hatırlatma başlığı", { exact: true }).fill("Geçerli taslak");
  await fillDue(form, "2020-01-01T12:00");
  await form.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("gelecekte");
  await expect(form.getByLabel("Hatırlatma başlığı", { exact: true })).toHaveValue("Geçerli taslak");
  await fillDue(form, local(future()));
  let writes = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/notifications/reminders") writes++;
  });
  await context.setOffline(true);
  await form.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Bağlantı yok");
  await context.setOffline(false);
  page.once("dialog", d => d.accept());
  await close(page);
  expect(writes).toBe(0);
  const own = await create();
  expect(
    (
      await foreign.api.post(`/api/notifications/reminders/${own.id}/cancel`, { data: { version: own.version } })
    ).status(),
  ).toBe(404);
  expect((await list()).find(x => x.id === own.id)!.canceled).toBe(false);
});

test("keyboard/pending guards and read acknowledgement work while the follow-up GET is held", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  const launcher = page.getByRole("button", { name: "Hatırlatma ekle", exact: true });
  await expect(launcher).toBeEnabled();
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  const form = f(page);
  await form.getByLabel("Hatırlatma başlığı", { exact: true }).fill(`Klavye ${randomUUID()}`);
  await fillDue(form, local(future()));
  page.once("dialog", d => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(form).toBeVisible();
  await auditTask(page, "editor", "reminders");
  await page.screenshot({ path: `${EVIDENCE}/reminders-editor-${info.project.name}.png` });
  let release!: () => void, releaseRead!: () => void;
  const gate = new Promise<void>(r => {
      release = r;
    }),
    readGate = new Promise<void>(r => {
      releaseRead = r;
    });
  let sent = false,
    hold = false;
  await page.route("**/api/notifications/reminders", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    sent = true;
    await gate;
    hold = true;
    await route.fulfill({ response });
  });
  await page.route("**/api/notifications/reminders?**", async route => {
    if (hold) await readGate;
    await route.continue();
  });
  try {
    await form.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
    await expect.poll(() => sent).toBe(true);
    await page.keyboard.press("Escape");
    await expect(form).toBeVisible();
    expect(
      await page.evaluate(() => window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }))),
    ).toBe(false);
    release();
    await expect(form).toBeHidden();
    await expect(launcher).toBeFocused();
  } finally {
    release();
    releaseRead();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(launcher).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("bounded reminder arrays traverse a second page without inventing a total", async ({ page }) => {
  for (let i = 0; i < 26; i++) await create(undefined, 30);
  await page.goto(base);
  await expect(page.getByRole("list", { name: "Özel hatırlatmalar", exact: true }).locator(":scope > li")).toHaveCount(
    25,
  );
  await page.getByRole("button", { name: "Daha fazla hatırlatma göster", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Hatırlatma sayfaları", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Özel hatırlatmalar", exact: true }).locator(":scope > li"),
  ).not.toHaveCount(25);
  await expect(
    page.getByRole("list", { name: "Özel hatırlatmalar", exact: true }).locator(":scope > li"),
  ).not.toHaveCount(0);
});

test("only owner Failed jobs retry; a lost ACK requires GET and payload never renders", async ({ page }) => {
  const me = await (await fx.api.get("/api/auth/me")).json(),
    jobId = seedFailedJob(me.id);
  let jobsRead = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/jobs/outbox") jobsRead++;
  });
  await page.goto(base);
  await expect(
    page
      .getByRole("navigation", { name: "Hatırlatma bölümleri" })
      .getByRole("link", { name: "Hatırlatmalar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(jobsRead).toBe(0);
  await page.goto("/internal-checks/jobs");
  const row = page.locator(`[data-job-id="${jobId}"]`);
  await expect(row.getByRole("button", { name: "İşi yeniden dene", exact: true })).toBeVisible();
  await expect(page.getByText("ui26-payload-must-not-render")).toHaveCount(0);
  const before = (await (await fx.api.get("/api/jobs/outbox?state=Failed&limit=100")).json()).items.find(
    (j: { id: string }) => j.id === jobId,
  );
  expect(
    (await foreign.api.post(`/api/jobs/outbox/${jobId}/retry`, { data: { version: before.version } })).status(),
  ).toBe(404);
  let posts = 0;
  await page.route(`**/api/jobs/outbox/${jobId}/retry`, async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await row.getByRole("button", { name: "İşi yeniden dene", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("sonucu alınamadı");
  await page.getByRole("button", { name: "Güncel işleri kontrol et", exact: true }).click();
  await expect(
    page.getByText("Güncel işler okundu. İşlem kendiliğinden tekrarlanmadı.", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await page.getByLabel("İş durumu", { exact: true }).selectOption("Pending");
  await expect(
    page
      .getByRole("list", { name: "Arka plan işleri", exact: true })
      .getByRole("button", { name: "İşi yeniden dene", exact: true }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  const second = seedFailedJob(me.id);
  await page.getByLabel("İş durumu", { exact: true }).selectOption("Failed");
  await page.getByRole("button", { name: "Güncel işleri kontrol et", exact: true }).click();
  await page
    .locator(`[data-job-id="${second}"]`)
    .getByRole("button", { name: "İşi yeniden dene", exact: true })
    .click();
  await expect(
    page.getByText("İş yeniden denemeye alındı. Bu, bildirimin cihazına teslim edildiği anlamına gelmez.", {
      exact: true,
    }),
  ).toBeVisible();
});

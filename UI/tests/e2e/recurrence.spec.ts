import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import type { Template, Effect, Occurrence, Rule } from "../../src/features/recurrence/model";
let fx: FocusFixture, foreign: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const day = (n = 10) => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: n }).toString();
const plus = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();
const radioNames: Record<string, string> = {
  Daily: "Her gün",
  Weekly: "Belirli günler",
  Monthly: "Aylık",
  IntervalDays: "Gün aralığı",
};
const modal = (p: Page, name: string) => p.getByRole("dialog", { name, exact: true });
const rule = (r: Partial<Rule> = {}): Rule => ({
  startDate: day(),
  timeZoneId: "Europe/Istanbul",
  frequency: "Daily",
  interval: 1,
  weekDays: [],
  monthDay: null,
  monthEnd: null,
  untilDate: null,
  dueTime: null,
  startTime: null,
  autoAddToPlan: false,
  gap: "Reject",
  overlap: "Reject",
  ...r,
});
async function seed(
  r: Partial<Rule> = {},
  title = `Düzenli iş ${randomUUID().slice(-8)}`,
  owner = fx,
): Promise<Template> {
  const response = await owner.api.post("/api/recurrence-templates", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      rule: rule(r),
      task: {
        title,
        description: null,
        estimatedSeconds: 600,
        priority: "Normal",
        canSplit: true,
        poolId: null,
        energyDemand: null,
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).template;
}
async function get(id: string): Promise<Template> {
  return (await fx.api.get(`/api/recurrence-templates/${id}`)).json();
}
async function occurrences(t: Template, from = t.rule.startDate, to = from): Promise<Occurrence[]> {
  const r = await fx.api.get(`/api/recurrence-templates/${t.id}/occurrences?fromDate=${from}&toDate=${to}&limit=100`);
  expect(r.status()).toBe(200);
  return (await r.json()).items;
}
async function materialize(t: Template, from = t.rule.startDate, to = from): Promise<Effect> {
  const r = await fx.api.post(`/api/recurrence-templates/${t.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: (await get(t.id)).version, fromDate: from, toDate: to },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
async function open(p: Page, t?: Template) {
  await p.goto(`/recurrences${t ? `?templateId=${t.id}` : ""}`);
  await expect(p.getByRole("heading", { name: "Rutin", exact: true })).toBeVisible();
  if (t) await expect(p.getByRole("region", { name: "Seçili seri", exact: true })).toContainText(t.task.title);
}
const detail = (p: Page) => p.getByRole("region", { name: "Seçili seri", exact: true });
async function more(p: Page, item: string) {
  await detail(p).getByRole("button", { name: "Rutin için diğer işlemler", exact: true }).click();
  await p.getByRole("menuitem", { name: item, exact: true }).click();
}
/** Okuma aralığı artık ayrıntıda yok; geçmiş liste bugüne kadar olanı gösterir. Geriye dönük uyumluluk için bölgeyi döndürür. */
async function range(p: Page, _from?: string, _to?: string) {
  return detail(p);
}
async function generate(p: Page, from: string, to = from) {
  await more(p, "Önümüzdeki 14 gün için görev oluştur");
  const f = modal(p, "Seçili günler için görev oluştur");
  await f.getByLabel("Görev üretimi başlangıcı", { exact: true }).fill(from);
  await f.getByLabel("Görev üretimi bitişi", { exact: true }).fill(to);
  await f.getByRole("button", { name: "Bu aralık için görev oluştur", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  await close(f);
  return detail(p);
}
async function close(f: Locator) {
  await f.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(f).toBeHidden();
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
  await fx.clean();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("empty recurrences guide starts editable drafts and only saving creates a series", async ({ page }, info) => {
  await open(page);
  const empty = page.locator(".recurrence-empty");
  await expect(empty.getByRole("heading", { name: "Rutinine bir yer aç." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rutin oluştur", exact: true })).toHaveCount(1);
  let posts = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/recurrence-templates" && r.method() === "POST") posts++;
  });
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await auditTask(page, `empty-${theme}`, "recurrence", theme);
    await page.screenshot({ path: `${EVIDENCE}/recurrence-empty-${theme}-${info.project.name}.png`, fullPage: true });
  }
  if (info.project.name === "chromium") {
    const viewport = page.viewportSize()!;
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${EVIDENCE}/recurrence-empty-${width}.png`, fullPage: true });
    }
    await page.setViewportSize(viewport);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const f = modal(page, "Rutin oluştur");
  await expect(f.getByLabel("Rutin adı", { exact: true })).toHaveValue("");
  await f.getByRole("button", { name: "Vazgeç", exact: true }).click();
  for (const [title, frequency] of [
    ["Kitap oku", "Daily"],
    ["Haftayı gözden geçir", "Weekly"],
    ["Ayın planını yap", "Monthly"],
  ]) {
    const starter = empty.getByRole("button", { name: new RegExp(title) });
    await starter.click();
    await expect(f.getByLabel("Rutin adı", { exact: true })).toHaveValue(title);
    await expect(f.getByRole("radio", { name: radioNames[frequency], exact: true })).toBeChecked();
    if (frequency === "Weekly") await expect(f.getByRole("checkbox", { name: "Pazartesi", exact: true })).toBeChecked();
    if (frequency === "Monthly") await expect(f.getByLabel("Ayın kaçıncı günü", { exact: true })).toHaveValue("1");
    await expect(f.getByLabel("Tahmini süre (dk, isteğe bağlı)", { exact: true })).toHaveValue("");
    await expect(f.getByLabel("Başlangıç saati (isteğe bağlı)", { exact: true })).toHaveValue("");
    await expect(f.getByRole("checkbox", { name: "Gün planlarına otomatik ekle", exact: true })).not.toBeChecked();
    await f.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(f).toBeHidden();
    await expect(starter).toBeFocused();
  }
  expect(posts).toBe(0);
  expect((await (await fx.api.get("/api/recurrence-templates?limit=1")).json()).total).toBe(0);
  const before = (await (await fx.api.get("/api/tasks?limit=1")).json()).total;
  await empty.getByRole("button", { name: /Haftayı gözden geçir/ }).click();
  await f.getByLabel("Rutin adı", { exact: true }).fill("Haftalık gözden geçirme");
  await f.getByLabel("Başlangıç günü", { exact: true }).fill(day());
  const response = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/recurrence-templates" && r.request().method() === "POST",
  );
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const result = (await (await response).json()) as Effect;
  expect(result.template.rule.frequency).toBe("Weekly");
  expect(result.template.rule.weekDays).toEqual([1]);
  await expect(f).toBeHidden();
  await expect(empty).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Haftalık gözden geçirme serisini aç", exact: true })).toBeVisible();
  expect(posts).toBe(1);
  expect((await (await fx.api.get("/api/tasks?limit=1")).json()).total).toBe(before);
});

test("weekday chips: empty selection is reported at the field and chosen days create occurrences only on those days", async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const f = modal(page, "Rutin oluştur");
  await f.getByLabel("Rutin adı", { exact: true }).fill(`Gün çipleri ${randomUUID()}`);
  const start = day(1);
  await f.getByLabel("Başlangıç günü", { exact: true }).fill(start);
  await f.getByRole("radio", { name: "Belirli günler", exact: true }).check();
  await f.getByRole("button", { name: "Temizle", exact: true }).click();
  let posts = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/recurrence-templates" && r.method() === "POST") posts++;
  });
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  await expect(f.getByRole("alert")).toHaveText("En az bir gün seç.");
  await expect(f.locator(".recurrence-days-error")).toHaveText("En az bir gün seç.");
  expect(posts).toBe(0);
  for (const name of ["Pazartesi", "Çarşamba", "Cuma"]) await f.getByRole("checkbox", { name, exact: true }).check();
  await expect(f.locator(".recurrence-days-error")).toHaveCount(0);
  await expect(f.locator(".recurrence-days-summary")).toHaveText("Her hafta Pazartesi, Çarşamba ve Cuma");
  await f.getByRole("button", { name: "Hafta içi", exact: true }).click();
  await expect(f.getByRole("button", { name: "Hafta içi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await f.getByRole("button", { name: "Temizle", exact: true }).click();
  for (const name of ["Pazartesi", "Çarşamba", "Cuma"]) await f.getByRole("checkbox", { name, exact: true }).check();
  const layout = async () =>
    f.evaluate(root => {
      const boxes = (sel: string) =>
        [...root.querySelectorAll<HTMLElement>(sel)].map(e => {
          const r = e.getBoundingClientRect();
          return {
            l: r.left,
            r: r.right,
            t: r.top,
            b: r.bottom,
            h: r.height,
            clipped: e.scrollWidth > e.clientWidth + 1,
          };
        });
      const cells = [...boxes(".recurrence-chip > span"), ...boxes(".recurrence-seg-item > span")];
      const group = (list: ReturnType<typeof boxes>) =>
        list.every((a, i) =>
          list.every((c, j) => i === j || a.r <= c.l + 0.5 || c.r <= a.l + 0.5 || a.b <= c.t + 0.5 || c.b <= a.t + 0.5),
        );
      return {
        overlap: !group(boxes(".recurrence-chip > span")) || !group(boxes(".recurrence-seg-item > span")),
        clipped: cells.some(c => c.clipped),
        shortest: Math.min(...cells.map(c => c.h)),
        tallestSeg: Math.max(...boxes(".recurrence-seg-item > span").map(c => c.h)),
        rootWidth: root.getBoundingClientRect().width,
        pageScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await layout();
    expect(m.overlap, `overlap at ${width}`).toBe(false);
    expect(m.clipped, `clipped at ${width}`).toBe(false);
    expect(m.pageScroll, `page scroll at ${width}`).toBe(false);
    expect(m.shortest, `target height at ${width}`).toBeGreaterThanOrEqual(44);
    expect(m.tallestSeg, `segment wraps at ${width}`).toBeLessThanOrEqual(56);
    await page.screenshot({ path: `${EVIDENCE}/recurrence-weekday-chips-${width}-${info.project.name}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await auditTask(page, "weekday-chips", "recurrence");
  await page.screenshot({ path: `${EVIDENCE}/recurrence-weekday-chips-${info.project.name}.png` });
  const response = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/recurrence-templates" && r.request().method() === "POST",
  );
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const created = (await (await response).json()) as Effect;
  expect(created.template.rule.frequency).toBe("Weekly");
  expect(created.template.rule.weekDays).toEqual([1, 3, 5]);
  await expect(f).toBeHidden();
  const effect = await materialize(created.template, start, plus(start, 6));
  const dates = (await occurrences(created.template, start, plus(start, 6))).map(o => o.localDate);
  expect(effect.occurrences).toHaveLength(3);
  expect(dates).toHaveLength(3);
  for (const d of dates) expect([1, 3, 5]).toContain(Temporal.PlainDate.from(d).dayOfWeek % 7);
});

test("history rows show done / not done and can be toggled without opening the task panel", async ({ page }, info) => {
  const t = await seed({ startDate: plus(day(0), -3) });
  const m = await fx.api.post(`/api/recurrence-templates/${t.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: t.version, fromDate: plus(day(0), -3), toDate: day(0) },
  });
  expect(m.status()).toBe(200);
  const rows = (await m.json()).occurrences as Occurrence[];
  await open(page, t);
  const list = detail(page).getByRole("list", { name: "Oluşan görevler, en yeniden eskiye", exact: true });
  await expect(list.locator('li[data-tone="done"]')).toHaveCount(0);
  await expect(list.locator('li[data-tone="missed"]')).toHaveCount(3);
  await page.screenshot({ path: `${EVIDENCE}/recurrence-history-${info.project.name}.png` });
  const target = rows[1];
  const row = list
    .locator("li")
    .filter({ has: page.getByRole("checkbox", { checked: false }) })
    .nth(2);
  await row.locator("label").click();
  await expect(list.locator('li[data-tone="done"]')).toHaveCount(1);
  await expect
    .poll(async () => (await (await fx.api.get(`/api/tasks/${target.taskId}`)).json()).state)
    .toBe("Completed");
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı" })).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/recurrence-history-done-${info.project.name}.png` });
  await list.locator('li[data-tone="done"] label').click();
  await expect(list.locator('li[data-tone="done"]')).toHaveCount(0);
  await expect
    .poll(async () => (await (await fx.api.get(`/api/tasks/${target.taskId}`)).json()).state)
    .not.toBe("Completed");
});

test("monthly form requires an explicit 29–31 policy; optional defaults remain null and creation alone creates no task", async ({
  page,
}, info) => {
  const before = (await (await fx.api.get("/api/tasks?limit=1")).json()).total;
  await open(page);
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const f = modal(page, "Rutin oluştur");
  await f.getByLabel("Rutin adı", { exact: true }).fill(`Aylık gözden geçirme ${randomUUID()}`);
  await f.getByLabel("Başlangıç günü", { exact: true }).fill("2028-01-31");
  await f.getByRole("radio", { name: "Aylık", exact: true }).check();
  await f.getByLabel("Ayın kaçıncı günü", { exact: true }).fill("31");
  let posts = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/recurrence-templates" && r.method() === "POST") posts++;
  });
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("ay sonu");
  expect(posts).toBe(0);
  await f.getByLabel("Ayda seçilen gün yoksa", { exact: true }).selectOption("ClampToLastDay");
  await expect(f.locator("details")).toHaveCount(0);
  await f.getByLabel("Başlangıç saati (isteğe bağlı)", { exact: true }).fill("10:15");
  await f.getByRole("checkbox", { name: "Gün planlarına otomatik ekle", exact: true }).check();
  await auditTask(page, "monthly-form", "recurrence");
  await page.screenshot({ path: `${EVIDENCE}/recurrence-form-${info.project.name}.png` });
  const response = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/recurrence-templates" && r.request().method() === "POST",
  );
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const result = (await (await response).json()) as Effect;
  await expect(f).toBeHidden();
  expect(result.template.task.estimatedSeconds).toBeNull();
  expect(result.template.task.energyDemand).toBeNull();
  expect(result.template.task.poolId).toBeNull();
  expect(result.template.rule.startTime).toBe("10:15:00");
  expect(result.template.rule.autoAddToPlan).toBe(true);
  expect(result.occurrences).toEqual([]);
  expect((await (await fx.api.get("/api/tasks?limit=1")).json()).total).toBe(before);
  expect((await get(result.template.id)).rule.monthEnd).toBe("ClampToLastDay");
  await materialize(result.template, "2028-01-31");
  await page.goto("/planning?date=2028-01-31");
  const row = page.locator("li.r2-plan-row").filter({
    has: page.getByRole("checkbox", { name: `${result.template.task.title} plan öğesi bitti`, exact: true }),
  });
  await expect(row.locator("time")).toHaveCount(1);
  await expect(row.locator("time")).toHaveText("10:15");
  await row.getByRole("button", { name: /Saati düzenle$/ }).click();
  await expect(row.getByLabel("Bitiş saati")).toHaveValue("");
  await page.screenshot({ path: `${EVIDENCE}/recurrence-open-end-${info.project.name}.png` });
  await open(page, result.template);
  await more(page, "Tanım geçmişi");
  await expect(page.getByRole("region", { name: "Değişmez tanım geçmişi", exact: true })).toContainText("Tanım 1");
  await auditTask(page, "series", "recurrence");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("weekly weekdays and interval-day forms save their bounded rule without synthesizing a calendar", async ({
  page,
}) => {
  for (const frequency of ["Weekly", "IntervalDays"]) {
    await open(page);
    await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
    const f = modal(page, "Rutin oluştur");
    await f.getByLabel("Rutin adı", { exact: true }).fill(`Kural ${frequency} ${randomUUID()}`);
    await f.getByRole("radio", { name: radioNames[frequency], exact: true }).check();
    if (frequency === "Weekly") {
      await f.getByText("Daha seyrek mi?").click();
      await f.getByLabel("Her kaç haftada", { exact: true }).fill("2");
      await f.getByRole("button", { name: "Temizle", exact: true }).click();
      await f.getByRole("checkbox", { name: "Pazartesi", exact: true }).check();
      await f.getByRole("checkbox", { name: "Çarşamba", exact: true }).check();
    } else await f.getByLabel("Her kaç günde", { exact: true }).fill("3");
    const response = page.waitForResponse(
      r => new URL(r.url()).pathname === "/api/recurrence-templates" && r.request().method() === "POST",
    );
    await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
    const e = (await (await response).json()) as Effect;
    expect(e.template.rule.frequency).toBe(frequency);
    expect(e.template.rule.weekDays).toEqual(frequency === "Weekly" ? [1, 3] : []);
    expect(e.occurrences).toEqual([]);
    await expect(f).toBeHidden();
  }
});

test("materialize enforces inclusive 1–93, paginates 93 actual tasks and repeated windows preserve every TaskId", async ({
  page,
}, info) => {
  const t = await seed();
  await open(page, t);
  await more(page, "Önümüzdeki 14 gün için görev oluştur");
  const f = modal(page, "Seçili günler için görev oluştur");
  await f.getByLabel("Görev üretimi başlangıcı", { exact: true }).fill(day());
  await f.getByLabel("Görev üretimi bitişi", { exact: true }).fill(day(103));
  let requests = 0;
  page.on("request", r => {
    if (r.url().includes("/materialize") && r.method() === "POST") requests++;
  });
  await f.getByRole("button", { name: "Bu aralık için görev oluştur", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("1–93");
  expect(requests).toBe(0);
  await f.getByLabel("Görev üretimi bitişi", { exact: true }).fill(plus(day(), 92));
  await f.getByRole("button", { name: "Bu aralık için görev oluştur", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  await close(f);
  const before = await occurrences(t, day(), plus(day(), 92));
  expect(before).toHaveLength(93);
  await auditTask(page, "occurrences", "recurrence");
  await page.screenshot({ path: `${EVIDENCE}/recurrence-list-${info.project.name}.png` });
  await generate(page, day(), plus(day(), 92));
  expect((await occurrences(t, day(), plus(day(), 92))).map(o => o.taskId)).toEqual(before.map(o => o.taskId));
});

test("monthly clamp and skip expose leap-February decisions through real API results", async ({ page }) => {
  for (const monthEnd of ["ClampToLastDay", "Skip"] as const) {
    const t = await seed({ startDate: "2028-01-31", frequency: "Monthly", monthDay: 31, monthEnd });
    await open(page, t);
    await generate(page, "2028-02-01", "2028-03-31");
    const rows = await occurrences(t, "2028-02-01", "2028-03-31");
    expect(rows.map(o => o.localDate)).toEqual(monthEnd === "Skip" ? ["2028-03-31"] : ["2028-02-29", "2028-03-31"]);
  }
});

test("DST gap Reject is honest, Skip creates a marker and ShiftForward preserves original local time", async ({
  page,
}) => {
  for (const gap of ["Reject", "Skip", "ShiftForward"] as const) {
    const t = await seed({ startDate: "2027-03-28", timeZoneId: "Europe/Berlin", dueTime: "02:30:00", gap });
    await open(page, t);
    await range(page, "2027-03-28");
    await more(page, "Önümüzdeki 14 gün için görev oluştur");
    const f = modal(page, "Seçili günler için görev oluştur");
    await f.getByLabel("Görev üretimi başlangıcı", { exact: true }).fill("2027-03-28");
    await f.getByLabel("Görev üretimi bitişi", { exact: true }).fill("2027-03-28");
    await f.getByRole("button", { name: "Bu aralık için görev oluştur", exact: true }).click();
    if (gap === "Reject") {
      await expect(f.getByRole("alert")).toContainText("bu saat diliminde yok");
      expect(await occurrences(t, "2027-03-28")).toEqual([]);
      await f.getByRole("button", { name: "Vazgeç", exact: true }).click();
    } else {
      await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
      await close(f);
      const [o] = await occurrences(t, "2027-03-28");
      expect(o.originalDueTime).toBe("02:30:00");
      expect(o.originalTimeZoneId).toBe("Europe/Berlin");
      if (gap === "Skip") {
        expect(o.taskId).toBeNull();
        expect(o.reason).toBe("DstGap");
      } else {
        expect(o.timeAdjusted).toBe(true);
        expect(Date.parse(o.originalDueAt!)).toBe(Date.parse("2027-03-28T01:00:00Z"));
      }
    }
  }
});

test("DST overlap choices yield explicit distinct real deadlines", async ({ page }) => {
  for (const overlap of ["Earlier", "Later"] as const) {
    const t = await seed({ startDate: "2027-10-31", timeZoneId: "Europe/Berlin", dueTime: "02:30:00", overlap });
    await open(page, t);
    await generate(page, "2027-10-31");
    const [o] = await occurrences(t, "2027-10-31");
    expect(Date.parse(o.originalDueAt!)).toBe(
      Date.parse(overlap === "Earlier" ? "2027-10-31T00:30:00Z" : "2027-10-31T01:30:00Z"),
    );
    expect(o.originalDueTime).toBe("02:30:00");
  }
});

test("skip/cancel markers block later generation; a materialized change preserves task identity and task recurrence link", async ({
  page,
}) => {
  const t = await seed();
  await open(page, t);
  for (const [action, delta] of [
    ["atla", 0],
    ["iptal et", 1],
  ] as const) {
    await more(page, action === "atla" ? "Bir günü atla…" : "Bir günü iptal et…");
    const f = modal(page, action === "atla" ? "Tek oluşumu atla" : "Tek oluşumu iptal et");
    await f.getByLabel("Tek oluşumun günü", { exact: true }).fill(plus(day(), delta));
    await f.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
    await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
    await close(f);
  }
  await generate(page, day(), plus(day(), 2));
  const rows = await occurrences(t, day(), plus(day(), 2));
  expect(rows.map(o => o.state)).toEqual(["Skipped", "Canceled", "Materialized"]);
  expect(rows.slice(0, 2).every(o => o.taskId === null)).toBe(true);
  await more(page, "Bir günü atla…");
  const f = modal(page, "Tek oluşumu atla");
  await f.getByLabel("Tek oluşumun günü", { exact: true }).fill(plus(day(), 2));
  await f.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  await close(f);
  const [changed] = await occurrences(t, plus(day(), 2));
  expect(changed.taskId).toBe(rows[2].taskId);
  expect(changed.taskState).toBe("Skipped");
});

test("stale template preserves local edits and rebases remote-only fields; stale task requires both fresh versions", async ({
  page,
}) => {
  const t = await seed();
  await materialize(t);
  await open(page, t);
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  const f = modal(page, "Rutini düzenle");
  const title = `Korunan taslak ${randomUUID()}`;
  await f.getByLabel("Rutin adı", { exact: true }).fill(title);
  const remote = await fx.api.put(`/api/recurrence-templates/${t.id}`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      version: t.version,
      effectiveFrom: day(),
      rule: t.rule,
      task: { ...t.task, description: "Diğer sekmenin açıklaması" },
      refreshExisting: false,
    },
  });
  expect(remote.status()).toBe(200);
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("Seçimlerin korundu");
  await f.getByRole("button", { name: "Güncel tekrar kaydını oku", exact: true }).click();
  await f.getByRole("button", { name: "Seçimlerimi güncel sürümle yeniden hazırla", exact: true }).click();
  await expect(f.getByLabel("Rutin adı", { exact: true })).toHaveValue(title);

  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f).toBeHidden();
  expect((await get(t.id)).task.title).toBe(title);
  expect((await get(t.id)).task.description).toBe("Diğer sekmenin açıklaması");
  await more(page, "Bir günü iptal et…");
  const c = modal(page, "Tek oluşumu iptal et");
  await c.getByLabel("Tek oluşumun günü", { exact: true }).fill(day());
  const [o] = await occurrences(t);
  const task = await (await fx.api.get(`/api/tasks/${o.taskId}`)).json();
  expect(
    (
      await fx.api.put(`/api/tasks/${o.taskId}`, {
        data: {
          version: task.version,
          title: "Tek görev değişti",
          description: task.description,
          priority: task.priority,
          deadlineAt: task.deadlineAt,
          canSplit: task.canSplit,
        },
      })
    ).status(),
  ).toBe(200);
  // Gün seçilerek açılan işlem kaydederken güncel görev sürümünü okur; değişmiş görev çakışma üretmez.
  await c.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
  await expect(c.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  expect((await occurrences(t))[0].taskState).toBe("Canceled");
});

test("lost create and materialize responses replay identical key/body; saved ACK does not wait for follow-up GET", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const f = modal(page, "Rutin oluştur");
  const title = `Tek kimlik ${randomUUID()}`;
  await f.getByLabel("Rutin adı", { exact: true }).fill(title);
  let lose = true;
  const keys: string[] = [],
    bodies: string[] = [];
  let saved: Effect | undefined;
  await page.route("**/api/recurrence-templates", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (lose) {
      lose = false;
      const response = await route.fetch();
      saved = await response.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  await f.getByRole("button", { name: "Aynı işlemi güvenle yeniden dene", exact: true }).click();
  await expect(f).toBeHidden();
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(new Set(bodies).size).toBe(1);
  await page.unroute("**/api/recurrence-templates");
  const t = saved!.template;
  await range(page, t.rule.startDate);
  await more(page, "Önümüzdeki 14 gün için görev oluştur");
  const g = modal(page, "Seçili günler için görev oluştur");
  lose = true;
  keys.length = 0;
  bodies.length = 0;
  let hold = false,
    held = false,
    release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  await page.route(`**/api/recurrence-templates/${t.id}/materialize`, async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else {
      hold = true;
      await route.continue();
    }
  });
  await page.route(`**/api/recurrence-templates/${t.id}/occurrences?**`, async route => {
    if (hold) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  try {
    await g.getByRole("button", { name: "Bu aralık için görev oluştur", exact: true }).click();
    await expect(g.getByRole("button", { name: "Aynı işlemi güvenle yeniden dene", exact: true })).toBeVisible();
    const committed = await occurrences(t);
    await g.getByRole("button", { name: "Aynı işlemi güvenle yeniden dene", exact: true }).click();
    await expect(g.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
    await expect.poll(() => held).toBe(true);
    expect((await occurrences(t)).map(o => o.taskId)).toEqual(committed.map(o => o.taskId));
    expect(new Set(keys).size).toBe(1);
    expect(keys).toHaveLength(2);
    expect(new Set(bodies).size).toBe(1);
  } finally {
    release();
  }
});

test("disabled series preserves history and rejects generation; foreign IDs return 404; bounded template pages remain navigable", async ({
  page,
}) => {
  const t = await seed();
  const before = await materialize(t);
  await open(page, t);
  await more(page, "Seriyi pasif yap");
  const f = modal(page, "Serinin etkinliğini değiştir");
  await f.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  await close(f);
  await detail(page).getByRole("button", { name: "Rutin için diğer işlemler", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Önümüzdeki 14 gün için görev oluştur", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect((await occurrences(t))[0].taskId).toBe(before.occurrences[0].taskId);
  expect(
    (
      await fx.api.post(`/api/recurrence-templates/${t.id}/materialize`, {
        headers: { "Idempotency-Key": randomUUID() },
        data: { version: (await get(t.id)).version, fromDate: day(), toDate: day() },
      })
    ).status(),
  ).toBe(409);
  const other = await seed({}, "Yabancı seri", foreign);
  expect((await fx.api.get(`/api/recurrence-templates/${other.id}`)).status()).toBe(404);
  expect(
    (
      await fx.api.put(`/api/recurrence-templates/${other.id}/enabled`, {
        headers: { "Idempotency-Key": randomUUID() },
        data: { version: other.version, enabled: false },
      })
    ).status(),
  ).toBe(404);
  await more(page, "Seriyi etkinleştir");
  const enable = modal(page, "Serinin etkinliğini değiştir");
  await enable.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
  await expect(enable.getByRole("status")).toHaveText("Tekrar işlemi kaydedildi.");
  await close(enable);
  await detail(page).getByRole("button", { name: "Rutin için diğer işlemler", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Önümüzdeki 14 gün için görev oluştur", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 26; i++) await seed();
  await page.reload();
  await page.getByRole("button", { name: "Sonraki şablonlar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tekrar şablonları", exact: true })).toContainText("2. sayfa");
});

test("future refresh preserves manual, completed, worked, planned and child-bearing instances; untouched task keeps its ID", async ({
  page,
}) => {
  const t = await seed();
  const e = await materialize(t, day(), plus(day(), 5));
  const ids = e.occurrences.map(o => o.taskId!);
  const task = async (i: number) => (await fx.api.get(`/api/tasks/${ids[i]}`)).json();
  const manual = await task(1);
  expect(
    (
      await fx.api.put(`/api/tasks/${manual.id}`, {
        data: {
          version: manual.version,
          title: "Elle korunan görev",
          description: null,
          priority: manual.priority,
          deadlineAt: manual.deadlineAt,
          canSplit: manual.canSplit,
        },
      })
    ).status(),
  ).toBe(200);
  const complete = await task(2);
  expect(
    (
      await fx.api.post(`/api/tasks/${complete.id}/state`, { data: { version: complete.version, action: "Complete" } })
    ).status(),
  ).toBe(200);
  const start = await fx.api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: ids[3] },
  });
  expect(start.status()).toBe(201);
  const w = await start.json();
  expect((await fx.api.post(`/api/work-sessions/${w.id}/finish`, { data: { version: w.version } })).status()).toBe(200);
  const parent = await task(4);
  expect(
    (
      await fx.api.post(`/api/tasks/${parent.id}/children`, {
        data: { parentVersion: parent.version, title: "Alt iş", parentWorkDisposition: "PreserveDirect" },
      })
    ).status(),
  ).toBe(201);
  const date = plus(day(), 5),
    plan = await (await fx.api.get(`/api/daily-plans/${date}`)).json();
  const s = await fx.api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: date,
      taskId: ids[5],
      kind: "Work",
      startsAt: `${date}T09:00:00+03:00`,
      endsAt: `${date}T09:10:00+03:00`,
      isFixed: true,
      isLocked: false,
      allowConflicts: true,
      expectedPlanningVersion: plan.planningVersion,
    },
  });
  expect(s.status()).toBe(201);
  const baseline = await (await fx.api.get(`/api/daily-plans/${date}`)).json();
  await open(page, t);
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  const f = modal(page, "Rutini düzenle");
  await f.getByLabel("Rutin adı", { exact: true }).fill("Yeni seri varsayılanı");
  const response = page.waitForResponse(
    r => new URL(r.url()).pathname === `/api/recurrence-templates/${t.id}` && r.request().method() === "PUT",
  );
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  const result = (await (await response).json()) as Effect;
  await expect(f.getByRole("status")).toHaveText("Rutin güncellendi.");
  expect(result.refreshedTaskIds).toEqual([ids[0]]);
  expect([...result.protectedTaskIds].sort()).toEqual(ids.slice(1).sort());
  await expect(f).toContainText("Korunan görev: 5");
  expect((await task(0)).title).toBe("Yeni seri varsayılanı");
  expect((await task(1)).title).toBe("Elle korunan görev");
  expect((await task(2)).state).toBe("Completed");
  expect(Number(result.planningVersion)).toBe(Number(baseline.planningVersion) + 1);
  expect(await (await fx.api.get(`/api/daily-plans/${date}`)).json()).toEqual({
    ...baseline,
    planningVersion: result.planningVersion,
  });
  const after = await occurrences(t, day(), plus(day(), 5));
  expect(after.map(o => o.taskId)).toEqual(ids);
  expect(after[0].originalDefinitionId).not.toBe(after[0].appliedDefinitionId);
});

test("offline writes are not queued; dirty Escape and pending logout keep intent; ordinary task has an honest null recurrence", async ({
  page,
}) => {
  const t = await seed();
  await open(page, t);
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  const f = modal(page, "Rutini düzenle");
  await f.getByLabel("Rutin adı", { exact: true }).fill("Kaybolmayan taslak");
  page.once("dialog", d => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(f).toBeVisible();
  await page.context().setOffline(true);
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("Bağlantı yok");
  await page.context().setOffline(false);
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let sent = false;
  await page.route(`**/api/recurrence-templates/${t.id}`, async route => {
    if (route.request().method() === "PUT") {
      const response = await route.fetch();
      sent = true;
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await f.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect.poll(() => sent).toBe(true);
    await page.keyboard.press("Escape");
    await expect(f).toBeVisible();
    expect(
      await page.evaluate(() => window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }))),
    ).toBe(false);
    release();
    await expect(f).toBeHidden();
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Düzenle", exact: true })).toBeFocused();
});

test("routine origins stay out of task tree, search and completed lists while routine details remain available", async ({
  page,
}, info) => {
  const prefix = `Ayrı liste ${randomUUID().slice(-8)}`;
  const t = await seed({}, `${prefix} rutin`);
  const made = await materialize(t);
  const routineId = made.occurrences[0].taskId!;
  const r = await fx.api.post("/api/tasks", { data: { title: `${prefix} normal` } });
  expect(r.status()).toBe(201);
  const normal = await r.json();
  await page.goto("/tasks");
  const main = page.locator("main#main");
  await expect(main.locator(`[data-task-title="${normal.id}"]`)).toBeVisible();
  await expect(main.locator(`[data-task-title="${routineId}"]`)).toHaveCount(0);
  await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
  const results = page.getByRole("region", { name: "Arama sonuçları", exact: true });
  await expect(results.getByRole("status")).toHaveText("1 sonuç");
  await expect(results.locator(`[data-task-title="${normal.id}"]`)).toBeVisible();
  await expect(results).not.toContainText(t.task.title);
  for (const id of [routineId, normal.id]) {
    const task = await (await fx.api.get(`/api/tasks/${id}`)).json();
    expect(
      (await fx.api.post(`/api/tasks/${id}/state`, { data: { version: task.version, action: "Complete" } })).status(),
    ).toBe(200);
  }
  await page.goto("/tasks");
  await main.getByRole("button", { name: "Tamamlananlar" }).click();
  await expect(main.locator(`[data-task-title="${normal.id}"]`)).toBeVisible();
  await expect(main.locator(`[data-task-title="${routineId}"]`)).toHaveCount(0);
  await page.goto("/tasks/completed");
  await expect(main).toContainText(normal.title);
  await expect(main).not.toContainText(t.task.title);
  expect((await fx.api.get(`/api/tasks/${routineId}`)).status()).toBe(200);
  await open(page, t);
  await expect(page.getByRole("region", { name: "Seçili seri", exact: true })).toContainText(t.task.title);
  await page.screenshot({ path: `${EVIDENCE}/routine-preserved-${info.project.name}.png`, fullPage: true });
});

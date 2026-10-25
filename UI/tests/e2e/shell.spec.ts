import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openAccountMenu, signIn } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";

test.beforeAll(async ({ browser, browserName }, worker) => {
  writeFileSync(
    `${EVIDENCE}/environment-${worker.project.name}-${worker.workerIndex}.json`,
    JSON.stringify(
      {
        browserName,
        browserVersion: browser.version(),
        project: worker.project.name,
        node: process.version,
        platform: process.platform,
        buildId: readFileSync(`${process.env.UI_E2E_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8").trim(),
        viewport: worker.project.use.viewport,
        locale: "tr-TR",
        timeZone: "Europe/Istanbul",
        fixture: "owned synthetic accounts; shell-only fixture clearly labelled",
      },
      null,
      2,
    ),
  );
});
const accountEmails = new WeakMap<Page, string>();
test.beforeEach(async ({ page, request }, info) => {
  // Hazırlık doğrulamayı atlamaz. Gerçek kayıt JWT'si ve gerçek me başlangıcı var.
  // Geniş test iki gerçek hazırlık sunucusunu kullanır;
  // değişmeyen giriş sınırları aşılmaz. Başlangıç yine normal Next–API proxy'den geçer.
  const email = `shell-${randomUUID()}@example.test`;
  accountEmails.set(page, email);
  const response = await request.post("http://127.0.0.1:5181/api/auth/register", {
    data: {
      email,
      password: randomUUID(),
      ...(info.title.includes("email identity") ? {} : { displayName: "Serhat Maikan" }),
    },
  });
  expect(response.status()).toBe(201);
  const auth = (await response.json()) as { accessToken: string };
  await signIn(page, auth.accessToken);
});
let auditSequence = 0;
test("R4 plan rows keep controls aligned and show priority and energy", async ({ page }, info) => {
  await page.goto("/planning");
  const input = page.getByRole("combobox", { name: "Görev ekle", exact: true });
  await input.fill("R4 yüksek öncelikli iş");
  await page.getByLabel("Yeni görevin önceliği").selectOption("High");
  await page.getByLabel("Yeni görevin eforu").selectOption("Low");
  await page.getByRole("option", { name: /R4 yüksek öncelikli iş.*oluştur/ }).click();
  const first = page
    .locator("li.r2-plan-row")
    .filter({ has: page.getByRole("checkbox", { name: "R4 yüksek öncelikli iş plan öğesi bitti", exact: true }) });
  await expect(first.getByText("Yüksek", { exact: true })).toBeVisible();
  await expect(first.getByText("Efor: Düşük", { exact: true })).toBeVisible();
  const date = await page.getByLabel("Plan günü", { exact: true }).inputValue();
  const headers = { "X-ADHD-CSRF": "1", Origin: "http://127.0.0.1:3400" };
  const response = await page.request.post("/api/tasks", { headers, data: { title: "R4 tahminli iş" } });
  expect(response.status()).toBe(201);
  const task = (await response.json()) as { id: string; version: number };
  expect(
    (
      await page.request.put(`/api/tasks/${task.id}/work-definition`, {
        headers,
        data: { version: task.version, hasDirectWork: true, directEstimatedSeconds: 1800 },
      })
    ).status(),
  ).toBe(200);
  expect((await page.request.post(`/api/daily-plans/${date}/items`, { headers, data: { taskId: task.id } })).ok()).toBe(
    true,
  );
  await page.reload();
  const second = page
    .locator("li.r2-plan-row")
    .filter({ has: page.getByRole("checkbox", { name: "R4 tahminli iş plan öğesi bitti", exact: true }) });
  await expect(second).toBeVisible();
  // Sıradaki satırın Başlat düğmesi yazılıdır; satırların menüsü aynı hizada kalır.
  for (const selector of [".menu-trigger"]) {
    const a = await first.locator(selector).boundingBox(),
      b = await second.locator(selector).boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
  }
  await expect(page.getByRole("checkbox", { name: "Düşük efor", exact: true })).toHaveCount(0);
  const rowMenu = first.getByRole("button", { name: "R4 yüksek öncelikli iş plan öğesi menüsü", exact: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await rowMenu.hover();
    const dimensions = await rowMenu.evaluate(el => {
      const button = el.getBoundingClientRect(),
        slot = el.parentElement!.getBoundingClientRect();
      return {
        button: button.width,
        slot: slot.width,
        left: button.left - slot.left,
        right: slot.right - button.right,
      };
    });
    expect(dimensions.button).toBeLessThanOrEqual(dimensions.slot);
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeGreaterThanOrEqual(0);
    await expect
      .poll(() => rowMenu.evaluate(el => getComputedStyle(el).backgroundColor))
      .not.toBe(await first.evaluate(el => getComputedStyle(el).backgroundColor));
    await first.screenshot({ path: `${EVIDENCE}/plan-menu-hover-${theme}-${info.project.name}.png` });
  }
  await first.getByRole("button", { name: "R4 yüksek öncelikli iş plan öğesi menüsü", exact: true }).click();
  await expect(page.getByRole("menuitem").first()).toHaveText("Görev ayrıntısı");
  const menu = page.getByRole("menu", { name: "R4 yüksek öncelikli iş plan öğesi menüsü", exact: true });
  await expect(menu).toBeVisible();
  const trigger = first.getByRole("button", { name: "R4 yüksek öncelikli iş plan öğesi menüsü", exact: true });
  expect(await trigger.getAttribute("aria-controls")).toBe(await menu.getAttribute("id"));
  // Açık menü diğer kontrolleri normal olarak örter. Önce kendi alanını, sonra açık sayfayı ölçüyoruz.
  const menuAudit = await new AxeBuilder({ page })
    .include(".menu-list")
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(menuAudit.violations).toEqual([]);
  expect(menuAudit.incomplete).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/r4-plan-menu-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await audit(page);
});

test("R4 urgent task adds an open-ended plan without starting work and accepts an overlapping end", async ({
  page,
}) => {
  await page.goto("/planning");
  await expect(page.getByRole("combobox", { name: "Görev ekle", exact: true })).toBeVisible();
  const date = await page.getByLabel("Plan günü", { exact: true }).inputValue();
  const headers = { "X-ADHD-CSRF": "1", Origin: "http://127.0.0.1:3400" };
  const t = await page.request.post("/api/tasks", { headers, data: { title: "Normal saatli iş" } });
  expect(t.status()).toBe(201);
  const task = (await t.json()) as { id: string };
  const day = (await (await page.request.get(`/api/daily-plans/${date}`)).json()) as { planningVersion: number };
  const normal = await page.request.post("/api/schedules", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: {
      localDate: date,
      taskId: task.id,
      kind: "Work",
      startsAt: `${date}T08:00:00+03:00`,
      endsAt: `${date}T09:00:00+03:00`,
      expectedPlanningVersion: day.planningVersion,
      allowConflicts: false,
    },
  });
  expect(normal.status()).toBe(201);
  const writes: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST") writes.push(new URL(r.url()).pathname);
  });
  await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Acil işe geç", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Acil işe geç", exact: true });
  await modal.getByRole("combobox").fill("R4 beklenmeyen iş");
  await expect(modal.getByRole("radio")).toHaveCount(0);
  await expect(modal.getByRole("button", { name: /^(Ara|Geçişi hazırla|Kapat)$/ })).toHaveCount(0);
  await modal.getByRole("option", { name: "“R4 beklenmeyen iş” görevine başla", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const box = page.getByRole("checkbox", { name: "R4 beklenmeyen iş plan öğesi bitti", exact: true });
  await expect(box).toBeVisible();
  const row = page.locator("li.r2-plan-row").filter({ has: box });
  await expect(row.getByText("Acil iş", { exact: true })).toBeVisible();
  await expect(row.locator("time")).toHaveCount(1);
  await row.getByRole("button", { name: /Saati düzenle$/ }).click();
  const form = row.getByRole("form", { name: "Saat aralığı" });
  await expect(form.getByLabel("Başlangıç saati")).toHaveValue(/^\d{2}:\d{2}$/);
  await expect(form.getByLabel("Bitiş saati")).toHaveValue("");
  await form.getByLabel("Başlangıç saati").fill("08:00");
  await form.getByLabel("Bitiş saati").fill("09:00");
  await form.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(row.locator("time")).toHaveCount(2);
  expect(writes.filter(p => p.startsWith("/api/work-sessions") || p.startsWith("/api/focus-sessions"))).toEqual([]);
  await expect(page.locator(".work-timer")).toHaveCount(0);
});
test("R4 task picker opens both groups, pages and filters without parent requests", async ({ page }, info) => {
  await page.goto("/planning");
  await expect(page.getByRole("combobox", { name: "Görev ekle", exact: true })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/plan-add-empty-${info.project.name}.png` });
  const date = await page.getByLabel("Plan günü", { exact: true }).inputValue();
  const headers = { "X-ADHD-CSRF": "1", Origin: "http://127.0.0.1:3400" };
  const create = async (title: string) => {
    const r = await page.request.post("/api/tasks", { data: { title }, headers });
    expect(r.status()).toBe(201);
    return (await r.json()) as { id: string; version: number };
  };
  const assigned = await create("Atanmış iş");
  expect(
    (
      await page.request.put(`/api/tasks/${assigned.id}/planned-range`, {
        headers,
        data: { version: assigned.version, plannedFrom: date, plannedTo: date },
      })
    ).status(),
  ).toBe(200);
  const parent = await create("Ana bağlam");
  const child = await page.request.post(`/api/tasks/${parent.id}/children`, {
    headers,
    data: { title: "İncelenecek alt iş", parentWorkDisposition: "ConvertToContainer", parentVersion: parent.version },
  });
  expect(child.status()).toBe(201);
  for (let i = 0; i < 26; i++) await create(`Diğer ${String(i).padStart(2, "0")}`);
  await page.reload();
  const input = page.getByRole("combobox", { name: "Görev ekle", exact: true });
  const requests: string[] = [];
  page.on("request", r => {
    if (r.method() === "GET") requests.push(new URL(r.url()).pathname);
  });
  await input.focus();
  const list = page.getByRole("listbox", { name: "Görev önerileri" });
  await expect(list.getByRole("group", { name: "Bu güne atanmış", exact: true })).toBeVisible();
  await expect(list.getByRole("group", { name: "Tüm görevler", exact: true })).toBeVisible();
  await expect(list.getByRole("option", { name: /Atanmış iş/ })).toBeVisible();
  await page.getByRole("button", { name: "Diğer görevleri göster", exact: true }).last().click();
  await expect(list.getByRole("option", { name: /Ana bağlam.*İncelenecek alt iş/ })).toBeVisible();
  await input.fill("İ");
  await expect(list.getByRole("option", { name: /İncelenecek alt iş/ })).toBeVisible();
  await input.fill("İncelenecek");
  await expect(list.getByRole("option", { name: /İncelenecek alt iş/ })).toBeVisible();
  await expect.poll(() => requests.filter(p => p === "/api/tasks/picker").length).toBeGreaterThan(0);
  expect(requests.filter(p => /^\/api\/tasks\/[0-9a-f-]{36}$/.test(p))).toEqual([]);
  await list.getByRole("option", { name: /İncelenecek alt iş/ }).click();
  await expect(page.getByRole("checkbox", { name: "İncelenecek alt iş plan öğesi bitti", exact: true })).toBeVisible();
  await input.press("Escape");
  await page.screenshot({ path: `${EVIDENCE}/plan-add-row-${info.project.name}.png` });
});
test("R4 account footer and searchable help guide", async ({ page }, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await page.goto("/planning");
  await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ayarlar", exact: true })).toHaveCount(0);
  await openAccountMenu(page);
  const menu = page.getByRole("menu", { name: "Hesap menüsü" });
  await expect(menu.getByRole("menuitem", { name: "Ayarlar", exact: true })).toBeFocused();
  await expect(menu.locator(".account-card-copy strong")).toHaveText("Serhat Maikan");
  await expect(menu.locator(".account-card-avatar")).toHaveText("S");
  expect(await menu.locator(".account-card-avatar").evaluate(el => getComputedStyle(el).borderRadius)).toBe("50%");
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Çıkış yap", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem", { name: "Ayarlar", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  const account = page.getByRole("button", { name: "Hesap menüsü", exact: true });
  await expect(account).toBeFocused();
  const footer = page.locator(".account-footer:visible");
  await expect(footer.locator(".account-initial")).toHaveText("S");
  const avatar = await footer.locator(".account-initial").evaluate(el => {
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height, radius: getComputedStyle(el).borderRadius };
  });
  expect(avatar.width).toBe(avatar.height);
  expect(avatar.radius).toBe("50%");
  await expect(footer.locator(".account-help svg")).toHaveAttribute("width", "16");
  const compact = await footer.evaluate(el => ({
    height: el.getBoundingClientRect().height,
    margin: parseFloat(getComputedStyle(el).marginTop),
  }));
  expect(compact.height + compact.margin).toBeLessThanOrEqual(57);
  if ((page.viewportSize()?.width ?? 0) >= 1200) {
    expect(compact.height + compact.margin).toBeLessThanOrEqual(49);
    const avatarBox = await footer.locator(".account-initial").boundingBox();
    const accountBox = await account.boundingBox();
    expect(Math.abs(avatarBox!.y + avatarBox!.height / 2 - accountBox!.y - accountBox!.height / 2)).toBeLessThan(1);
    expect(await footer.locator(".account-name > span").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await footer.locator(".account-help").evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(
      32,
    );
  }
  const help = footer.getByRole("link", { name: "Kullanım rehberi" });
  const a = await account.boundingBox(),
    h = await help.boundingBox();
  expect(a).not.toBeNull();
  expect(h).not.toBeNull();
  if ((page.viewportSize()?.width ?? 0) >= 1200 || info.project.name === "mobile-chromium")
    expect(h!.x).toBeGreaterThan(a!.x);
  await page.screenshot({ path: `${EVIDENCE}/r4-account-${info.project.name}.png` });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await openAccountMenu(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
          .map(a => a.finished.catch(() => {})),
      );
    });
    const bounds = await menu.boundingBox();
    const base = await footer.boundingBox();
    const view = page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(view.width);
    const settings = menu.getByRole("menuitem", { name: "Ayarlar", exact: true });
    expect(
      await settings.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(result.incomplete).toEqual([]);
    const x = Math.max(0, Math.min(bounds!.x, base!.x) - 8),
      y = Math.max(0, bounds!.y - 8);
    await page.screenshot({
      path: EVIDENCE + "/account-menu-" + theme + "-" + info.project.name + ".png",
      clip: {
        x,
        y,
        width: Math.min(view.width - x, Math.max(bounds!.x + bounds!.width, base!.x + base!.width) - x + 8),
        height: Math.min(view.height - y, base!.y + base!.height - y + 8),
      },
    });
    await page.keyboard.press("Escape");
    await footer.screenshot({ path: EVIDENCE + "/account-footer-" + theme + "-" + info.project.name + ".png" });
  }
  if (info.project.name === "chromium") {
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await openAccountMenu(page);
      const bounds = await menu.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const settings = menu.getByRole("menuitem", { name: "Ayarlar", exact: true });
      expect(
        await settings.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
      ).toBe(true);
      await page.screenshot({ path: EVIDENCE + "/account-" + width + ".png" });
      await page.keyboard.press("Escape");
    }
  }
  await openAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  // Ayarlar açık sayfanın üstünde pencere olarak açılır; adres yalnız settings parametresi alır.
  await expect(page).toHaveURL(/\/planning\?settings=(profile|menu)$/);
  await expect(page.getByRole("dialog", { name: "Ayarlar" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Ayarlar" })).toHaveCount(0);
  await page.goto("/planning");
  await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
  if (info.project.name === "mobile-chromium") {
    await openAccountMenu(page);
    await page.keyboard.press("Escape");
  }

  await help.click();
  await expect(page.getByRole("heading", { name: "Kullanım rehberi", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Rehberde ara" }).fill("parolanı");
  await expect(page.getByRole("heading", { name: "Hesap ve bağlantı", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "İlk planını oluştur", exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Rehberde ara" }).clear();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await audit(page);
    await page.screenshot({ path: `${EVIDENCE}/r4-help-${theme}-${info.project.name}.png` });
  }
  expect(faults).toEqual([]);
});
test("email identity appears once and long addresses stay inside the account menu", async ({ page }, info) => {
  await page.goto("/planning");
  await openAccountMenu(page);
  const menu = page.getByRole("menu", { name: "Hesap menüsü" });
  const email = accountEmails.get(page)!;
  await expect(page.locator(".account-footer:visible .account-initial")).toHaveText("S");
  await expect(menu.locator(".account-card-avatar")).toHaveText("S");
  await expect(page.locator(".account-footer:visible .account-name")).toHaveText(email);
  const copy = menu.locator(".account-card-copy");
  await expect(copy).toHaveText(email);
  await expect(copy.locator("strong")).toHaveText(email);
  await expect(copy.locator("span")).toHaveCount(0);
  const text = await copy.boundingBox();
  const avatar = await menu.locator(".account-card-avatar").boundingBox();
  const check = await menu.locator(".account-current").boundingBox();
  expect(text!.x).toBeGreaterThanOrEqual(avatar!.x + avatar!.width);
  expect(text!.x + text!.width).toBeLessThanOrEqual(check!.x);
  expect(await menu.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `${EVIDENCE}/account-email-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Hesap menüsü", exact: true })).toBeFocused();
});
async function audit(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {})),
    );
  });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  writeFileSync(`${EVIDENCE}/axe-raw-${test.info().project.name}.json`, JSON.stringify(result, null, 2));
  const reviewed = [];
  for (const item of result.incomplete) {
    // axe 4.14 yerel üst katman sınırını kapatmadan, ölçerek inceliyoruz.
    expect(item.id).toBe("color-contrast");
    for (const node of item.nodes) {
      expect(node.any.some(check => check.data?.messageKey === "elmPartiallyObscuring")).toBe(true);
      expect(node.target.length).toBe(1);
      const selector = node.target[0];
      expect([".surface-body > .muted", ".form-error > p"]).toContain(selector);
      const measurement = await page.locator(`dialog[open] ${selector}`).evaluate(element => {
        const text = getComputedStyle(element);
        const background = getComputedStyle(element.parentElement!);
        const channel = (value: number) =>
          value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
        const luminance = (color: string) => {
          const numbers = color.match(/[\d.]+/g)!.map(Number);
          return 0.2126 * channel(numbers[0]) + 0.7152 * channel(numbers[1]) + 0.0722 * channel(numbers[2]);
        };
        const front = luminance(text.color);
        const back = luminance(background.backgroundColor);
        const range = document.createRange();
        range.selectNodeContents(element);
        const samples = [...range.getClientRects()].flatMap(rect =>
          [rect.left + 2, rect.left + rect.width / 2, rect.right - 2].map(x => {
            const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
            return hit === element || (hit !== null && element.contains(hit));
          }),
        );
        return {
          foreground: text.color,
          background: background.backgroundColor,
          backgroundImage: background.backgroundImage,
          opaque:
            background.opacity === "1" &&
            [
              "rgb(255, 255, 255)",
              "rgb(242, 242, 242)",
              "rgb(253, 236, 238)",
              "rgb(255, 244, 229)",
              "rgb(235, 244, 255)",
            ].includes(background.backgroundColor),
          ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
          samples,
          nativeModal: element.closest("dialog")!.matches(":modal"),
        };
      });
      expect(measurement.nativeModal).toBe(true);
      expect(measurement.opaque).toBe(true);
      expect(measurement.backgroundImage).toBe("none");
      expect(measurement.ratio).toBeGreaterThanOrEqual(4.5);
      expect(measurement.samples.length).toBeGreaterThan(0);
      expect(measurement.samples.every(Boolean)).toBe(true);
      reviewed.push({
        target: node.target,
        reason:
          "Native modal top-layer overlap measurement reviewed with actual colors and text-line hit tests; visual review also required.",
        measurement,
      });
    }
  }
  const key = createHash("sha256").update(test.info().titlePath.join("/")).digest("hex").slice(0, 12);
  writeFileSync(
    `${EVIDENCE}/axe-shell-${test.info().project.name}-${key}-${++auditSequence}.json`,
    JSON.stringify({ violations: result.violations, incomplete: result.incomplete, reviewed }, null, 2),
  );
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}

test(
  "real owner shell navigation, mobile menu and no fake feature success",
  { tag: "@smoke" },
  async ({ page }, info) => {
    const faults: string[] = [];
    const commands: string[] = [];
    trackFaults(page, faults);
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (
        path.startsWith("/api/") &&
        !["/api/hubs/planner", "/api/hubs/planner/negotiate"].includes(path) &&
        request.method() !== "GET"
      )
        commands.push(path);
    });
    const initial = await page.goto("/planning");
    expect(await initial!.text()).toContain('name="robots" content="noindex, nofollow"');
    await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
    const mobile = info.project.name === "mobile-chromium";
    const navigation = page.getByRole("navigation", { name: mobile ? "Mobil gezinme" : "Çalışma alanı", exact: true });
    // Sunucu kabuğu başlığı zaten gösterir. Gerçek görünür menü çalışma alanı çizilince gelir.
    await expect(navigation.getByRole("link", { name: "Gün Planlama", exact: true })).toBeVisible();
    if (mobile)
      expect((await navigation.getByRole("link").count()) + (await navigation.getByRole("button").count())).toBe(5);
    await expect(navigation.getByRole("link", { name: "Gün Planlama", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await navigation.getByRole("link", { name: "Görevler", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Görevler", exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Görevlerde ara", exact: true })).toBeVisible();
    if (mobile) {
      const more = navigation.getByRole("button", { name: "Daha fazla" });
      await more.click();
      await expect(page.getByRole("dialog", { name: "Daha fazla" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Daha fazla", exact: true })).toBeFocused();
      await audit(page);
      await expect(page.getByRole("button", { name: "Daha fazla panelini kapat", exact: true })).toBeInViewport();
      await page.screenshot({ path: `${EVIDENCE}/shell-menu-${info.project.name}.png` });
      await page.goBack();
      await expect(more).toBeFocused();
      await more.click();
      await expect(page.getByRole("heading", { name: "Daha fazla", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
      await more.click();
      await page.getByRole("button", { name: "Daha fazla panelini kapat", exact: true }).click();
      await expect(more).toBeFocused();
      await more.click();
    }
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Ayarlar" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]settings=(profile|menu)$/);
    await audit(page);
    expect(faults).toEqual([]);
    expect(commands).toEqual([]);
  },
);

test("URL panel back, Escape, focus, resize and direct-link fallback", async ({ page }, info) => {
  await page.goto("/internal-checks/shell?date=2026-10-17&q=koru&page=2");
  const open = page.getByRole("button", { name: "Ayrıntı örneğini aç" });
  await expect(open).toBeVisible();
  const beforeScroll = await page.evaluate(() => {
    window.scrollTo(0, 100);
    return window.scrollY;
  });
  await open.click();
  await expect(page).toHaveURL(/page=2&taskId=/);
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeFocused();
  const modal = info.project.name === "mobile-chromium";
  const panel = page.getByRole(modal ? "dialog" : "complementary", { name: "Görev ayrıntısı", exact: true });
  await expect(panel).toBeVisible();
  await audit(page);
  await page.screenshot({ path: `${EVIDENCE}/shell-panel-${info.project.name}.png` });
  if (modal) {
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press("Tab");
      expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
  }
  await page.goBack();
  await expect(open).toBeFocused();
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - beforeScroll))
    .toBeLessThanOrEqual(2);
  await expect(page).toHaveURL(/date=2026-10-17&q=koru&page=2$/);
  await open.click();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  if (info.project.name === "chromium") {
    await open.click();
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.getByRole("dialog", { name: "Görev ayrıntısı" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("complementary", { name: "Görev ayrıntısı" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
  }
  await page.goto("/tasks?date=2026-10-17&taskId=invalid");
  await expect(
    page.getByText("Görev bağlantısı geçersiz. Paneli kapatıp görev listesinden tekrar açabilirsin.", { exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat" }).click();
  await expect(page).toHaveURL(/\/tasks\?date=2026-10-17$/);
  writeFileSync(
    `${EVIDENCE}/focus-return-${info.project.name}.json`,
    JSON.stringify(
      await page.evaluate(() => ({
        active: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100) },
        headings: [...document.querySelectorAll("#main h1")].map(element => ({
          text: element.textContent,
          visible: element.getClientRects().length > 0,
        })),
        surfaces: [...document.querySelectorAll("[data-workspace-surface]")].map(element => ({
          tag: element.tagName,
          visible: element.getClientRects().length > 0,
        })),
      })),
      null,
      2,
    ),
  );
  await expect(page.getByRole("heading", { name: "Görevler", exact: true })).toBeFocused();
  await page.context().setOffline(false);
  await page.goto("/tasks?taskId=00000000-0000-0000-0000-000000000001&menu=more");
  await expect(page.getByRole("dialog", { name: "Daha fazla", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tasks$/);
});

test("responsive long, loading, empty and error surfaces remain reachable", async ({ page }, info) => {
  const widths =
    info.project.name === "chromium" ? [320, 390, 768, 1199, 1440, 1920] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/internal-checks/shell?state=long");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/shell-long-${info.project.name}-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Son satır denetimi" }).scrollIntoViewIfNeeded();
    const bottom = await page.getByRole("button", { name: "Son satır denetimi" }).boundingBox();
    const nav =
      width < 768 ? await page.getByRole("navigation", { name: "Mobil gezinme", exact: true }).boundingBox() : null;
    const player = await page.getByRole("region", { name: "Çalışma denetimleri" }).boundingBox();
    expect(
      bottom !== null &&
        player !== null &&
        bottom.y + bottom.height <= player.y &&
        (nav === null || player.y + player.height <= nav.y),
    ).toBe(true);
  }
  await page.goto("/internal-checks/shell?state=loading");
  await expect(page.getByRole("status").filter({ hasText: "Test içeriği" })).toHaveText("Test içeriği yükleniyor…");
  await audit(page);
  await page.goto("/internal-checks/shell?state=error");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Test kaynağı yüklenemedi");
  await audit(page);
  await page.screenshot({ path: `${EVIDENCE}/shell-error-${info.project.name}.png`, fullPage: true });
  await page.goto("/planning");
  await audit(page);
  await page.screenshot({ path: `${EVIDENCE}/shell-empty-${info.project.name}.png`, fullPage: true });
});

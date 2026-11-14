import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import type { Category, Note } from "../../src/features/notes/model";
import { switchAccount } from "./helpers/session";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
test.describe.configure({ mode: "default" });
let fx: FocusFixture, foreign: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const requests = new WeakMap<Page, Set<Request>>();
async function visit(page: Page, url: string) {
  await page.goto(url, test.info().project.name === "firefox" ? { waitUntil: "domcontentloaded" } : undefined);
}
const tag = () => randomUUID().slice(-8);
const composer = (p: Page, name = "Yeni not") => p.getByRole("form", { name, exact: true });
const card = (p: Page, text: string) => p.getByRole("article", { name: text, exact: true });
const views = (p: Page) => p.getByRole("navigation", { name: "Not görünümü", exact: true });

test("note detail keeps its menu beside dates and gives the remaining height to long linked text", async ({ page }) => {
  const task = await fx.task();
  const category = await createCategory(`Yerleşim ${tag()}`);
  for (const categoryId of [null, category.id]) {
    const title = `Sıkı not başlığı ${tag()}`;
    await createNote("Uzun not içeriği. ".repeat(500), { title, display: "Detailed", taskId: task.id, categoryId });
    await visit(page, "/notes");
    await card(page, title).getByRole("button", { name: title, exact: true }).click();
    const win = page.getByRole("dialog", { name: title, exact: true });
    await expect(win).toBeVisible();
    const layout = await win.evaluate(d => {
      const dates = d.querySelector(".note-detail-dates")!.getBoundingClientRect();
      const menu = d.querySelector(".note-detail-head .menu-trigger")!.getBoundingClientRect();
      const link = d.querySelector(".note-task-link")!.getBoundingClientRect();
      const text = d.querySelector<HTMLElement>(".note-detail-scroll")!;
      return {
        sameRow: dates.top < menu.bottom && menu.top < dates.bottom,
        gap: text.getBoundingClientRect().top - link.bottom,
        windowScrolls: d.scrollHeight > d.clientHeight + 1,
        textScrolls: text.scrollHeight > text.clientHeight + 1,
      };
    });
    expect(layout.sameRow).toBe(true);
    expect(layout.gap).toBeLessThanOrEqual(12);
    expect(layout.windowScrolls).toBe(false);
    expect(layout.textScrolls).toBe(true);
    await win.getByRole("button", { name: "Not işlemleri", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Düzenle", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
});
async function act(p: Page, label: string, item: string) {
  await card(p, label)
    .getByRole("button", { name: `Not işlemleri: ${label.slice(0, 40)}`, exact: true })
    .click();
  await p.getByRole("menuitem", { name: item, exact: true }).click();
}
async function createNote(text: string, fields: object = {}): Promise<Note> {
  const r = await fx.api.post("/api/notes", { data: { kind: "General", text, ...fields } });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function createCategory(name: string, fields: object = {}): Promise<Category> {
  const r = await fx.api.post("/api/note-categories", {
    data: { name, color: "Teal", showInBar: true, pinInAll: false, ...fields },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function find(id: string) {
  const r = await fx.api.get("/api/notes?limit=100");
  expect(r.status()).toBe(200);
  return ((await r.json()).items as Note[]).find(n => n.id === id);
}
async function notesNamed(text: string) {
  const r = await fx.api.get(`/api/notes?limit=100&search=${encodeURIComponent(text)}`);
  return (await r.json()).items as Note[];
}
async function openComposer(page: Page) {
  await page.getByRole("button", { name: "Not ekle", exact: true }).first().click();
  const f = composer(page);
  await expect(f).toBeVisible();
  return f;
}
async function pickCategory(f: Locator, page: Page, current: string, name: string) {
  await f.getByRole("button", { name: `Kategori: ${current}`, exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
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
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  await fx.login(page);
  const active = new Set<Request>();
  requests.set(page, active);
  page.on("request", r => {
    if (["fetch", "xhr"].includes(r.resourceType())) active.add(r);
  });
  page.on("requestfinished", r => active.delete(r));
  page.on("requestfailed", r => active.delete(r));
});
test.afterEach(async ({ page }, info) => {
  await fx.clean();
  if (info.project.name === "firefox") {
    await page.unrouteAll({ behavior: "wait" });
    await expect
      .poll(() => requests.get(page)?.size ?? 0, { message: "application API requests finish before Firefox teardown" })
      .toBe(0);
    await page.close({ runBeforeUnload: false });
  }
  expect(faults.get(page)).toEqual([]);
});

test("creates short, detailed and toggle notes; text survives switching and Ctrl+Enter saves", async ({
  page,
}, info) => {
  const t = tag();
  const task = await fx.task();
  const study = await createCategory(`Ders ${t}`);
  await visit(page, "/notes");
  const f = await openComposer(page);
  await expect(f.getByRole("button", { name: "Tarih", exact: true })).toHaveCount(0);
  await expect(f.getByRole("switch", { name: "Toggle olarak göster" })).toHaveCount(0);
  const short = f.getByRole("textbox", { name: "Not", exact: true });
  await expect(short).toBeFocused();
  await short.fill(`Önce kısa yazdım ${t}`);
  await f.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await expect(f.getByRole("textbox", { name: "Açıklama", exact: true })).toHaveValue(`Önce kısa yazdım ${t}`);
  await expect(f.getByRole("switch", { name: "Toggle olarak göster" })).toHaveAttribute("aria-checked", "false");
  await f.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await expect(short).toHaveValue(`Önce kısa yazdım ${t}`);
  await short.press("Control+Enter");
  await expect(f).toHaveCount(0);
  await expect(card(page, `Önce kısa yazdım ${t}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Not ekle", exact: true }).first()).toBeFocused();

  const d = await openComposer(page);
  await pickCategory(d, page, "Kategorisiz", study.name);
  await d.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await d.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(d.getByText("Ayrıntılı not için başlık yaz.")).toBeVisible();
  await expect(d.getByRole("alert")).toHaveCount(0);
  await expect(d.getByRole("textbox", { name: "Başlık", exact: true })).toBeFocused();
  await d.getByRole("textbox", { name: "Başlık", exact: true }).fill(`Hipotez testleri ${t}`);
  await d.getByRole("textbox", { name: "Açıklama", exact: true }).fill("H0: fark yok.\nH1: fark var.");
  await d.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(d).toHaveCount(0);

  const g = await openComposer(page);
  await g.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await g.getByRole("switch", { name: "Toggle olarak göster" }).click();
  await expect(g.getByText("oka basınca içerik aynı yerde açılır")).toHaveCount(0);
  await g.getByRole("textbox", { name: "Başlık", exact: true }).fill(`Kontrol listesi ${t}`);
  await g.getByRole("textbox", { name: "Açıklama", exact: true }).fill("Adaptör\nSu şişesi");
  await g.getByRole("button", { name: "Göreve bağla", exact: true }).click();
  const pick = page.getByRole("dialog", { name: "Göreve bağla", exact: true });
  await pick.getByRole("searchbox", { name: "Görev ara" }).fill(task.title);
  await pick.getByRole("button", { name: task.title, exact: true }).click();
  await expect(g.getByRole("button", { name: task.title, exact: true })).toBeFocused();
  await expect(g.getByRole("button", { name: "Tarih", exact: true })).toHaveCount(0);
  await expect(g.locator('input[type="date"], input[type="time"]')).toHaveCount(0);
  await g.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(g).toHaveCount(0);

  const [shortNote] = await notesNamed(`Önce kısa yazdım ${t}`);
  expect(shortNote).toMatchObject({ kind: "General", display: "Short", title: null, categoryId: null });
  const [detailed] = await notesNamed(`Hipotez testleri ${t}`);
  expect(detailed).toMatchObject({ display: "Detailed", categoryId: study.id, text: "H0: fark yok.\nH1: fark var." });
  const [toggle] = await notesNamed(`Kontrol listesi ${t}`);
  expect(toggle).toMatchObject({ display: "Toggle", taskId: task.id, taskTitle: task.title });
  expect(toggle.dueAt).toBeNull();

  const toggleCard = card(page, `Kontrol listesi ${t}`);
  const expand = toggleCard.getByRole("button", { name: `Kontrol listesi ${t}`, exact: true });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(toggleCard.getByText("Su şişesi")).toBeHidden();
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(toggleCard.getByText(/Su şişesi/)).toBeVisible();
  await expect(card(page, `Hipotez testleri ${t}`).getByText("H0: fark yok.")).toHaveCount(0);
  await auditTask(page, "library", "notes");
  await page.screenshot({ path: `${EVIDENCE}/notes-library-${info.project.name}.png`, fullPage: true });
});

test("detail window shows the whole note, edits in place and returns focus; NextStep never lists", async ({
  page,
}, info) => {
  const t = tag();
  const task = await fx.task();
  const note = await createNote("Uzun ders notu\nİkinci satır", { title: `Ayrıntı ${t}`, display: "Detailed" });
  const step = await createNote(`Sonraki küçük adım ${t}`, { kind: "NextStep", taskId: task.id });
  const categories = (await (await fx.api.get("/api/note-categories")).json()).items as Category[];
  const warning = categories.find(c => c.name === "Uyarı" && !c.removedAt)!;
  const alert = await createNote(`Kira elle ödenir ${t}`, { categoryId: warning.id });
  await visit(page, "/notes");
  const pinned = page.getByRole("region", { name: "Uyarı", exact: true });
  await expect(pinned.getByRole("article", { name: alert.text })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Diğer notlar", exact: true }).getByRole("article", { name: alert.text }),
  ).toHaveCount(0);
  await expect(page.getByText(step.text)).toHaveCount(0);
  const open = card(page, note.title!).getByRole("button", { name: note.title!, exact: true });
  await open.click();
  const win = page.getByRole("dialog", { name: note.title!, exact: true });
  await expect(win.getByText("İkinci satır")).toBeVisible();
  await expect(win.getByText(/Ayrıntılı not/)).toHaveCount(0);
  await expect(win.locator(".note-detail-dates")).toContainText("Oluşturuldu:");
  await expect(win.locator(".note-detail-dates")).toContainText("Güncellendi:");
  await auditTask(page, "detail", "notes");
  await page.screenshot({ path: `${EVIDENCE}/notes-detail-${info.project.name}.png` });
  await expect(win.getByRole("button", { name: /^(Düzenle|Kapat)$/ })).toHaveCount(0);
  await win.getByRole("button", { name: "Not işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const edit = composer(page, "Notu düzenle");
  await edit.getByRole("textbox", { name: "Başlık", exact: true }).fill(`Ayrıntı güncel ${t}`);
  await edit.getByRole("button", { name: "Kaydet", exact: true }).click();
  const updated = page.getByRole("dialog", { name: `Ayrıntı güncel ${t}`, exact: true });
  await expect(updated.getByText("İkinci satır")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(updated).toHaveCount(0);
  await expect(card(page, `Ayrıntı güncel ${t}`)).toBeVisible();
  expect((await find(note.id))!.title).toBe(`Ayrıntı güncel ${t}`);
  await visit(page, "/notes?view=tasks");
  await expect(page.getByText(step.text)).toHaveCount(0);
});

test("Görev notları group by task; category bar, Diğer menu and search live in the URL", async ({ page }) => {
  const t = tag();
  const a = await fx.task(),
    b = await fx.task();
  await createNote(`A notu ${t}`, { taskId: a.id });
  await createNote(`B notu ${t}`, { taskId: b.id });
  await createNote(`Bağsız ${t}`);
  const shown = await createCategory(`Ev ${t}`, { color: "Purple" });
  const hidden = await createCategory(`Arşiv ${t}`, { showInBar: false });
  await createNote(`Ev notu ${t}`, { categoryId: shown.id });
  await createNote(`Arşiv notu ${t}`, { categoryId: hidden.id });
  await visit(page, "/notes");
  await views(page).getByRole("link", { name: "Görev notları", exact: true }).click();
  await expect(page).toHaveURL(/view=tasks/);
  const tasks = page.getByRole("region", { name: "Görev notları", exact: true });
  await expect(tasks.getByRole("heading", { name: a.title })).toBeVisible();
  await expect(tasks.getByRole("heading", { name: b.title })).toBeVisible();
  await expect(tasks.getByRole("article", { name: `Bağsız ${t}` })).toHaveCount(0);
  await expect(views(page).getByRole("link", { name: `Arşiv ${t}` })).toHaveCount(0);
  await views(page)
    .getByRole("button", { name: /^Diğer kategoriler/ })
    .click();
  await page.getByRole("menuitem", { name: `Arşiv ${t}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=${hidden.id}`));
  await expect(
    page.getByRole("region", { name: `Arşiv ${t}` }).getByRole("article", { name: `Arşiv notu ${t}` }),
  ).toBeVisible();
  await views(page)
    .getByRole("link", { name: `Ev ${t}`, exact: true })
    .click();
  await expect(views(page).getByRole("link", { name: `Ev ${t}`, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(card(page, `Ev notu ${t}`)).toBeVisible();
  await expect(card(page, `Arşiv notu ${t}`)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`view=${hidden.id}`));
  await views(page).getByRole("link", { name: "Tümü", exact: true }).click();
  await page.getByRole("searchbox", { name: "Notlarda ara" }).fill(`EV NOTU ${t}`);
  await expect(page).toHaveURL(/q=EV/);
  await expect(card(page, `Ev notu ${t}`)).toBeVisible();
  await expect(card(page, `Bağsız ${t}`)).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Notlarda ara" }).fill(`yok-${t}`);
  await expect(page.getByText(`“yok-${t}” için not bulunamadı.`)).toBeVisible();
});

test("Kartlar/Liste is saved per view and survives a reload", async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 640, "Telefonda görünüm seçimi yok.");
  const c = await createCategory(`Görünüm ${tag()}`);
  await visit(page, "/notes");
  const mode = page.getByRole("group", { name: "Görünüm", exact: true });
  await expect(mode.getByRole("button", { name: "Kartlar" })).toHaveAttribute("aria-pressed", "true");
  await mode.getByRole("button", { name: "Liste" }).click();
  await expect(mode.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true");
  await visit(page, `/notes?view=${c.id}`);
  await expect(mode.getByRole("button", { name: "Kartlar" })).toHaveAttribute("aria-pressed", "true");
  await mode.getByRole("button", { name: "Liste" }).click();
  await expect(mode.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(mode.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true");
  const list = (await (await fx.api.get("/api/note-categories")).json()) as { allViewMode: string; items: Category[] };
  expect(list.allViewMode).toBe("List");
  expect(list.items.find(x => x.id === c.id)!.viewMode).toBe("List");
  await fx.api.put("/api/notes/view-modes", { data: { allViewMode: "Cards", taskViewMode: "List" } });
});

test("delete asks nothing and Geri al brings the same note back", async ({ page }) => {
  const note = await createNote(`Silinecek ${tag()}`);
  await visit(page, "/notes");
  await act(page, note.text, "Sil");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page, note.text)).toHaveCount(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(card(page, note.text)).toBeVisible();
  const back = (await find(note.id))!;
  expect(back.deletedAt).toBeNull();
  expect(back.text).toBe(note.text);
});

test("409 keeps the draft until an explicit read and rebase; the untouched date follows the server", async ({
  page,
}) => {
  const n = await createNote(`Eski ${tag()}`, { dueAt: "2031-10-22T09:00:00Z" });
  await visit(page, "/notes");
  await act(page, n.text, "Düzenle");
  const f = composer(page, "Notu düzenle");
  await f.getByRole("textbox", { name: "Not", exact: true }).fill("Yerel taslak");
  const r = await fx.api.put(`/api/notes/${n.id}`, {
    data: { version: n.version, text: "Başka sekmenin metni", dueAt: "2031-11-22T09:00:00Z" },
  });
  expect(r.status()).toBe(200);
  const remote = (await r.json()) as Note;
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("başka bir sekmede");
  await expect(f.getByRole("textbox", { name: "Not", exact: true })).toHaveValue("Yerel taslak");
  await expect(f.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await f.getByRole("button", { name: "Güncel notları kontrol et" }).click();
  await expect(f.getByRole("region", { name: "Sunucudaki not" })).toContainText("Başka sekmenin metni");
  await f.getByRole("button", { name: "Taslağımı güncel nota göre hazırla" }).click();
  await expect(f.getByRole("textbox", { name: "Not", exact: true })).toHaveValue("Yerel taslak");
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f).toHaveCount(0);
  const after = (await find(n.id))!;
  expect(after.text).toBe("Yerel taslak");
  expect(after.dueAt).toBe(remote.dueAt);
});

test("an unknown create is never resent; reading unblocks a new explicit save", async ({ page }) => {
  await visit(page, "/notes");
  const f = await openComposer(page);
  const text = `Kayıp create ${tag()}`;
  await f.getByRole("textbox", { name: "Not", exact: true }).fill(text);
  let writes = 0;
  await page.route("**/api/notes", async route => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    expect(route.request().headers()["idempotency-key"]).toBeUndefined();
    await route.fetch();
    await route.abort("failed");
  });
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("sonucu alınamadı");
  await expect(f.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(f).toBeVisible();
  await f.getByRole("button", { name: "Güncel notları kontrol et" }).click();
  await expect(f.getByRole("status")).toContainText("Not listede görünüyorsa");
  await expect(card(page, text)).toBeVisible();
  page.once("dialog", d => d.accept());
  await f.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.unroute("**/api/notes");
  expect(writes).toBe(1);
  expect(await notesNamed(text)).toHaveLength(1);
});

test("conversion saves range, effort and urgency; a lost response retries the same key and body once", async ({
  page,
}) => {
  const n = await createNote(`Dönüşüm ${tag()}\n<img src=x onerror=alert(1)>`, {
    dueAt: "2031-10-22T09:00:00.123456Z",
  });
  const pool = await (
    await fx.api.post("/api/pools", { data: { name: `Not havuzu ${tag()}`, description: null } })
  ).json();
  await visit(page, "/notes");
  await expect(card(page, n.text).locator("img")).toHaveCount(0);
  await act(page, n.text, "Göreve dönüştür");
  const f = page.getByRole("dialog", { name: "Notu göreve dönüştür", exact: true });
  await f.getByLabel("Görevin havuzu").selectOption(pool.id);
  const title = `Tek görev ${tag()}`;
  await f.getByLabel("Yeni görev başlığı").fill(title);
  await expect(f.locator('input[type="datetime-local"]')).toHaveCount(0);
  await f.getByLabel("Başlangıç tarihi", { exact: true }).fill("2031-10-23");
  await f.getByLabel("Bitiş tarihi", { exact: true }).fill("2031-10-25");
  await f.getByLabel("Efor (isteğe bağlı)").selectOption("High");
  await f.getByLabel("Aciliyet (isteğe bağlı)").selectOption("Urgent");
  await expect(f).toHaveJSProperty("scrollWidth", await f.evaluate(el => el.clientWidth));
  await test.info().attach("note-conversion-options", { body: await f.screenshot(), contentType: "image/png" });
  let lose = true;
  const keys: string[] = [],
    bodies: string[] = [];
  await page.route(`**/api/notes/${n.id}/convert`, async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await f.getByRole("button", { name: "Göreve dönüştür", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("sonucu alınamadı");
  await f.getByRole("button", { name: "Aynı dönüşümü güvenle yeniden dene" }).click();
  await expect(f.getByRole("status")).toHaveText("Göreve dönüşüm kaydedildi.");
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(new Set(bodies).size).toBe(1);
  expect(JSON.parse(bodies[0])).toMatchObject({
    plannedFrom: "2031-10-23",
    plannedTo: "2031-10-25",
    energyDemand: "High",
    priority: "Urgent",
    inheritNoteDueAt: false,
  });
  await f.getByRole("button", { name: "Kapat", exact: true }).last().click();
  const after = (await find(n.id))!;
  const task = await (await fx.api.get(`/api/tasks/${after.convertedTaskId}`)).json();
  expect(task.poolId).toBe(pool.id);
  expect(task.deadlineAt).toBeNull();
  expect(after.dueAt).toBe(n.dueAt);
  expect(task).toMatchObject({
    plannedFrom: "2031-10-23",
    plannedTo: "2031-10-25",
    energyDemand: "High",
    priority: "Urgent",
  });
  expect(
    (await (await fx.api.get(`/api/tasks?search=${encodeURIComponent(title)}&limit=100`)).json()).items,
  ).toHaveLength(1);
});

test("conversion allows every planning option to stay empty without copying the note date", async ({ page }) => {
  const n = await createNote(`Opsiyonel dönüşüm ${tag()}`, { dueAt: "2031-10-22T09:00:00Z" });
  await visit(page, "/notes");
  await act(page, n.text, "Göreve dönüştür");
  const f = page.getByRole("dialog", { name: "Notu göreve dönüştür", exact: true });
  for (const label of ["Başlangıç tarihi", "Bitiş tarihi", "Efor (isteğe bağlı)", "Aciliyet (isteğe bağlı)"]) {
    await expect(f.getByLabel(label)).toHaveValue("");
    await expect(f.getByLabel(label)).not.toHaveAttribute("required");
  }
  await f.getByRole("button", { name: "Göreve dönüştür", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Göreve dönüşüm kaydedildi.");
  const after = (await find(n.id))!;
  const task = await (await fx.api.get(`/api/tasks/${after.convertedTaskId}`)).json();
  expect(task).toMatchObject({
    plannedFrom: null,
    plannedTo: null,
    deadlineAt: null,
    energyDemand: null,
    priority: "Normal",
  });
  expect(after.dueAt).toBe(n.dueAt);
});

test("conversion normalizes a single selected date to a one-day range", async ({ page }) => {
  // Yalnız kısa notlar göreve dönüştürülür.
  const n = await createNote(`Tek gün dönüşüm ${tag()}`);
  await visit(page, "/notes");
  await act(page, n.text, "Göreve dönüştür");
  const f = page.getByRole("dialog", { name: "Notu göreve dönüştür", exact: true });
  await f.getByLabel("Bitiş tarihi", { exact: true }).fill("2031-10-24");
  await f.getByRole("button", { name: "Göreve dönüştür", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Göreve dönüşüm kaydedildi.");
  const after = (await find(n.id))!;
  const task = await (await fx.api.get(`/api/tasks/${after.convertedTaskId}`)).json();
  expect(task).toMatchObject({ plannedFrom: "2031-10-24", plannedTo: "2031-10-24", deadlineAt: null });
});

test("lists page 25 at a time; an empty category offers to add there with the category chosen", async ({ page }) => {
  const t = tag();
  const full = await createCategory(`Sayfalı ${t}`);
  const empty = await createCategory(`Boş ${t}`);
  for (let i = 0; i < 26; i++) await createNote(`Sayfalı ${i} ${t}`, { categoryId: full.id });
  const reads: number[] = [];
  page.on("request", r => {
    const u = new URL(r.url());
    if (r.method() === "GET" && u.pathname === "/api/notes") reads.push(Number(u.searchParams.get("limit")));
  });
  await visit(page, `/notes?view=${full.id}`);
  const region = page.getByRole("region", { name: `Sayfalı ${t}` });
  await expect(region.getByRole("article")).toHaveCount(25);
  await region.getByRole("button", { name: /^Daha fazla göster/ }).click();
  await expect(region.getByRole("article")).toHaveCount(26);
  await expect(region.getByRole("button", { name: /^Daha fazla göster/ })).toHaveCount(0);
  expect(reads.every(n => n === 25)).toBe(true);
  await visit(page, `/notes?view=${empty.id}`);
  await expect(page.getByText("Bu kategoride henüz not yok.")).toBeVisible();
  await page.getByRole("button", { name: "Bu kategoriye not ekle", exact: true }).click();
  await expect(composer(page).getByRole("button", { name: `Kategori: Boş ${t}`, exact: true })).toBeVisible();
});

test("offline writes are not queued; owner isolation and account switch clear the previous owner's notes", async ({
  page,
}) => {
  const own = await createNote(`Hesabım ${tag()}`);
  const otherR = await foreign.api.post("/api/notes", { data: { kind: "General", text: `Diğer hesap ${tag()}` } });
  const other = await otherR.json();
  expect(
    (await fx.api.put(`/api/notes/${other.id}`, { data: { version: other.version, text: "x", dueAt: null } })).status(),
  ).toBe(404);
  await visit(page, "/notes");
  await expect(card(page, other.text)).toHaveCount(0);
  const f = await openComposer(page);
  await f.getByRole("textbox", { name: "Not", exact: true }).fill("Çevrimdışı taslak");
  let posts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/notes") posts++;
  });
  await page.context().setOffline(true);
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("Bağlantı yok");
  await page.context().setOffline(false);
  page.once("dialog", d => d.accept());
  await f.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(posts).toBe(0);
  const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/me" && r.status() === 200);
  await switchAccount(page, foreign.token);
  await bootstrap;
  await expect(card(page, other.text)).toBeVisible();
  await expect(card(page, own.text)).toHaveCount(0);
  expect(posts).toBe(0);
});

test("P4 categories panel adds, renames, recolours, orders, toggles and removes with undo and restore", async ({
  page,
}, info) => {
  const t = tag();
  await visit(page, "/notes");
  await page.getByRole("button", { name: "Kategoriler", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Kategoriler", exact: true });
  await expect(panel.getByText("Görev notları", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /yukarı taşı|aşağı taşı/ })).toHaveCount(0);
  await panel.getByRole("textbox", { name: "Yeni kategori" }).fill(`Okul ${t}`);
  await panel.getByRole("radio", { name: "Mor" }).check();
  await panel.getByRole("button", { name: "Ekle", exact: true }).click();
  const name = panel.getByRole("textbox", { name: `Okul ${t} kategorisinin adı` });
  await expect(name).toBeVisible();
  let list = (await (await fx.api.get("/api/note-categories")).json()).items as Category[];
  const created = list.find(c => c.name === `Okul ${t}`)!;
  expect(created.color).toBe("Purple");
  await name.fill(`Okul işleri ${t}`);
  await name.press("Enter");
  await expect(panel.getByRole("textbox", { name: `Okul işleri ${t} kategorisinin adı` })).toBeVisible();
  await panel.getByRole("button", { name: new RegExp(`^Okul işleri ${t} rengini değiştir`) }).click();
  await page.getByRole("menuitem", { name: "Yeşil", exact: true }).click();
  await panel.getByRole("switch", { name: `Okul işleri ${t}: Tümü'nde üstte sabitle` }).click();
  await expect(panel.getByRole("switch", { name: `Okul işleri ${t}: Tümü'nde üstte sabitle` })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await panel.getByRole("switch", { name: `Okul işleri ${t}: çubukta göster` }).click();
  await expect(panel.getByRole("switch", { name: `Okul işleri ${t}: çubukta göster` })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await panel.getByRole("button", { name: `Okul işleri ${t} sırasını değiştir` }).press("ArrowUp");
  await expect
    .poll(async () => {
      const items = ((await (await fx.api.get("/api/note-categories")).json()).items as Category[]).filter(
        c => !c.removedAt,
      );
      return items.findIndex(c => c.id === created.id) < items.length - 1;
    })
    .toBe(true);
  list = (await (await fx.api.get("/api/note-categories")).json()).items as Category[];
  expect(list.find(c => c.id === created.id)).toMatchObject({
    name: `Okul işleri ${t}`,
    color: "Green",
    pinInAll: true,
    showInBar: false,
  });
  await auditTask(page, "categories-panel", "notes");
  await page.screenshot({ path: `${EVIDENCE}/notes-categories-${info.project.name}.png` });
  const note = await createNote(`Okul notu ${t}`, { categoryId: created.id });
  await panel.getByRole("button", { name: `Okul işleri ${t} kategorisini kaldır` }).click();
  await expect(panel.getByRole("textbox", { name: `Okul işleri ${t} kategorisinin adı` })).toHaveCount(0);
  await expect(panel.getByRole("status")).toContainText(`“Okul işleri ${t}” kaldırıldı. Notları bu kategoride kalır.`);
  await panel.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: `Okul işleri ${t} kategorisinin adı` })).toBeVisible();
  await panel.getByRole("button", { name: `Okul işleri ${t} kategorisini kaldır` }).click();
  await panel.getByText(/^Kaldırılan kategoriler/).click();
  expect((await find(note.id))!.categoryId).toBe(created.id);
  await panel.getByRole("button", { name: "Geri getir", exact: true }).first().click();
  await expect(panel.getByRole("textbox", { name: `Okul işleri ${t} kategorisinin adı` })).toBeVisible();
  await panel.getByRole("button", { name: "Bitti", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: `Okul işleri ${t}`, exact: true }).getByRole("article", { name: note.text }),
  ).toBeVisible();
});

test("P4 task panel notes use the same card and composer with the task fixed; Sıkıştım steps stay out", async ({
  page,
}) => {
  const t = tag();
  const task = await fx.task();
  const existing = await createNote(`Var olan ${t}`, { taskId: task.id });
  const step = await createNote(`Küçük adım ${t}`, { kind: "NextStep", taskId: task.id });
  await visit(page, `/tasks?taskId=${task.id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await expect(page.getByText(existing.text)).toHaveCount(0);
  const toggle = page.getByRole("button", { name: /^Notlar/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(card(page, existing.text)).toBeVisible();
  await expect(page.getByText(step.text)).toHaveCount(0);
  await page.getByRole("button", { name: "Not ekle", exact: true }).click();
  const f = composer(page);
  await expect(f.getByRole("button", { name: task.title, exact: true })).toBeDisabled();
  await f.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await f.getByRole("textbox", { name: "Başlık", exact: true }).fill(`Panel ayrıntı ${t}`);
  await f.getByRole("textbox", { name: "Açıklama", exact: true }).fill("Paneldeki içerik");
  await page.route("**/api/notes", route =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 400,
          contentType: "application/problem+json",
          body: JSON.stringify({ status: 400, title: "Bad", code: "note_title_invalid" }),
        })
      : route.continue(),
  );
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("başlığı");
  await expect(f.getByRole("textbox", { name: "Açıklama", exact: true })).toHaveValue("Paneldeki içerik");
  await page.unroute("**/api/notes");
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f).toHaveCount(0);
  await expect(card(page, `Panel ayrıntı ${t}`)).toBeVisible();
  const [saved] = await notesNamed(`Panel ayrıntı ${t}`);
  expect(saved).toMatchObject({ kind: "General", display: "Detailed", taskId: task.id });
  await card(page, `Panel ayrıntı ${t}`)
    .getByRole("button", { name: `Panel ayrıntı ${t}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: `Panel ayrıntı ${t}`, exact: true }).getByText("Paneldeki içerik"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Bu görevin bütün notları", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\?view=tasks/);
  await expect(
    page.getByRole("region", { name: "Görev notları", exact: true }).getByRole("heading", { name: task.title }),
  ).toBeVisible();
  await expect(page.getByText(step.text)).toHaveCount(0);
});

test("P5 long titles, long lesson notes and many coloured categories stay readable in both themes", async ({
  page,
}, info) => {
  const t = tag();
  const palette = ["Gray", "Blue", "Teal", "Green", "Red", "Pink", "Purple"];
  const made: Category[] = [];
  for (let i = 0; i < 15; i++)
    made.push(
      await createCategory(`Renk ${i + 1} ${t}`, { color: palette[i % 7], showInBar: i < 6, pinInAll: i === 1 }),
    );
  const longTitle = `${"Çok uzun bir ders notu başlığı ".repeat(6)}${t}`.slice(0, 200);
  const lesson = await createNote(`${"Paragraf: hipotez testi, p değeri ve güven aralığı. ".repeat(60)}\nSon satır`, {
    title: longTitle,
    display: "Detailed",
    categoryId: made[2].id,
  });
  for (const [i, c] of made.slice(0, 8).entries())
    await createNote(`${c.name} için kısa not ${"uzun kelime".repeat(i)}`, { categoryId: c.id });
  await createNote(`Açılır ${t}`, { title: `Açılır ${t}`, display: "Toggle", categoryId: made[4].id });
  await visit(page, "/notes");
  await expect(card(page, longTitle)).toBeVisible();
  await card(page, `Açılır ${t}`)
    .getByRole("button", { name: `Açılır ${t}`, exact: true })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await auditTask(page, "long-light", "notes");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await auditTask(page, "long-dark", "notes", "dark");
  await page.screenshot({ path: `${EVIDENCE}/notes-long-dark-${info.project.name}.png`, fullPage: true });
  await openComposer(page);
  await composer(page).getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await auditTask(page, "composer-dark", "notes", "dark");
  await page.screenshot({ path: `${EVIDENCE}/notes-composer-dark-${info.project.name}.png` });
  page.once("dialog", d => d.accept());
  await composer(page).getByRole("button", { name: "Vazgeç", exact: true }).click();
  await card(page, longTitle).getByRole("button", { name: longTitle, exact: true }).click();
  const win = page.getByRole("dialog", { name: longTitle, exact: true });
  await expect(win.getByText("Son satır", { exact: false })).toBeAttached();
  await auditTask(page, "detail-dark", "notes", "dark");
  // Tek kaydırma çubuğu var. Pencere sabit, yalnız not yazısı kayar.
  const scrolls = await win.evaluate(d => ({
    window: d.scrollHeight > d.clientHeight + 1,
    text: (() => {
      const t = d.querySelector<HTMLElement>(".note-detail-scroll")!;
      return t.scrollHeight > t.clientHeight + 1;
    })(),
  }));
  expect(scrolls).toEqual({ window: false, text: true });
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await page.getByRole("button", { name: "Kategoriler", exact: true }).click();
  await auditTask(page, "categories-dark", "notes", "dark");
  await page.screenshot({ path: `${EVIDENCE}/notes-categories-dark-${info.project.name}.png` });
  expect(lesson.text.length).toBeGreaterThan(2000);
});

test("R2 Escape closes an untouched composer and returns focus to Not ekle", async ({ page }) => {
  await visit(page, "/notes");
  const f = await openComposer(page);
  await page.keyboard.press("Escape");
  await expect(f).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Not ekle", exact: true }).first()).toBeFocused();
  const again = await openComposer(page);
  await again.getByRole("switch", { name: "Ayrıntılı not", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(again).toHaveCount(0);
});

test("R2 giving an uncategorised note a category shows that category's name at once", async ({ page }) => {
  const t = tag();
  const c = await createCategory(`Yeni yer ${t}`, { color: "Purple" });
  const note = await createNote(`Kategorisiz ${t}`);
  await visit(page, "/notes");
  await act(page, note.text, "Düzenle");
  const f = composer(page, "Notu düzenle");
  await pickCategory(f, page, "Kategorisiz", c.name);
  await expect(f.getByRole("button", { name: `Kategori: ${c.name}`, exact: true })).toBeVisible();
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  const win = page.getByRole("dialog", { name: "Not", exact: true });
  await expect(win.getByText(c.name, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card(page, note.text).getByText(c.name, { exact: true })).toBeVisible();
  await expect(card(page, note.text).getByText("Kategorisiz", { exact: true })).toHaveCount(0);
});

/** Menünün orta noktasındaki öğe kendisiyse gerçekten ulaşılabilir, kırpılmamış veya örtülmemiş demektir. */
async function onTop(item: Locator) {
  await item.scrollIntoViewIfNeeded();
  return item.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit)) && r.left >= 0 && r.right <= innerWidth;
  });
}
test("R2 menus open whole above their containers; detail and categories are centred; Uyarı is red", async ({
  page,
}, info) => {
  const t = tag();
  const c = await createCategory(`Taşma ${t}`, { color: "Pink" });
  const note = await createNote(`Menü notu ${t}`, { title: `Menü notu ${t}`, display: "Detailed" });
  const list = (await (await fx.api.get("/api/note-categories")).json()).items as Category[];
  expect(list.find(x => x.name === "Uyarı" && !x.removedAt)!.color).toBe("Red");
  await visit(page, "/notes");
  await expect(page.getByRole("region", { name: "Tüm notlar", exact: true })).toBeVisible();
  await card(page, note.title!)
    .getByRole("button", { name: `Not işlemleri: ${note.title}`, exact: true })
    .click();
  // Ayrıntılı notta "Göreve dönüştür" seçeneği yok.
  for (const name of ["Düzenle", "Sil"])
    expect(await onTop(page.getByRole("menuitem", { name, exact: true }))).toBe(true);
  await expect(page.getByRole("menuitem", { name: "Göreve dönüştür", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const win = page.getByRole("dialog", { name: note.title!, exact: true });
  const f = composer(page, "Notu düzenle");
  await f.getByRole("button", { name: "Kategori: Kategorisiz", exact: true }).click();
  expect(await onTop(page.getByRole("menuitem", { name: c.name, exact: true }))).toBe(true);
  await page.keyboard.press("Escape");
  const viewport = page.viewportSize()!;
  if (info.project.name === "chromium") {
    const box = (await win.boundingBox())!;
    expect(box.x).toBeGreaterThan(40);
    expect(viewport.width - (box.x + box.width)).toBeGreaterThan(40);
  }
  page.once("dialog", d => d.accept());
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await page.getByRole("button", { name: "Kategoriler", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Kategoriler", exact: true });
  await panel.getByRole("button", { name: new RegExp(`^Taşma ${t} rengini değiştir`) }).click();
  expect(await onTop(page.getByRole("menuitem", { name: "Kırmızı", exact: true }))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("radio")).toHaveCount(7);
  await expect(panel.locator(".note-palette-name")).toHaveCount(0);
  const swatches = await panel
    .getByRole("radio")
    .evaluateAll(els => els.map(el => el.closest("label")!.getBoundingClientRect().top));
  expect(new Set(swatches.map(y => Math.round(y))).size).toBe(1);
  if (info.project.name === "chromium") {
    const box = (await panel.boundingBox())!;
    expect(viewport.width - (box.x + box.width)).toBeGreaterThan(40);
  }
  await page.screenshot({ path: `${EVIDENCE}/notes-r2-categories-${info.project.name}.png` });
});

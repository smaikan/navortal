import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { signIn, signOutFromMenu } from "./helpers/session";
import { switchAccount } from "./helpers/session";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>(),
  base = "/reminders/preferences";
async function prepare(page: Page) {
  await page.goto(base);
  await page.getByText("Diğer cihazlar ve uygulama", { exact: true }).click();
  const launcher = page.getByRole("button", { name: "Güncellemeyi kontrol et", exact: true });
  await expect(launcher).toBeEnabled();
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Uygulama güncel.", { exact: true })).toBeVisible();
  // Kurulan worker sonraki soğuk belgede kontrol edilir. Kurulum açık kullanıcı işini zorla yenilemez.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function recipient(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const r = indexedDB.open("adhd-push-recipient-v1");
        r.onerror = () => reject(new Error("Storage unavailable"));
        r.onsuccess = () => {
          const tx = r.result.transaction("context");
          const q = tx.objectStore("context").get("owner");
          q.onsuccess = () => resolve(q.result ?? null);
          tx.oncomplete = () => r.result.close();
        };
      }),
  );
}
test.beforeAll(async () => {
  fx = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.clean();
  await fx.login(page);
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
});
test.afterEach(async ({ page }) => {
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("permission remains opt-in; manifest/public-only cache and offline navigation contain no private content", async ({
  page,
  context,
}, info) => {
  let prompts = 0;
  await page.exposeFunction("permissionRequested", () => {
    prompts++;
  });
  await page.addInitScript(() => {
    if ("Notification" in window)
      Notification.requestPermission = async () => {
        await (window as unknown as { permissionRequested: () => Promise<void> }).permissionRequested();
        return "denied";
      };
  });
  await prepare(page);
  expect(prompts).toBe(0);
  await expect(
    page.getByText("Cihaz bildirimleri şu an kullanılamıyor. Bildirimlerini sağ üstteki zilden görebilirsin.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true })).toBeDisabled();
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.lang).toBe("tr");
  expect(manifest.start_url).toBe("/planning");
  expect(manifest.display).toBe("standalone");
  const t = await fx.task();
  await page.goto(`/tasks?taskId=${t.id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(t.title);
  await page.goto(base);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(
      names.map(async name => ({
        name,
        paths: (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname).sort(),
      })),
    );
  });
  expect(cached).toEqual([
    {
      name: "adhd-public-v2",
      paths: [
        "/icon-192.png",
        "/icon-512.png",
        "/icon-maskable-512.png",
        "/icon.svg",
        "/manifest.webmanifest",
        "/offline.html",
      ],
    },
  ]);
  await auditTask(page, "device-panel", "pwa");
  await page.screenshot({ path: `${EVIDENCE}/devices-${info.project.name}.png` });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "device-panel-dark", "pwa", "dark");
  await page.screenshot({ path: `${EVIDENCE}/devices-dark-${info.project.name}.png` });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByText("Diğer cihazlar ve uygulama", { exact: true }).click();
  expect(
    await page.getByRole("button", { name: "Güncellemeyi kontrol et", exact: true }).evaluate(el =>
      getComputedStyle(el)
        .transitionDuration.split(",")
        .every(value => Number.parseFloat(value) === 0),
    ),
  ).toBe(true);
  let writes = 0;
  page.on("request", r => {
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method()) && new URL(r.url()).pathname.startsWith("/api/")) writes++;
  });
  await context.setOffline(true);
  await page.goto(`/tasks?taskId=${t.id}`);
  await expect(page.getByRole("heading", { name: "Bağlantı yok", exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(t.title);
  expect(await page.content()).not.toContain("accessToken");
  expect(writes).toBe(0);
  await context.setOffline(false);
});

test("real IndexedDB serializes two-tab receipts, bounds history and rejects stale owner/generation cleanup", async ({
  page,
  context,
}) => {
  await prepare(page);
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string;
  const second = await context.newPage();
  await second.goto(base);
  await expect(second.getByRole("heading", { name: "Uygulama ve cihaz bildirimleri", exact: true })).toBeVisible();
  const claim = (p: Page, key: string) =>
    p.evaluate(
      async ({ owner, key }) => {
        const url = "/recipient-store.js";
        const store: typeof import("../../public/recipient-store.js") = await import(url);
        return store.claimDelivery(owner, key);
      },
      { owner, key },
    );
  expect((await Promise.all([claim(page, "same-round"), claim(second, "same-round")])).sort()).toEqual([false, true]);
  expect(await claim(page, "next-round")).toBe(true);
  await page.reload();
  await expect.poll(() => recipient(page)).toBe(owner);
  expect(await claim(page, "same-round")).toBe(false);
  // Sonraki bölüm gerçek depolamanın hesap/generation işlemlerini sınar.
  // Yapay hesap eklemeden iki canlı köprü de kapanır;
  // normal hesap yazıları bu depolama örneğiyle yarışmasın.
  await Promise.all([page.goto("/"), second.goto("/")]);
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  await expect(second.locator(".workspace-shell")).toHaveCount(0);
  const result = await page.evaluate(
    async ({ owner, next, oldGeneration, generation }) => {
      const url = "/recipient-store.js";
      const s: typeof import("../../public/recipient-store.js") = await import(url);
      await s.setRecipient(next, oldGeneration);
      await s.setRecipient(next, generation);
      const stale = await s.clearRecipient(next, oldGeneration);
      const foreign = await s.clearRecipient(owner);
      const denied = await s.clearRecipient(next, generation, () => false);
      const current = await s.getRecipient();
      await s.setRecipient(owner);
      // Önceki makbuz geçmişi tek gerçek depolama işleminde hazırlanır. Sonra üretim temizlik sınırı aşılır.
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("adhd-push-recipient-v1");
        r.onerror = () => reject(new Error("Fixture unavailable"));
        r.onsuccess = () => {
          const tx = r.result.transaction("seen", "readwrite");
          tx.onerror = () => reject(new Error("Fixture failed"));
          for (let i = 0; i < 255; i++) tx.objectStore("seen").put({ at: i }, `fixture:${i}`);
          tx.oncomplete = () => {
            r.result.close();
            resolve();
          };
        };
      });
      const claims = [await s.claimDelivery(owner, "new:255"), await s.claimDelivery(owner, "new:256")];
      return { stale, foreign, denied, current, claims };
    },
    { owner, next: randomUUID(), oldGeneration: randomUUID(), generation: randomUUID() },
  );
  expect(result.stale).toBe(false);
  expect(result.foreign).toBe(false);
  expect(result.denied).toBe(false);
  expect(result.current).not.toBe(owner);
  const history = await page.evaluate(
    () =>
      new Promise<{ count: number; oldest: boolean; newest: boolean }>((resolve, reject) => {
        const r = indexedDB.open("adhd-push-recipient-v1");
        r.onerror = () => reject(new Error("Storage unavailable"));
        r.onsuccess = () => {
          const tx = r.result.transaction("seen"),
            store = tx.objectStore("seen"),
            count = store.count(),
            oldest = store.get("fixture:0"),
            newest = store.get("new:256");
          tx.oncomplete = () => {
            r.result.close();
            resolve({ count: count.result, oldest: !!oldest.result, newest: !!newest.result });
          };
        };
      }),
  );
  expect(result.claims).toEqual([true, true]);
  expect(history).toEqual({ count: 256, oldest: false, newest: true });
  await second.close();
});

test("offline logout clears the durable recipient and cold invalid auth cannot retain an old recipient", async ({
  page,
  context,
}) => {
  await prepare(page);
  await expect.poll(() => recipient(page)).not.toBeNull();
  const observer = await context.newPage();
  await observer.goto("/offline.html");
  // Bu aynı kaynak gözlemcisinde AuthProvider yok, alıcıyı silemez. Çıkış gezinmesinden sonra da kalır.
  await context.setOffline(true);
  await signOutFromMenu(page);
  await expect.poll(() => recipient(observer)).toBeNull();
  await context.setOffline(false);
  await observer.evaluate(async () => {
    const url = "/recipient-store.js";
    const s: typeof import("../../public/recipient-store.js") = await import(url);
    await s.setRecipient("00000000-0000-0000-0000-000000000001");
  });
  // Değerini veya gerçek tokenı yazdırmadan bilerek geçersiz yerel kimlik koyuyoruz.
  const cold = await context.newPage();
  const destination = `/notifications?notificationId=${randomUUID()}`;
  await signIn(cold, "invalid");
  await cold.goto(destination);
  await expect(cold).toHaveURL(/\/login\?next=/);
  // Eski cihaz bağlantısı önce Hatırlatmalar'a taşınır, sonra giriş boyunca korunur.
  expect(new URL(cold.url()).searchParams.get("next")).toBe(destination.replace("/notifications", "/reminders"));
  await expect.poll(() => recipient(observer)).toBeNull();
  await cold.close();
  await observer.close();
});

test("a waiting worker never reloads running or paused work; explicit activation waits until finish", async ({
  page,
}) => {
  await prepare(page);
  const focus = await fx.start();
  await page.reload();
  const player = page.getByRole("region", { name: "Çalışma denetimleri" });
  await expect(player).toBeVisible();
  const revision = randomUUID();
  await page.evaluate(async suffix => {
    await navigator.serviceWorker.register(`/planner-sw.js?revision=${suffix}`, {
      type: "module",
      scope: "/",
      updateViaCache: "none",
    });
  }, revision);
  const update = page.getByRole("button", { name: "Yeni sürümü kullan", exact: true });
  await expect(update).toBeVisible();
  await expect(update).toBeDisabled();
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "Duraklat", exact: true }).click();
  await expect(player).toContainText("Duraklatıldı");
  await expect(update).toBeDisabled();
  expect((await fx.current())?.id).toBe(focus.id);
  await player.getByRole("button", { name: "Oturumu bitir", exact: true }).click();
  await expect(update).toBeEnabled();
  const reloaded = page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() });
  await update.click();
  await reloaded;
  await expect(page.getByRole("heading", { name: "Uygulama ve cihaz bildirimleri", exact: true })).toBeVisible();
  expect((await fx.detail(focus.id)).state).toBe("Finished");
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.scriptURL))
    .toContain(`revision=${revision}`);
});

test("verified account switch replaces the durable recipient; old delivery and owner detail are denied", async ({
  page,
}) => {
  const other = await FocusFixture.create();
  try {
    await prepare(page);
    const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string,
      next = (await (await other.api.get("/api/auth/me")).json()).id as string;
    await switchAccount(page, other.token);
    await expect.poll(() => recipient(page)).toBe(next);
    const claimed = await page.evaluate(async owner => {
      const url = "/recipient-store.js";
      const s: typeof import("../../public/recipient-store.js") = await import(url);
      return s.claimDelivery(owner, "old-owner:0");
    }, owner);
    expect(claimed).toBe(false);
    const old = await fx.task();
    expect((await other.api.get(`/api/tasks/${old.id}`)).status()).toBe(404);
  } finally {
    await other.api.dispose();
  }
});

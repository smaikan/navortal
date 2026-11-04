import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { FocusFixture } from "./helpers/focus-fixture";
import { openAccountMenu, SESSION_COOKIE } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";

test("a cookie owner change cannot send a stale form into the new account", async ({ page, context }) => {
  const owner = await FocusFixture.create(),
    other = await FocusFixture.create();
  try {
    await owner.login(page);
    await page.goto("/settings?section=profile");
    const section = page.getByRole("region", { name: "Profil", exact: true });
    await section.getByLabel("Ad", { exact: true }).fill("Eski Ekran");
    const oldUser = await (await owner.api.get("/api/auth/me")).json();
    const otherUser = await (await other.api.get("/api/auth/me")).json();
    await page.route("**/api/auth/me", route => route.fulfill({ json: oldUser }));
    await context.addCookies([
      { name: SESSION_COOKIE, value: other.token, url: "http://127.0.0.1:3400", httpOnly: true, sameSite: "Strict" },
    ]);
    await section.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(section.getByRole("alert")).toBeVisible();
    expect((await (await other.api.get("/api/auth/me")).json()).displayName).toBe(otherUser.displayName);
    expect((await (await owner.api.get("/api/auth/me")).json()).displayName).toBe(oldUser.displayName);
  } finally {
    await owner.clean();
    await owner.api.dispose();
    await other.clean();
    await other.api.dispose();
  }
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);

test("profile name persists and updates the account menu without signing out", async ({ page }, info) => {
  const owner = await FocusFixture.create();
  try {
    await owner.login(page);
    await page.goto("/settings?section=profile");
    const section = page.getByRole("region", { name: "Profil", exact: true });
    await section.getByLabel("Ad", { exact: true }).fill("Deniz");
    await section.getByLabel("Soyad", { exact: true }).fill("Yılmaz");
    await section.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(section.getByRole("status")).toHaveText("Ad ve soyad kaydedildi.");
    await expect
      .poll(async () => (await (await owner.api.get("/api/auth/me")).json()).displayName)
      .toBe("Deniz Yılmaz");
    // Ayarlar penceresi açıkken arka plan pasif; hesap menüsüne bakmadan önce pencere kapanır.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Ayarlar" })).toHaveCount(0);
    await openAccountMenu(page);
    await expect(page.locator(".account-card-copy strong")).toHaveText("Deniz Yılmaz");
    await page.keyboard.press("Escape");
    await page.goto("/settings?section=profile");
    await expect(section.getByLabel("Ad", { exact: true })).toHaveValue("Deniz");
    await expect(section.getByLabel("Soyad", { exact: true })).toHaveValue("Yılmaz");
    // E-posta açıklamasız ve salt okunur gösterilir.
    await expect(section.getByText("Giriş için kullanılır", { exact: false })).toHaveCount(0);
    // Pencerenin açılış hareketi bitmeden kontrast ölçülürse arka plan belirsiz kalır.
    await page.locator("dialog[open]").evaluate(d => Promise.all(d.getAnimations().map(a => a.finished)));
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const axe = await new AxeBuilder({ page })
        .include(".profile-section")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      writeFileSync(
        `${EVIDENCE}/profile-axe-${theme}-${info.project.name}.json`,
        JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2),
      );
      expect(axe.violations).toEqual([]);
      // Telefondaki tam ekran pencerede axe gizlilik paragrafının arka planını "kısmen örtülü" diye belirleyemiyor.
      // Yalnız bu bulguyu kabul edip kontrastı ve görünürlüğü tarayıcıda ölçüyoruz; başka her belirsizlik hata sayılır.
      for (const finding of axe.incomplete) {
        expect(finding.id).toBe("color-contrast");
        for (const node of finding.nodes) {
          expect(node.target).toEqual([".profile-privacy"]);
          expect(node.any.some(check => String(check.data?.messageKey ?? "").startsWith("elmPartiallyObscur"))).toBe(
            true,
          );
          const measured = await page.locator(".profile-privacy").evaluate(el => {
            const luminance = (color: string) => {
              const [r, g, b] = color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number)
                .map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
              return r * 0.2126 + g * 0.7152 + b * 0.0722;
            };
            let background: Element | null = el;
            while (background && getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)")
              background = background.parentElement;
            const bg = getComputedStyle(background!),
              fg = getComputedStyle(el),
              a = luminance(fg.color),
              b = luminance(bg.backgroundColor);
            const range = document.createRange();
            range.selectNodeContents(el);
            const hits = [...range.getClientRects()]
              .filter(r => r.width && r.height)
              .flatMap(r =>
                [r.left + 1, r.left + r.width / 2, r.right - 1].map(x => {
                  const hit = document.elementFromPoint(x, r.top + r.height / 2);
                  return hit === el || (hit !== null && el.contains(hit));
                }),
              );
            return {
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              opacity: fg.opacity,
              backgroundOpacity: bg.opacity,
              backgroundImage: bg.backgroundImage,
              hits,
            };
          });
          writeFileSync(
            `${EVIDENCE}/profile-axe-reviewed-${theme}-${info.project.name}.json`,
            JSON.stringify(measured, null, 2),
          );
          expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
          expect([measured.opacity, measured.backgroundOpacity, measured.backgroundImage]).toEqual(["1", "1", "none"]);
          expect(measured.hits.length).toBeGreaterThan(0);
          expect(measured.hits.every(Boolean)).toBe(true);
        }
      }
    }
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/profile-settings-${info.project.name}.png`, fullPage: true });
  } finally {
    await owner.clean();
    await owner.api.dispose();
  }
});

test("a stale name remains a draft and a committed lost response is reconciled without replay", async ({ page }) => {
  const owner = await FocusFixture.create();
  try {
    await owner.login(page);
    await page.goto("/settings?section=profile");
    const section = page.getByRole("region", { name: "Profil", exact: true });
    await section.getByLabel("Ad", { exact: true }).fill("Taslak Ad");
    const initial = await (await owner.api.get("/api/account/profile")).json();
    expect(
      (
        await owner.api.put("/api/account/profile", {
          data: {
            version: initial.user.profileVersion,
            expectedUserId: initial.user.id,
            firstName: "Sunucudaki",
            lastName: "İsim",
          },
        })
      ).status(),
    ).toBe(200);
    await section.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(section.getByRole("alert")).toContainText("başka bir yerde değişti");
    await expect(section.getByLabel("Ad", { exact: true })).toHaveValue("Taslak Ad");
    await section.getByRole("button", { name: "Güncel profili kontrol et" }).click();
    await expect(section.getByRole("status")).toHaveText(
      "Güncel profil yüklendi. Bilgileri kontrol edip istersen yeniden kaydedebilirsin.",
    );
    let writes = 0;
    await page.route("**/api/account/profile", async route => {
      if (route.request().method() !== "PUT") return route.continue();
      writes++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await section.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(section.getByRole("alert")).toContainText("sonucu doğrulanamadı");
    await expect(section.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
    expect(writes).toBe(1);
    await section.getByRole("button", { name: "Güncel profili kontrol et" }).click();
    await expect(section.getByRole("status")).toHaveText("Değişiklik kaydedilmiş. Güncel profil yüklendi.");
    await expect(section.getByLabel("Ad", { exact: true })).toHaveValue("Taslak Ad");
    expect(writes).toBe(1);
  } finally {
    await owner.clean();
    await owner.api.dispose();
  }
});

test("real Cloudinary photo uploads, survives reload, replaces and removes without exposing the provider to the browser", async ({
  page,
}, info) => {
  test.skip(process.env.UI_REAL_PROFILE !== "1", "Explicit real-provider profile run only.");
  const owner = await FocusFixture.create();
  const external: string[] = [];
  page.on("request", request => {
    const host = new URL(request.url()).hostname;
    if (host.endsWith("cloudinary.com")) external.push(host);
  });
  try {
    await owner.login(page);
    await page.goto("/settings?section=profile");
    const section = page.getByRole("region", { name: "Profil", exact: true });
    await expect(section.getByRole("button", { name: "Fotoğraf seç", exact: true })).toBeEnabled();
    await section.getByLabel("Ad", { exact: true }).fill("Fotoğraflı Kullanıcı");
    const upload = () =>
      section
        .getByLabel("Profil fotoğrafı dosyası")
        .setInputFiles({ name: "profil.png", mimeType: "image/png", buffer: png });
    await upload();
    await expect(section.getByRole("status")).toHaveText("Profil fotoğrafı güncellendi.");
    const image = section.locator(".profile-avatar-large img");
    await expect(section.getByLabel("Ad", { exact: true })).toHaveValue("Fotoğraflı Kullanıcı");
    await section.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(section.getByRole("status")).toHaveText("Ad ve soyad kaydedildi.");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(256);
    const first = await (await owner.api.get("/api/account/profile")).json();
    await page.reload();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(256);
    const replaced = page.waitForResponse(
      response =>
        new URL(response.url()).pathname === "/api/account/profile/photo" && response.request().method() === "PUT",
    );
    await upload();
    expect((await replaced).status()).toBe(200);
    await expect(section.getByRole("status")).toHaveText("Profil fotoğrafı güncellendi.");
    const second = await (await owner.api.get("/api/account/profile")).json();
    expect(second.user.photoVersion).not.toBe(first.user.photoVersion);
    expect((await owner.api.get(`/api/account/profile/photo?version=${first.user.photoVersion}`)).status()).toBe(404);
    await page.screenshot({ path: `${EVIDENCE}/profile-photo-${info.project.name}.png`, fullPage: true });
    await section.getByRole("button", { name: "Profil fotoğrafı seçenekleri", exact: true }).click();
    await page.getByRole("menuitem", { name: "Fotoğrafı kaldır", exact: true }).click();
    await expect(section.getByRole("status")).toHaveText("Profil fotoğrafı kaldırıldı.");
    await expect(image).toHaveCount(0);
    expect(external).toEqual([]);
  } finally {
    const current = await (await owner.api.get("/api/account/profile")).json();
    if (current.user.photoVersion)
      await owner.api.delete("/api/account/profile/photo", {
        data: { version: current.user.profileVersion, expectedUserId: current.user.id },
      });
    await owner.clean();
    await owner.api.dispose();
  }
});

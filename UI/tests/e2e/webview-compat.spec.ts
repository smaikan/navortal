import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const missing of [false, true]) {
  test(`WebView runtime compatibility: ${missing ? "missing APIs" : "native APIs"}, register, login and plan`, async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const initialize = (remove: boolean) => {
      const targets: [object, string][] = [
        [AbortSignal, "any"],
        [AbortSignal, "timeout"],
        [AbortSignal.prototype, "throwIfAborted"],
        [AbortSignal.prototype, "reason"],
        [Array.prototype, "at"],
        [Object, "hasOwn"],
        [URL, "canParse"],
        [URLSearchParams.prototype, "size"],
        [Crypto.prototype, "randomUUID"],
        [Intl, "supportedValuesOf"],
        [Array.prototype, "findLast"],
        [Array.prototype, "findLastIndex"],
        [Array.prototype, "toSorted"],
        [String.prototype, "isWellFormed"],
        [Promise, "withResolvers"],
        [Response, "json"],
        [globalThis, "structuredClone"],
      ];
      if (remove) for (const [target, key] of targets) Reflect.deleteProperty(target, key);
      const originals = targets.map(([target, key]) => ({
        target,
        key,
        descriptor: Object.getOwnPropertyDescriptor(target, key),
      }));
      Object.defineProperty(globalThis, "__compatNativeUnchanged", {
        value: () =>
          originals.every(({ target, key, descriptor }) => {
            if (!descriptor) return true;
            const current = Object.getOwnPropertyDescriptor(target, key);
            return current?.value === descriptor.value && current?.get === descriptor.get;
          }),
      });
    };
    await context.addInitScript(initialize, missing);
    const faults: string[] = [];
    const page = await context.newPage();
    page.on("pageerror", error => faults.push(error.message));
    const email = `webview-${randomUUID()}@example.test`,
      password = randomUUID();
    try {
      await page.goto("/register");
      await expect(page.getByRole("heading", { name: "Kendi alanını oluştur" })).toBeVisible();
      const apis = await page.evaluate(() => ({
        at: typeof Array.prototype.at,
        hasOwn: typeof Object.hasOwn,
        uuid: typeof crypto.randomUUID,
        canParse: typeof URL.canParse,
        throwIfAborted: typeof AbortSignal.prototype.throwIfAborted,
        parameters: new URLSearchParams("a=1&a=2&b=3").size,
        unchanged: (globalThis as unknown as { __compatNativeUnchanged: () => boolean }).__compatNativeUnchanged(),
      }));
      expect(apis).toEqual({
        at: "function",
        hasOwn: "function",
        uuid: "function",
        canParse: "function",
        throwIfAborted: "function",
        parameters: 3,
        unchanged: true,
      });
      await page.getByLabel("E-posta", { exact: true }).fill(email);
      await page.getByLabel("Parola", { exact: true }).fill(password);
      await page.getByRole("checkbox", { name: /Kullanım Koşulları/ }).check();
      const registered = page.waitForResponse(
        response =>
          new URL(response.url()).pathname === "/api/auth/session/register" && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
      expect((await registered).status()).toBe(201);
      await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
      await expect(page.getByText("Bu gün için henüz plan yok", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Bu gün için henüz plan yok", { exact: true })).toBeVisible();

      const search = randomUUID();
      const filtered = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/tasks" && url.searchParams.get("search") === search;
      });
      await page.goto(`/tasks?search=${search}`);
      expect((await filtered).status()).toBe(200);

      const login = await browser.newContext();
      await login.addInitScript(initialize, missing);
      try {
        const signed = await login.newPage();
        signed.on("pageerror", error => faults.push(error.message));
        await signed.goto("/login");
        await expect(signed.getByRole("button", { name: "Giriş yap", exact: true })).toBeVisible();
        await signed.getByLabel("E-posta", { exact: true }).fill(email);
        await signed.getByLabel("Parola", { exact: true }).fill(password);
        const entered = signed.waitForResponse(
          response =>
            new URL(response.url()).pathname === "/api/auth/session/login" && response.request().method() === "POST",
        );
        await signed.getByRole("button", { name: "Giriş yap", exact: true }).click();
        expect((await entered).status()).toBe(200);
        await expect(signed.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
        await expect(signed.getByText("Bu gün için henüz plan yok", { exact: true })).toBeVisible();
      } finally {
        await login.close();
      }
      expect(faults).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

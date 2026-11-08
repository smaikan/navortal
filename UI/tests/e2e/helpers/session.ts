import { expect, request, type BrowserContext, type Page } from "@playwright/test";
import { SESSION_MARKER_KEY } from "../../../src/features/auth/session";
import { credentialsFor } from "./fixture-account";

/** HTTPS olmayan yerel testte HttpOnly cookie adı __Host- öneki olmadan kullanılıyor. */
export const SESSION_COOKIE = "adhd_session";
const BASE = process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400";

/** Gerçek girişin tarayıcı tarafı: cookie ve sırsız giriş işareti. Tarayıcı ayrı sunucu oturumu açar; UI çıkışı yalnız onu bitirir, testin API oturumu ikinci cihaz gibi çalışır. */
export async function signIn(target: Page | BrowserContext, token: string) {
  const context = "context" in target ? target.context() : target;
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await browserToken(token),
      url: BASE,
      httpOnly: true,
      sameSite: "Strict",
      expires: persistent(),
    },
  ]);
  await context.addInitScript(key => {
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1 }));
    } catch {
      /* Depolaması engellenen testler için. */
    }
  }, SESSION_MARKER_KEY);
}

/** Sunucunun yaklaşık 400 günlük Max-Age değeri gibi. Kalıcı profil yeniden açılınca korur. */
const persistent = () => Math.floor(Date.now() / 1000) + 400 * 86_400;

async function browserToken(token: string) {
  const account = credentialsFor(token);
  if (!account) return token;
  const api = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  try {
    const response = await api.post("/api/auth/login", { data: account });
    if (response.status() !== 200) throw new Error(`Fixture browser sign-in failed: ${response.status()}`);
    return ((await response.json()) as { accessToken: string }).accessToken;
  } finally {
    await api.dispose();
  }
}

/** Ortak tarayıcı oturumunu diğer hesaba geçirir ve başka sekmede giriş olmuş gibi duyurur. */
export async function switchAccount(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: await browserToken(token),
      url: BASE,
      httpOnly: true,
      sameSite: "Strict",
      expires: persistent(),
    },
  ]);
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ version: 1 }));
    const channel = new BroadcastChannel("adhd.auth.changes.v1");
    channel.postMessage({ version: 1, kind: "changed" });
    channel.close();
  }, SESSION_MARKER_KEY);
}

/** Tarayıcıdaki cookie değeri, yalnız test için. Sayfa JavaScript'i bunu okuyamaz. */
export async function sessionCookie(context: BrowserContext) {
  return (await context.cookies(BASE)).find(x => x.name === SESSION_COOKIE);
}

/** Mobil hesap Daha fazla içinde, masaüstünde yan menünün altında. */
export async function openAccountMenu(page: Page) {
  await expect(page.locator(".workspace-shell")).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    // Daha fazla URL'ye ait. Önceki eylem oraya gittiyse yerel pencere hâlâ açılıyor olabilir.
    if (new URL(page.url()).searchParams.get("menu") !== "more")
      await page
        .getByRole("navigation", { name: "Mobil gezinme", exact: true })
        .getByRole("button", { name: "Daha fazla", exact: true })
        .click();
    await expect(page.getByRole("button", { name: "Daha fazla panelini kapat", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Hesap menüsü", exact: true }).click();
}
export async function signOutFromMenu(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Çıkış yap", exact: true }).click();
}

export async function assertSignedInAccount(page: Page, email: string) {
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: `Giriş yapılan hesap: ${email}`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Hesap menüsü", exact: true })).toHaveCount(0);
  const closeMore = page.getByRole("button", { name: "Daha fazla panelini kapat", exact: true });
  if (await closeMore.isVisible()) {
    await closeMore.click();
    await expect(closeMore).not.toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("menu")).toBeNull();
  }
}

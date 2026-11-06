import { test, type APIRequestContext } from "@playwright/test";

// beforeAll kendi süre aralığını kullanır, info.timeout yine normal test süresini verir.
// Aynı TestInfo bütçesi hem denemeler hem aynı hazırlıktaki hesap kayıtları boyunca korunur.
const fixtureBudgets = new WeakMap<object, number>();
// Test hesabının parolası API tokenına göre tutulur. Tarayıcı kendi oturumunu signIn ile alır.
const credentials = new Map<string, { email: string; password: string }>();
export const credentialsFor = (token: string) => credentials.get(token);

/** Gerçek API kayıt sınırı 5 dakikada 30'dur. Yoğun testte 429 gelirse Retry-After kadar beklenip denenir, hazırlık süresine bekleme eklenir. Kimlik testleri bu yardımcıdan geçmeden normal sınırı ayrıca sınar. */
export async function registerFixture(context: APIRequestContext, url: string, options: { data: unknown }) {
  // Gerçek kayıt penceresi ve pay bırakıyoruz. Sabit altı deneme, Retry-After 30sn ise 150sn'de bitebilir.
  const deadline = Date.now() + 330_000;
  for (;;) {
    const response = await context.post(url, options);
    if (response.status() === 201 && typeof response.json === "function") {
      const data = (options.data ?? {}) as { email?: unknown; password?: unknown };
      const token = ((await response.json().catch(() => ({}))) as { accessToken?: unknown }).accessToken;
      if (typeof token === "string" && typeof data.email === "string" && typeof data.password === "string")
        credentials.set(token, { email: data.email, password: data.password });
    }
    if (response.status() !== 429 || Date.now() >= deadline) return response;
    const seconds = Math.min(Math.max(Number(response.headers()["retry-after"]) || 30, 1), 300);
    const delay = Math.min(seconds * 1000, deadline - Date.now());
    const info = test.info();
    const budget = Math.max(info.timeout, fixtureBudgets.get(info) ?? 0) + delay + 5000;
    fixtureBudgets.set(info, budget);
    info.setTimeout(budget);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

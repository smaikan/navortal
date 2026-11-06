import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Hesabın outbox Pending/Processing işleri bitsin, önceki olayların hepsi yayımlansın. Sonra açılan sayfa eski olay almaz, kasıtlı hata aralığı arka plan okumayla kapanmaz. */
export async function outboxDrained(api: APIRequestContext, fixtureWaitMs = 5000) {
  if (fixtureWaitMs > 5000) test.setTimeout(test.info().timeout + fixtureWaitMs);
  await expect
    .poll(
      async () => {
        let open = 0;
        for (const state of ["Pending", "Processing"])
          open += (await (await api.get(`/api/jobs/outbox?state=${state}&limit=1`)).json()).total;
        return open;
      },
      { timeout: fixtureWaitMs },
    )
    .toBe(0);
}

/** Hub ilk bağlanınca aktif sorguları yeniler. Sonrasında yalnız canlı olaylar yeniler. */
export const syncConnected = (page: Page) => expect(page.locator('[data-sync-state="connected"]')).toBeAttached();

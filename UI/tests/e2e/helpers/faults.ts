import type { Page } from "@playwright/test";

const cancelledMessage = (url: string) => `${url.replace(/^https?:\//, "")} due to access control checks.`;

/** Sayfa hataları listelenir. WebKit gezinmeyle iptal olan isteği erişim hatası diye de bildirebilir. Yalnız Load request cancelled ile veya yeni ana belge istenirken açık kalan istekle eşleşen hata atılır. Olay sırası önemli değil; gerçek erişim hatası dahil diğer hatalar kalır. */
export function trackFaults(page: Page, list: string[]) {
  const cancelled = new Set<string>();
  const pending = new Map<string, number>();
  const cut = (url: string) => {
    const message = cancelledMessage(url);
    cancelled.add(message);
    for (let index = list.indexOf(message); index >= 0; index = list.indexOf(message)) list.splice(index, 1);
  };
  const settle = (url: string) => {
    const count = (pending.get(url) ?? 1) - 1;
    if (count > 0) pending.set(url, count);
    else pending.delete(url);
  };
  page.on("request", request => {
    // Ana belge isteği eski belgenin açık isteklerini terk eder. pushState bu kapsama girmez.
    let document = false;
    try {
      document = request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      /* Service worker isteğinin frame'i yok. */
    }
    if (document) {
      for (const url of pending.keys()) cut(url);
      pending.clear();
    }
    pending.set(request.url(), (pending.get(request.url()) ?? 0) + 1);
  });
  page.on("requestfinished", request => settle(request.url()));
  page.on("requestfailed", request => {
    settle(request.url());
    if (request.failure()?.errorText === "Load request cancelled") cut(request.url());
  });
  page.on("pageerror", error => {
    if (!cancelled.has(error.message)) list.push(error.message);
  });
}

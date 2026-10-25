type Handler = (event: PopStateEvent) => void;
const handlers = new Map<Handler, number>();
let installed = false;

/** Dinleyici kök istemci modülü yüklenirken App Router etkilerinden önce kurulur. Window üzerindeki capture daha önceki hedef dinleyiciyi sıralamaz; geç kurulan form dinleyicisi yönlendirmeyi kesin durduramaz. Kayıtta yalnız bağlı istemci çağrıları vardır, SSR durumu yok. */
export function prepareTraversalGuard() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("popstate", event => {
    for (const [handler] of [...handlers].sort((a, b) => b[1] - a[1])) {
      handler(event);
      if (event.cancelBubble) break;
    }
  });
}
export function subscribeTraversal(handler: Handler, priority = 0) {
  handlers.set(handler, priority);
  return () => {
    handlers.delete(handler);
  };
}

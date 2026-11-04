import type { Status } from "./model";
export type Hub = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  on: (name: "changed", callback: (event: unknown) => void) => void;
  off: (name: "changed", callback: (event: unknown) => void) => void;
  onreconnecting: (callback: () => void) => void;
  onreconnected: (callback: () => void) => void;
  onclose: (callback: () => void) => void;
};
type Options = {
  createHub: () => Hub;
  current: () => boolean;
  refresh: () => Promise<void>;
  /** Başlamış ilk HTTP okuması paylaşılır. Abonelikten sonra telafi okuması yine yapılır. */
  bootstrap?: () => Promise<void>;
  invalidate: () => void;
  signal: (event: unknown) => void;
  status: (s: Status) => void;
  browser: Window;
  document: Document;
};
/** Sekmede tek eşitleyici var, yazı tekrarı yok. İlk başlatma ve yeniden bağlanma bütçeleri ayrı. */
export function syncEngine(o: Options) {
  const retries = [2000, 10000, 30000];
  let hub: Hub | undefined,
    connected = false,
    disposed = false,
    initialized = false;
  let poll: ReturnType<typeof setInterval> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    attempts = 0,
    ticks = 0;
  let handler: ((e: unknown) => void) | undefined;
  const active = () =>
    !disposed && o.current() && o.document.visibilityState === "visible" && o.browser.navigator.onLine !== false;
  const recover = () => {
    if (!active()) return;
    const invalidate = () => {
      if (active()) o.invalidate();
    };
    void o.refresh().then(invalidate, invalidate);
  };
  function stopPoll() {
    if (poll) clearInterval(poll);
    poll = undefined;
  }
  function fallback() {
    stopPoll();
    if (!active() || connected) return;
    poll = setInterval(() => {
      if (!active()) {
        stopPoll();
        return;
      }
      const invalidateThisTick = ++ticks % 2 === 0;
      const invalidate = () => {
        if (invalidateThisTick && active()) o.invalidate();
      };
      void o.refresh().then(invalidate, invalidate);
    }, 15000);
  }
  function detach() {
    if (retry) clearTimeout(retry);
    retry = undefined;
    const old = hub;
    hub = undefined;
    connected = false;
    if (old && handler) old.off("changed", handler);
    handler = undefined;
    if (old) void old.stop().catch(() => {});
  }
  async function start(instance: Hub) {
    if (!active() || hub !== instance) return;
    o.status(attempts ? "reconnecting" : "connecting");
    try {
      await instance.start();
      if (!active() || hub !== instance) {
        void instance.stop().catch(() => {});
        return;
      }
      connected = true;
      stopPoll();
      o.status("connected");
      recover();
    } catch {
      if (!active() || hub !== instance) return;
      connected = false;
      o.status("fallback");
      fallback();
      const delay = retries[attempts++];
      if (delay !== undefined)
        retry = setTimeout(() => {
          retry = undefined;
          void start(instance);
        }, delay);
    }
  }
  function resume() {
    if (disposed || !o.current()) return;
    if (!active()) {
      stopPoll();
      detach();
      o.status(o.browser.navigator.onLine === false ? "offline" : "paused");
      return;
    }
    if (!initialized) {
      initialized = true;
      // Açılan sorgular ilk okumayı zaten yapıyor. Abonelik sonrası telafi aradaki boşluğu kapatır.
      void (o.bootstrap ?? o.refresh)();
    } else recover();
    if (hub) {
      fallback();
      return;
    }
    attempts = 0;
    ticks = 0;
    const instance = o.createHub();
    hub = instance;
    handler = e => {
      if (active() && hub === instance) o.signal(e);
    };
    instance.on("changed", handler);
    instance.onreconnecting(() => {
      if (hub !== instance || !active()) return;
      connected = false;
      o.status("reconnecting");
      fallback();
    });
    instance.onreconnected(() => {
      if (hub !== instance || !active()) return;
      connected = true;
      stopPoll();
      o.status("connected");
      recover();
    });
    instance.onclose(() => {
      if (hub !== instance || !active()) return;
      connected = false;
      o.status("fallback");
      fallback();
    });
    fallback();
    void start(instance);
  }
  const pagehide = () => {
    stopPoll();
    detach();
  };
  const pageshow = () => resume();
  o.document.addEventListener("visibilitychange", resume);
  for (const e of ["online", "offline", "focus"]) o.browser.addEventListener(e, resume);
  o.browser.addEventListener("pageshow", pageshow);
  o.browser.addEventListener("pagehide", pagehide);
  resume();
  return {
    retry() {
      if (!active()) return;
      detach();
      resume();
    },
    refresh: recover,
    dispose() {
      disposed = true;
      stopPoll();
      detach();
      o.document.removeEventListener("visibilitychange", resume);
      for (const e of ["online", "offline", "focus"]) o.browser.removeEventListener(e, resume);
      o.browser.removeEventListener("pageshow", pageshow);
      o.browser.removeEventListener("pagehide", pagehide);
    },
  };
}

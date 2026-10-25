import { SESSION_MARKER_KEY, type Session } from "./session";

export const AUTH_CHANNEL = "adhd.auth.changes.v1";
type Channel = Pick<BroadcastChannel, "addEventListener" | "removeEventListener" | "postMessage" | "close">;

/** İşaret ve kanal yalnız giriş değişti sinyalini taşıyor. Kimlik bilgisi HttpOnly cookie'de. */
export function connectBrowserSession(
  session: Session,
  browser: Window = window,
  channelFactory: () => Channel = () => new BroadcastChannel(AUTH_CHANNEL),
) {
  let channel: Channel | undefined;
  try {
    channel = channelFactory();
  } catch {
    /* Depolama olayları çalışmaya devam ediyor. */
  }
  // Başka sekmenin sinyalini tekrar yayımlamıyoruz. Yalnız buradaki giriş değişikliği duyuruluyor.
  let remote = false;
  const fromRemote = (run: () => void) => {
    remote = true;
    try {
      run();
    } finally {
      remote = false;
    }
  };
  const changed = () => {
    if (remote) return;
    try {
      channel?.postMessage({ version: 1, kind: "changed" });
    } catch {
      channel?.close();
      channel = undefined;
    }
  };
  const unsubscribe = session.onIdentityChange(changed);
  const storage = (event: StorageEvent) => {
    if (event.key === SESSION_MARKER_KEY || event.key === null) fromRemote(() => void session.synchronize(true, true));
  };
  // Sekme gizliyken cookie değişebilir. Geri gelince veya odaklanınca hesabı yeniden kontrol ediyoruz.
  const visible = () => {
    if (browser.document.visibilityState === "visible") void session.synchronize(true);
  };
  const focus = () => void session.synchronize(true);
  const online = () => {
    void session.synchronize(session.getSnapshot().phase === "unavailable");
  };
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) void session.synchronize(true);
  };
  const message = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("kind" in data)) return;
    // Gecikmiş çıkış sinyali yeni girişi silmesin; mevcut işareti ve cookie'yi yeniden doğruluyoruz.
    if (data.kind === "changed") fromRemote(() => void session.synchronize(true, true));
  };
  browser.addEventListener("storage", storage);
  browser.addEventListener("online", online);
  browser.addEventListener("pageshow", pageshow);
  browser.addEventListener("focus", focus);
  browser.document.addEventListener("visibilitychange", visible);
  channel?.addEventListener("message", message);
  // İlk çizimle bu modülün yüklenmesi arasındaki depolama değişikliğini de yakalayalım.
  void session.synchronize();
  return () => {
    unsubscribe();
    browser.removeEventListener("storage", storage);
    browser.removeEventListener("online", online);
    browser.removeEventListener("pageshow", pageshow);
    browser.removeEventListener("focus", focus);
    browser.document.removeEventListener("visibilitychange", visible);
    channel?.removeEventListener("message", message);
    channel?.close();
    channel = undefined;
  };
}

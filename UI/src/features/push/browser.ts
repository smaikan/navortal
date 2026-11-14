export type PushSupport = "supported" | "install-required" | "worker-only" | "unsupported";
export type PushBrowserFacts = {
  secure: boolean;
  worker: boolean;
  notification: boolean;
  push: boolean;
  userAgent: string;
  platform: string;
  touchPoints: number;
  standalone: boolean;
};
export function isAppleMobile(facts: Pick<PushBrowserFacts, "userAgent" | "platform" | "touchPoints">) {
  return /iPad|iPhone|iPod/i.test(facts.userAgent) || (facts.platform === "MacIntel" && facts.touchPoints > 1);
}
export function classifyPushSupport(facts: PushBrowserFacts): PushSupport {
  if (!facts.secure || !facts.worker) return "unsupported";
  if (isAppleMobile(facts) && !facts.standalone) return "install-required";
  return facts.notification && facts.push ? "supported" : "worker-only";
}
export function browserFacts(): PushBrowserFacts {
  return {
    secure: window.isSecureContext,
    worker: "serviceWorker" in navigator,
    notification: "Notification" in window,
    push: "PushManager" in window,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    touchPoints: navigator.maxTouchPoints,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}
export const pushSupport = () => classifyPushSupport(browserFacts());
export const appleMobile = () => isAppleMobile(browserFacts());
export const permissionValue = () => ("Notification" in window ? Notification.permission : "unsupported");
export const storedDeviceLabel = () => {
  try {
    const id = localStorage.getItem("adhd.push-device.v1");
    return id ? `Tarayıcı:${id}` : null;
  } catch {
    return null;
  }
};
export function browserChanges(notify: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  const events = ["focus", "pageshow", "appinstalled", "storage", "planner-push-permission", "planner-push-registered"];
  for (const event of events) window.addEventListener(event, notify);
  document.addEventListener("visibilitychange", notify);
  media.addEventListener("change", notify);
  return () => {
    for (const event of events) window.removeEventListener(event, notify);
    document.removeEventListener("visibilitychange", notify);
    media.removeEventListener("change", notify);
  };
}

import { displaySeconds, type Work } from "./model";

/** Yalnız kurulabilir Navortal uygulamaları bu nesneyi sağlar. Web/PWA yolu işlem yapmaz. */
type Host = { postMessage: (message: string) => void; onmessage?: ((event: { data: unknown }) => void) | null };
declare global {
  interface Window {
    navortalTimer?: Host;
    webkit?: { messageHandlers?: { navortalTimer?: Host } };
  }
}

export type NativeTimerMessage = {
  protocol: 1;
  ownerId: string;
  work: {
    id: string;
    version: string;
    serverNow: string;
    title: string;
    state: "Running" | "Paused";
    elapsedMs: number;
  } | null;
  capturedAtMs: number;
  requestPermission: boolean;
};

export function timerMessage(
  ownerId: string,
  work: Work | null,
  receivedAt: number,
  now: number,
  wallNow: number,
  requestPermission = false,
): NativeTimerMessage {
  const active = ownerId && work && (work.state === "Running" || work.state === "Paused") ? work : null;
  return {
    protocol: 1,
    ownerId,
    work: active
      ? {
          id: active.id,
          version: String(active.version),
          serverNow: active.serverNow,
          title: Array.from(active.taskAtStart?.title || "Çalışma")
            .slice(0, 200)
            .join(""),
          state: active.state as "Running" | "Paused",
          elapsedMs: Math.max(
            0,
            Math.min(Number.MAX_SAFE_INTEGER, Math.floor(displaySeconds(active, receivedAt, now) * 1000)),
          ),
        }
      : null,
    capturedAtMs: wallNow,
    requestPermission: requestPermission && active?.state === "Running",
  };
}

export function hasAndroidTimerHost() {
  return typeof window !== "undefined" && typeof window.navortalTimer?.postMessage === "function";
}

const versions = new Map<string, { version: bigint; ended: boolean }>();
let lastMessage = "";

function send(message: NativeTimerMessage) {
  if (typeof window === "undefined") return;
  const host = window.navortalTimer ?? window.webkit?.messageHandlers?.navortalTimer;
  if (!host) return;
  try {
    const raw = JSON.stringify(message);
    if (raw.length <= 4096) host.postMessage(raw);
  } catch {
    // Telefon bildirimi başarısız olsa da sunucuda kabul edilmiş çalışma değişmez.
  }
}

export function publishNativeTimer(
  ownerId: string,
  work: Work | null,
  receivedAt: number,
  requestPermission = false,
  force = false,
) {
  if (typeof window === "undefined" || (!window.navortalTimer && !window.webkit?.messageHandlers?.navortalTimer))
    return;
  if (work) {
    const key = `${ownerId}:${work.id}`;
    const previous = versions.get(key);
    const version = BigInt(work.version);
    if (previous && (version < previous.version || (previous.ended && version === previous.version))) return;
    versions.set(key, { version, ended: work.state !== "Running" && work.state !== "Paused" });
  }
  const message = timerMessage(ownerId, work, receivedAt, performance.now(), Date.now(), requestPermission);
  const signature = JSON.stringify([
    ownerId,
    message.work?.id,
    message.work?.version,
    message.work?.state,
    message.work?.title,
  ]);
  if (!force && !requestPermission && signature === lastMessage) return;
  lastMessage = signature;
  send(message);
}

export function clearNativeTimer(ownerId: string) {
  versions.clear();
  lastMessage = "";
  send(timerMessage(ownerId, null, 0, 0, Date.now()));
}

/** Resume reads immediately, including while the realtime module is still loading. */
export function listenNativeTimerResume(refresh: () => Promise<void>) {
  if (typeof window === "undefined") return () => {};
  const resume = () => {
    if (!window.navortalTimer && !window.webkit?.messageHandlers?.navortalTimer) return;
    void refresh().catch(() => {});
  };
  window.addEventListener("navortal:resume", resume);
  return () => window.removeEventListener("navortal:resume", resume);
}

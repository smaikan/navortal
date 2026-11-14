import { alertSoundIds, isAlertSound, type AlertSound } from "../../../public/alert-tones.js";

/** Yalnız Navortal uygulamasının WebView köprüsünde (window.navortalTimer) kullanılan ses tercihi. Sunucuya kaydedilmez. */
export type NativeSoundState = { enabled: boolean; sound: AlertSound; available: AlertSound[] };
export type NativeSoundHost = {
  postMessage: (message: string) => void;
  onmessage?: ((event: { data: unknown }) => void) | null;
};

export const nativeSoundTimeoutMs = 2000;
export const defaultNativeSound: AlertSound = "soft";

/** Uygulama içinde olup olmadığını köprü nesnesinden anlar; normal tarayıcıda null. */
export function nativeSoundHost(): NativeSoundHost | null {
  if (typeof window === "undefined") return null;
  const host = (window as { navortalTimer?: NativeSoundHost }).navortalTimer;
  return host && typeof host.postMessage === "function" ? host : null;
}

export const nativeSoundGetMessage = () => JSON.stringify({ type: "sound.get" });
/** Açıkken ses zorunlu ve geçerli olmalı. Kapatırken ses gönderilmez; uygulama son seçimi korur. */
export function nativeSoundSetMessage(enabled: boolean, sound?: AlertSound) {
  if (enabled) {
    if (!isAlertSound(sound)) throw new TypeError("Geçerli bir ses gerekli.");
    return JSON.stringify({ type: "sound.set", enabled: true, sound });
  }
  return JSON.stringify({ type: "sound.set", enabled: false });
}

/** Uygulamanın yanıtı JSON metindir. Geçersiz biçim, tür veya ses null döner ve yok sayılır. */
export function parseNativeSoundState(data: unknown): NativeSoundState | null {
  if (typeof data !== "string" || data.length > 4096) return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "sound.state" || typeof raw.enabled !== "boolean" || !isAlertSound(raw.sound)) return null;
  if (!Array.isArray(raw.available) || !raw.available.length || !raw.available.every(isAlertSound)) return null;
  const available = alertSoundIds.filter(id => (raw.available as unknown[]).includes(id)) as AlertSound[];
  if (!available.includes(raw.sound)) available.push(raw.sound);
  return { enabled: raw.enabled, sound: raw.sound, available };
}

export type NativeSoundSnapshot = {
  phase: "loading" | "ready" | "failed";
  /** Uygulamanın doğruladığı son durum. */
  state: NativeSoundState | null;
  /** Gönderilmiş ama henüz yanıtlanmamış istek. */
  pending: { enabled: boolean; sound: AlertSound } | null;
  error: string;
};

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

/** Köprü iletişimi çerçeveden bağımsız: durum okuma, kaydetme, 2 sn yanıt zaman aşımı ve geri alma. */
export function createNativeSoundController(
  host: NativeSoundHost,
  // Tarayıcıda setTimeout bir nesnenin yöntemi gibi çağrılırsa "Illegal invocation" verir; sarmalıyoruz.
  timers: Timers = { set: (run, ms) => setTimeout(run, ms), clear: id => clearTimeout(id as never) },
) {
  let snapshot: NativeSoundSnapshot = { phase: "loading", state: null, pending: null, error: "" };
  let timer: unknown = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<NativeSoundSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(listener => listener());
  };
  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const previous = host.onmessage ?? null;
  const handle = (event: { data: unknown }) => {
    const state = parseNativeSoundState(event.data);
    if (!state) {
      // Başka tüketiciler (varsa) kendi iletilerini alabilsin.
      previous?.(event);
      return;
    }
    if (disposed) return;
    stop();
    publish({ phase: "ready", state, pending: null, error: "" });
  };
  host.onmessage = handle;
  const send = (message: string) => {
    try {
      host.postMessage(message);
      return true;
    } catch {
      return false;
    }
  };
  const arm = (onTimeout: () => void) => {
    stop();
    timer = timers.set(() => {
      timer = null;
      if (!disposed) onTimeout();
    }, nativeSoundTimeoutMs);
  };
  function refresh() {
    publish({ phase: snapshot.state ? "ready" : "loading", error: "" });
    if (!send(nativeSoundGetMessage()))
      return publish({ phase: snapshot.state ? "ready" : "failed", error: "Uygulamaya ulaşılamadı." });
    arm(() => publish({ phase: snapshot.state ? "ready" : "failed", error: "Uygulamadan ses durumu alınamadı." }));
  }
  function change(enabled: boolean, sound: AlertSound) {
    if (!snapshot.state || snapshot.pending) return;
    if (enabled && !isAlertSound(sound)) return;
    const request = { enabled, sound };
    publish({ pending: request, error: "" });
    const ok = send(enabled ? nativeSoundSetMessage(true, sound) : nativeSoundSetMessage(false));
    if (!ok) return publish({ pending: null, error: "Ses ayarı uygulamaya gönderilemedi. Önceki değer korundu." });
    arm(() => publish({ pending: null, error: "Ses ayarı uygulamaya ulaşmadı. Önceki değer geri yüklendi." }));
  }
  refresh();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh,
    toggle() {
      const state = snapshot.state;
      if (state) change(!state.enabled, state.sound);
    },
    choose(sound: AlertSound) {
      const state = snapshot.state;
      if (state?.enabled && state.available.includes(sound)) change(true, sound);
    },
    dispose() {
      disposed = true;
      stop();
      if (host.onmessage === handle) host.onmessage = previous;
      listeners.clear();
    },
  };
}

const idle: NativeSoundSnapshot = { phase: "loading", state: null, pending: null, error: "" };
/** Denetleyiciyi ilk abone gelince kurar, son abone gidince kapatır. useSyncExternalStore ile doğrudan kullanılır. */
export function createNativeSoundStore(getHost: () => NativeSoundHost | null = nativeSoundHost, timers?: Timers) {
  let controller: ReturnType<typeof createNativeSoundController> | null = null;
  let release = () => {};
  let snapshot = idle;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!controller) {
        const host = getHost();
        if (host) {
          const created = createNativeSoundController(host, timers);
          controller = created;
          snapshot = created.getSnapshot();
          const off = created.subscribe(() => {
            snapshot = created.getSnapshot();
            emit();
          });
          release = () => {
            off();
            created.dispose();
          };
        }
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && controller) {
          release();
          controller = null;
          snapshot = idle;
        }
      };
    },
    getSnapshot: () => snapshot,
    refresh: () => controller?.refresh(),
    toggle: () => controller?.toggle(),
    choose: (sound: AlertSound) => controller?.choose(sound),
  };
}

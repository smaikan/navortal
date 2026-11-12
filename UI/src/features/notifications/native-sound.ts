import { alertSoundIds, isAlertSound, type AlertSound } from "../../../public/alert-tones.js";

/** Uygulamadaki üç ses kategorisi. Masaüstündeki pomodoroSound / reminderSound / taskEndSound ile aynı anlam. */
export const nativeSoundCategories = ["pomodoro", "reminder", "taskEnd"] as const;
export type NativeSoundCategory = (typeof nativeSoundCategories)[number];
export type NativeSounds = Record<NativeSoundCategory, AlertSound>;

/** Yalnız Navortal uygulamasının WebView köprüsünde (window.navortalTimer) kullanılan ses tercihi. Sunucuya kaydedilmez. */
export type NativeSoundState = { enabled: boolean; sounds: NativeSounds; available: AlertSound[] };
export type NativeSoundHost = {
  postMessage: (message: string) => void;
  onmessage?: ((event: { data: unknown }) => void) | null;
};

export const nativeSoundTimeoutMs = 2000;

/** Uygulama içinde olup olmadığını köprü nesnesinden anlar; normal tarayıcıda null. */
export function nativeSoundHost(): NativeSoundHost | null {
  if (typeof window === "undefined") return null;
  const host = (window as { navortalTimer?: NativeSoundHost }).navortalTimer;
  return host && typeof host.postMessage === "function" ? host : null;
}

function validSounds(value: unknown): value is NativeSounds {
  return (
    !!value &&
    typeof value === "object" &&
    nativeSoundCategories.every(key => isAlertSound((value as Record<string, unknown>)[key]))
  );
}

export const nativeSoundGetMessage = () => JSON.stringify({ type: "sound.get" });
/** Açıkken üç kategorinin sesi de zorunlu ve geçerli olmalı. Kapatırken ses gönderilmez; uygulama son seçimleri korur. */
export function nativeSoundSetMessage(enabled: boolean, sounds?: NativeSounds) {
  if (enabled) {
    if (!validSounds(sounds)) throw new TypeError("Üç kategori için geçerli ses gerekli.");
    const { pomodoro, reminder, taskEnd } = sounds;
    return JSON.stringify({ type: "sound.set", enabled: true, sounds: { pomodoro, reminder, taskEnd } });
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
  if (raw.type !== "sound.state" || typeof raw.enabled !== "boolean" || !validSounds(raw.sounds)) return null;
  if (!Array.isArray(raw.available) || !raw.available.length || !raw.available.every(isAlertSound)) return null;
  const { pomodoro, reminder, taskEnd } = raw.sounds;
  const chosen = [pomodoro, reminder, taskEnd];
  // Sıra uygulamadaki sabit sırayla aynı kalır; seçili ses listede yoksa yine seçilebilir olur.
  const available = alertSoundIds.filter(
    id => (raw.available as unknown[]).includes(id) || chosen.includes(id as AlertSound),
  ) as AlertSound[];
  return { enabled: raw.enabled, sounds: { pomodoro, reminder, taskEnd }, available };
}

/** Eski uygulama sürümü tek sesli yanıt verir (sounds yok, sound var). Bölüm bunu "uygulamayı güncelle" diye gösterir. */
export function isLegacyNativeSoundState(data: unknown) {
  if (typeof data !== "string" || data.length > 4096) return false;
  try {
    const raw = JSON.parse(data) as Record<string, unknown> | null;
    return !!raw && typeof raw === "object" && raw.type === "sound.state" && !("sounds" in raw) && "sound" in raw;
  } catch {
    return false;
  }
}

export type NativeSoundSnapshot = {
  phase: "loading" | "ready" | "failed" | "outdated";
  /** Uygulamanın doğruladığı son durum. */
  state: NativeSoundState | null;
  /** Gönderilmiş ama henüz yanıtlanmamış istek. */
  pending: { enabled: boolean; sounds: NativeSounds } | null;
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
      if (isLegacyNativeSoundState(event.data)) {
        if (disposed) return;
        stop();
        publish({ phase: "outdated", state: null, pending: null, error: "" });
        return;
      }
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
  function change(enabled: boolean, sounds: NativeSounds) {
    if (!snapshot.state || snapshot.pending) return;
    if (enabled && !validSounds(sounds)) return;
    const request = { enabled, sounds };
    publish({ pending: request, error: "" });
    const ok = send(enabled ? nativeSoundSetMessage(true, sounds) : nativeSoundSetMessage(false));
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
      if (state) change(!state.enabled, state.sounds);
    },
    choose(category: NativeSoundCategory, sound: AlertSound) {
      const state = snapshot.state;
      if (!state?.enabled || !nativeSoundCategories.includes(category) || !state.available.includes(sound)) return;
      if (state.sounds[category] === sound) return;
      change(true, { ...state.sounds, [category]: sound });
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
    choose: (category: NativeSoundCategory, sound: AlertSound) => controller?.choose(category, sound),
  };
}

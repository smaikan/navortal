import { alertTones, type AlertSound } from "./alert-tones";

export type AlertAudioStatus = "locked" | "ready" | "unavailable";

/** Modül yüklenince ses bağlamı açmıyoruz. Etkinleştirme doğrudan kullanıcı hareketinden gelmeli. */
export function createAlertAudio(createContext = () => new window.AudioContext()) {
  let context: AudioContext | undefined;
  let status: AlertAudioStatus = "locked";
  let activating: Promise<boolean> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: AlertAudioStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach(listener => listener());
  };
  function release() {
    const previous = context;
    context = undefined;
    activating = undefined;
    if (previous) {
      previous.onstatechange = null;
      try {
        void previous.close().catch(() => {});
      } catch {
        // Tarayıcının zaten kaldırdığı ses bağlamını kapatmak ek işlem istemiyor.
      }
    }
  }
  function activate(): Promise<boolean> {
    if (context?.state === "running") {
      publish("ready");
      return Promise.resolve(true);
    }
    if (activating) return activating;
    try {
      if (context?.state === "closed") release();
      const active = (context ??= createContext());
      const update = () => {
        if (context === active) publish(active.state === "running" ? "ready" : "locked");
      };
      active.onstatechange = update;
      // Güvenilir kullanıcı hareketi sürerken resume çağrısını hemen yapıyoruz.
      const resumed = active.resume();
      const pending = resumed
        .then(() => {
          if (context !== active) return false;
          update();
          return active.state === "running";
        })
        .catch(() => {
          if (context === active) publish("locked");
          return false;
        })
        .finally(() => {
          if (activating === pending) activating = undefined;
        });
      activating = pending;
      return pending;
    } catch {
      release();
      publish("unavailable");
      return Promise.resolve(false);
    }
  }
  function play(sound: AlertSound = "soft") {
    const active = context;
    if (!active || active.state !== "running") {
      if (active) publish("locked");
      return false;
    }
    const nodes: { oscillator: OscillatorNode; gain: GainNode }[] = [];
    try {
      // Ses saatinde sonlu planlama var. Döngü, indirme veya arka plan JS sayacı yok.
      const start = active.currentTime + 0.01;
      for (const [offset, frequency, duration, peak, wave] of alertTones[sound].notes) {
        const oscillator = active.createOscillator();
        const gain = active.createGain();
        nodes.push({ oscillator, gain });
        const at = start + offset;
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(peak, at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration - 0.02);
        oscillator.connect(gain);
        gain.connect(active.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(at);
        oscillator.stop(at + duration);
      }
      return true;
    } catch {
      for (const { oscillator, gain } of nodes) {
        try {
          oscillator.stop();
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Yarım oluşturulan düğümleri tarayıcı zaten durdurmuş olabilir.
        }
      }
      release();
      publish("unavailable");
      return false;
    }
  }
  return {
    activate,
    play,
    async test(sound: AlertSound = "soft") {
      return (await activate()) && play(sound);
    },
    reset() {
      release();
      publish("locked");
    },
    getSnapshot: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const alertAudio = createAlertAudio();

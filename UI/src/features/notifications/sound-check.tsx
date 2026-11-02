"use client";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { alertAudio } from "./alert-audio";
import { alertHealth } from "./alert-health";
import { alertTones, isAlertSound, type AlertSound } from "./alert-tones";
import { alertSoundIds } from "../../../public/alert-tones.js";
import type { Settings } from "./model";

type SoundKey = "pomodoroSound" | "reminderSound" | "taskEndSound";
const rows: { key: SoundKey; label: string; detail: string }[] = [
  { key: "pomodoroSound", label: "Pomodoro", detail: "Çalışma hedefi ve mola bitişi" },
  {
    key: "reminderSound",
    label: "Hatırlatma",
    detail: "Hatırlatmalar, işe dönüş, son teslim, özel gün ve plan başlangıcı",
  },
  { key: "taskEndSound", label: "Görev süresi bitimi", detail: "Planlanan çalışma süresi dolduğunda" },
];

export function SoundCheck({
  settings,
  disabled,
  change,
}: {
  settings: Settings;
  disabled: boolean;
  change: (key: SoundKey, sound: AlertSound) => void;
}) {
  const id = useId();
  const status = useSyncExternalStore(alertAudio.subscribe, alertAudio.getSnapshot, () => "locked");
  const issue = useSyncExternalStore(alertHealth.subscribe, alertHealth.getSnapshot, () => "");
  const [message, setMessage] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const preview = useRef(false);
  async function testSound(sound: AlertSound, label: string) {
    if (preview.current) return;
    preview.current = true;
    setPreviewing(true);
    setMessage("");
    window.dispatchEvent(new Event("planner-alert-retry"));
    try {
      const played = await alertAudio.test(sound);
      setMessage(
        played
          ? `${label}: ${alertTones[sound].label} çalındı. Duymadıysan cihazın sesini kontrol et.`
          : "Ses açılamadı. Tarayıcı izinlerini kontrol edip yeniden dene.",
      );
    } finally {
      // Hızlı deneme tıklamalarında melodiler üst üste binmesin.
      setTimeout(() => {
        preview.current = false;
        setPreviewing(false);
      }, 1400);
    }
  }
  return (
    <section className="notification-sounds" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="r2-small-heading">
        Bildirim sesleri
      </h2>
      <p className="r2-hint">Her olay için ayrı bir ses seç. Seçimlerin otomatik kaydedilir.</p>
      {rows.map(({ key, label, detail }) => {
        const sound = settings[key];
        return (
          <div className="notification-sound-row" key={key}>
            <label htmlFor={`${id}-${key}`}>
              <strong>{label}</strong>
              <span className="r2-hint">{detail}</span>
            </label>
            <div className="notification-sound-controls">
              <select
                id={`${id}-${key}`}
                aria-label={`${label} sesi`}
                value={sound}
                disabled={disabled}
                onChange={e => {
                  if (isAlertSound(e.target.value)) change(key, e.target.value);
                }}
              >
                {alertSoundIds.map(value => (
                  <option key={value} value={value}>
                    {alertTones[value].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn secondary"
                disabled={previewing}
                aria-label={`${label} sesini dene`}
                onClick={() => {
                  if (isAlertSound(sound)) void testSound(sound, label);
                }}
              >
                <span>Sesi dene</span>
              </button>
            </div>
            {isAlertSound(sound) && (
              <p className="r2-hint notification-sound-description">{alertTones[sound].description}</p>
            )}
          </div>
        );
      })}
      <p className="r2-hint" role="status">
        {issue ||
          message ||
          (status === "ready"
            ? "Uygulama sesi hazır."
            : status === "unavailable"
              ? "Tarayıcı sesi kullanılamıyor. Masaüstü bildirimlerini aşağıdan açabilirsin."
              : "Sesi hazırlamak ve duymak için dene.")}
      </p>
      {!settings.soundEnabled && (
        <p className="r2-hint">Bildirim sesi kapalı. Deneme seslerini dinleyebilirsin; bildirimler sessiz kalır.</p>
      )}
      <p className="r2-hint">
        Ses düzeyini cihazından ayarlayabilirsin. Uygulama kapalıyken cihazının bildirim sesi kullanılır.
      </p>
    </section>
  );
}

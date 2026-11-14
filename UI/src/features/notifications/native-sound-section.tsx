"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { createNativeSoundStore, nativeSoundHost, type NativeSoundSnapshot } from "./native-sound";
import { SoundSelect, useSoundPreview } from "./sound-check";

const none = () => () => {};
const empty: NativeSoundSnapshot = { phase: "loading", state: null, pending: null, error: "" };

/** Yalnız uygulamanın içinde (window.navortalTimer var) görünür. Tercih uygulamada tutulur, sunucuya yazılmaz. */
export function NativeSoundSection() {
  // Sunucu ve ilk istemci çizimi aynı (gizli); köprü varsa ilk etkileşimde bölüm belirir.
  const inApp = useSyncExternalStore(
    none,
    () => nativeSoundHost() !== null,
    () => false,
  );
  return inApp ? <Section /> : null;
}

function Section() {
  const id = useId();
  const [store] = useState(() => createNativeSoundStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => empty);
  const { message, previewing, test } = useSoundPreview();
  const shown = snapshot.pending ?? snapshot.state;
  const busy = !!snapshot.pending;
  const enabled = shown?.enabled ?? false;
  return (
    <section className="notification-sounds native-sound" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="r2-small-heading">
        Bildirim sesi
      </h2>
      <div className="notification-sound-row">
        <div id={`${id}-label`} className="native-sound-label">
          <strong>Özel bildirim sesi</strong>
          <span id={`${id}-hint`} className="r2-hint">
            Kapalıyken telefonunun kendi bildirim sesi çalar.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          disabled={!snapshot.state || busy}
          className={`r2-switch${enabled ? " on" : ""}`}
          onClick={() => store.toggle()}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      {enabled && shown && snapshot.state && (
        <div className="notification-sound-row">
          <label htmlFor={`${id}-sound`}>
            <strong>Ses</strong>
            <span className="r2-hint">Seçtiğin ses uygulamadaki bildirimlerde çalar.</span>
          </label>
          <SoundSelect
            id={`${id}-sound`}
            label="Özel bildirim"
            sound={shown.sound}
            options={snapshot.state.available}
            disabled={busy}
            previewing={previewing}
            change={sound => store.choose(sound)}
            test={test}
          />
        </div>
      )}
      {snapshot.phase === "loading" && (
        <p role="status" className="r2-hint">
          Uygulamadan okunuyor…
        </p>
      )}
      {snapshot.error && (
        <div className="form-error">
          <p role="alert">{snapshot.error}</p>
          {snapshot.phase === "failed" && (
            <button type="button" onClick={() => store.refresh()}>
              Yeniden dene
            </button>
          )}
        </div>
      )}
      {busy && (
        <p role="status" className="r2-hint">
          Kaydediliyor…
        </p>
      )}
      {message && (
        <p role="status" className="r2-hint">
          {message}
        </p>
      )}
      <p className="r2-hint">Bu tercih yalnız bu uygulamada tutulur, hesabına kaydedilmez.</p>
    </section>
  );
}

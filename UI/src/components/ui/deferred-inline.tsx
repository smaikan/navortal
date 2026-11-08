"use client";
import { createElement, useEffect, useState, type ComponentType } from "react";

// Bir kez yüklenen modül sonraki açılışta beklemeden çiziliyor; seçim değişince alan titremiyor.
const loaded = new WeakMap<() => Promise<unknown>, unknown>();

/** Sayfa içindeki isteğe bağlı form. Modül yüklenemezse yalnız bu alan hata gösterir, sayfa çalışmaya devam eder. */
export function DeferredInline<P extends object>({ load, props }: { load: () => Promise<ComponentType<P>>; props: P }) {
  const [Component, setComponent] = useState<ComponentType<P> | null>(
    () => (loaded.get(load) as ComponentType<P> | undefined) ?? null,
  );
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded.has(load)) return;
    let current = true;
    load().then(
      value => {
        loaded.set(load, value);
        if (current) setComponent(() => value);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);
  if (Component) return createElement(Component, props);
  return (
    <div className="deferred-inline">
      <p role={failed ? "alert" : "status"}>
        {failed
          ? "Form yüklenemedi. Bağlantını kontrol edip yeniden deneyebilirsin. Çalışma kaydın korunuyor."
          : "Form hazırlanıyor…"}
      </p>
      {failed && (
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt(value => value + 1);
            }}
          >
            Formu yeniden yükle
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Sayfayı yenile
          </button>
        </div>
      )}
    </div>
  );
}

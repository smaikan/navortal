"use client";
import { createElement, useEffect, useState, type ComponentType } from "react";
import { Surface } from "./surface";

/** İsteğe bağlı modül yüklenemezse bütün uygulama çökmemeli, aktif oturum kaybolmamalı. */
export function DeferredPanel<P extends object>({
  load,
  props,
  title,
  trigger,
  close,
}: {
  load: () => Promise<ComponentType<P>>;
  props: P;
  title: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null);
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    load().then(
      value => {
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
    <Surface title={title} modal returnTo={trigger} onClose={close}>
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
      <button type="button" onClick={close}>
        Kapat
      </button>
    </Surface>
  );
}

"use client";
import { useLocal } from "../../lib/local-preference";
import { applyTheme, isTheme, THEME_KEY, themes, type Theme } from "../../lib/theme";
import { MiniPlayerSettings } from "../mini-player/settings";

/** Görünüm hemen uygulanır. Cihaza özeldir, hesap tercihleri formunun kaydına girmez. */
export function AppearanceSection() {
  const stored = useLocal(THEME_KEY);
  const theme: Theme = isTheme(stored) ? stored : "light";
  return (
    <section className="preferences-section appearance" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Görünüm</h2>
      <fieldset className="segmented">
        <legend className="sr-only">Tema</legend>
        {(Object.keys(themes) as Theme[]).map(value => (
          <label key={value}>
            <input
              type="radio"
              name="ui-theme"
              value={value}
              checked={theme === value}
              onChange={() => applyTheme(value)}
            />
            <span>{themes[value]}</span>
          </label>
        ))}
      </fieldset>
      <MiniPlayerSettings />
    </section>
  );
}

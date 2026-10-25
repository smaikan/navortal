/** Cihaza özel görünüm tercihi, hesap verisi değil. API'ye gönderilmez, JWT bağdaştırıcısından ayrıdır. */
import { writeLocal } from "./local-preference";

export const THEME_KEY = "ui-theme";
export const themes = { light: "Açık", dark: "Koyu", system: "Sistem" } as const;
export type Theme = keyof typeof themes;

export const isTheme = (value: unknown): value is Theme => typeof value === "string" && Object.hasOwn(themes, value);

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  writeLocal(THEME_KEY, theme);
}

/** İlk boyamadan önce çalışır, kayıtlı koyu temada açık renk parlamasın. isTheme ile aynı kalsın. */
export const themeBootstrap = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});document.documentElement.dataset.theme=t==="dark"||t==="system"?t:"light"}catch(e){document.documentElement.dataset.theme="light"}`;

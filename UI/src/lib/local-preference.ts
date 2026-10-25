"use client";
import { useSyncExternalStore } from "react";

/** Tema ve menü gibi cihaza özel görünüm ayarları. Hesap verisi değil; depolama engelliyse oturumluk değer kullanılır. */
const listeners = new Set<() => void>();
const memory = new Map<string, string>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
export function writeLocal(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Bellekteki değer seçimi bu sayfa boyunca korur. */
  }
  listeners.forEach(listener => listener());
}
/** Sunucu çiziminde ve ilk bağlanmada null, sonrasında kayıtlı değer. */
export function useLocal(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readLocal(key),
    () => null,
  );
}

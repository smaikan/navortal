"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Toast = {
  text: string;
  tone?: "info" | "error";
  action?: { label: string; run: () => void | Promise<void> };
};
const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Tek seferde tek kısa bildirim var, varsa geri al ile 8 saniye sonra kalkıyor. Başarısız kaydın tek izi bu olamaz. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const show = useCallback((next: Toast) => {
    seq.current += 1;
    setToast({ ...next, id: seq.current });
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (toast) timer.current = setTimeout(() => setToast(current => (current?.id === toast.id ? null : current)), 8000);
    return () => clearTimeout(timer.current);
  }, [toast]);
  return (
    <ToastContext value={show}>
      {children}
      <div className="toast-region" role={toast?.tone === "error" ? "alert" : "status"}>
        {toast && (
          <div className={`toast${toast.tone === "error" ? " error" : ""}`} key={toast.id}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  const run = toast.action!.run;
                  setToast(null);
                  void run();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext>
  );
}
export function useToast() {
  return useContext(ToastContext);
}

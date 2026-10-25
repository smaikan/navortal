"use client";
import { useState } from "react";
import { X } from "lucide-react";

const seenKey = "adhd.tips.seen.v1";
const sessionKey = "adhd.tips.session.v1";
function read(storage: () => Storage, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage().getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
/** İpucu bu cihazda kapatılmamışsa ve bu tarayıcı oturumunda başka ipucu gösterilmediyse açılıyor. Her oturumda en fazla bir yeni destek tanıtılıyor. Test edilebilen saf kural burada. */
export function mayShowTip(id: string, seen: string[], shownThisSession: string[]) {
  if (seen.includes(id)) return false;
  return shownThisSession.length === 0 || shownThisSession.includes(id);
}

export function NewTip({ id, children }: { id: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    const ok = mayShowTip(
      id,
      read(() => localStorage, seenKey),
      read(() => sessionStorage, sessionKey),
    );
    if (ok)
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify([id]));
      } catch {
        /* Burada oturum sınırı olmadan gösteriliyor. */
      }
    return ok;
  });
  if (!visible) return null;
  return (
    <p className="new-tip" role="note">
      <span className="new-tip-badge">Yeni</span>
      <span>{children}</span>
      <button
        type="button"
        className="ghost icon"
        aria-label="İpucunu kapat"
        onClick={() => {
          setVisible(false);
          try {
            localStorage.setItem(seenKey, JSON.stringify([...read(() => localStorage, seenKey), id]));
          } catch {
            /* Yalnız bu görünüm için kapanıyor. */
          }
        }}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </p>
  );
}

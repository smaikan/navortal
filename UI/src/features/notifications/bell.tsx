"use client";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useOptionalWork } from "../work/coordinator";
import { unreadIds, useNotificationBadge } from "./badge";
const NotificationPanel = lazy(() => import("./panel").then(m => ({ default: m.NotificationPanel })));

/** İlk ekran boşta kaldıktan sonra sayıyı okuyoruz, başlangıç isteklerine eklenmiyor. */
function useIdle(start: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!start) return;
    const done = () => setIdle(true);
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(done, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(done, 1500);
    return () => clearTimeout(timer);
  }, [start]);
  return idle;
}

/** Sağ üst zil ve okunmamış sayı. Liste panelde açılıyor, sayfa değişmiyor. */
export function NotificationBell() {
  const id = useId();
  // Canlı bağlantının telafi okuması bitsin, sonra boşta kalmayı bekleyip sayıyı bir kere okuyalım.
  const work = useOptionalWork();
  const synced = !work || ["connected", "fallback", "paused"].includes(work.syncStatus);
  const badge = useNotificationBadge(useIdle(synced));
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const unread = unreadIds(badge.data ?? []);
  const count = unread.length;
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  };
  // Bağlantıyla gezinme veya Geri/İleri paneli kapatıyor.
  const [shownAt, setShownAt] = useState(pathname);
  if (shownAt !== pathname) {
    setShownAt(pathname);
    if (open) setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target) || (target as Element).closest?.("[role=menu]")) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const shown = count > 9 ? "9+" : String(count);
  return (
    <div className="bell" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="ghost icon bell-button"
        aria-label={count ? `Bildirimler, ${count > 9 ? "9'dan fazla" : count} okunmamış` : "Bildirimler"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Bell aria-hidden="true" size={18} />
        {count > 0 && (
          <span className="bell-count" aria-hidden="true">
            {shown}
          </span>
        )}
      </button>
      {open && (
        <Suspense fallback={null}>
          <NotificationPanel id={id} close={close} />
        </Suspense>
      )}
    </div>
  );
}

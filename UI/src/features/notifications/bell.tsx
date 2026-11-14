"use client";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { subscribeTraversal } from "../../lib/navigation/traversal";
import { consumeDismissalClick } from "./panel-dismissal";
import { Bell } from "lucide-react";
import { useOptionalWork } from "../work/coordinator";
import { useNotificationBadge } from "./badge";
const mobileMedia = "(max-width: 767px), (max-width: 1024px) and (pointer: coarse)";
const subscribeMobile = (notify: () => void) => {
  const media = window.matchMedia(mobileMedia);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const isMobile = () => window.matchMedia(mobileMedia).matches;
function inboxUrl(open: boolean) {
  const url = new URL(location.href);
  url.searchParams.delete("inbox");
  if (open) url.searchParams.set("inbox", "open");
  return url.pathname + url.search + url.hash;
}
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
  const [desktopOpen, setDesktopOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);
  const search = useSearchParams();
  const open = mobile ? search.get("inbox") === "open" : desktopOpen;
  const closing = useRef(false);
  const restoreFocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const count = badge.data?.unreadCount ?? 0;
  const close = useCallback(
    (focus: boolean, navigating = false) => {
      if (mobile && navigating) return;
      restoreFocus.current = focus;
      if (mobile) {
        if (closing.current) return;
        if (history.state?.navortalInbox === inboxUrl(false)) {
          closing.current = true;
          history.back();
        } else history.replaceState({}, "", inboxUrl(false));
      } else setDesktopOpen(false);
    },
    [mobile],
  );
  function show() {
    if (mobile) history.pushState({ navortalInbox: inboxUrl(false) }, "", inboxUrl(true));
    else setDesktopOpen(true);
  }
  useEffect(() => {
    if (open) return;
    closing.current = false;
    if (restoreFocus.current) {
      restoreFocus.current = false;
      button.current?.focus({ preventScroll: true });
    }
  }, [open]);
  useEffect(() => {
    if (!mobile || !open) return;
    const base = inboxUrl(false);
    return subscribeTraversal(event => {
      // Yalnız panelin kendi geri kaydı; sayfa yönlendirmeleri normal davranır.
      if (location.pathname + location.search + location.hash !== base) return;
      event.stopImmediatePropagation();
      restoreFocus.current = true;
      history.replaceState({}, "", base);
    }, 200);
  }, [mobile, open]);
  // Bağlantıyla gezinme veya Geri/İleri paneli kapatıyor.
  const [shownAt, setShownAt] = useState(pathname);
  if (shownAt !== pathname) {
    setShownAt(pathname);
    if (desktopOpen) setDesktopOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target) || (!mobile && (target as Element).closest?.("[role=menu]"))) return;
      if (mobile) {
        event.preventDefault();
        event.stopImmediatePropagation();
        consumeDismissalClick();
      }
      close(mobile);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      close(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, mobile, close]);
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
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : show())}
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

"use client";

import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  modal: boolean;
  onClose: () => void | boolean;
  closeDisabled?: boolean;
  returnTo: HTMLElement | null;
  children: React.ReactNode;
  initialFocus?: "heading" | "field";
  keepOpenOn?: string;
  /** center tek şeyi okumak veya düzenlemek için ortadaki pencere. center-wide bölümlü geniş pencere (Ayarlar). confirm tek kararlık küçük pencere, telefonda da ortada. Varsayılan sağ panel telefonda alttan açılıyor. full uzun görev düzenleyicisini telefonda tam ekran tutuyor. */
  placement?: "side" | "center" | "center-wide" | "confirm" | "full";
};
const placementClass = {
  side: "",
  center: " modal-center",
  "center-wide": " modal-center modal-wide",
  confirm: " modal-confirm",
  full: " modal-full",
} as const;
/** Modal yerleşiminin sınıfı. Telefon davranışı (alttan sayfa, tam ekran, küçük onay) CSS'te bu sınıflara bağlı. */
export function surfaceClass(placement: keyof typeof placementClass) {
  return `workspace-surface modal-surface${placementClass[placement]}`;
}
const sheetSelector = ".modal-surface:not(.modal-center, .modal-full, .modal-confirm)";
const sheetDuration = 120;
const dragCloseDistance = 80;
const dragCloseSpeed = 0.5;
/** Telefonda alttan açılan pencere mi? Görünüm CSS'teki aynı seçici ve kırılımla belirleniyor. */
function isSheet(element: HTMLElement | null): element is HTMLElement {
  return !!element?.matches(sheetSelector) && window.matchMedia("(max-width: 767px)").matches;
}
function slide(element: HTMLElement, from: string, to: string, entering = false) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  return element.animate([{ transform: from }, { transform: `translateY(${to})` }], {
    duration: sheetDuration,
    easing: entering ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : "cubic-bezier(0.3, 0, 0.8, 0.4)",
    fill: "forwards",
  });
}
const modalLocks = new Set<HTMLDialogElement>();
let bodyOverflow = "";

/** Yerel modal üst katmanı, pasif arka planı ve klavye sınırını kendisi sağlıyor. */
export function Surface({
  title,
  modal,
  onClose,
  closeDisabled = false,
  returnTo,
  children,
  initialFocus = "heading",
  keepOpenOn,
  placement = "side",
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const closing = useRef(false);
  const opening = useRef<Animation | null>(null);
  const outsideDown = useRef(false);
  const titleId = useId();
  const requestClose = useCallback(
    (from = 0) => {
      if (closing.current || closeDisabled) return;
      closing.current = true;
      const element = dialog.current;
      const transform = element && opening.current ? getComputedStyle(element).transform : `translateY(${from}px)`;
      opening.current?.cancel();
      opening.current = null;
      const animation = modal && isSheet(element) ? slide(element, transform, "100%") : null;
      if (element) element.style.transform = "";
      const finish = () => {
        if (onClose() !== false) return;
        closing.current = false;
        animation?.cancel();
      };
      if (animation) void animation.finished.then(finish, () => undefined);
      else finish();
    },
    [closeDisabled, modal, onClose],
  );
  function containTab(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest("[inert]"));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) {
      event.preventDefault();
      heading.current?.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  useEffect(() => {
    const element = dialog.current;
    if (!modal || !element) return;
    // Yalnız üst tutamak ve başlıktan başlayan parmak hareketi pencereyi taşır; içerik kaydırması aynı kalır.
    let drag: { y: number; at: number; distance: number } | null = null;
    const start = (event: TouchEvent) => {
      drag = null;
      if (event.touches.length !== 1 || closing.current || closeDisabled || !isSheet(element)) return;
      const target = event.target as Element;
      const header = element.querySelector(":scope > .surface-header");
      if (!header || target.closest("button, a, input, textarea, select")) return;
      const touch = event.touches[0];
      if (touch.clientY <= header.getBoundingClientRect().bottom)
        drag = { y: touch.clientY, at: event.timeStamp, distance: 0 };
    };
    const move = (event: TouchEvent) => {
      if (!drag) return;
      event.preventDefault();
      opening.current?.cancel();
      opening.current = null;
      drag.distance = Math.max(0, event.touches[0].clientY - drag.y);
      element.style.transform = `translateY(${drag.distance}px)`;
    };
    const end = (event: TouchEvent) => {
      if (!drag) return;
      const { distance, at } = drag;
      drag = null;
      if (
        event.type === "touchend" &&
        (distance >= dragCloseDistance || distance / Math.max(1, event.timeStamp - at) >= dragCloseSpeed)
      ) {
        requestClose(distance);
        return;
      }
      const back = slide(element, `translateY(${distance}px)`, "0");
      element.style.transform = "";
      void back?.finished.then(
        () => back.cancel(),
        () => undefined,
      );
    };
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [closeDisabled, modal, requestClose]);
  useEffect(() => {
    if (modal) return;
    const escape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && !event.defaultPrevented && !closing.current) {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [modal, requestClose]);
  useEffect(() => {
    if (modal) return;
    const outside = (event: PointerEvent) =>
      event.button === 0 &&
      !document.querySelector("dialog[open]") &&
      event.target instanceof Element &&
      !event.target.closest("[data-workspace-surface]") &&
      !(keepOpenOn && event.target.closest(keepOpenOn));
    const down = (event: PointerEvent) => {
      outsideDown.current = outside(event);
    };
    const up = (event: PointerEvent) => {
      if (outsideDown.current && outside(event)) requestClose();
      outsideDown.current = false;
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
    };
  }, [keepOpenOn, modal, requestClose]);
  useEffect(() => {
    const element = dialog.current;
    // Ekran boyutu yüzünden aside yerine dialog geldiğinde daha sonra açılan pencere
    // düzenleme odağını zaten almış olabilir. Yeni ana pencerenin üstünde kalsın.
    const upper =
      modal && element
        ? [...document.querySelectorAll<HTMLDialogElement>("dialog[data-workspace-surface][open]")].find(
            other =>
              other !== element &&
              other.matches(":modal") &&
              !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
          )
        : undefined;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal && element) {
      if (!modalLocks.size) bodyOverflow = document.body.style.overflow;
      modalLocks.add(element);
      element.showModal();
      document.body.style.overflow = "hidden";
      if (upper) {
        upper.close();
        upper.showModal();
        if (focused && upper.contains(focused)) focused.focus({ preventScroll: true });
      }
    }
    if (!upper)
      (
        (initialFocus === "field" &&
          element?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)")) ||
        heading.current
      )?.focus();
    const animation = modal && isSheet(element) ? slide(element, "translateY(100%)", "0", true) : null;
    opening.current = animation;
    void animation?.finished.then(
      () => {
        animation.cancel();
        if (opening.current === animation) opening.current = null;
      },
      () => undefined,
    );
    return () => {
      animation?.cancel();
      element?.close();
      if (modal && element) {
        modalLocks.delete(element);
        document.body.style.overflow = modalLocks.size ? "hidden" : bodyOverflow;
      }
      const focusAfterClose = document.activeElement;
      // Yerel kapanma ve yönlendirici odağı otursun. Yerine gelen pencere odağı devralıyor.
      requestAnimationFrame(() => {
        const visible = (element: HTMLElement) => element.getClientRects().length > 0 && !element.closest("[inert]");
        const open = [...document.querySelectorAll<HTMLElement>("[data-workspace-surface]")].filter(visible);
        // Alttaki pencere açık kalıyorsa odak yalnız açan kontrol o pencerenin içindeyse geri döner.
        if (open.length && !(returnTo?.isConnected && visible(returnTo) && open.some(s => s.contains(returnTo))))
          return;
        if (open.length) {
          returnTo!.focus({ preventScroll: true });
          return;
        }
        const focused = document.activeElement;
        // Yeni eylem veya sayfa odağı sonraki etkileşimi devralmışsa
        // Enter tuşunu eski pencerenin düğmesine geri göndermiyoruz.
        if (
          focused !== focusAfterClose &&
          focused instanceof HTMLElement &&
          focused !== document.body &&
          visible(focused)
        )
          return;
        const fallback = [
          ...document.querySelectorAll<HTMLElement>("#main h1"),
          ...document.querySelectorAll<HTMLElement>("#main"),
        ].find(visible);
        const target = returnTo?.isConnected && visible(returnTo) ? returnTo : fallback;
        target?.focus({ preventScroll: true });
      });
    };
  }, [modal, returnTo, initialFocus]);
  const content = (
    <>
      <header className="surface-header">
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button aria-label={`${title} panelini kapat`} disabled={closeDisabled} onClick={() => requestClose()}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="surface-body">{children}</div>
    </>
  );
  return modal ? (
    <dialog
      ref={dialog}
      data-workspace-surface
      className={surfaceClass(placement)}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={containTab}
      onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        outsideDown.current =
          event.button === 0 &&
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
        if (outsideDown.current && isSheet(event.currentTarget)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerUp={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
        if (isSheet(event.currentTarget) && (outsideDown.current || outside)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (outsideDown.current && outside) requestClose();
        outsideDown.current = false;
      }}
      onPointerCancel={() => {
        outsideDown.current = false;
      }}
      onClick={event => {
        if (!isSheet(event.currentTarget)) return;
        const down = outsideDown.current;
        outsideDown.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
        if (down || outside) {
          // Dokunmanın click olayı da tüketilmeden pencereyi kaldırma.
          event.preventDefault();
          event.stopPropagation();
          if (down && outside) requestClose();
        }
      }}
      onCancel={event => {
        // React içteki modalın cancel olayını üst pencerelere de taşıyor. Yalnız en üstteki kapanmalı.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        requestClose();
      }}
    >
      {content}
    </dialog>
  ) : (
    <aside data-workspace-surface className="workspace-surface docked-surface" aria-labelledby={titleId}>
      {content}
    </aside>
  );
}

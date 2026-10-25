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
  const outsideDown = useRef(false);
  const titleId = useId();
  const requestClose = useCallback(() => {
    if (!closing.current && !closeDisabled) {
      closing.current = true;
      if (onClose() === false) closing.current = false;
    }
  }, [closeDisabled, onClose]);
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
    return () => {
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
        <button aria-label={`${title} panelini kapat`} disabled={closeDisabled} onClick={requestClose}>
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
      }}
      onPointerUp={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
        if (outsideDown.current && outside) requestClose();
        outsideDown.current = false;
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

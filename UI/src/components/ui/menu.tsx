"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export type MenuItem = {
  label: string;
  /** İsteğe bağlı görsel içerik. label sabit anahtar ve erişilebilir yedek ad olarak kalıyor. */
  content?: ReactNode;
  /** Görünen yazıdan farklı olması gerekiyorsa erişilebilir ad burada. Eski düğmelerin adı korunuyor. */
  ariaLabel?: string;
  /** Menü öğesi kapanınca kayboluyor. Açılan pencere odağı bu yüzden menü düğmesine geri veriyor. */
  onSelect: (trigger: HTMLButtonElement) => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};

type MenuPoint = { x: number; y: number };
const contextPoints = new WeakMap<HTMLButtonElement, MenuPoint>();

/** Sağ tık konumunu satırın kendi menü düğmesine iletir. */
export function openRowMenu(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented) return;
  if (
    event.target instanceof Element &&
    event.target.closest("[role=menu], textarea, input:not([type=checkbox]), [contenteditable]")
  )
    return;
  const button = event.currentTarget.querySelector<HTMLButtonElement>(":scope > .menu > .menu-trigger");
  if (!button || button.disabled) return;
  event.preventDefault();
  contextPoints.set(button, { x: event.clientX, y: event.clientY });
  try {
    button.click();
  } finally {
    contextPoints.delete(button);
  }
}

/** İkincil işlemler için ARIA menüsü. Oklar, Home ve End ile gezinilir; Escape, Tab veya dışarı tıklama kapatır ve odak düğmeye döner. */
export function Menu({
  label,
  items,
  children,
  className,
  floating = false,
}: {
  label: string;
  items: (MenuItem | false | null | undefined)[];
  children?: ReactNode;
  className?: string;
  /** Kırpan kapsayıcıdaki satırlar için menüyü üst katmana alıyoruz. */
  floating?: boolean;
}) {
  const [openedAt, setOpenedAt] = useState<false | "trigger" | MenuPoint>(false),
    [up, setUp] = useState(false);
  const open = openedAt !== false;
  const point = typeof openedAt === "object" ? openedAt : null;
  const usePopover = floating || point !== null;
  const trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  const shown = items.filter((item): item is MenuItem => !!item);
  const entries = () =>
    Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
  useLayoutEffect(() => {
    if (!open || !usePopover) return;
    const panel = list.current!,
      anchor = trigger.current!;
    panel.showPopover();
    const place = () => {
      // Sayfa CSS zoom ile ölçeklenmişse left/top/maxHeight yerel değerdir; görünür koordinatı ölçeğe bölerek yazarız.
      const zoom = panel.getBoundingClientRect().width / panel.offsetWidth || 1;
      const width = panel.offsetWidth * zoom,
        height = panel.offsetHeight * zoom;
      if (point) {
        panel.style.maxHeight = `${Math.min(420, innerHeight * 0.7) / zoom}px`;
        panel.style.left = `${Math.max(8, Math.min(point.x, innerWidth - width - 8)) / zoom}px`;
        panel.style.top = `${Math.max(8, Math.min(point.y, innerHeight - height - 8)) / zoom}px`;
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const below = Math.max(0, innerHeight - rect.bottom - 12),
        above = Math.max(0, rect.top - 12);
      const desired = Math.min(panel.scrollHeight * zoom + 2, 420, innerHeight * 0.7);
      const upwards = desired > below && above > below;
      panel.style.maxHeight = `${Math.min(420, innerHeight * 0.7, upwards ? above : below) / zoom}px`;
      panel.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) / zoom}px`;
      panel.style.top = `${Math.max(8, Math.min(upwards ? rect.top - height - 4 : rect.bottom + 4, innerHeight - height - 8)) / zoom}px`;
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      if (panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [open, point, usePopover]);
  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node))
        setOpenedAt(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, point]);
  function toggle() {
    const button = trigger.current;
    const contextPoint = button && contextPoints.get(button);
    if (contextPoint) {
      setOpenedAt(contextPoint);
      return;
    }
    const rect = button?.getBoundingClientRect();
    setUp(!!rect && rect.bottom + 56 * shown.length + 24 > window.innerHeight && rect.top > window.innerHeight / 2);
    setOpenedAt(open ? false : "trigger");
  }
  function close(focus = true) {
    setOpenedAt(false);
    if (focus) trigger.current?.focus();
  }
  function key(event: React.KeyboardEvent) {
    const all = entries(),
      at = all.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(all.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") close(false);
  }
  return (
    <div className={`menu${className ? ` ${className}` : ""}`}>
      <button
        ref={trigger}
        type="button"
        className="menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            toggle();
          }
        }}
      >
        {children ?? <MoreHorizontal aria-hidden="true" size={18} />}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={`menu-list${usePopover ? " menu-floating" : up ? " up" : ""}`}
          popover={usePopover ? "manual" : undefined}
          onKeyDown={key}
        >
          {shown.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${item.danger ? "danger" : ""}${item.separator ? " menu-separator" : ""}`.trim() || undefined}
              disabled={item.disabled}
              aria-label={item.ariaLabel}
              onClick={() => {
                const at = trigger.current!;
                setOpenedAt(false);
                at.focus();
                item.onSelect(at);
              }}
            >
              {item.content ?? item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

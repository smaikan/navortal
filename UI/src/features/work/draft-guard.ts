"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { subscribeTraversal } from "../../lib/navigation/traversal";

/** Modal taslağı korunur. Kapatma, geçmiş, yenileme ve yerel çıkış önce sorar. Süren yazı terk edilmez. */
export function useDialogGuard({
  dirty,
  pending,
  close,
  trigger,
  message,
}: {
  dirty: boolean;
  pending: boolean;
  close: () => void;
  trigger: HTMLElement | null;
  message: string;
}) {
  const guard = useRef({ dirty, pending });
  useLayoutEffect(() => {
    guard.current = { dirty, pending };
  }, [dirty, pending]);
  const allow = () => !guard.current.pending && (!guard.current.dirty || window.confirm(message));
  useEffect(() => {
    const href = location.href;
    // Yakalanan yönlendirme kaydını URL ile birlikte geri yüklüyoruz. Boş durum verilirse
    // Next'in yamalı pushState'i hedef sayfanın ağacını kopyalardı.
    const entry = history.state;
    const unsubscribe = subscribeTraversal(event => {
      if (location.href === href) return;
      if (!(!guard.current.pending && (!guard.current.dirty || window.confirm(message)))) {
        event.stopImmediatePropagation();
        history.pushState(entry, "", href);
      } else close();
    }, 100);
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current.dirty || guard.current.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const logout = (event: Event) => {
      if (guard.current.pending || (guard.current.dirty && !window.confirm(message))) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("adhd:before-local-logout", logout);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("adhd:before-local-logout", logout);
    };
  }, [close, message]);
  return {
    requestClose() {
      if (!allow()) return false;
      close();
      requestAnimationFrame(() => {
        (trigger?.isConnected ? trigger : document.querySelector<HTMLElement>("main h1"))?.focus({
          preventScroll: true,
        });
      });
    },
    markSaved() {
      guard.current.dirty = false;
    },
  };
}

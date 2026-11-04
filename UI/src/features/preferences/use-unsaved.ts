"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeTraversal } from "../../lib/navigation/traversal";

/** Aynı URL'de kontrol noktası ekliyoruz, Geri taslak sökülmeden sorabilsin. Yalnız kendi geçmiş kaydımız var, Next'in özel __NA durumu kopyalanmaz. Ortak dinleyici App Router'dan önce kurulur. */
export function useUnsaved(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const checkpoint = useRef<{ id: string; url: string } | null>(null);
  const armed = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
    // Kayıtlı form yenilenince kendi kontrol noktasını tekrar kullansın;
    // kullanıcı yeniden düzenlediğinde aynı geçmiş kaydı çoğalmasın.
    if (!checkpoint.current && typeof history.state?.adhdUnsaved === "string")
      checkpoint.current = { id: history.state.adhdUnsaved, url: location.href };
    if (dirty && !armed.current) {
      const value = { id: crypto.randomUUID(), url: location.href };
      checkpoint.current = value;
      armed.current = true;
      history.pushState({ adhdUnsaved: value.id }, "", value.url);
    }
  }, [dirty]);
  useEffect(() => {
    let navigate: (() => void) | null = null;
    let restoring = false;
    let leaving = false;
    const confirm = () =>
      !dirtyRef.current || window.confirm("Kaydedilmemiş değişikliklerin var. Kaydetmeden ayrılmak istiyor musun?");
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const logout = (event: Event) => {
      if (!confirm()) event.preventDefault();
      else dirtyRef.current = false;
    };
    const pop = (event: PopStateEvent) => {
      const entry = checkpoint.current;
      if (!entry) return;
      if (restoring) {
        if (event.state?.adhdUnsaved === entry.id) {
          restoring = false;
          return;
        }
        event.stopImmediatePropagation();
        history.forward();
        return;
      }
      if (leaving) {
        if (location.href === entry.url) {
          event.stopImmediatePropagation();
          history.back();
        } else {
          checkpoint.current = null;
          dirtyRef.current = false;
        }
        return;
      }
      if (navigate) {
        event.stopImmediatePropagation();
        if ((location.href === entry.url && event.state?.adhdUnsaved) || event.state?.adhdMenu) history.back();
        else {
          const action = navigate;
          navigate = null;
          checkpoint.current = null;
          dirtyRef.current = false;
          action();
        }
        return;
      }
      if (event.state?.adhdUnsaved === entry.id || event.state?.adhdMenu) return;
      // Normal Geri, tam bu URL'deki kontrol noktası öncesine gider.
      if (location.href === entry.url) {
        event.stopImmediatePropagation();
        if (confirm()) {
          dirtyRef.current = false;
          leaving = true;
          history.back();
        } else {
          restoring = true;
          history.forward();
        }
      } else if (dirtyRef.current && !confirm()) {
        // İlk düzenleme sona yeni kayıt ekliyor. Geçmiş menüsünden atlama
        // geriye doğru olur. İleri gidip tam kendi kontrol noktamıza dönüyoruz;
        // taslağın URL'sini başka sayfanın yönlendirme ağacıyla eşlemiyoruz.
        event.stopImmediatePropagation();
        restoring = true;
        history.forward();
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const target = new URL(anchor.href);
      if (target.origin !== location.origin || target.pathname === location.pathname) return;
      if (!checkpoint.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!confirm()) return;
      navigate = () => router.push(target.pathname + target.search + target.hash);
      history.back();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("adhd:before-local-logout", logout);
    const unsubscribe = subscribeTraversal(pop);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("adhd:before-local-logout", logout);
      unsubscribe();
      document.removeEventListener("click", click, true);
    };
  }, [router]);
}

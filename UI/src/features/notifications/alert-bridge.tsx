"use client";
import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { useSession } from "../auth/provider";
import { alertAudio } from "./alert-audio";
import { alertHealth } from "./alert-health";

const subscribeVisibility = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const visible = () => document.visibilityState === "visible";

/** Oturum kapısından önce özel okuma, güvenilir etkileşimden önce ses yok. */
export function AlertBridge() {
  const { session, state } = useSession();
  const owner = state.user!.id;
  const status = useSyncExternalStore(alertAudio.subscribe, alertAudio.getSnapshot, () => "locked");
  const shown = useSyncExternalStore(subscribeVisibility, visible, () => false);
  const [Feed, setFeed] = useState<ComponentType | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const retry = () => setAttempt(n => n + 1);
    window.addEventListener("online", retry);
    window.addEventListener("planner-alert-retry", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("planner-alert-retry", retry);
    };
  }, []);
  useEffect(() => {
    if (status !== "ready" || !shown || Feed) return;
    let live = true;
    // Ses modülü indirilemezse çalışma alanı hata ekranına dönüşmemeli.
    void import("./alert-feed")
      .then(module => {
        if (live) {
          setFeed(() => module.AlertFeed);
          alertHealth.report("");
        }
      })
      .catch(() => {
        if (live)
          alertHealth.report("Sesli hatırlatmalar yüklenemedi. Bağlantını kontrol edip Sesi dene ile yeniden dene.");
      });
    return () => {
      live = false;
    };
  }, [status, shown, Feed, attempt]);
  useEffect(() => {
    const epoch = session.getIdentity().epoch;
    const current = () => session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
    const activate = (event: Event) => {
      if (event.type === "pointerdown" && (event as PointerEvent).pointerType !== "mouse") return;
      if (event.type === "keydown") {
        const key = event as KeyboardEvent;
        if (key.key === "Escape" || key.ctrlKey || key.metaKey || key.altKey || key.repeat) return;
      }
      if (event.isTrusted && current() && visible() && alertAudio.getSnapshot() !== "ready") void alertAudio.activate();
    };
    const unsubscribe = session.onIdentityChange(() => alertAudio.reset());
    window.addEventListener("pointerdown", activate, { capture: true, passive: true });
    window.addEventListener("pointerup", activate, { capture: true, passive: true });
    window.addEventListener("touchend", activate, { capture: true, passive: true });
    window.addEventListener("keydown", activate, { capture: true });
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("pointerup", activate, true);
      window.removeEventListener("touchend", activate, true);
      window.removeEventListener("keydown", activate, true);
      alertAudio.reset();
      alertHealth.report("");
    };
  }, [session, owner]);
  return status === "ready" && shown && Feed ? <Feed /> : null;
}

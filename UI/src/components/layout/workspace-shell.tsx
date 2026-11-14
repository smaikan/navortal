"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListPlus, MoreHorizontal, Plus } from "lucide-react";
import { Account } from "../../features/auth/account";
import { BrandMark } from "../ui/brand-mark";
import { Surface } from "../ui/surface";
import { NavigationLinks } from "./navigation";
import { TaskPanelProvider } from "./task-panel";
import { closeSettings, readSettingsView, settingsTrigger } from "../../features/preferences/settings-url";
import { useOptionalWork, WorkProvider } from "../../features/work/coordinator";
import { WorkPlayer } from "../../features/work/player";
import { statusLabels } from "../../features/sync/model";
import { ToastProvider } from "../ui/toast";
import { PushBridge } from "../../features/push/runtime";
import { AlertBridge } from "../../features/notifications/alert-bridge";
import { NotificationBell } from "../../features/notifications/bell";
import { MiniPlayerBridge } from "../../features/mini-player/bridge";
import "../../features/tasks/brain-dump.css";
const CommandPalette = lazy(() => import("./command-palette").then(m => ({ default: m.CommandPalette })));
const BrainDump = lazy(() => import("../../features/tasks/brain-dump").then(m => ({ default: m.BrainDump })));
const QuickAdd = lazy(() => import("../../features/tasks/quick-add").then(m => ({ default: m.QuickAdd })));
const SettingsDialog = lazy(() =>
  import("../../features/preferences/settings-dialog").then(m => ({ default: m.SettingsDialog })),
);

/** Test oynatıcısı canlı oynatıcının yerine geçiyor ve canlı eşitlemeyi kapatıyor. */
export function WorkspaceShell({ children, player }: { children: React.ReactNode; player?: React.ReactNode }) {
  return (
    <WorkProvider enabled={!player}>
      <ToastProvider>
        {!player && <PushBridge />}
        {!player && <AlertBridge />}
        {!player && <MiniPlayerBridge />}
        <ShellFrame player={player}>{children}</ShellFrame>
      </ToastProvider>
    </WorkProvider>
  );
}
function ShellFrame({ children, player }: { children: React.ReactNode; player?: React.ReactNode }) {
  const work = useOptionalWork();
  const live =
    !player && !!work && (!!work.work || (work.ready && work.origin === "player" && (!!work.failure || !!work.notice)));
  const [returnTo, setReturnTo] = useState<HTMLButtonElement | null>(null);
  const [quick, setQuick] = useState<HTMLElement | null>(null);
  const [palette, setPalette] = useState<HTMLElement | null>(null);
  const [dump, setDump] = useState<HTMLElement | null>(null);
  const quickButton = useRef<HTMLButtonElement>(null);
  // Ctrl/⌘+K yazarken de paleti açar ama başka pencerenin üstüne açmaz.
  // Odak önceki alana dönüyor. Başlıkta ayrıca arama düğmesi yok.
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      const from = document.activeElement;
      setPalette(from instanceof HTMLElement && from !== document.body ? from : quickButton.current);
    };
    document.addEventListener("keydown", open);
    return () => document.removeEventListener("keydown", open);
  }, []);
  // N hızlı eklemeyi açar. Yazarken, başka tuşla birlikteyken veya pencere açıkken çalışmaz.
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "n" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        event.defaultPrevented
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable], dialog[open]") ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      setQuick(quickButton.current);
    };
    document.addEventListener("keydown", open);
    return () => document.removeEventListener("keydown", open);
  }, []);
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const more = search.get("menu") === "more";
  const settings = readSettingsView(search.get("settings"));
  function menuUrl(open: boolean) {
    const params = new URLSearchParams(search.toString());
    params.delete("menu");
    if (open) params.set("menu", "more");
    return pathname + (params.size ? `?${params}` : "") + window.location.hash;
  }
  function closeMenu() {
    const base = menuUrl(false);
    if (window.history.state?.adhdMenu === base) router.back();
    else window.history.replaceState({}, "", base);
  }
  const shown = player ?? (live ? <WorkPlayer /> : null);
  return (
    <div className={`workspace-shell${shown ? " has-player" : ""}`}>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/planning" prefetch={false}>
          <BrandMark size={25} />
          <span>Navortal</span>
        </Link>
        <nav aria-label="Çalışma alanı" className="sidebar-links">
          <NavigationLinks />
        </nav>
        <Account />
      </aside>
      <div className="workspace-area">
        <header className="workspace-header">
          <Link className="mobile-brand" href="/planning" prefetch={false}>
            <BrandMark size={22} />
            <span className="mobile-brand-name">Navortal</span>
          </Link>
          {!player && work && (
            // Çalışan bağlantı sessiz kalıyor; ekran okuyucu durumunu yine duyuyor. Yalnız sorun gösteriliyor.
            // İlk bağlantı da sorun sayılmıyor. Onu kısa süre göstermek başlığı kaydırıyordu.
            <div
              className={`sync-status${["connected", "paused", "connecting"].includes(work.syncStatus) ? " quiet" : ""}`}
              data-sync-state={work.syncStatus}
            >
              <span className="sync-dot" aria-hidden="true" />
              <span role="status">{statusLabels[work.syncStatus]}</span>
              {work.syncStatus === "fallback" && (
                <button onClick={work.retrySync}>Canlı bağlantıyı yeniden dene</button>
              )}
            </div>
          )}
          {!player && <NotificationBell />}
          <button
            ref={quickButton}
            className="quick-open"
            aria-keyshortcuts="N"
            onClick={event => setQuick(event.currentTarget)}
          >
            <Plus aria-hidden="true" size={16} />
            <span className="quick-label">Görev</span>
            <kbd aria-hidden="true">N</kbd>
          </button>
        </header>
        {!player && work && !work.ready && work.failure && (
          <div role="alert" className="form-error">
            <p>{work.failure}</p>
            <button disabled={!work.online} onClick={() => void work.refresh()}>
              Çalışma durumunu yeniden oku
            </button>
          </div>
        )}
        <TaskPanelProvider
          after={
            <div
              id="work-player-slot"
              role={shown ? "region" : undefined}
              aria-label={shown ? "Çalışma denetimleri" : undefined}
            >
              {shown}
            </div>
          }
        >
          {children}
        </TaskPanelProvider>
      </div>
      <nav aria-label="Mobil gezinme" className="mobile-navigation">
        <NavigationLinks subset="primary" />
        <button
          aria-expanded={more}
          aria-haspopup="dialog"
          onClick={event => {
            setReturnTo(event.currentTarget);
            window.history.pushState({ adhdMenu: menuUrl(false) }, "", menuUrl(true));
          }}
        >
          <MoreHorizontal aria-hidden="true" size={21} />
          <span>Daha fazla</span>
        </button>
      </nav>
      {quick && (
        <Suspense fallback={<p role="status">Hızlı ekleme açılıyor…</p>}>
          <Surface
            title="Hızlı görev ekle"
            modal
            placement="center"
            initialFocus="field"
            onClose={() => setQuick(null)}
            returnTo={quick}
          >
            <QuickAdd />
            <button
              type="button"
              className="quick-dump-entry r2-quiet-link"
              onClick={() => {
                const from = quick;
                setQuick(null);
                setDump(from);
              }}
            >
              <ListPlus size={16} aria-hidden="true" />
              Çoklu görev
            </button>
          </Surface>
        </Suspense>
      )}
      {palette && (
        <Suspense fallback={null}>
          <CommandPalette
            trigger={palette}
            close={() => setPalette(null)}
            quickAdd={() => setQuick(quickButton.current)}
            brainDump={() => setDump(quickButton.current)}
          />
        </Suspense>
      )}
      {dump && (
        <Suspense fallback={<p role="status">Açılıyor…</p>}>
          <Surface
            title="Çoklu görev"
            modal
            placement="center"
            initialFocus="field"
            onClose={() => setDump(null)}
            returnTo={dump}
          >
            <BrainDump />
          </Surface>
        </Suspense>
      )}
      {settings && (
        <Suspense fallback={null}>
          <SettingsDialog view={settings} close={closeSettings} returnTo={settingsTrigger()} />
        </Suspense>
      )}
      {more && (
        <Surface title="Daha fazla" modal onClose={closeMenu} returnTo={returnTo}>
          <nav aria-label="Diğer bölümler" className="more-links">
            <NavigationLinks subset="more" onNavigate={() => window.history.replaceState({}, "", menuUrl(false))} />
          </nav>
          <Account />
        </Surface>
      )}
    </div>
  );
}

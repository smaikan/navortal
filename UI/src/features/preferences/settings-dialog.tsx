"use client";
import { lazy, Suspense, useCallback, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Surface } from "../../components/ui/surface";
import { legalLinks } from "../legal/links";
import { AccountSection } from "./account-section";
import { AppearanceSection } from "./appearance";
import { PreferencesForm } from "./form";
import { ProfileSection } from "./profile-section";
import { usePreferences } from "./queries";
import { changeSettings, settingsSections, type SettingsSection, type SettingsView } from "./settings-url";
import { SupportsSection } from "./supports";
import "./settings.css";
const NotificationPreferences = lazy(() =>
  import("../notifications/preferences-content").then(module => ({ default: module.NotificationPreferences })),
);

const narrowQuery = "(max-width: 640px)";
function subscribeNarrow(change: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );

/** Bölümlü geniş pencere. Masaüstünde solda bölümler, sağda yalnız seçili bölüm; telefonda önce liste, sonra geri oklu ayrıntı. */
export function SettingsDialog({
  view,
  close,
  returnTo,
}: {
  view: SettingsView;
  close: () => void;
  returnTo: HTMLElement | null;
}) {
  const narrow = useNarrow();
  const dirty = useRef(false);
  const onDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const leave = () =>
    !dirty.current || window.confirm("Kaydedilmemiş değişikliklerin var. Kaydetmeden ayrılmak istiyor musun?");
  const section: SettingsSection | null = view === "menu" ? (narrow ? null : "profile") : view;
  function show(next: SettingsView) {
    if (next === view || !leave()) return;
    dirty.current = false;
    changeSettings(next);
  }
  return (
    <Surface
      title="Ayarlar"
      modal
      placement="center-wide"
      returnTo={returnTo}
      onClose={() => {
        if (!leave()) return false;
        dirty.current = false;
        close();
      }}
    >
      <div className={`settings-layout${section ? " has-section" : ""}`}>
        <nav aria-label="Ayar bölümleri" className="settings-nav">
          {settingsSections.map(item => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => show(item.id)}
            >
              <span>{item.label}</span>
              <ChevronRight aria-hidden="true" size={16} className="settings-nav-arrow" />
            </button>
          ))}
        </nav>
        {section && (
          <div className="settings-content">
            {narrow && (
              <button type="button" className="settings-back" onClick={() => show("menu")}>
                <ChevronLeft aria-hidden="true" size={18} />
                Ayarlar listesine dön
              </button>
            )}
            <SectionContent section={section} onDirty={onDirty} />
          </div>
        )}
      </div>
    </Surface>
  );
}

function SectionContent({ section, onDirty }: { section: SettingsSection; onDirty: (dirty: boolean) => void }) {
  switch (section) {
    case "profile":
      return <ProfileSection />;
    case "appearance":
      return <AppearanceSection />;
    case "supports":
      return <SupportsSection />;
    case "hours":
      return <HoursSection onDirty={onDirty} />;
    case "notifications":
      return (
        <section className="preferences-section" aria-labelledby="settings-notifications">
          <h2 id="settings-notifications">Bildirimler ve ses</h2>
          <Suspense fallback={<p role="status">Bildirim tercihleri açılıyor…</p>}>
            <NotificationPreferences onDirty={onDirty} />
          </Suspense>
        </section>
      );
    case "account":
      return <AccountSection onDirty={onDirty} />;
    case "privacy":
      return (
        <section className="preferences-section" aria-labelledby="settings-privacy">
          <h2 id="settings-privacy">Gizlilik ve kullanım</h2>
          <p className="muted">Verilerin, kullanım koşulları ve başvuru yolları.</p>
          <nav className="settings-legal-links" aria-label="Gizlilik ve kullanım">
            {legalLinks.map(link => (
              <Link key={link.href} href={link.href} prefetch={false}>
                {link.label}
              </Link>
            ))}
          </nav>
        </section>
      );
  }
}

function HoursSection({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const preferences = usePreferences();
  if (preferences.data) return <PreferencesForm initial={preferences.data} onDirty={onDirty} />;
  if (preferences.isPending)
    return (
      <p role="status" className="preference-empty">
        Tercihler okunuyor…
      </p>
    );
  return (
    <div className="form-error" role="alert">
      <p>Tercihler alınamadı. Kaydetmeden önce bağlantını kontrol edip yeniden yükle.</p>
      <button onClick={() => void preferences.refetch()}>Tercihleri yeniden yükle</button>
    </div>
  );
}

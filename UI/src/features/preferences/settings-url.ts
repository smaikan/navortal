/** Ayarlar ayrı sayfa değil, açık sayfanın üstünde ?settings=<bölüm> ile açılan geniş penceredir. Geri tuşu pencereyi kapatır. */
export const settingsSections = [
  { id: "profile", label: "Profil" },
  { id: "appearance", label: "Görünüm" },
  { id: "supports", label: "Destekler" },
  { id: "hours", label: "Saat ve çalışma günü" },
  { id: "notifications", label: "Bildirimler ve ses" },
  { id: "account", label: "Hesap" },
  { id: "privacy", label: "Gizlilik ve kullanım" },
] as const;
export type SettingsSection = (typeof settingsSections)[number]["id"];
/** menu yalnız telefonda bölüm listesini gösterir; geniş ekranda Profil açılır. */
export type SettingsView = SettingsSection | "menu";

export function readSettingsView(value: string | null): SettingsView | null {
  if (value === null) return null;
  return value === "menu" || settingsSections.some(s => s.id === value) ? (value as SettingsView) : "profile";
}

function settingsUrl(view: SettingsView | null) {
  const params = new URLSearchParams(window.location.search);
  params.delete("settings");
  // Telefondaki Daha fazla menüsünden açılınca o menü kapanır.
  params.delete("menu");
  if (view) params.set("settings", view);
  return window.location.pathname + (params.size ? `?${params}` : "") + window.location.hash;
}

// Pencere adresle açıldığı için kapanınca odağın döneceği kontrolü açılış anında tutuyoruz.
let trigger: HTMLElement | null = null;
export const settingsTrigger = () => (trigger?.isConnected ? trigger : null);

export function openSettings(view: SettingsView) {
  const from = document.activeElement;
  trigger = from instanceof HTMLElement && from !== document.body ? from : null;
  window.history.pushState({ adhdSettings: settingsUrl(null) }, "", settingsUrl(view));
}

export function changeSettings(view: SettingsView) {
  // Next'in kendi geçmiş alanlarını kopyalamıyoruz; kopyalanırsa useSearchParams güncellenmez.
  window.history.replaceState({ adhdSettings: window.history.state?.adhdSettings }, "", settingsUrl(view));
}

export function closeSettings() {
  const base = settingsUrl(null);
  if (window.history.state?.adhdSettings === base) window.history.back();
  else window.history.replaceState({}, "", base);
}

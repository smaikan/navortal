"use client";
import { useRouter } from "next/navigation";
import { Menu } from "../../components/ui/menu";
import { useSession } from "./provider";
import { allowLocalLogout } from "../../lib/navigation/unsaved";
import { OFFLINE_LOGOUT_NOTICE } from "./logout-notice";
import Link from "next/link";
import { Check, ChevronDown, CircleHelp, LogOut, Settings, ShieldCheck } from "lucide-react";
import { ProfileAvatar } from "./avatar";
import { openSettings } from "../preferences/settings-url";

/** Hesap düğmesindeki harf menüyü açıyor. Hesap, ayarlar ve sunucudan çıkış burada. */
export function Account() {
  const { state, session } = useSession();
  const router = useRouter();
  if (!state.user) return null;
  const email = state.user.email;
  // Parolayla kayıtta displayName e-posta olabiliyor. Kullanıcının verdiği gerçek adları koruyoruz.
  const name = state.user.displayName?.trim() || email;
  const named = name.toLowerCase() !== email.toLowerCase();
  return (
    <div className="account-footer">
      <Menu
        label="Hesap menüsü"
        className="account-menu"
        items={[
          {
            label: `Giriş yapılan hesap: ${email}`,
            ariaLabel: `Giriş yapılan hesap: ${email}`,
            disabled: true,
            onSelect: () => undefined,
            content: (
              <span className="account-card">
                <ProfileAvatar user={state.user} className="account-card-avatar" />
                <span className="account-card-copy">
                  <strong title={name}>{name}</strong>
                  {named && <span title={email}>{email}</span>}
                </span>
                <Check size={16} aria-hidden="true" className="account-current" />
              </span>
            ),
          },
          {
            label: "Ayarlar",
            content: (
              <>
                <Settings size={17} aria-hidden="true" />
                <span>Ayarlar</span>
              </>
            ),
            onSelect: () => openSettings(window.matchMedia("(max-width: 640px)").matches ? "menu" : "profile"),
          },
          {
            label: "Gizlilik ve kullanım",
            content: (
              <>
                <ShieldCheck size={17} aria-hidden="true" />
                <span>Gizlilik ve kullanım</span>
              </>
            ),
            onSelect: () => router.push("/privacy-notice"),
          },
          {
            label: "Çıkış yap",
            separator: true,
            content: (
              <>
                <LogOut size={17} aria-hidden="true" />
                <span>Çıkış yap</span>
              </>
            ),
            onSelect: () => {
              if (!allowLocalLogout()) return;
              void session.logout().then(reached => {
                if (reached) return;
                try {
                  sessionStorage.setItem(OFFLINE_LOGOUT_NOTICE, "1");
                } catch {
                  /* Giriş ekranında fazladan not göstermiyoruz. */
                }
              });
            },
          },
        ]}
      >
        <ProfileAvatar user={state.user} className="account-initial" />
        <span className="account-name" title={name}>
          <span>{name}</span>
        </span>
        <ChevronDown className="account-chevron" size={14} aria-hidden="true" />
      </Menu>
      <Link
        className="account-help"
        href="/guide"
        prefetch={false}
        aria-label="Kullanım rehberi"
        title="Kullanım rehberi"
      >
        <CircleHelp size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

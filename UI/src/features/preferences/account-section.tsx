"use client";
import { useState } from "react";
import { Surface } from "../../components/ui/surface";
import { useSession } from "../auth/provider";
import { allowLocalLogout } from "../../lib/navigation/unsaved";
import { PasswordChange } from "./password-change";

/** Hesap bölümünde mevcut hesap ve bütün cihazlardan onaylı çıkış var. */
export function AccountSection({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const { state, session } = useSession();
  const [confirm, setConfirm] = useState<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  if (!state.user) return null;
  return (
    <section className="preferences-section account-section" aria-labelledby="account-heading">
      <h2 id="account-heading">Hesap</h2>
      <p className="muted">
        Giriş yapılan hesap: <span>{state.user.email}</span>
      </p>
      <PasswordChange key={`${state.user.id}:${session.getIdentity().epoch}`} owner={state.user.id} onDirty={onDirty} />
      <div className="account-sessions">
        <h3>Oturumlar</h3>
        <p className="muted">Bu hesapla açık olan bütün cihazlardan çıkış yapabilirsin.</p>
        <button type="button" className="danger" onClick={event => setConfirm(event.currentTarget)}>
          Tüm cihazlardan çık
        </button>
      </div>
      {confirm && (
        <Surface
          title="Tüm cihazlardan çıkılsın mı?"
          modal
          placement="confirm"
          onClose={() => !busy && setConfirm(null)}
          returnTo={confirm}
        >
          <p>Bu cihaz dahil bütün oturumların kapanır. Sürmekte olan çalışmalar ve bildirim abonelikleri değişmez.</p>
          <div className="actions">
            <button
              type="button"
              className="danger"
              aria-busy={busy}
              disabled={busy}
              onClick={() => {
                if (!allowLocalLogout()) return;
                setBusy(true);
                void session.logoutEverywhere();
              }}
            >
              Tüm cihazlardan çık
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)}>
              Vazgeç
            </button>
          </div>
        </Surface>
      )}
    </section>
  );
}

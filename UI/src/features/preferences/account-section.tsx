"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GoogleSignInButton } from "../auth/google-sign-in-button";
import { readProfile } from "./profile-model";
import { queryKeys } from "../../lib/api/query-client";
import { Surface } from "../../components/ui/surface";
import { useSession } from "../auth/provider";
import { allowLocalLogout } from "../../lib/navigation/unsaved";
import { PasswordChange } from "./password-change";

/** Hesap bölümünde mevcut hesap ve bütün cihazlardan onaylı çıkış var. */
export function AccountSection({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const { state, session } = useSession();
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.resource(state.user?.id ?? "", "profile"),
    enabled: !!state.user,
    queryFn: async ({ signal }) => readProfile(await session.api.read("/api/account/profile", { signal })),
  });
  const [confirm, setConfirm] = useState<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordCreated, setPasswordCreated] = useState(false);
  if (!state.user) return null;
  return (
    <section className="preferences-section account-section" aria-labelledby="account-heading">
      <h2 id="account-heading">Hesap</h2>
      <p className="muted">
        Giriş yapılan hesap: <span>{state.user.email}</span>
      </p>
      <section className="account-methods" aria-label="Giriş yöntemleri">
        <h3>Giriş yöntemleri</h3>
        {profile.isPending ? (
          <p role="status">Giriş yöntemleri okunuyor…</p>
        ) : profile.isError ? (
          <p role="alert">
            Hesap bilgileri alınamadı. <button onClick={() => void profile.refetch()}>Yeniden dene</button>
          </p>
        ) : (
          <>
            {profile.data.hasPassword && (
              <div className="account-method">
                <div>
                  <strong>E-posta ve parola</strong>
                  <p className="muted">{state.user.email}</p>
                </div>
                <span>Etkin</span>
              </div>
            )}
            <div className="account-method">
              <div>
                <strong>Google</strong>
                <p className="muted">
                  {profile.data.googleLinked ? state.user.email : "Google hesabınla da giriş yapabilirsin."}
                </p>
              </div>
              {profile.data.googleLinked && <span>Bağlı</span>}
            </div>
            {!profile.data.googleLinked && (
              <GoogleSignInButton
                mode="link"
                onLinked={() => {
                  void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "profile") });
                }}
              />
            )}
            {profile.data.googleLinked && (
              <p className="muted form-hint">Google ile giriş yaptığında aynı hesabın açılır.</p>
            )}
          </>
        )}
      </section>
      {passwordCreated && (
        <p role="status" className="account-password-success">
          Şifren oluşturuldu. Artık e-posta ve şifrenle de giriş yapabilirsin. Diğer cihazlardaki oturumların kapatıldı.
        </p>
      )}
      {profile.data && (profile.data.hasPassword || profile.data.googleLinked) && (
        <PasswordChange
          key={`${state.user.id}:${session.getIdentity().epoch}:${!!profile.data.hasPassword}`}
          owner={state.user.id}
          mode={profile.data.hasPassword ? "change" : "create"}
          onDirty={onDirty}
          onCreated={() => {
            setPasswordCreated(true);
            void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "profile") });
          }}
        />
      )}
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

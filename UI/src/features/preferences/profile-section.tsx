"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ProfileAvatar } from "../auth/avatar";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { Menu } from "../../components/ui/menu";
import { photoBase64, readProfile, type Profile } from "./profile-model";
import "./profile.css";

type Intent = { kind: "name"; first: string; last: string } | { kind: "photo"; id: string } | { kind: "remove" };
export function ProfileSection() {
  const { state } = useSession();
  return state.user ? <ProfileEditor key={state.user.id} owner={state.user.id} /> : null;
}
function ProfileEditor({ owner }: { owner: string }) {
  const { session } = useSession();
  const client = useQueryClient();
  const key = queryKeys.resource(owner, "profile");
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = readProfile(await session.api.read("/api/account/profile", { signal }));
      if (result.user.id !== owner) throw new ApiError("protocol", "Profil sahibi doğrulanamadı.");
      return result;
    },
    structuralSharing: (old, next) => {
      const before = old as Profile | undefined,
        after = next as Profile;
      return before && (before.user.profileVersion ?? 1) > (after.user.profileVersion ?? 1) ? before : after;
    },
    networkMode: "always",
  });
  const [draft, setDraft] = useState<{ first: string; last: string; version: number }>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState<Intent>();
  const fileInput = useRef<HTMLInputElement>(null);
  const profile = query.data;
  const first = draft?.first ?? profile?.firstName ?? "";
  const last = draft?.last ?? profile?.lastName ?? "";
  const changed = !!profile && (first.trim() !== profile.firstName || last.trim() !== profile.lastName);
  const identity = () => session.getIdentity().epoch;
  function current(epoch: number) {
    return identity() === epoch && session.getSnapshot().user?.id === owner;
  }
  function accept(result: Profile, epoch: number) {
    if (!current(epoch) || result.user.id !== owner) return false;
    client.setQueryData<Profile>(key, old =>
      old && (old.user.profileVersion ?? 1) > (result.user.profileVersion ?? 1) ? old : result,
    );
    session.updateUser(result.user, epoch);
    return true;
  }
  async function run(intent: Intent, file?: File) {
    if (!profile || sending.current || blocked) return;
    sending.current = true;
    setBusy(true);
    setIssue("");
    setMessage("");
    const epoch = identity();
    try {
      await client.cancelQueries({ queryKey: key });
      let result: Profile;
      if (intent.kind === "name") {
        result = readProfile(
          await session.api
            .mutation("/api/account/profile", "put", {
              body: {
                version: draft?.version ?? profile.user.profileVersion!,
                expectedUserId: owner,
                firstName: intent.first,
                lastName: intent.last,
              },
            })
            .execute(),
        );
      } else if (intent.kind === "photo") {
        const contentBase64 = await photoBase64(file!);
        if (!current(epoch)) return;
        result = readProfile(
          await session.api
            .mutation("/api/account/profile/photo", "put", {
              body: {
                version: profile.user.profileVersion!,
                expectedUserId: owner,
                uploadId: intent.id,
                mediaType: file!.type,
                contentBase64,
              },
            })
            .execute(),
        );
      } else {
        result = readProfile(
          await session.api
            .mutation("/api/account/profile/photo", "delete", {
              body: { version: profile.user.profileVersion!, expectedUserId: owner },
            })
            .execute(),
        );
      }
      if (!accept(result, epoch)) return;
      if (intent.kind === "name") setDraft(undefined);
      else if (
        result.user.profileVersion === profile.user.profileVersion + 1 &&
        result.firstName === profile.firstName &&
        result.lastName === profile.lastName
      )
        setDraft(old =>
          old?.version === profile.user.profileVersion ? { ...old, version: result.user.profileVersion } : old,
        );
      setMessage(
        intent.kind === "name"
          ? "Ad ve soyad kaydedildi."
          : intent.kind === "photo"
            ? "Profil fotoğrafı güncellendi."
            : "Profil fotoğrafı kaldırıldı.",
      );
    } catch (error) {
      if (!current(epoch)) return;
      if (error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status >= 500)) {
        setBlocked(intent);
        setIssue(
          error.status === 409
            ? "Profil başka bir yerde değişti. Güncel bilgileri kontrol et."
            : "İşlemin sonucu doğrulanamadı. Yeniden göndermeden önce güncel profili kontrol et.",
        );
      } else setIssue(error instanceof Error ? error.message : "Profil güncellenemedi.");
    } finally {
      sending.current = false;
      if (current(epoch)) setBusy(false);
    }
  }
  async function reconcile() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const epoch = identity();
    try {
      const result = readProfile(await session.api.read("/api/account/profile"));
      if (!accept(result, epoch)) return;
      const matched =
        blocked?.kind === "name"
          ? result.firstName === blocked.first && result.lastName === blocked.last
          : blocked?.kind === "photo"
            ? result.user.photoVersion === blocked.id
            : blocked?.kind === "remove" && !result.user.photoVersion && !result.user.googlePictureUrl;
      if (matched && blocked?.kind === "name") setDraft(undefined);
      else setDraft(old => (old ? { ...old, version: result.user.profileVersion! } : old));
      setBlocked(undefined);
      setIssue("");
      setMessage(
        matched
          ? "Değişiklik kaydedilmiş. Güncel profil yüklendi."
          : "Güncel profil yüklendi. Bilgileri kontrol edip istersen yeniden kaydedebilirsin.",
      );
    } catch {
      if (current(epoch)) setIssue("Güncel profil alınamadı. Bağlantını kontrol edip yeniden dene.");
    } finally {
      sending.current = false;
      if (current(epoch)) setBusy(false);
    }
  }
  return (
    <section className="preferences-section profile-section" aria-labelledby="profile-title">
      <h2 id="profile-title">Profil</h2>
      {!profile ? (
        query.isPending ? (
          <p role="status">Profil yükleniyor…</p>
        ) : (
          <div className="form-error">
            <p role="alert">Profil bilgileri alınamadı.</p>
            <button onClick={() => void query.refetch()}>Yeniden dene</button>
          </div>
        )
      ) : (
        <>
          <div className="profile-photo-row">
            <ProfileAvatar user={profile.user} className="profile-avatar-large" />
            <div className="profile-photo-controls">
              <div className="actions">
                <button
                  type="button"
                  disabled={busy || !!blocked || !profile.photoUploadEnabled}
                  onClick={() => fileInput.current?.click()}
                >
                  {profile.user.photoVersion || profile.user.googlePictureUrl ? "Fotoğrafı değiştir" : "Fotoğraf seç"}
                </button>
                {(profile.user.photoVersion || profile.user.googlePictureUrl) && (
                  <Menu
                    label="Profil fotoğrafı seçenekleri"
                    items={[
                      {
                        label: "Fotoğrafı kaldır",
                        disabled: busy || !!blocked,
                        onSelect: () => void run({ kind: "remove" }),
                      },
                    ]}
                  />
                )}
              </div>
              <p className="muted form-hint">JPEG, PNG veya WebP · En fazla 2 MB</p>
              {!profile.photoUploadEnabled && <p className="muted form-hint">Fotoğraf yükleme şu an kullanılamıyor.</p>}
            </div>
          </div>
          <input
            className="sr-only profile-file-input"
            ref={fileInput}
            tabIndex={-1}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profil fotoğrafı dosyası"
            disabled={busy || !!blocked || !profile.photoUploadEnabled}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void run({ kind: "photo", id: crypto.randomUUID() }, file);
            }}
          />
          <p className="profile-privacy muted">
            Yüklediğin fotoğraf Cloudinary’de saklanır. Google profil fotoğrafın varsa tarayıcın görseli Google’dan
            alır.{" "}
            <Link href="/privacy-notice" target="_blank" rel="noopener">
              Veri kullanımı hakkında bilgi<span className="sr-only"> (yeni sekmede açılır)</span>
            </Link>
          </p>
          <form
            onSubmit={event => {
              event.preventDefault();
              if (first.trim() && changed) void run({ kind: "name", first: first.trim(), last: last.trim() });
            }}
            aria-busy={busy}
          >
            <div className="profile-name-fields">
              <div className="form-field">
                <label htmlFor="profile-first-name">Ad</label>
                <input
                  id="profile-first-name"
                  value={first}
                  autoComplete="given-name"
                  maxLength={50}
                  required
                  disabled={busy || !!blocked}
                  onChange={event =>
                    setDraft(old => ({
                      first: event.target.value,
                      last,
                      version: old?.version ?? profile.user.profileVersion!,
                    }))
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="profile-last-name">Soyad</label>
                <input
                  id="profile-last-name"
                  value={last}
                  autoComplete="family-name"
                  maxLength={50}
                  disabled={busy || !!blocked}
                  onChange={event =>
                    setDraft(old => ({
                      first,
                      last: event.target.value,
                      version: old?.version ?? profile.user.profileVersion!,
                    }))
                  }
                />
              </div>
            </div>
            <button className="primary" type="submit" disabled={busy || !!blocked || !first.trim() || !changed}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
          <div className="profile-email">
            <span className="form-label">E-posta</span>
            <span>{profile.user.email}</span>
          </div>
          {issue && (
            <div className="form-error">
              <p role="alert">{issue}</p>
              {blocked && (
                <button type="button" disabled={busy} onClick={() => void reconcile()}>
                  Güncel profili kontrol et
                </button>
              )}
            </div>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}

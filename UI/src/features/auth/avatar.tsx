"use client";
import { useState } from "react";
import { isValidGooglePictureUrl, type User } from "./session";
import "./avatar.css";

/** Özel fotoğraf tarayıcının oturum cookie'siyle okunur. Next'in açık görsel iyileştiricisi kullanılmaz. */
export function ProfileAvatar({ user, className = "" }: { user: User; className?: string }) {
  const privatePhotoKey = user.photoVersion ? `${user.id}:photo:${user.photoVersion}` : null;
  const validGoogleUrl =
    user.googlePictureUrl && isValidGooglePictureUrl(user.googlePictureUrl) ? user.googlePictureUrl : null;
  const googlePhotoKey = validGoogleUrl ? `${user.id}:google:${validGoogleUrl}` : null;
  const [failedPrivate, setFailedPrivate] = useState<string>();
  const [failedGoogle, setFailedGoogle] = useState<string>();
  const name = user.displayName?.trim() || user.email;

  const showPrivate = privatePhotoKey && failedPrivate !== privatePhotoKey;
  const showGoogle = !showPrivate && googlePhotoKey && failedGoogle !== googlePhotoKey;

  return (
    <span className={`profile-avatar ${className}`} aria-hidden="true">
      {showPrivate ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cookie ile doğrulanan özel dosya açık görsel iyileştiricisinden geçemez.
        <img
          key={privatePhotoKey}
          src={`/api/account/profile/photo?version=${encodeURIComponent(user.photoVersion!)}`}
          alt=""
          onError={() => setFailedPrivate(privatePhotoKey)}
        />
      ) : showGoogle ? (
        // eslint-disable-next-line @next/next/no-img-element -- Dış kaynaklı Google profil görseli doğrudan yüklenir.
        <img
          key={googlePhotoKey}
          src={validGoogleUrl!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedGoogle(googlePhotoKey)}
        />
      ) : (
        <span>{[...name][0]?.toLocaleUpperCase("tr-TR") || "?"}</span>
      )}
    </span>
  );
}

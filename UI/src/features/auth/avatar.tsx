"use client";
import { useState } from "react";
import type { User } from "./session";
import "./avatar.css";

/** Özel fotoğraf tarayıcının oturum cookie'siyle okunur. Next'in açık görsel iyileştiricisi kullanılmaz. */
export function ProfileAvatar({ user, className = "" }: { user: User; className?: string }) {
  const key = `${user.id}:${user.photoVersion ?? "none"}`;
  const [failed, setFailed] = useState<string>();
  const name = user.displayName?.trim() || user.email;
  return (
    <span className={`profile-avatar ${className}`} aria-hidden="true">
      {user.photoVersion && failed !== key ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cookie ile doğrulanan özel dosya açık görsel iyileştiricisinden geçemez.
        <img
          key={key}
          src={`/api/account/profile/photo?version=${encodeURIComponent(user.photoVersion)}`}
          alt=""
          onError={() => setFailed(key)}
        />
      ) : (
        <span>{[...name][0]?.toLocaleUpperCase("tr-TR") || "?"}</span>
      )}
    </span>
  );
}

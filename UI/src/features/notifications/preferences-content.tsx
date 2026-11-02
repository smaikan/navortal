"use client";
import { NotificationSettings } from "./preferences";
import { PushPage } from "../push/page";

export function NotificationPreferences({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  return (
    <>
      <NotificationSettings onDirty={onDirty} />
      <div className="r2-device-push">
        <PushPage />
      </div>
    </>
  );
}

"use client";
import { NotificationSettings } from "./preferences";
import { PushPage } from "../push/page";
import { NativeSoundSection } from "./native-sound-section";

export function NotificationPreferences({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  return (
    <>
      <NotificationSettings onDirty={onDirty} />
      <NativeSoundSection />
      <div className="r2-device-push">
        <PushPage />
      </div>
    </>
  );
}

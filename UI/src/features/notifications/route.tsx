"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { validTaskId } from "../../components/layout/task-panel-url";
import { useDisplayPreferences } from "../workspace/queries";
import { useNotificationCache } from "./cache";
import { NotificationDetail } from "./detail";

/** A native notification opens only its own detail, without the inbox read-all effect. */
export function NotificationRoute({ id }: { id: string }) {
  const router = useRouter();
  const preferences = useDisplayPreferences();
  const [trigger, setTrigger] = useState<HTMLHeadingElement | null>(null);
  const valid = validTaskId(id);
  useNotificationCache(valid);
  return (
    <main id="main" className="page">
      <h1 ref={setTrigger} tabIndex={-1}>
        Bildirim ayrıntısı
      </h1>
      <Link href="/reminders" prefetch={false}>
        Hatırlatmalara dön
      </Link>
      {!valid && <p role="alert">Bildirim bağlantısı geçersiz.</p>}
      {valid && trigger && (
        <NotificationDetail
          id={id}
          zone={preferences.data?.values.timeZoneId ?? "Europe/Istanbul"}
          trigger={trigger}
          close={() => router.replace("/reminders")}
        />
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { ReminderSection } from "../../../../features/reminders/section";
import { NotificationPreferences } from "../../../../features/notifications/preferences-content";
export const metadata: Metadata = { title: "Bildirim tercihleri", robots: { index: false, follow: false } };
/** Bildirim ayarları burada kaydoluyor, bu cihazın push ayarı da hemen altta. */
export default function Page() {
  return (
    <ReminderSection current="preferences">
      <NotificationPreferences />
    </ReminderSection>
  );
}

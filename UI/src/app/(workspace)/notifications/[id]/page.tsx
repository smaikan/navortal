import type { Metadata } from "next";
import { NotificationRoute } from "../../../../features/notifications/route";

export const metadata: Metadata = { title: "Bildirim ayrıntısı", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotificationRoute id={id} />;
}

import Link from "next/link";

const tabs = [
  ["reminders", "/reminders", "Hatırlatmalar"],
  ["special-days", "/reminders/special-days", "Özel günler"],
  ["preferences", "/reminders/preferences", "Bildirim ayarları"],
] as const;
export type ReminderTab = (typeof tabs)[number][0];

/** Hatırlatma başlığı, bölüm sekmeleri ve aktif sekmenin tek ana eylemi. */
export function ReminderSection({
  current,
  action,
  counts,
  children,
}: {
  current: ReminderTab;
  action?: React.ReactNode;
  /** Sekme başlığının yanında görünen sayı; bilinmeyen sekmede gösterilmez. */
  counts?: Partial<Record<ReminderTab, number | undefined>>;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="workspace-main soft-scale" tabIndex={-1}>
      <header className="page-header reminder-head">
        <h1 tabIndex={-1}>Hatırlatmalar</h1>
        {action}
      </header>
      <nav aria-label="Hatırlatma bölümleri" className="r2-tabs r2-tab-links">
        {tabs.map(([key, href, label]) => (
          <Link key={key} href={href} prefetch={false} aria-current={key === current ? "page" : undefined}>
            {label}
            {counts?.[key] !== undefined && <span className="r2-tab-count">{counts[key]}</span>}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}

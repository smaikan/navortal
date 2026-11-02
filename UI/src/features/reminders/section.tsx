import Link from "next/link";

const tabs = [
  ["reminders", "/reminders", "Hatırlatmalar"],
  ["special-days", "/reminders/special-days", "Özel günler"],
  ["preferences", "/reminders/preferences", "Tercihler"],
] as const;
export type ReminderTab = (typeof tabs)[number][0];

/** Hatırlatma başlığı, bölüm sekmeleri ve aktif sekmenin tek ana eylemi. */
export function ReminderSection({
  current,
  action,
  children,
}: {
  current: ReminderTab;
  action?: React.ReactNode;
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
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}

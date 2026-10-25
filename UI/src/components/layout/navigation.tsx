"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlarmClock,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDot,
  Folder,
  Inbox,
  ListTodo,
  LayoutGrid,
  NotebookPen,
  Repeat,
  Shapes,
  Sun,
  type LucideIcon,
} from "lucide-react";

// Biten görevler yan menüde yok, Görevler başlığından açılıyor.
type Group = "main" | "organize" | "soon";
export const destinations: { path: string; label: string; icon: LucideIcon; group: Group }[] = [
  { path: "/planning", label: "Gün Planlama", icon: Sun, group: "main" },
  { path: "/tasks", label: "Görevler", icon: ListTodo, group: "main" },
  { path: "/calendar", label: "Takvim", icon: CalendarDays, group: "main" },
  { path: "/focus", label: "Pomodoro", icon: CircleDot, group: "main" },
  { path: "/matrix", label: "Eisenhower Matrisi", icon: LayoutGrid, group: "main" },
  { path: "/pool", label: "Havuz", icon: Inbox, group: "organize" },
  { path: "/projects", label: "Projeler", icon: Folder, group: "organize" },
  { path: "/categories", label: "Kategoriler", icon: Shapes, group: "organize" },
  { path: "/notes", label: "Notlar", icon: NotebookPen, group: "organize" },
  { path: "/recurrences", label: "Rutin", icon: Repeat, group: "organize" },
  { path: "/analytics", label: "Analiz", icon: ChartNoAxesCombined, group: "organize" },
  { path: "/reminders", label: "Hatırlatmalar", icon: AlarmClock, group: "organize" },
];

function Links({
  links,
  onNavigate,
  soonId,
}: {
  links: typeof destinations;
  onNavigate?: () => void;
  soonId?: string;
}) {
  const pathname = usePathname();
  return links.map(({ path, label, icon: Icon, group }) => (
    <Link
      key={path}
      href={path}
      prefetch={false}
      onClick={onNavigate}
      aria-current={
        pathname === path || (["/analytics", "/reminders"].includes(path) && pathname.startsWith(path + "/"))
          ? "page"
          : undefined
      }
      className={group === "soon" ? "soon" : undefined}
      aria-describedby={group === "soon" ? soonId : undefined}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      {group === "soon" && (
        <span className="soon-badge" aria-hidden="true">
          Yakında
        </span>
      )}
    </Link>
  ));
}

/** primary mobil çubuk, more ek panel, all ise gruplu masaüstü menüsü için. */
export function NavigationLinks({
  subset = "all",
  onNavigate,
}: {
  subset?: "all" | "primary" | "more";
  onNavigate?: () => void;
}) {
  const soonId = useId();
  const of = (group: Group) => destinations.filter(d => d.group === group);
  if (subset === "primary")
    return <Links links={of("main").filter(x => x.path !== "/matrix")} onNavigate={onNavigate} />;
  return (
    <>
      {subset === "all" && <Links links={of("main")} onNavigate={onNavigate} />}
      {subset === "more" && <Links links={of("main").filter(x => x.path === "/matrix")} onNavigate={onNavigate} />}
      <hr className="nav-divider" />
      <Links links={of("organize")} onNavigate={onNavigate} />
      {of("soon").length > 0 && (
        <p className="nav-group-label" id={soonId}>
          Yakında
        </p>
      )}
      <Links links={of("soon")} onNavigate={onNavigate} soonId={soonId} />
    </>
  );
}

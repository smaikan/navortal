"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  CalendarHeart,
  Check,
  CircleDot,
  Clock,
  Coffee,
  Flag,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { useDisplayPreferences } from "../workspace/queries";
import { useSession } from "../auth/provider";
import { useTask } from "../tasks/queries";
import { useNotifications } from "./queries";
import { useNotificationCache } from "./cache";
import {
  deliveryKey,
  failure,
  isUnreadAfter,
  kinds,
  mustReconcile,
  pageSize,
  readNotification,
  type Notification,
} from "./model";
import { useReadNotificationsOnOpen } from "./read-on-open";

const dayKey = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
const kindIcon: Record<keyof typeof kinds, { icon: LucideIcon; tone: string }> = {
  ScheduleStart: { icon: Clock, tone: "plan" },
  ScheduleEnd: { icon: Clock, tone: "plan" },
  TaskDeadline: { icon: Flag, tone: "due" },
  FocusTarget: { icon: CircleDot, tone: "focus" },
  BreakEnd: { icon: Coffee, tone: "focus" },
  ReturnToTask: { icon: Undo2, tone: "plan" },
  Custom: { icon: AlarmClock, tone: "own" },
  SpecialDay: { icon: CalendarHeart, tone: "day" },
};

/** Panel açılınca mevcut sunucu listesini bir kere işaretliyoruz. Göstergeler doğrulanmış makbuz/readAt değerini izler. Sonradan gelenler, eski GET gelse bile okunmamış kalır. */
export function NotificationPanel({ id, close }: { id: string; close: (restoreFocus: boolean) => void }) {
  const readOnOpen = useReadNotificationsOnOpen();
  const [offset, setOffset] = useState(0),
    [open, setOpen] = useState<string | null>(null);
  const list = useNotifications(offset);
  const prefs = useDisplayPreferences();
  useNotificationCache(true);
  const { state } = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const data = list.data;
  const zone = prefs.data?.values.timeZoneId ?? "Europe/Istanbul";
  const items = data?.items ?? [];
  const newCount = items.filter(n => isUnreadAfter(n, readOnOpen.readAt)).length;
  const [now] = useState(() => Date.now());
  const today = dayKey(new Date(now).toISOString(), zone),
    yesterday = dayKey(new Date(now - 86400000).toISOString(), zone);
  const groups = new Map<string, Notification[]>();
  for (const n of items) {
    const key = dayKey(n.occurredAt, zone);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const label = (key: string) =>
    key === today
      ? "Bugün"
      : key === yesterday
        ? "Dün"
        : new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" }).format(
            new Date(`${key}T12:00:00Z`),
          );
  return (
    <section id={id} className="bell-panel" role="dialog" aria-labelledby={`${id}-title`}>
      <header className="bell-panel-head">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
          Bildirimler
        </h2>
        {newCount > 0 && <span className="bell-panel-count">{newCount} yeni</span>}
        <button type="button" className="ghost icon bell-panel-close" aria-label="Kapat" onClick={() => close(true)}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="bell-panel-body">
        {readOnOpen.issue && (
          <p role="alert" className="field-error">
            {readOnOpen.issue}{" "}
            <button type="button" onClick={readOnOpen.retry}>
              Okundu olarak işaretlemeyi tekrar dene
            </button>
          </p>
        )}
        {list.isPending && (
          <p role="status" className="r2-hint bell-panel-note">
            Bildirimler okunuyor…
          </p>
        )}
        {list.isError && (
          <div role="alert" className="form-error bell-panel-note">
            {failure(list.error)}
            <button type="button" onClick={() => void list.refetch()}>
              Bildirimleri yenile
            </button>
          </div>
        )}
        {data && !items.length && (
          <div className="bell-panel-empty">
            <span aria-hidden="true">
              <Check size={20} />
            </span>
            <strong>Her şey sakin</strong>
            <span>{Number(data.total) === 0 ? "Henüz bildirim yok." : "Bu sayfada bildirim yok."}</span>
          </div>
        )}
        {[...groups].map(([key, rows]) => (
          <section key={key} aria-label={label(key)} className="r2-inbox-group">
            <h3>{label(key)}</h3>
            <ul className="r2-inbox" aria-label={`${label(key)} bildirimleri`}>
              {rows.map(n => (
                <Row
                  key={`${n.id}:${n.version}`}
                  n={n}
                  zone={zone}
                  readAt={readOnOpen.readAt}
                  expanded={open === n.id}
                  toggle={() => setOpen(open === n.id ? null : n.id)}
                  deliveryKey={deliveryKey(state.user!.id, n)}
                  navigate={() => close(false)}
                />
              ))}
            </ul>
          </section>
        ))}
        {data && Number(data.total) > pageSize && (
          <nav className="bell-panel-pages" aria-label="Bildirim sayfaları">
            <button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
              Daha yeni
            </button>
            <span>
              {data.items.length ? `${offset ? `${offset + 1}–` : ""}${offset + data.items.length} / ${data.total}` : ""}
            </span>
            <button
              type="button"
              disabled={offset + pageSize >= Number(data.total) || offset + pageSize > 100000}
              onClick={() => setOffset(offset + pageSize)}
            >
              Daha eski
            </button>
          </nav>
        )}
      </div>
      <footer className="bell-panel-foot">
        <Link href="/reminders" prefetch={false} onClick={() => close(false)}>
          <AlarmClock aria-hidden="true" size={15} />
          Hatırlatmalar
        </Link>
        <Link href="/reminders/preferences" prefetch={false} onClick={() => close(false)}>
          <SlidersHorizontal aria-hidden="true" size={15} />
          Bildirim tercihleri
        </Link>
      </footer>
    </section>
  );
}

function Row({
  n,
  zone,
  readAt,
  expanded,
  toggle,
  deliveryKey: key,
  navigate,
}: {
  n: Notification;
  zone: string;
  readAt: string | null;
  expanded: boolean;
  toggle: () => void;
  deliveryKey: string;
  navigate: () => void;
}) {
  const { session } = useSession();
  const cache = useNotificationCache();
  const [pending, setPending] = useState(false),
    [issue, setIssue] = useState(""),
    [blocked, setBlocked] = useState(false);
  const busy = useRef(false);
  async function command(action: "read" | "snooze") {
    if (busy.current || blocked) return;
    busy.current = true;
    setPending(true);
    setIssue("");
    try {
      const options = { path: { id: n.id }, body: { version: n.version } };
      const raw = await (
        action === "read"
          ? session.api.mutation("/api/notifications/{id}/read", "post", options)
          : session.api.mutation("/api/notifications/{id}/snooze", "post", options)
      ).execute();
      const result = readNotification(raw, n.id);
      if (cache.current()) cache.changed(result);
    } catch (error) {
      if (cache.current()) {
        setIssue(failure(error));
        setBlocked(mustReconcile(error));
        if (mustReconcile(error)) cache.changed();
      }
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  const unread = isUnreadAfter(n, readAt);
  const kind = n.title ?? kinds[n.kind as keyof typeof kinds];
  const time = new Intl.DateTimeFormat("tr-TR", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(n.occurredAt),
  );
  const quiet = !["Pending", "Ready"].includes(n.state);
  const mark = kindIcon[n.kind as keyof typeof kinds] ?? kindIcon.Custom;
  const Icon = mark.icon;
  return (
    <li
      data-notification-id={n.id}
      data-delivery-key={key}
      className={`r2-inbox-row${unread ? " unread" : ""}${expanded ? " open" : ""}`}
      aria-busy={pending || undefined}
    >
      <div className="r2-inbox-line">
        <span className={`bell-kind tone-${mark.tone}`} aria-hidden="true">
          <Icon size={15} />
        </span>
        <button
          type="button"
          className="r2-inbox-body"
          aria-expanded={expanded}
          aria-label={`${kind} bildirimini aç`}
          onClick={toggle}
        >
          <span className="r2-inbox-title">{kind}</span>
          <span className="r2-inbox-meta">
            {unread && <span className="sr-only">Yeni. </span>}
            {n.title && `${kinds[n.kind as keyof typeof kinds]} · `}
            {time}
            {n.state === "Pending" && " · Bekliyor"}
            {quiet && " · Artık geçerli değil"}
          </span>
        </button>
        <span className="r2-unread-dot" aria-hidden="true" />
        <Menu
          label="Bildirim işlemleri"
          items={[
            {
              label: "Tercihlerdeki süreyle ertele",
              disabled: pending || blocked || !["Pending", "Ready"].includes(n.state),
              onSelect: () => void command("snooze"),
            },
          ]}
        />
      </div>
      {expanded && (
        <div className="r2-inbox-actions">
          {n.taskId && <TaskLink id={n.taskId} navigate={navigate} />}
          {["FocusTarget", "BreakEnd"].includes(n.kind) && (
            <Link className="button primary" href="/focus" prefetch={false} onClick={navigate}>
              Odak oturumunu aç
            </Link>
          )}
          {["Pending", "Ready"].includes(n.state) && (
            <button
              type="button"
              className="secondary"
              disabled={pending || blocked}
              onClick={() => void command("snooze")}
            >
              Ertele
            </button>
          )}
          {unread && (
            <button
              type="button"
              className="r2-quiet"
              disabled={pending || blocked}
              onClick={() => void command("read")}
            >
              Okundu
            </button>
          )}
        </div>
      )}
      {issue && (
        <p role="alert" className="field-error">
          {issue}
        </p>
      )}
    </li>
  );
}
/** Görevi yalnız satır açıldığında bir kere okuyoruz. */
function TaskLink({ id, navigate }: { id: string; navigate: () => void }) {
  const task = useTask(id);
  return task.isError ? (
    <span className="r2-hint">İlgili görev artık erişilebilir değil.</span>
  ) : (
    <Link className="button primary" href={`/tasks?taskId=${id}`} prefetch={false} onClick={navigate}>
      {task.data ? `Görevi aç: ${task.data.title}` : "Görevi aç"}
    </Link>
  );
}

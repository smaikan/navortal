"use client";
import { lazy, Suspense, useState } from "react";
import { Bell, Clock3, Plus, Repeat } from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { useDisplayPreferences } from "../workspace/queries";
import {
  groupReminders,
  pageSize,
  reminderFailure,
  reminderToday,
  reminderWhen,
  repeatLabel,
  type Reminder,
} from "./model";
import { QuickReminder } from "./quick-reminder";
import { ReminderHistory } from "./history";
import { useMinute } from "../planning/agenda-blocks";
import { useReminderCache, useReminders } from "./queries";
import { ReminderSection } from "./section";
import { LinkedNotification } from "../notifications/linked-detail";
import { useSession } from "../auth/provider";
import { ReminderPushNudge } from "../push/reminder-nudge";
const Dialog = lazy(() => import("./dialog").then(m => ({ default: m.ReminderDialog })));
import "./styles.css";
export function RemindersPage() {
  const { session, state } = useSession();
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const [offerPush, setOfferPush] = useState<{ owner: string; epoch: number; intent: string } | null>(null);
  const [action, setAction] = useState<{
    action: "create" | "edit" | "cancel";
    reminder?: Reminder;
    trigger: HTMLElement;
    offset: number;
  } | null>(null);
  const query = useReminders(),
    prefs = useDisplayPreferences();
  useReminderCache(true);
  const items = query.data?.pages.flatMap(page => page.slice(0, pageSize));
  const now = useMinute();
  const zone = prefs.data?.values.timeZoneId ?? "Europe/Istanbul";
  const today = reminderToday(zone);
  return (
    <ReminderSection
      current="reminders"
      counts={{ reminders: items && !query.hasNextPage ? items.length : undefined }}
      action={
        <div className="reminder-head-actions">
          <button
            className="primary head-action"
            aria-label="Hatırlatma ekle"
            disabled={!prefs.data}
            onClick={e => setAction({ action: "create", trigger: e.currentTarget, offset: 0 })}
          >
            <Plus aria-hidden="true" size={16} />
            <span className="reminder-add-label">Hatırlatma ekle</span>
            <span className="reminder-add-short" aria-hidden="true">
              Ekle
            </span>
          </button>
        </div>
      }
    >
      <LinkedNotification />
      {offerPush?.owner === owner && offerPush.epoch === epoch && (
        <ReminderPushNudge key={`${owner}:${epoch}:${offerPush.intent}`} />
      )}
      {prefs.isError && (
        <p role="alert">
          Tercihler okunamadı.<button onClick={() => void prefs.refetch()}>Tercihleri yeniden oku</button>
        </p>
      )}
      {query.isPending && <p role="status">Hatırlatmalar okunuyor…</p>}
      {query.isError && <p role="alert">{reminderFailure(query.error)}</p>}
      {items && (
        <>
          <QuickReminder
            zone={zone}
            disabled={!prefs.data}
            onCreated={() => setOfferPush({ owner, epoch, intent: crypto.randomUUID() })}
          />
          <div className="reminder-groups" hidden={!items.length}>
            {groupReminders(items, zone, today).map(group => (
              <section key={group.key} aria-labelledby={`reminders-${group.key}`} className="reminder-group">
                <h2 id={`reminders-${group.key}`} className="reminder-group-title">
                  {group.label}
                </h2>
                <ul className="reminders-list" aria-label={`${group.label} hatırlatmaları`}>
                  {group.rows.map(({ reminder: r, index }) => {
                    const when = reminderWhen(r.dueAt, now, zone, today);
                    const offset = Math.floor(index / pageSize) * pageSize;
                    return (
                      <li
                        key={r.id}
                        data-reminder-id={r.id}
                        onClick={event => {
                          // Satırın boş yerine basınca da ayrıntı açılır; düğme ve menü kendi işini yapar.
                          if ((event.target as HTMLElement).closest("button, a, [role='menu'], .menu")) return;
                          event.currentTarget.querySelector<HTMLButtonElement>(".row-open")?.click();
                        }}
                      >
                        <div className="reminder-when">
                          <time dateTime={r.dueAt}>{when.time}</time>
                          <span className={when.soon ? "soon" : undefined}>{when.text}</span>
                        </div>
                        <div className="reminder-copy">
                          <h3>
                            {r.canceled ? (
                              r.title
                            ) : (
                              // Satırın her yerine basınca ayrıntı açılır; düğme satırı kaplar, menü üstte kalır.
                              <button
                                type="button"
                                className="row-open"
                                disabled={!prefs.data}
                                onClick={e =>
                                  setAction({ action: "edit", reminder: r, trigger: e.currentTarget, offset })
                                }
                              >
                                {r.title}
                              </button>
                            )}
                          </h3>
                          {r.repeat && (
                            <span className="reminder-repeat">
                              <Repeat aria-hidden="true" size={12} />
                              {repeatLabel(r.repeat)}
                            </span>
                          )}
                        </div>
                        {!r.canceled && (
                          <Menu
                            floating
                            label={`${r.title} hatırlatma işlemleri`}
                            items={[
                              {
                                label: "Düzenle",
                                disabled: !prefs.data,
                                onSelect: trigger => setAction({ action: "edit", reminder: r, trigger, offset }),
                              },
                              {
                                label: "İptal et",
                                disabled: !prefs.data,
                                onSelect: trigger => setAction({ action: "cancel", reminder: r, trigger, offset }),
                              },
                            ]}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          {!items.length && (
            <div className="reminder-empty">
              <span className="reminder-empty-marks" aria-hidden="true">
                {[Bell, Clock3, Repeat].map(Icon => (
                  <span key={Icon.displayName} className="reminder-empty-mark">
                    <Icon size={15} />
                  </span>
                ))}
              </span>
              <h2>Aktif hatırlatma yok.</h2>
              <p className="muted">
                Hatırlamak istediğin işler için tarih ve saat belirle. Tek seferlik veya seçtiğin günlerde tekrarlayan
                hatırlatmalar oluştur.
              </p>
            </div>
          )}
          {query.hasNextPage && (
            <button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "Yükleniyor…" : "Daha fazla hatırlatma göster"}
            </button>
          )}
          <ReminderHistory zone={zone} />
        </>
      )}
      {action && prefs.data && (
        <Suspense fallback={<p role="status">Hatırlatma formu açılıyor…</p>}>
          <Dialog
            {...action}
            zone={prefs.data.values.timeZoneId}
            close={() => setAction(null)}
            onCreated={() => setOfferPush({ owner, epoch, intent: crypto.randomUUID() })}
          />
        </Suspense>
      )}
    </ReminderSection>
  );
}

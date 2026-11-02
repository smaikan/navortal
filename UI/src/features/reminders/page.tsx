"use client";
import { lazy, Suspense, useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { Menu } from "../../components/ui/menu";
import { useDisplayPreferences } from "../workspace/queries";
import { stamp } from "../notifications/model";
import { pageSize, reminderFailure, repeatLabel, type Reminder } from "./model";
import { useReminderCache, useReminders } from "./queries";
import { ReminderSection } from "./section";
import { LinkedNotification } from "../notifications/linked-detail";
const Dialog = lazy(() => import("./dialog").then(m => ({ default: m.ReminderDialog })));
import "./styles.css";
export function RemindersPage() {
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
  return (
    <ReminderSection
      current="reminders"
      action={
        <div className="reminder-head-actions">
          <button
            className="ghost icon"
            aria-label="Hatırlatmaları yenile"
            title="Hatırlatmaları yenile"
            onClick={() => void query.refetch()}
          >
            <RotateCw aria-hidden="true" size={16} />
          </button>
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
      {prefs.isError && (
        <p role="alert">
          Tercihler okunamadı.<button onClick={() => void prefs.refetch()}>Tercihleri yeniden oku</button>
        </p>
      )}
      {query.isPending && <p role="status">Hatırlatmalar okunuyor…</p>}
      {query.isError && <p role="alert">{reminderFailure(query.error)}</p>}
      {items && (
        <>
          <ul className="reminders-list" aria-label="Özel hatırlatmalar">
            {items.map((r, index) => (
              <li key={r.id} data-reminder-id={r.id}>
                <div className="reminder-copy">
                  <h2>{r.title}</h2>
                  <p>
                    <time dateTime={r.dueAt}>{stamp(r.dueAt, prefs.data?.values.timeZoneId ?? "Europe/Istanbul")}</time>
                  </p>
                  {r.repeat && <p>{repeatLabel(r.repeat)}</p>}
                </div>
                {!r.canceled && (
                  <Menu
                    floating
                    label={`${r.title} hatırlatma işlemleri`}
                    items={[
                      {
                        label: "Düzenle",
                        disabled: !prefs.data,
                        onSelect: trigger =>
                          setAction({
                            action: "edit",
                            reminder: r,
                            trigger,
                            offset: Math.floor(index / pageSize) * pageSize,
                          }),
                      },
                      {
                        label: "İptal et",
                        disabled: !prefs.data,
                        onSelect: trigger =>
                          setAction({
                            action: "cancel",
                            reminder: r,
                            trigger,
                            offset: Math.floor(index / pageSize) * pageSize,
                          }),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
          {!items.length && <p>Aktif hatırlatma yok.</p>}
          {!!items.length && (
            <p className="reminder-list-count">
              {items.length} hatırlatma{query.hasNextPage ? " gösteriliyor" : ""}
            </p>
          )}
          {query.hasNextPage && (
            <button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "Yükleniyor…" : "Daha fazla hatırlatma göster"}
            </button>
          )}
        </>
      )}
      {action && prefs.data && (
        <Suspense fallback={<p role="status">Hatırlatma formu açılıyor…</p>}>
          <Dialog {...action} zone={prefs.data.values.timeZoneId} close={() => setAction(null)} />
        </Suspense>
      )}
    </ReminderSection>
  );
}

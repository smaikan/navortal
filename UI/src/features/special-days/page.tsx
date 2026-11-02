"use client";
import { useDisplayPreferences } from "../workspace/queries";
import { localToday } from "../preferences/model";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { Menu } from "../../components/ui/menu";
import { useToast } from "../../components/ui/toast";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSpecialDays } from "./queries";
import {
  arrange,
  kindClass,
  kinds,
  monthName,
  months,
  reminders,
  soonWindowDays,
  toBody,
  whenLabel,
  toDraft,
  type Draft,
  type Kind,
  type SpecialDay,
} from "./model";
import { kindIcon } from "./icons";
import { ReminderSection } from "../reminders/section";
import { Bell, Moon, Plus, Repeat } from "lucide-react";
import "./styles.css";

function useRefresh() {
  const { state } = useSession();
  const client = useQueryClient();
  return () =>
    Promise.all(
      ["day-overview", "special-days", "special-day-occurrences", "plan-glance", "working-hours"].map(resource =>
        client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, resource).slice(0, 3) }),
      ),
    );
}
const failure = (error: unknown) =>
  error instanceof RangeError
    ? error.message
    : error instanceof ApiError && error.status === 409
      ? "Bu özel gün başka bir yerde değişmiş. Güncel halini gösteriyorum; değişikliğin formda duruyor."
      : error instanceof ApiError && error.status === 400
        ? "Bu tarih kaydedilemedi. Gün ve ayı kontrol et."
        : error instanceof ApiError && error.outcomeUnknown
          ? "Sonuç alınamadı. Listeyi yeniden okuyup kontrol et; aynı isteği kendiliğinden göndermiyorum."
          : "Kaydedilemedi. Bağlantını kontrol edip yeniden dene.";

/** Özel günlerde yaklaşan önce. Ekle/düzenle pencerede, silmede onay yerine Geri al var. */
export function SpecialDaysPage() {
  const [offset, setOffset] = useState(0);
  const list = useSpecialDays(offset);
  const { session } = useSession();
  const refresh = useRefresh();
  const toast = useToast();
  const [edit, setEdit] = useState<{ day?: SpecialDay; trigger: HTMLElement } | null>(null);
  const preferences = useDisplayPreferences();
  async function remove(day: SpecialDay) {
    try {
      const deleted = await session.api
        .mutation("/api/special-days/{id}/delete", "post", {
          path: { id: day.id },
          body: { version: Number(day.version) },
        })
        .execute();
      await refresh();
      toast({
        text: `${day.title} silindi.`,
        action: {
          label: "Geri al",
          run: async () => {
            await session.api
              .mutation("/api/special-days/{id}/restore", "post", {
                path: { id: day.id },
                body: { version: Number(deleted.version) },
              })
              .execute();
            await refresh();
          },
        },
      });
    } catch (error) {
      toast({ text: failure(error), tone: "error" });
      await refresh();
    }
  }
  const zone = preferences.data?.values.timeZoneId;
  const groups = list.data && zone ? arrange(list.data.items, localToday(zone)) : null;
  const row = (day: SpecialDay) => (
    <Menu
      floating
      label={`${day.title} işlemleri`}
      items={[
        { label: "Düzenle", onSelect: trigger => setEdit({ day, trigger }) },
        { label: "Sil", danger: true, onSelect: () => void remove(day) },
      ]}
    />
  );
  return (
    <ReminderSection
      current="special-days"
      action={
        <button
          type="button"
          className="primary head-action"
          onClick={event => setEdit({ trigger: event.currentTarget })}
        >
          <Plus aria-hidden="true" size={16} />
          Özel gün ekle
        </button>
      }
    >
      {(list.isPending || (list.data && preferences.isPending)) && <p role="status">Özel günler okunuyor…</p>}
      {list.isError && (
        <div role="alert" className="form-error">
          Özel günler okunamadı.
          <button onClick={() => void list.refetch()}>Yeniden oku</button>
        </div>
      )}
      {preferences.isError && !preferences.data && (
        <div role="alert" className="form-error">
          Gün bilgisi alınamadı.
          <button onClick={() => void preferences.refetch()}>Yeniden dene</button>
        </div>
      )}
      {list.data && !list.data.items.length && (
        <div className="special-empty">
          <span className="special-empty-marks" aria-hidden="true">
            {(Object.keys(kinds) as Kind[]).map(kind => {
              const Icon = kindIcon[kind];
              return (
                <span key={kind} className={`special-mark ${kindClass(kind)}`}>
                  <Icon size={15} />
                </span>
              );
            })}
          </span>
          <h2>Henüz özel gün yok</h2>
          <p className="muted">
            Doğum günleri, yıldönümleri ve tatiller burada ve takvimde kendi gününde görünür. İstersen önceden
            hatırlatılırsın.
          </p>
        </div>
      )}
      {groups && list.data!.items.length > 0 && (
        <div className="special-days">
          {groups.soon.length > 0 && (
            <section aria-labelledby="special-soon">
              <h2 id="special-soon" className="special-heading">
                Önümüzdeki {soonWindowDays} gün
              </h2>
              <ul className="special-soon" aria-labelledby="special-soon">
                {groups.soon.map(({ day, days }) => {
                  const Icon = kindIcon[day.kind];
                  return (
                    <li key={day.id} className={`special-item special-card ${kindClass(day.kind)}`}>
                      <span className="special-mark" aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <span className="special-text">
                        <strong>{day.title}</strong>
                        <span className="muted">
                          {longDay(day.nextOccurrence!)} · {kinds[day.kind]}
                        </span>
                      </span>
                      <span className={`special-when${days === 0 ? " now" : ""}`}>{whenLabel(days)}</span>
                      {row(day)}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {(groups.later.length > 0 || groups.past.length > 0) && (
            <section aria-labelledby="special-later">
              <h2 id="special-later" className="special-heading">
                {groups.soon.length ? "Daha sonra" : "Özel günlerin"}
              </h2>
              {groups.later.map(group => (
                <Month key={group.label} label={group.label} items={group.items} menu={row} />
              ))}
              {groups.past.length > 0 && <Month label="Geçmiş tek seferlik günler" items={groups.past} menu={row} />}
            </section>
          )}
        </div>
      )}
      {list.data && Number(list.data.total) > 50 && (
        <div className="actions">
          <button disabled={!offset} onClick={() => setOffset(offset - 50)}>
            Önceki sayfa
          </button>
          <button disabled={offset + 50 >= Number(list.data.total)} onClick={() => setOffset(offset + 50)}>
            Sonraki sayfa
          </button>
        </div>
      )}
      {edit && <SpecialDayForm day={edit.day} trigger={edit.trigger} close={() => setEdit(null)} />}
    </ReminderSection>
  );
}

const longDay = (date: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" }).format(
    new Date(`${date}T12:00:00Z`),
  );

function Month({
  label,
  items,
  menu,
}: {
  label: string;
  items: SpecialDay[];
  menu: (day: SpecialDay) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="special-month">{label}</h3>
      <ul className="special-list" aria-label={label}>
        {items.map(day => {
          const Icon = kindIcon[day.kind];
          return (
            <li key={day.id} className={`special-item special-row ${kindClass(day.kind)}`}>
              <span className="special-date" aria-hidden="true">
                <b>{day.day}</b>
                <small>{monthName(Number(day.month)).slice(0, 3)}</small>
              </span>
              <span className="special-text">
                <strong>{day.title}</strong>
                <span className="special-facts">
                  <span className="sr-only">
                    {day.day} {monthName(Number(day.month))}.{" "}
                  </span>
                  <span>
                    <Repeat aria-hidden="true" size={13} />
                    {day.recurrence === "Once" ? `Yalnız ${day.year}` : "Her yıl"}
                  </span>
                  {day.nonWorking && (
                    <span className="special-off">
                      <Moon aria-hidden="true" size={13} />
                      Çalışma dışı
                    </span>
                  )}
                  <span>
                    <Bell aria-hidden="true" size={13} />
                    {reminders[day.reminder]}
                  </span>
                </span>
              </span>
              <span className="special-kind">
                <Icon aria-hidden="true" size={13} />
                {kinds[day.kind]}
              </span>
              {menu(day)}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function SpecialDayForm({
  day,
  trigger,
  close,
  date = "",
}: {
  day?: SpecialDay;
  trigger: HTMLElement;
  close: () => void;
  date?: string;
}) {
  const { session } = useSession();
  const preferences = useDisplayPreferences();
  const currentYear = preferences.data ? Number(localToday(preferences.data.values.timeZoneId).slice(0, 4)) : null;
  const refresh = useRefresh();
  const [draft, setDraft] = useState<Draft>(() => toDraft(day, date));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const create = useRef<ReturnType<typeof session.api.mutation<"/api/special-days", "post">> | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    create.current = null;
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    try {
      if (currentYear === null) throw new RangeError("Gün bilgisi alınamadı. Yeniden dene.");
      const body = toBody(draft, currentYear);
      setPending(true);
      if (day) {
        await session.api
          .mutation("/api/special-days/{id}", "put", {
            path: { id: day.id },
            body: { ...body, version: Number(day.version) },
          })
          .execute();
      } else {
        // Aynı isteğin Idempotency-Key değeri korunur. Kaybolan yanıt güvenle doğrulanabilir.
        create.current ??= session.api.mutation("/api/special-days", "post", { body });
        await create.current.execute({ retryUnknownResult: true });
      }
      void refresh();
      close();
    } catch (failed) {
      setError(failure(failed));
      if (failed instanceof ApiError && failed.status === 409) await refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <Surface
      title={day ? "Özel günü düzenle" : "Özel gün ekle"}
      modal
      initialFocus="field"
      onClose={() => !pending && close()}
      returnTo={trigger}
    >
      <form className="special-form" onSubmit={submit} aria-busy={pending}>
        <div className="form-field">
          <label htmlFor="special-title">Ad</label>
          <input
            id="special-title"
            maxLength={120}
            required
            value={draft.title}
            onChange={e => set({ title: e.target.value })}
          />
        </div>
        <fieldset className="special-kinds">
          <legend>Tür</legend>
          {(Object.keys(kinds) as Kind[]).map(k => {
            const Icon = kindIcon[k];
            return (
              <label key={k} className={`special-kind-option ${kindClass(k)}`}>
                <input
                  type="radio"
                  name="special-kind"
                  value={k}
                  checked={draft.kind === k}
                  onChange={() => set({ kind: k })}
                />
                <span>
                  <span className="special-mark" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  {kinds[k]}
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="special-date-fields">
          <legend>Tarih</legend>
          <div className="form-field">
            <label htmlFor="special-day">Gün</label>
            <select id="special-day" required value={draft.day} onChange={e => set({ day: e.target.value })}>
              <option value="">Gün seç</option>
              {Array.from({ length: 31 }, (_, n) => n + 1).map(value => (
                <option key={value} value={value}>
                  {String(value).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="special-month">Ay</label>
            <select id="special-month" required value={draft.month} onChange={e => set({ month: e.target.value })}>
              <option value="">Ay seç</option>
              {months.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <fieldset className="r2-segment special-repeat">
          <legend>Tekrar</legend>
          <label>
            <input
              type="radio"
              name="special-repeat"
              checked={draft.yearly}
              onChange={() => set({ yearly: true, year: null })}
            />{" "}
            Her yıl
          </label>
          <label>
            <input
              type="radio"
              name="special-repeat"
              checked={!draft.yearly}
              onChange={() => set({ yearly: false, year: currentYear })}
            />{" "}
            Yalnız bu yıl
          </label>
        </fieldset>
        {!draft.yearly && <p className="muted form-hint">{draft.year ?? currentYear} yılı için kaydedilir.</p>}
        {draft.yearly && draft.year !== null && (
          <p className="muted form-hint">{draft.year} yılından itibaren her yıl.</p>
        )}
        {draft.yearly && draft.month === "2" && draft.day === "29" && (
          <p className="muted form-hint">29 Şubat olmayan yıllarda 28 Şubat’ta gösterilir.</p>
        )}
        {preferences.isError && !preferences.data && (
          <p role="alert">
            Gün bilgisi alınamadı.{" "}
            <button type="button" onClick={() => void preferences.refetch()}>
              Yeniden dene
            </button>
          </p>
        )}
        <div className="form-field">
          <label htmlFor="special-reminder">Hatırlatma</label>
          <select
            id="special-reminder"
            value={draft.reminder}
            onChange={e => set({ reminder: e.target.value as Draft["reminder"] })}
          >
            {(Object.keys(reminders) as Draft["reminder"][]).map(r => (
              <option key={r} value={r}>
                {reminders[r]}
              </option>
            ))}
          </select>
        </div>
        <label className="special-switch">
          <input
            type="checkbox"
            role="switch"
            checked={draft.nonWorking}
            onChange={e => set({ nonWorking: e.target.checked })}
          />
          <span>
            Çalışma dışı gün
            <small>O günün çalışma saatleri boş sayılır. Mevcut planın kendiliğinden değişmez.</small>
          </span>
        </label>
        {error && (
          <p role="alert" tabIndex={-1} ref={alert} className="field-error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={pending || currentYear === null}>
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button type="button" disabled={pending} onClick={close}>
            Vazgeç
          </button>
        </div>
      </form>
    </Surface>
  );
}

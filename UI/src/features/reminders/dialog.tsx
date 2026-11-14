"use client";
import { ClockSelect, TemporalInput } from "../../components/ui/temporal-input";
import { useId, useRef, useState, type FormEvent } from "react";
import { Temporal } from "temporal-polyfill";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { wallTimeIsAmbiguous, type WallChoice } from "../../lib/time/wall-time";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import {
  dueInput,
  readReminder,
  readReminders,
  reminderFailure,
  reminderFields,
  reminderToday,
  reminderAfter,
  reminderDays,
  type Reminder,
} from "./model";
import { useReminderCache } from "./queries";
type Action = "create" | "edit" | "cancel";
const headings = { create: "Hatırlatma ekle", edit: "Hatırlatmayı düzenle", cancel: "Hatırlatmayı iptal et" };
export function ReminderDialog({
  action,
  reminder,
  offset,
  zone: displayZone,
  trigger,
  close,
  onCreated,
}: {
  action: Action;
  reminder?: Reminder;
  offset: number;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
  onCreated?: () => void;
}) {
  const zone = reminder?.repeat?.timeZoneId ?? displayZone;
  const { session } = useSession();
  const cache = useReminderCache();
  const id = useId();
  const [initialDue] = useState(() => (reminder ? dueInput(reminder.dueAt, zone) : `${reminderToday(zone)}T00:00`));
  const [base, setBase] = useState(reminder),
    [title, setTitle] = useState(reminder?.title ?? ""),
    [date, setDate] = useState(initialDue.slice(0, 10)),
    [time, setTime] = useState(initialDue.slice(11)),
    [repeat, setRepeat] = useState(!!reminder?.repeat),
    [days, setDays] = useState<number[]>(
      reminder?.repeat?.weekDays.map(Number) ?? [Temporal.PlainDate.from(initialDue.slice(0, 10)).dayOfWeek % 7],
    ),
    [choice, setChoice] = useState<WallChoice>("");
  const [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState(false),
    [blocked, setBlocked] = useState(false),
    [saved, setSaved] = useState(false),
    [issue, setIssue] = useState(""),
    [latest, setLatest] = useState<Reminder | null>(null),
    [checked, setChecked] = useState(false);
  const due = `${date}T${time}`;
  function setDue(value: string) {
    const [nextDate, nextTime = ""] = value.split("T");
    setDate(nextDate);
    setTime(nextTime);
  }
  const busy = useRef(false);
  const prepared = useRef<{ execute: (options?: { retryUnknownResult?: boolean }) => Promise<Reminder> } | null>(null);
  const dirty =
    !saved &&
    action !== "cancel" &&
    (title !== (base?.title ?? "") ||
      due !== (base ? dueInput(base.dueAt, zone) : initialDue) ||
      repeat !== !!base?.repeat ||
      (repeat && JSON.stringify([...days].sort()) !== JSON.stringify([...(base?.repeat?.weekDays ?? [])].sort())));
  const guard = useDialogGuard({
    dirty: dirty || unknown,
    pending,
    close,
    trigger,
    message: "Hatırlatma taslağı veya sonucu belirsiz işlem var. Listeyi kontrol etmeden ayrılmak istiyor musun?",
  });
  const locked = pending || unknown || blocked || saved;
  async function save(retry = false) {
    if (busy.current || saved || ((unknown || blocked) && !retry)) return;
    setIssue("");
    busy.current = true;
    setPending(true);
    try {
      let raw: Reminder;
      if (action === "cancel") {
        if (!base) throw new RangeError("Hatırlatmayı yeniden aç.");
        raw = await session.api
          .mutation("/api/notifications/reminders/{id}/cancel", "post", {
            path: { id: base.id },
            body: { version: base.version },
          })
          .execute();
      } else {
        if (!prepared.current) {
          const body = reminderFields(
            title,
            due,
            zone,
            choice,
            "",
            action === "edit" ? base : undefined,
            repeat ? { timeZoneId: zone, localTime: `${time.slice(0, 5)}:00`, weekDays: days } : null,
          );
          prepared.current =
            action === "create"
              ? session.api.mutation("/api/notifications/reminders", "post", { body })
              : session.api.mutation("/api/notifications/reminders/{id}", "put", { path: { id: base!.id }, body });
        }
        raw = await prepared.current.execute({ retryUnknownResult: retry });
      }
      const result = readReminder(raw, base?.id);
      if (!cache.current()) return;
      setBase(result);
      setUnknown(false);
      setBlocked(false);
      setSaved(true);
      guard.markSaved();
      cache.changed();
      if (action === "create") onCreated?.();
      close();
    } catch (e) {
      if (!cache.current()) return;
      const uncertain = e instanceof ApiError && (e.outcomeUnknown || e.kind === "protocol");
      setUnknown(uncertain);
      setBlocked(uncertain || (e instanceof ApiError && [404, 409].includes(e.status)));
      setChecked(false);
      setIssue(reminderFailure(e));
      if (!uncertain) prepared.current = null;
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setIssue("");
    try {
      const first = readReminders(
        await session.api.read("/api/notifications/reminders", { query: { offset: 0, limit: 100 } }),
        100,
      );
      const around =
        offset >= 100
          ? readReminders(
              await session.api.read("/api/notifications/reminders", {
                query: { offset: Math.floor(offset / 100) * 100, limit: 100 },
              }),
              100,
            )
          : [];
      if (!cache.current()) return;
      const result = [...first, ...around].find(r => r.id === base?.id);
      setChecked(true);
      setLatest(result ?? null);
      cache.changed();
      if (base && !result)
        setIssue(
          "Kayıt okunan sayfalarda bulunamadı. Daha ileri bir sayfaya taşınmış olabilir; taslağın korunuyor. Listeyi kontrol et.",
        );
      if (result?.canceled && action === "cancel") {
        setBase(result);
        setUnknown(false);
        setSaved(true);
        guard.markSaved();
      }
    } catch (e) {
      if (cache.current()) setIssue(reminderFailure(e));
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  function rebase() {
    if (!base || !latest || latest.canceled || unknown) return;
    if (title === base.title) setTitle(latest.title);
    if (due === dueInput(base.dueAt, zone)) setDue(dueInput(latest.dueAt, zone));
    if (repeat === !!base.repeat && JSON.stringify(days) === JSON.stringify(base.repeat?.weekDays ?? days)) {
      setRepeat(!!latest.repeat);
      setDays(latest.repeat?.weekDays.map(Number) ?? days);
    }
    setBase(latest);
    setLatest(null);
    setBlocked(false);
    prepared.current = null;
    setIssue("");
  }
  const ambiguous =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(due) &&
    (!base || due !== dueInput(base.dueAt, zone)) &&
    wallTimeIsAmbiguous(due, zone);
  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }
  return (
    <Surface title={headings[action]} modal returnTo={trigger} closeDisabled={pending} onClose={guard.requestClose}>
      {!saved && (
        <form
          className="reminder-form"
          onSubmit={submit}
          aria-label={headings[action]}
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              guard.requestClose();
            }
          }}
        >
          <fieldset disabled={locked}>
            {action === "cancel" ? (
              <p>
                “{base?.title}” hatırlatması iptal edilecek. Daha önce oluşan kayıtlar korunur; yeni alarm gösterilmez.
              </p>
            ) : (
              <>
                <div className="hours-field">
                  <label htmlFor={`${id}-title`}>Hatırlatma başlığı</label>
                  <input
                    id={`${id}-title`}
                    maxLength={200}
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                <section className="reminder-date-field" aria-label="Hatırlatma tarihi">
                  <label htmlFor={`${id}-date`}>Tarih</label>
                  <div className="reminder-date-shortcuts">
                    {[0, 1].map(n => {
                      const candidateDate = Temporal.PlainDate.from(reminderToday(zone)).add({ days: n }).toString();
                      return (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={date === candidateDate}
                          onClick={() => {
                            setDue(`${candidateDate}T${time}`);
                            setChoice("");
                          }}
                        >
                          {n ? "Yarın" : "Bugün"}
                        </button>
                      );
                    })}
                  </div>
                  <TemporalInput
                    id={`${id}-date`}
                    type="date"
                    required
                    value={date}
                    onChange={e => {
                      setDue(`${e.target.value}T${time}`);
                      setChoice("");
                    }}
                  />
                </section>
                <section className="reminder-clock-field" aria-labelledby={`${id}-clock-title`}>
                  <h3 id={`${id}-clock-title`}>Saat seç</h3>
                  <ClockSelect
                    id={id}
                    value={time}
                    onChange={next => {
                      setDue(`${date}T${next}`);
                      setChoice("");
                    }}
                  />
                  <div className="reminder-time-shortcuts">
                    {[15, 30, 60].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setDue(reminderAfter(n, zone));
                          setChoice("");
                        }}
                      >
                        {n === 60 ? "1 saat sonra" : `${n} dk sonra`}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="reminder-repeat">
                  <label className="reminder-repeat-toggle">
                    <input
                      type="checkbox"
                      checked={repeat}
                      onChange={e => {
                        setRepeat(e.target.checked);
                        setIssue("");
                        if (e.target.checked && !base?.repeat)
                          setDays([Temporal.PlainDate.from(date || reminderToday(zone)).dayOfWeek % 7]);
                      }}
                    />
                    Tekrarla
                  </label>
                  {repeat && (
                    <fieldset className="reminder-weekdays">
                      <legend>Hangi günler?</legend>
                      {reminderDays.map(([day, name]) => (
                        <label key={day}>
                          <input
                            type="checkbox"
                            checked={days.includes(day)}
                            onChange={e => {
                              setDays(e.target.checked ? [...days, day] : days.filter(d => d !== day));
                              setIssue("");
                            }}
                          />
                          {name}
                        </label>
                      ))}
                      <p className="muted">Seçtiğin günlerde aynı saatte hatırlatılır.</p>
                    </fieldset>
                  )}
                </section>
                {ambiguous && (
                  <div className="hours-field">
                    <label htmlFor={`${id}-choice`}>Bu saat iki kez yaşanıyor</label>
                    <select
                      id={`${id}-choice`}
                      value={choice}
                      onChange={e => setChoice(e.target.value as WallChoice)}
                      required
                    >
                      <option value="">Bir oluşum seç</option>
                      <option value="earlier">İlk oluşum</option>
                      <option value="later">İkinci oluşum</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </fieldset>
          <div className="actions">
            <button className="primary" disabled={locked}>
              {action === "cancel" ? "Hatırlatmayı iptal et" : "Hatırlatmayı kaydet"}
            </button>
          </div>
        </form>
      )}
      {pending && <p role="status">İşlem bekleniyor…</p>}
      {saved && <p role="status">{action === "cancel" ? "Hatırlatma iptal edildi." : "Hatırlatma kaydedildi."}</p>}
      {issue && (
        <p role="alert" className="form-error">
          {issue}
        </p>
      )}
      {unknown && action !== "cancel" && (
        <button disabled={pending} onClick={() => void save(true)}>
          Aynı isteği ve anahtarı yeniden dene
        </button>
      )}
      {blocked && !saved && (
        <button disabled={pending} onClick={() => void check()}>
          Güncel hatırlatmaları kontrol et
        </button>
      )}
      {checked && unknown && !base && (
        <p>Liste yenilendi. Yeni kayıt kimliği bilinmiyor; aynı anahtarla kontrol edebilirsin.</p>
      )}
      {latest && !unknown && (
        <section aria-label="Güncel hatırlatma">
          <p>
            {latest.title}
            {latest.canceled && " · İptal edildi"}
          </p>
          {!latest.canceled && <button onClick={rebase}>Taslağımı güncel kayıtla birleştir</button>}
        </section>
      )}
    </Surface>
  );
}

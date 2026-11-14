"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "../auth/provider";
import {
  failure,
  mustReconcile,
  readPreferences,
  rebaseSettings,
  validateSettings,
  type Preferences,
  type Settings,
} from "./model";
import { useNotificationPreferences } from "./queries";
import { useNotificationCache } from "./cache";
import { SoundCheck } from "./sound-check";

type Switch = keyof Pick<
  Settings,
  | "enabled"
  | "scheduleStart"
  | "scheduleEnd"
  | "taskDeadline"
  | "focusTarget"
  | "breakEnd"
  | "returnToTask"
  | "custom"
  | "specialDay"
  | "soundEnabled"
>;
const rows: [Switch, string][] = [
  ["scheduleStart", "Planlı iş başlamadan önce"],
  ["scheduleEnd", "Planlanan çalışma süresi dolunca"],
  ["taskDeadline", "Son teslim yaklaşınca"],
  ["focusTarget", "Pomodoro süresi dolunca"],
  ["breakEnd", "Mola bitince"],
  ["returnToTask", "İşe dönmeyi hatırlat"],
  ["custom", "Kendi hatırlatmalarım"],
  ["specialDay", "Özel günler"],
  ["soundEnabled", "Bildirim sesi"],
];
const minuteChoices = (values: number[], current: number) => [...new Set([...values, current])].sort((a, b) => a - b);
const minutesText = (seconds: number) =>
  seconds % 60 === 0 ? `${seconds / 60} dk` : `${Math.round(seconds / 6) / 10} dk`;

/** Her tercih mevcut sürümle hemen kaydolur. Çatışmada seçimler kalır, kullanıcıdan güncel kayıt kontrolü istenir. */
export function NotificationSettings({ onDirty }: { onDirty?: (dirty: boolean) => void } = {}) {
  const query = useNotificationPreferences();
  if (!query.data)
    return query.isError ? (
      <p role="alert">
        {failure(query.error)}
        <button onClick={() => void query.refetch()}>Tercihleri yeniden yükle</button>
      </p>
    ) : (
      <p role="status" className="r2-hint">
        Tercihler okunuyor…
      </p>
    );
  return <Form initial={query.data} onDirty={onDirty} />;
}
function Form({ initial, onDirty }: { initial: Preferences; onDirty?: (dirty: boolean) => void }) {
  const { session } = useSession();
  const cache = useNotificationCache();
  const id = useId();
  const [base, setBase] = useState(initial),
    [draft, setDraft] = useState(initial.settings),
    [latest, setLatest] = useState<Preferences | null>(null);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [issue, setIssue] = useState(""),
    [message, setMessage] = useState("");
  const busy = useRef(false);
  // Kayıt sürerken yapılan değişikliği tutuyoruz. Önceki bitince son sürümle gönderilir, paralel yazılmaz.
  const version = useRef(initial.version);
  const queued = useRef<Settings | null>(null);
  useEffect(() => {
    onDirty?.(pending || blocked || JSON.stringify(draft) !== JSON.stringify(base.settings));
  }, [pending, blocked, draft, base.settings, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => {
    if (!pending) return;
    const hold = (event: Event) => event.preventDefault();
    window.addEventListener("adhd:before-local-logout", hold);
    return () => window.removeEventListener("adhd:before-local-logout", hold);
  }, [pending]);
  const [seen, setSeen] = useState(initial.version);
  if (String(seen) !== String(initial.version) && !pending && JSON.stringify(draft) === JSON.stringify(base.settings)) {
    setSeen(initial.version);
    setBase(initial);
    setDraft(initial.settings);
  }
  // Önbellekten alınan yeni kaydın sürümü sonraki kaydın temeli oluyor.
  useEffect(() => {
    if (!busy.current) version.current = base.version;
  }, [base.version]);
  // Uzlaştırma yeni durum çizilmeden çalıştığı için from ve stuck değerlerini açıkça veriyor.
  async function save(next: Settings, from = base.settings, stuck = blocked) {
    setDraft(next);
    if (stuck) return;
    try {
      validateSettings(next);
    } catch (e) {
      setIssue(failure(e));
      return;
    }
    if (busy.current) {
      queued.current = next;
      return;
    }
    // Değişmeyen alandan çıkmak yazı göndermiyor, gereksiz sürüm harcamıyoruz.
    if (JSON.stringify(next) === JSON.stringify(from)) {
      setIssue("");
      return;
    }
    setMessage("");
    busy.current = true;
    setPending(true);
    setIssue("");
    let failed = false,
      stored = from;
    try {
      const result = readPreferences(
        await session.api
          .mutation("/api/notifications/preferences", "put", { body: { version: version.current, settings: next } })
          .execute(),
      );
      if (!cache.current()) return;
      version.current = result.version;
      stored = result.settings;
      setBase(result);
      setSeen(result.version);
      setLatest(null);
      setMessage("Kaydedildi");
      cache.changed(undefined, result);
      if (!queued.current) setDraft(result.settings);
    } catch (e) {
      failed = true;
      queued.current = null;
      if (cache.current()) {
        setIssue(failure(e));
        setBlocked(mustReconcile(e));
      }
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
      const later = queued.current;
      queued.current = null;
      if (later && !failed && cache.current()) void save(later, stored, false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = readPreferences(await session.api.read("/api/notifications/preferences"));
      if (cache.current()) setLatest(result);
    } catch (e) {
      if (cache.current()) setIssue(failure(e));
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  function reconcile(keep: boolean) {
    if (!latest) return;
    const next = keep ? rebaseSettings(base.settings, draft, latest.settings) : latest.settings;
    version.current = latest.version;
    setBase(latest);
    setLatest(null);
    setBlocked(false);
    setIssue("");
    if (keep) void save(next, latest.settings, false);
    else {
      setDraft(next);
      setMessage("Sunucudaki tercihler yüklendi.");
    }
  }
  // Telefon saat seçicisi odak kaybetmeyebilir. Tam değer kısa beklemede kaydolur; yarım aralık hatası daha uzun beklemeden sonra gösterilir.
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settle = () => clearTimeout(quietTimer.current);
  function quiet(next: Settings) {
    setDraft(next);
    settle();
    quietTimer.current = setTimeout(() => void save(next), !next.quietStart === !next.quietEnd ? 800 : 2500);
  }
  useEffect(() => settle, []);
  const toggle = (key: Switch) => void save({ ...draft, [key]: !draft[key] });
  const pick = (key: "leadSeconds" | "snoozeSeconds" | "returnAfterSeconds", value: string) =>
    void save({ ...draft, [key]: Number(value) });
  const lead = Number(draft.leadSeconds),
    snooze = Number(draft.snoozeSeconds),
    back = Number(draft.returnAfterSeconds);
  return (
    <div className="r2-notify-settings" aria-busy={pending || undefined}>
      <div className="r2-master">
        <span>
          <strong>Bildirimler açık</strong>
          <span className="r2-hint">Kapatırsan hiçbir bildirim hazırlanmaz.</span>
        </span>
        <span role="status" className="r2-saved">
          {pending ? "Kaydediliyor…" : message}
        </span>
        <Toggle label="Bildirimler açık" on={draft.enabled} disabled={blocked} change={() => toggle("enabled")} />
      </div>
      <section aria-labelledby={`${id}-when`}>
        <h2 id={`${id}-when`} className="r2-small-heading">
          Ne zaman haber verelim?
        </h2>
        <ul className="r2-switch-list">
          {rows.map(([key, label]) => (
            <li key={key}>
              <span>{label}</span>
              {key === "scheduleStart" && (
                <label className="r2-inline-select">
                  <span className="sr-only">Önceden haber ver</span>
                  <select
                    aria-label="Önceden haber ver"
                    value={lead}
                    disabled={blocked}
                    onChange={e => pick("leadSeconds", e.target.value)}
                  >
                    {minuteChoices([0, 300, 600, 900, 1800], lead).map(v => (
                      <option key={v} value={v}>
                        {v === 0 ? "Tam zamanında" : `${minutesText(v)} önce`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {key === "returnToTask" && (
                <label className="r2-inline-select">
                  <span className="sr-only">İşe dönüş hatırlatma zamanı</span>
                  <select
                    aria-label="İşe dönüş hatırlatma zamanı"
                    value={back}
                    disabled={blocked}
                    onChange={e => pick("returnAfterSeconds", e.target.value)}
                  >
                    {minuteChoices([0, 600, 1200, 1800, 3600], back).map(v => (
                      <option key={v} value={v}>
                        {v === 0 ? "Hatırlatma" : `${minutesText(v)} ara verince`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Toggle
                label={label}
                on={draft[key]}
                disabled={blocked || (!draft.enabled && key !== "soundEnabled")}
                change={() => toggle(key)}
              />
            </li>
          ))}
        </ul>
        <p className="r2-hint">
          Önceden haber verme süresi plan başlangıcı, plan bitişi ve son teslim bildirimlerine uygulanır.
        </p>
      </section>
      <SoundCheck settings={draft} disabled={blocked} change={(key, sound) => void save({ ...draft, [key]: sound })} />
      <section aria-labelledby={`${id}-calm`} className="r2-calm">
        <h2 id={`${id}-calm`} className="r2-small-heading">
          Sakin saatler
        </h2>
        <div className="r2-calm-row">
          <span>Sessiz saatler</span>
          <label>
            Başlangıç
            <TemporalInput
              type="time"
              aria-label="Başlangıç (sessiz saatler)"
              value={draft.quietStart?.slice(0, 5) ?? ""}
              disabled={blocked}
              onChange={e => quiet({ ...draft, quietStart: e.target.value || null })}
              onBlur={e => {
                settle();
                void save({ ...draft, quietStart: e.currentTarget.value || null });
              }}
            />
          </label>
          <label>
            Bitiş
            <TemporalInput
              type="time"
              aria-label="Bitiş (sessiz saatler)"
              value={draft.quietEnd?.slice(0, 5) ?? ""}
              disabled={blocked}
              onChange={e => quiet({ ...draft, quietEnd: e.target.value || null })}
              onBlur={e => {
                settle();
                const next = { ...draft, quietEnd: e.currentTarget.value || null };
                if (!next.quietStart === !next.quietEnd) void save(next);
              }}
            />
          </label>
          {draft.quietStart && draft.quietEnd && draft.quietEnd < draft.quietStart && (
            <span className="r2-hint">ertesi gün</span>
          )}
        </div>
        <div className="r2-calm-row">
          <span>Ertele düğmesi</span>
          <label>
            <span className="sr-only">Erteleme süresi</span>
            <select
              aria-label="Erteleme süresi"
              value={snooze}
              disabled={blocked}
              onChange={e => pick("snoozeSeconds", e.target.value)}
            >
              {minuteChoices([300, 600, 900, 1800, 3600], snooze).map(v => (
                <option key={v} value={v}>
                  {minutesText(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {issue && (
        <div role="alert" className="form-error">
          <p>{issue}</p>
          {blocked && (
            <button disabled={pending} onClick={() => void check()}>
              Güncel tercihleri kontrol et
            </button>
          )}
        </div>
      )}
      {latest && (
        <section aria-label="Tercihleri uzlaştır" className="reconcile-panel">
          <p>Güncel tercihler alındı. Hiçbir yazı kendiliğinden tekrarlanmadı.</p>
          <div className="actions">
            <button onClick={() => reconcile(true)}>Seçimlerimi güncel kayda uygula</button>
            <button onClick={() => reconcile(false)}>Sunucudaki tercihleri kullan</button>
          </div>
        </section>
      )}
    </div>
  );
}
function Toggle({
  label,
  on,
  disabled,
  change,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  change: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`r2-switch${on ? " on" : ""}`}
      onClick={change}
    >
      <span aria-hidden="true" />
    </button>
  );
}

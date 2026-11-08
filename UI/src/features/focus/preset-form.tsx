"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { useDialogGuard } from "../work/draft-guard";
import { focusFailure, readPreset, readSettings, type Preset, type Settings } from "./model";
import { cycleSegments, roundSeconds, spanText } from "./rhythm";

const fresh: Settings = {
  workSeconds: 2100,
  shortBreakSeconds: 420,
  longBreakSeconds: 1200,
  longBreakEvery: 3,
  targetBehavior: "ContinueTracking",
  soundEnabled: false,
  notificationsEnabled: true,
};
const durations = [
  ["workSeconds", "Çalışma süresi", 86400, "Çalışmayı kısalt", "Çalışmayı uzat"],
  ["shortBreakSeconds", "Kısa mola süresi", 14400, "Kısa molayı kısalt", "Kısa molayı uzat"],
  ["longBreakSeconds", "Uzun mola süresi", 43200, "Uzun molayı kısalt", "Uzun molayı uzat"],
] as const;

/** Özel ritim ritimlerin altında açılıyor. Kayıt kuralları eski pencereyle aynı: belirsiz sonuçta otomatik tekrar yok. */
export function PresetForm({
  preset,
  saved,
  close,
  report,
}: {
  preset?: Preset;
  /** Kaydedilen ritim sayfada seçili hale geliyor. */
  saved: (preset: Preset) => void;
  close: () => void;
  /** Sayfa, taslak varken başka bir ritme geçmeden önce sorabilsin diye. */
  report: (state: { dirty: boolean; pending: boolean }) => void;
}) {
  const { session, state } = useSession();
  const cache = useTaskCache();
  const client = useQueryClient();
  const initial = preset?.settings;
  const [unit, setUnit] = useState<"60" | "1">(
    initial && [initial.workSeconds, initial.shortBreakSeconds, initial.longBreakSeconds].some(v => v % 60)
      ? "1"
      : "60",
  );
  const factor = Number(unit);
  const [name, setName] = useState(preset?.name ?? "");
  const [settings, setSettings] = useState<Settings>(initial ?? fresh);
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState(false),
    [failure, setFailure] = useState("");
  const busy = useRef(false);
  const guard = useDialogGuard({
    dirty,
    pending,
    close,
    trigger: null,
    message: "Kaydedilmemiş ritmi bırakmak istiyor musun?",
  });
  useEffect(() => {
    report({ dirty, pending });
  }, [dirty, pending, report]);
  useEffect(() => () => report({ dirty: false, pending: false }), [report]);
  const update = (value: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...value }));
    setDirty(true);
  };
  async function save() {
    if (busy.current || unknown) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      if (!name.trim() || name.trim().length > 100) throw new RangeError("Ritme 1–100 karakterlik bir ad ver.");
      try {
        readSettings(settings);
      } catch {
        throw new RangeError("Süreleri ve uzun mola sıklığını kontrol et.");
      }
      const result = readPreset(
        preset
          ? await session.api
              .mutation("/api/focus-presets/{id}", "put", {
                path: { id: preset.id },
                body: { name: name.trim(), settings, version: preset.version },
              })
              .execute()
          : await session.api
              .mutation("/api/focus-presets", "post", { body: { name: name.trim(), settings } })
              .execute(),
      );
      if (!cache.current()) return;
      setDirty(false);
      guard.markSaved();
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-presets").slice(0, 3) });
      saved(result);
    } catch (error) {
      if (!cache.current()) return;
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol" || error.status === 409)) {
        setUnknown(true);
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-presets").slice(0, 3) });
      }
      setFailure(error instanceof RangeError ? error.message : focusFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const step = unit === "1" ? 5 : 60;
  const segments = cycleSegments(settings);
  const valid = settings.workSeconds > 0 && settings.shortBreakSeconds > 0 && settings.longBreakSeconds > 0;
  return (
    <form
      className="focus-preset-form"
      onSubmit={e => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={pending || unknown}>
        <div className="focus-preset-grid">
          <div className="focus-preset-column">
            <label className="focus-field">
              Ritmin adı
              <input
                value={name}
                maxLength={100}
                required
                placeholder="Örneğin Okuma seansı"
                aria-invalid={failure.startsWith("Ritme") || undefined}
                onChange={e => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <div className="focus-durations">
              <div className="focus-durations-head">
                <span>Süreler</span>
                <fieldset className="segmented focus-unit">
                  <legend className="sr-only">Süre birimi</legend>
                  {(
                    [
                      ["60", "Dakika"],
                      ["1", "Saniye"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="focus-unit"
                        value={value}
                        checked={unit === value}
                        onChange={() => setUnit(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
              {durations.map(([key, label, max, less, more]) => (
                <Stepper
                  key={key}
                  id={`focus-${key}`}
                  label={label}
                  less={less}
                  more={more}
                  unit={unit === "1" ? "saniye" : "dakika"}
                  value={settings[key] / factor}
                  min={1 / factor}
                  max={max / factor}
                  inputStep={unit === "1" ? 1 : "any"}
                  dec={() => update({ [key]: Math.max(unit === "1" ? 1 : 60, settings[key] - step) })}
                  inc={() => update({ [key]: Math.min(max, settings[key] + step) })}
                  set={value => update({ [key]: Math.round(value * factor) })}
                />
              ))}
              <Stepper
                id="focus-longBreakEvery"
                label="Kaç döngüde bir uzun mola?"
                less="Uzun molayı daha sık ver"
                more="Uzun molayı daha seyrek ver"
                unit="döngüde bir"
                value={settings.longBreakEvery}
                min={1}
                max={20}
                inputStep={1}
                dec={() => update({ longBreakEvery: Math.max(1, settings.longBreakEvery - 1) })}
                inc={() => update({ longBreakEvery: Math.min(20, settings.longBreakEvery + 1) })}
                set={value => update({ longBreakEvery: value })}
              />
            </div>
          </div>
          <div className="focus-preset-column">
            <div className="focus-round">
              <div className="focus-round-head">
                <span>Bir tur</span>
                <span className="muted">{valid ? spanText(roundSeconds(settings)) : "—"}</span>
              </div>
              {valid && settings.longBreakEvery <= 20 && (
                <span className="focus-strip focus-strip-large" aria-hidden="true">
                  {segments.map((s, i) => (
                    <i key={i} data-kind={s.kind} style={{ flexGrow: s.seconds }} />
                  ))}
                </span>
              )}
              <ul className="focus-legend" aria-hidden="true">
                <li data-kind="work">Çalışma</li>
                <li data-kind="short">Kısa mola</li>
                <li data-kind="long">Uzun mola</li>
              </ul>
            </div>
            <fieldset className="focus-choice">
              <legend>Hedefe ulaşınca</legend>
              {(
                [
                  ["ContinueTracking", "Saymaya devam et", "Çalışma ve hedef aşımı ölçülmeye devam eder."],
                  ["AutoBreak", "Molaya geç", "Hedef dolunca mola kendiliğinden başlar."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="focus-target-behavior"
                    value={value}
                    checked={settings.targetBehavior === value}
                    onChange={() => update({ targetBehavior: value })}
                  />
                  <span>
                    {label}
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="focus-checks">
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={e => update({ soundEnabled: e.target.checked })}
                />
                Hedef sesi çalsın
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={e => update({ notificationsEnabled: e.target.checked })}
                />
                Ekranda hedef bildirimi göster
              </label>
            </div>
          </div>
        </div>
      </fieldset>
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
      {unknown && (
        <p>
          Otomatik tekrar gönderilmedi. Formu kapatıp güncel ritimleri kontrol et; düzenlemek için güncel kaydı yeniden
          aç.
        </p>
      )}
      <div className="focus-preset-footer">
        <p className="muted">Hedefin dolması görevi tamamlamaz.</p>
        <div className="actions">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              // Odak dönüşünü sayfa yönetiyor; burada yalnız taslak soruluyor.
              if (!dirty || window.confirm("Kaydedilmemiş ritmi bırakmak istiyor musun?")) close();
            }}
          >
            {unknown ? "Kapat" : "Vazgeç"}
          </button>
          <button className="primary" disabled={pending || unknown}>
            {pending ? "Kaydediliyor…" : preset ? "Değişiklikleri kaydet" : "Kaydet ve seç"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Stepper({
  id,
  label,
  less,
  more,
  unit,
  value,
  min,
  max,
  inputStep,
  dec,
  inc,
  set,
}: {
  id: string;
  label: string;
  /** Düğme adları alanın etiketini tekrar etmiyor; etiketle alan aramak tek sonuç veriyor. */
  less: string;
  more: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  inputStep: number | "any";
  dec: () => void;
  inc: () => void;
  set: (value: number) => void;
}) {
  return (
    <div className="focus-stepper">
      <label htmlFor={id}>{label}</label>
      <div>
        <button type="button" className="focus-step" aria-label={less} onClick={dec}>
          <Minus aria-hidden="true" size={14} />
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={inputStep}
          required
          value={value || ""}
          onChange={e => set(Number(e.target.value))}
        />
        <button type="button" className="focus-step" aria-label={more} onClick={inc}>
          <Plus aria-hidden="true" size={14} />
        </button>
        <span className="muted">{unit}</span>
      </div>
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { useDialogGuard } from "../work/draft-guard";
import { focusFailure, readPreset, readSettings, type Preset, type Settings } from "./model";

export function PresetDialog({ preset, trigger, close }: { preset?: Preset; trigger: HTMLElement; close: () => void }) {
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
  const [name, setName] = useState(preset?.name ?? "35/7");
  const [settings, setSettings] = useState<Settings>(
    initial ?? {
      workSeconds: 2100,
      shortBreakSeconds: 420,
      longBreakSeconds: 1200,
      longBreakEvery: 3,
      targetBehavior: "ContinueTracking",
      soundEnabled: false,
      notificationsEnabled: true,
    },
  );
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState(false),
    [saved, setSaved] = useState(false),
    [failure, setFailure] = useState("");
  const busy = useRef(false);
  const guard = useDialogGuard({
    dirty,
    pending,
    close,
    trigger,
    message: "Kaydedilmemiş odak ayarını bırakmak istiyor musun?",
  });
  const update = (value: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...value }));
    setDirty(true);
  };
  async function save() {
    if (busy.current || unknown || saved) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      if (!name.trim() || name.trim().length > 100) throw new RangeError("Ayar adına 1–100 karakter gir.");
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
      setName(result.name);
      setSaved(true);
      setDirty(false);
      guard.markSaved();
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-presets").slice(0, 3) });
    } catch (error) {
      if (!cache.current()) return;
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) {
        setUnknown(true);
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-presets").slice(0, 3) });
      }
      setFailure(error instanceof RangeError ? error.message : focusFailure(error));
      if (error instanceof ApiError && error.status === 409) {
        setUnknown(true);
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-presets").slice(0, 3) });
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Surface
      title={preset ? "Odak ayarını düzenle" : "Özel odak ayarı"}
      modal
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={pending}
    >
      <form
        className="focus-form"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={pending || unknown || saved}>
          <legend>Çalışma ve mola</legend>
          <label>
            Ayar adı
            <input
              value={name}
              maxLength={100}
              required
              onChange={e => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            Süre birimi
            <select value={unit} onChange={e => setUnit(e.target.value as "60" | "1")}>
              <option value="60">Dakika</option>
              <option value="1">Saniye</option>
            </select>
          </label>
          {(
            [
              ["workSeconds", "Çalışma süresi", 86400],
              ["shortBreakSeconds", "Kısa mola süresi", 14400],
              ["longBreakSeconds", "Uzun mola süresi", 43200],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={1 / factor}
                max={max / factor}
                step={unit === "1" ? 1 : "any"}
                required
                value={settings[key] / factor || ""}
                onChange={e => update({ [key]: Math.round(Number(e.target.value) * factor) })}
              />
            </label>
          ))}
          <label>
            Kaç döngüde bir uzun mola?
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              required
              value={settings.longBreakEvery || ""}
              onChange={e => update({ longBreakEvery: Number(e.target.value) })}
            />
          </label>
          <label>
            Hedefe ulaşınca
            <select
              value={settings.targetBehavior}
              onChange={e => update({ targetBehavior: e.target.value as Settings["targetBehavior"] })}
            >
              <option value="ContinueTracking">Çalışmayı ve aşımı izlemeye devam et</option>
              <option value="AutoBreak">Sunucu değerlendirdiğinde molaya geç</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={e => update({ soundEnabled: e.target.checked })}
            />
            Hedef sesi
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={e => update({ notificationsEnabled: e.target.checked })}
            />
            Ekran içi hedef bildirimi
          </label>
        </fieldset>
        <p className="muted">
          Hedef görevi tamamlamaz. Uzun mola ve hedef politikası başlayan oturumun ayarında korunur.
        </p>
        {failure && (
          <p role="alert" className="form-error">
            {failure}
          </p>
        )}
        {unknown && (
          <p>
            Otomatik tekrar gönderilmedi. Bu formu kapatıp güncel ayarları kontrol et; düzenlemek için güncel kaydı
            yeniden aç.
          </p>
        )}
        {saved && <p role="status">Odak ayarı kaydedildi.</p>}
        <div className="actions">
          <button className="primary" disabled={pending || unknown || saved}>
            {pending ? "Kaydediliyor…" : "Ayarı kaydet"}
          </button>
          <button type="button" disabled={pending} onClick={guard.requestClose}>
            {saved || unknown ? "Kapat" : "Vazgeç"}
          </button>
        </div>
      </form>
    </Surface>
  );
}

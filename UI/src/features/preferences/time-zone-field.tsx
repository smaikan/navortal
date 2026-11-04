"use client";
import { useSyncExternalStore } from "react";
const common: Record<string, string> = {
  "Europe/Istanbul": "Türkiye · İstanbul",
  UTC: "Eşgüdümlü evrensel saat · UTC",
  "Europe/Berlin": "Almanya · Berlin",
  "Europe/London": "Birleşik Krallık · Londra",
  "Europe/Paris": "Fransa · Paris",
  "Europe/Amsterdam": "Hollanda · Amsterdam",
  "America/New_York": "ABD · New York",
  "America/Los_Angeles": "ABD · Los Angeles",
  "America/Chicago": "ABD · Chicago",
  "Asia/Dubai": "Birleşik Arap Emirlikleri · Dubai",
  "Asia/Tokyo": "Japonya · Tokyo",
  "Asia/Shanghai": "Çin · Şanghay",
  "Australia/Sydney": "Avustralya · Sidney",
};
const defaults = Object.keys(common);
const subscribe = () => () => {};
const serverZones = () => defaults;
let browserZones: string[] | undefined;
function supportedZones() {
  if (!browserZones) {
    try {
      browserZones = Intl.supportedValuesOf("timeZone");
    } catch {
      browserZones = defaults;
    }
  }
  return browserZones;
}
export function TimeZoneField({
  value,
  error,
  change,
}: {
  value: string;
  error?: string;
  change: (value: string) => void;
}) {
  const available = useSyncExternalStore(subscribe, supportedZones, serverZones);
  const zones = [...new Set([...Object.keys(common), value, ...available])];
  return (
    <section className="preferences-section" aria-labelledby="time-zone-heading">
      <h2 id="time-zone-heading">Saat dilimi</h2>
      <div className="hours-field">
        <label htmlFor="timeZoneId" className="sr-only">
          Saat dilimi
        </label>
        <p className="muted form-hint" id="zone-hint">
          Bulunduğun şehre uygun saat dilimini seç. Gün sınırları ve çalışma saatleri buna göre gösterilir.
        </p>
        <select
          id="timeZoneId"
          name="timeZoneId"
          aria-label="Saat dilimi"
          value={value}
          onChange={event => change(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={`zone-hint${error ? " zone-error" : ""}`}
        >
          {zones.map(zone => (
            <option key={zone} value={zone}>
              {common[zone] ?? `${zone.split("/").at(-1)!.replaceAll("_", " ")} · ${zone}`}
            </option>
          ))}
        </select>
        {error && (
          <p className="field-error" id="zone-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

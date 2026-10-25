"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import "./temporal-input.css";

type Props = Omit<ComponentPropsWithRef<"input">, "type"> & {
  type: "date" | "time" | "datetime-local" | "text";
  presentation?: "field" | "navigation";
};

/** Gerçek kontrol yerel input olsun. Olayları, hassasiyeti, doğrulaması ve form değeri korunuyor. */
export function TemporalInput({ type, presentation = "field", className = "", ...props }: Props) {
  if (presentation === "navigation")
    return <input {...props} type={type} className={`temporal-day-input ${className}`.trim()} />;
  const Icon = type === "time" || type === "text" ? Clock3 : CalendarDays;
  return (
    <span className={`temporal-control temporal-${type} temporal-${presentation}`}>
      <Icon className="temporal-icon" aria-hidden="true" size={18} />
      <input {...props} type={type} className={`temporal-input ${className}`.trim()} />
    </span>
  );
}

/** Hatırlatmada saat ve dakika açıkça seçiliyor. Seçilmeyen saat kendiliğinden gece yarısı olmuyor. */
export function ClockSelect({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="clock-select">
      <div>
        <label htmlFor={`${id}-hour`}>Saat</label>
        <select
          id={`${id}-hour`}
          required
          disabled={disabled}
          value={value.slice(0, 2)}
          onChange={e => onChange(`${e.target.value}:${value.slice(3, 5) || "00"}`)}
        >
          <option value="">Seç</option>
          {Array.from({ length: 24 }, (_, n) => String(n).padStart(2, "0")).map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <span aria-hidden="true">:</span>
      <div>
        <label htmlFor={`${id}-minute`}>Dakika</label>
        <select
          id={`${id}-minute`}
          disabled={disabled || !value.slice(0, 2)}
          value={value.slice(3, 5) || "00"}
          onChange={e => onChange(`${value.slice(0, 2)}:${e.target.value}`)}
        >
          {Array.from({ length: 60 }, (_, n) => String(n).padStart(2, "0")).map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

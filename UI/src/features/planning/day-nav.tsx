"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftDate } from "../../lib/time/date-only";
import { dateFormat } from "../../lib/date-format";
import "./styles.css";

export { shiftDate } from "../../lib/time/date-only";
export function dayLabel(date: string) {
  return dateFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** Başlıkta gün ve oklar var, Bugüne dön yalnız başka günde görünür. Plan günü adlı gerçek tarih alanı saydam biçimde etiketin üstünde durur, seçici ve odak çemberi çalışır. */
export function DayNav({ date, today, change }: { date: string; today: string; change: (date: string) => void }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <div className="day-nav">
      <button
        className="ghost icon"
        aria-label="Önceki gün"
        disabled={!valid || date <= "0002-01-01"}
        onClick={() => change(shiftDate(date, -1))}
      >
        <ChevronLeft aria-hidden="true" size={18} />
      </button>
      <div className="day-nav-date">
        <span className="day-nav-label" aria-hidden="true">
          {valid ? dayLabel(date) : "Tarih seç"}
        </span>
        <label htmlFor="plan-date" className="sr-only">
          Plan günü
        </label>
        <TemporalInput
          presentation="navigation"
          id="plan-date"
          type="date"
          min="0002-01-01"
          max="9998-12-31"
          value={date}
          onClick={event => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              /* Yerel alana klavyeyle de yazılabiliyor. */
            }
          }}
          onChange={e => change(e.target.value)}
        />
      </div>
      <button
        className="ghost icon"
        aria-label="Sonraki gün"
        disabled={!valid || date >= "9998-12-31"}
        onClick={() => change(shiftDate(date, 1))}
      >
        <ChevronRight aria-hidden="true" size={18} />
      </button>
      {date !== today && (
        <button type="button" className="r2-quiet-link day-nav-today" onClick={() => change(today)}>
          Bugüne dön
        </button>
      )}
    </div>
  );
}

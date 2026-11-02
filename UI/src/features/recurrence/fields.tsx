"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useId, useState } from "react";
import { Check } from "lucide-react";
import "./projection.css";
import {
  weekDays,
  weekOrder,
  weekShort,
  weekPresets,
  weekDayNames,
  weekdayOf,
  sameDays,
  noDaysMessage,
  monthEnds,
  type Draft,
} from "./model";

const freqOptions: [Draft["frequency"], string][] = [
  ["Daily", "Her gün"],
  ["Weekly", "Belirli günler"],
  ["Monthly", "Aylık"],
  ["IntervalDays", "Gün aralığı"],
];
export function TemplateFields({
  draft: d,
  change,
  daysError = false,
}: {
  draft: Draft;
  change: (d: Draft) => void;
  daysError?: boolean;
}) {
  const id = useId();
  // Tahmin tam dakika girilir, API'de saniye kalır. Tam dakika olmayan eski değer olduğu gibi görünür.
  const [minutes, setMinutes] = useState(() =>
    d.estimatedSeconds === "" ? "" : String(Number(d.estimatedSeconds) / 60),
  );
  const put = <K extends keyof Draft>(key: K, value: Draft[K]) => change({ ...d, [key]: value });
  // Günler korunur; ilk kez Belirli günler açılırken başlangıç gününün haftanın günü işaretlenir.
  const pick = (frequency: Draft["frequency"]) => {
    const start = weekdayOf(d.startDate);
    change({
      ...d,
      frequency,
      interval: "1",
      weekDays: frequency === "Weekly" && !d.weekDays.length && start != null ? [start] : d.weekDays,
    });
  };
  return (
    <>
      <label htmlFor={`${id}-title`}>Rutin adı</label>
      <input id={`${id}-title`} maxLength={300} required value={d.title} onChange={e => put("title", e.target.value)} />
      <label>
        Başlangıç günü
        <TemporalInput type="date" required value={d.startDate} onChange={e => put("startDate", e.target.value)} />
      </label>
      <label>
        Bitiş tarihi (isteğe bağlı)
        <TemporalInput
          type="date"
          min={d.startDate}
          value={d.untilDate}
          onChange={e => put("untilDate", e.target.value)}
        />
      </label>
      {d.untilDate ? (
        <button type="button" className="routine-until-clear" onClick={() => put("untilDate", "")}>
          Bitiş tarihini kaldır
        </button>
      ) : (
        <p className="muted">Boş bırakırsan rutin sen durdurana kadar sürer.</p>
      )}
      <fieldset className="recurrence-freq">
        <legend>Ne zaman tekrarlansın?</legend>
        <div className="recurrence-fit">
          <div className="recurrence-seg">
            {freqOptions.map(([value, text]) => (
              <label key={value} className="recurrence-seg-item">
                <input
                  type="radio"
                  name={`${id}-frequency`}
                  checked={d.frequency === value}
                  onChange={() => pick(value)}
                />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {d.frequency === "IntervalDays" && (
        <label>
          Her kaç günde
          <input type="number" min={1} max={366} value={d.interval} onChange={e => put("interval", e.target.value)} />
        </label>
      )}
      {d.frequency === "Weekly" && (
        <fieldset
          className="recurrence-days"
          aria-describedby={`${id}-days-note${daysError ? ` ${id}-days-error` : ""}`}
        >
          <legend>Hangi günler?</legend>
          <div className="recurrence-fit">
            <div className="recurrence-chips">
              {weekOrder.map(day => (
                <label key={day} className="recurrence-chip">
                  <input
                    type="checkbox"
                    aria-label={weekDays[day]}
                    checked={d.weekDays.includes(day)}
                    onChange={e =>
                      put(
                        "weekDays",
                        e.target.checked
                          ? [...d.weekDays, day].sort((x, y) => x - y)
                          : d.weekDays.filter(x => x !== day),
                      )
                    }
                  />
                  <span aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                    {weekShort[day]}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="recurrence-presets" role="group" aria-label="Hazır gün kümeleri">
            {weekPresets.map(p => (
              <button
                key={p.key}
                type="button"
                aria-pressed={sameDays(d.weekDays, p.days)}
                onClick={() => put("weekDays", [...p.days])}
              >
                {p.label}
              </button>
            ))}
            <button type="button" className="recurrence-clear" onClick={() => put("weekDays", [])}>
              Temizle
            </button>
          </div>
          {daysError && !d.weekDays.length && (
            <p id={`${id}-days-error`} className="recurrence-days-error">
              {noDaysMessage}
            </p>
          )}
          <p className="recurrence-days-summary" aria-live="polite">
            {d.weekDays.length ? `Her hafta ${weekDayNames(d.weekDays)}` : ""}
          </p>
          <p id={`${id}-days-note`} className="muted">
            Hafta Pazartesi başlar. Seçimin yalnız bu rutini etkiler.
          </p>
          <details open={d.interval !== "1" || undefined}>
            <summary>Daha seyrek mi? (örn. 2 haftada bir)</summary>
            <label>
              Her kaç haftada
              <input
                type="number"
                min={1}
                max={52}
                value={d.interval}
                onChange={e => put("interval", e.target.value)}
              />
            </label>
          </details>
        </fieldset>
      )}
      {d.frequency === "Monthly" && (
        <>
          <label>
            Ayın kaçıncı günü
            <input type="number" min={1} max={31} value={d.monthDay} onChange={e => put("monthDay", e.target.value)} />
          </label>
          <label htmlFor={`${id}-select-2`}>Ayda seçilen gün yoksa</label>
          <select id={`${id}-select-2`} value={d.monthEnd} onChange={e => put("monthEnd", e.target.value)}>
            <option value="">29–31 için açık seçim gerekli</option>
            {Object.entries(monthEnds).map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </>
      )}
      <label>
        Tahmini süre (dk, isteğe bağlı)
        <input
          inputMode="numeric"
          value={minutes}
          onChange={e => {
            const v = e.target.value.trim();
            setMinutes(v);
            put("estimatedSeconds", v === "" ? "" : /^\d+$/.test(v) ? String(Number(v) * 60) : v);
          }}
        />
      </label>
      <label>
        Başlangıç saati (isteğe bağlı)
        <TemporalInput type="time" step={60} value={d.startTime} onChange={e => put("startTime", e.target.value)} />
      </label>
      <label className="r2-check-row">
        <input type="checkbox" checked={d.autoAddToPlan} onChange={e => put("autoAddToPlan", e.target.checked)} />
        Gün planlarına otomatik ekle
      </label>
      <p className="muted">Saat veya süre boş kalabilir.</p>
      {d.dueTime && <p className="muted">Bu eski serinin mevcut son teslim saati ({d.dueTime}) korunur.</p>}
    </>
  );
}

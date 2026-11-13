"use client";
import { useEffect, useRef } from "react";
import { ListFilter, X } from "lucide-react";
import { DateFilter } from "./date-filter";
import { estimateRanges } from "./model";

const priorities: Record<string, string> = {
  Urgent: "Acil öncelik",
  High: "Yüksek öncelik",
  Normal: "Normal öncelik",
  Low: "Düşük öncelik",
};
const energies: Record<string, string> = { Low: "Düşük efor", Medium: "Orta efor", High: "Yüksek efor" };
const short = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

type Change = Record<string, string | null>;
type Chip = { key: string; label: string; clear: Change };

/** Etkin süzgeçler: panelin düğmesindeki sayı ve altındaki kaldırılabilir çipler aynı listeden gelir. */
export function activeFilters(params: URLSearchParams, today: string): Chip[] {
  const chips: Chip[] = [];
  const state = params.get("state");
  const from = params.get("dateFrom") ?? "";
  const to = params.get("dateTo") ?? "";
  if (state === "Completed") chips.push({ key: "state", label: "Biten", clear: { state: null } });
  if (from)
    chips.push({
      key: "date",
      label: from === today && to === today ? "Bugün" : from === to ? short(from) : `${short(from)} – ${short(to)}`,
      clear: { dateFrom: null, dateTo: null },
    });
  const priority = params.get("priority");
  if (priority) chips.push({ key: "priority", label: priorities[priority] ?? priority, clear: { priority: null } });
  const estimate = params.get("estimate");
  if (estimate)
    chips.push({
      key: "estimate",
      label: (estimateRanges as Record<string, { label: string }>)[estimate]?.label ?? estimate,
      clear: { estimate: null },
    });
  const energy = params.get("energyDemand");
  if (energy) chips.push({ key: "energy", label: energies[energy] ?? energy, clear: { energyDemand: null } });
  return chips;
}

export function FilterPanel({
  params,
  today,
  setFilters,
}: {
  params: URLSearchParams;
  today: string;
  setFilters: (changes: Change) => void;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      const element = box.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        element.open = false;
        element.querySelector("summary")?.focus();
      } else if (!element.contains(event.target as Node)) element.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const chips = activeFilters(params, today);
  const state = params.get("state");
  const from = params.get("dateFrom") ?? "";
  const to = params.get("dateTo") ?? "";
  const open = !state && !from;
  const todayOn = from === today && to === today && !state;
  const doneOn = state === "Completed";
  return (
    <details ref={box} className={`r2-filter-box${chips.length ? " active" : ""}`}>
      <summary>
        <ListFilter aria-hidden="true" size={16} />
        Filtreler
        {chips.length > 0 && <span className="r2-filter-count">{chips.length}</span>}
      </summary>
      <div className="r2-filter-pop" role="group" aria-label="Filtreler">
        <fieldset className="r2-filter-status">
          <legend>Durum</legend>
          <button
            type="button"
            aria-pressed={open}
            onClick={() => setFilters({ state: null, dateFrom: null, dateTo: null })}
          >
            Açık
          </button>
          <button
            type="button"
            aria-pressed={todayOn}
            onClick={() => setFilters({ state: null, dateFrom: today, dateTo: today })}
          >
            Bugün
          </button>
          <button
            type="button"
            aria-pressed={doneOn}
            onClick={() => setFilters({ state: "Completed", dateFrom: null, dateTo: null })}
          >
            Biten
          </button>
        </fieldset>
        <div className="r2-filter-grid">
          <label className="r2-select">
            <span>Öncelik</span>
            <select
              value={params.get("priority") ?? ""}
              onChange={event => setFilters({ priority: event.target.value || null })}
            >
              <option value="">Tüm öncelikler</option>
              {Object.entries(priorities).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="r2-select">
            <span>Süre</span>
            <select
              value={params.get("estimate") ?? ""}
              onChange={event => setFilters({ estimate: event.target.value || null })}
            >
              <option value="">Tüm süreler</option>
              {Object.entries(estimateRanges).map(([value, range]) => (
                <option key={value} value={value}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>
          <label className="r2-select">
            <span>Efor</span>
            <select
              value={params.get("energyDemand") ?? ""}
              onChange={event => setFilters({ energyDemand: event.target.value || null })}
            >
              <option value="">Tüm eforlar</option>
              {Object.entries(energies).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="r2-filter-date">
            <span>Tarih</span>
            <DateFilter from={from} to={to} change={(dateFrom, dateTo) => setFilters({ dateFrom, dateTo })} />
          </div>
        </div>
        <div className="r2-filter-actions">
          <button
            type="button"
            className="r2-quiet-link"
            disabled={!chips.length}
            onClick={() =>
              setFilters({
                state: null,
                dateFrom: null,
                dateTo: null,
                priority: null,
                estimate: null,
                energyDemand: null,
              })
            }
          >
            Temizle
          </button>
          <button type="button" className="primary" onClick={() => box.current?.removeAttribute("open")}>
            Tamam
          </button>
        </div>
      </div>
    </details>
  );
}

/** Etkin süzgeçlerin kaldırılabilir özeti. Süzgeç yoksa hiçbir şey çizmez. */
export function ActiveFilterChips({ chips, setFilters }: { chips: Chip[]; setFilters: (changes: Change) => void }) {
  if (!chips.length) return null;
  return (
    <ul className="r2-active-filters" aria-label="Etkin filtreler">
      {chips.map(chip => (
        <li key={chip.key}>
          <span>{chip.label}</span>
          <button type="button" aria-label={`${chip.label} filtresini kaldır`} onClick={() => setFilters(chip.clear)}>
            <X aria-hidden="true" size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useState, type FormEvent } from "react";
import { entryId, type DayActions, type Entry } from "./day-actions";
import { localInput } from "./time-model";
import { partialTimeRange, timeRange } from "./time-range";
import { calibrationText } from "./calibration";

const hhmm = (instant: string, zone: string) => localInput(instant, zone).slice(11, 16);
/** Yalnız önerilen bitişi hesaplıyoruz: 23:50 + 20 dakika = 00:10. Kaydetmek kullanıcıya ait. */
function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function TimeEditor({
  id,
  entry,
  date,
  zone,
  estimate,
  suggestion,
  actions,
  close,
}: {
  id: string;
  entry: Entry;
  date: string;
  zone: string;
  estimate: string;
  suggestion: number | null;
  actions: DayActions;
  close: () => void;
}) {
  const block = entry.kind === "block" ? entry.block : null;
  const key = entryId(entry);
  const startsAt = block?.startsAt ?? (entry.kind === "item" ? entry.item.startsAt : null);
  const endsAt = block?.endsAt ?? (entry.kind === "item" ? entry.item.endsAt : null);
  const [start, setStart] = useState(startsAt ? hhmm(startsAt, zone) : "");
  const [end, setEnd] = useState(endsAt ? hhmm(endsAt, zone) : "");
  const [issue, setIssue] = useState("");
  const busy = actions.pending === key;
  const failure = actions.failure?.id === key ? actions.failure.text : "";
  const nextDay = !!start && !!end && end <= start;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setIssue("");
    try {
      (block ? timeRange : partialTimeRange)(date, zone, start, end);
    } catch (error) {
      setIssue((error as Error).message);
      return;
    }
    if (await actions.setTime(entry, start, end)) close();
  }
  return (
    <form
      id={id}
      className="r2-time-editor"
      aria-label="Saat aralığı"
      onSubmit={submit}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <label>
        Başlangıç saati
        <TemporalInput
          type="time"
          value={start}
          required={!!block || (entry.kind === "item" && entry.item.isUrgent)}
          readOnly={busy}
          autoFocus
          onChange={event => setStart(event.target.value)}
        />
      </label>
      <span aria-hidden="true">–</span>
      <label>
        Bitiş saati
        <TemporalInput
          type="time"
          value={end}
          required={!!block}
          readOnly={busy}
          onChange={event => setEnd(event.target.value)}
        />
      </label>
      {nextDay && <span className="r2-next-day">ertesi gün</span>}
      <span className="r2-hint">{estimate ? `Tahmini süre ${estimate}` : "Tahmin girilmedi"}</span>
      {suggestion !== null && start && (
        <p className="r2-hint r2-calibration">
          {calibrationText(suggestion)}{" "}
          <button
            type="button"
            className="r2-quiet-link"
            disabled={busy}
            onClick={() => setEnd(addMinutes(start, suggestion))}
          >
            Payı uygula
          </button>
        </p>
      )}
      <div className="r2-time-actions">
        <button type="submit" className="r2-soft" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" className="r2-quiet" disabled={busy} onClick={close}>
          Vazgeç
        </button>
      </div>
      {(issue || failure) && (
        <p role="alert" className="field-error">
          {issue || failure}
        </p>
      )}
    </form>
  );
}

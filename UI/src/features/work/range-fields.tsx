"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { wallTimeIsAmbiguous, type WallChoice } from "../../lib/time/wall-time";
import { reasonLimit, type RangeDraft } from "./journal";

/** Başlangıç/bitiş zone saat diliminde, saniye hassasiyetinde ve gerekçeli. İki kez oluşan yerel saatte seçim sorulur. */
export function RangeFields({
  id,
  draft,
  change,
  zone,
  openEnd,
  issue,
}: {
  id: string;
  draft: RangeDraft;
  change: (next: RangeDraft) => void;
  zone: string;
  openEnd: boolean;
  issue: string;
}) {
  const described = [`${id}-zone`, issue && `${id}-issue`].filter(Boolean).join(" ");
  return (
    <>
      <p id={`${id}-zone`} className="muted form-hint">
        Saniye girebilirsin.
      </p>
      <div className="work-range">
        <div className="hours-field">
          <label htmlFor={`${id}-start`}>Başlangıç</label>
          <TemporalInput
            id={`${id}-start`}
            type="datetime-local"
            step={1}
            required
            value={draft.start}
            aria-describedby={described}
            onChange={event => change({ ...draft, start: event.target.value, startChoice: "" })}
          />
          <Choice
            id={`${id}-start-choice`}
            label="Başlangıç hangi oluşum"
            local={draft.start}
            zone={zone}
            value={draft.startChoice}
            change={startChoice => change({ ...draft, startChoice })}
          />
        </div>
        <div className="hours-field">
          <label htmlFor={`${id}-end`}>Bitiş{openEnd && " (boş: aralık açık kalır)"}</label>
          <TemporalInput
            id={`${id}-end`}
            type="datetime-local"
            step={1}
            required={!openEnd}
            value={draft.end}
            aria-describedby={described}
            onChange={event => change({ ...draft, end: event.target.value, endChoice: "" })}
          />
          <Choice
            id={`${id}-end-choice`}
            label="Bitiş hangi oluşum"
            local={draft.end}
            zone={zone}
            value={draft.endChoice}
            change={endChoice => change({ ...draft, endChoice })}
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-reason`}>Neden</label>
        <p id={`${id}-reason-hint`} className="muted form-hint">
          Kayıt geçmişinde saklanır; en çok {reasonLimit} karakter.
        </p>
        <textarea
          id={`${id}-reason`}
          required
          maxLength={reasonLimit}
          rows={3}
          value={draft.reason}
          aria-describedby={`${id}-reason-hint`}
          onChange={event => change({ ...draft, reason: event.target.value })}
        />
      </div>
    </>
  );
}
function Choice({
  id,
  label,
  local,
  zone,
  value,
  change,
}: {
  id: string;
  label: string;
  local: string;
  zone: string;
  value: WallChoice;
  change: (value: WallChoice) => void;
}) {
  if (!local || !wallTimeIsAmbiguous(local, zone)) return null;
  return (
    <div className="hours-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={event => change(event.target.value as WallChoice)}>
        <option value="">Seç: saat geri alınırken iki kez yaşanıyor</option>
        <option value="earlier">İlk oluşum (yaz saati)</option>
        <option value="later">İkinci oluşum (kış saati)</option>
      </select>
    </div>
  );
}

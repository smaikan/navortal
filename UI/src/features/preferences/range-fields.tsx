"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { X } from "lucide-react";
import { useId } from "react";
import type { FieldIssue, RangeDraft } from "./model";

export function RangeFields({
  value,
  path,
  label,
  errors,
  onChange,
  onRemove,
}: {
  value: RangeDraft;
  path: string;
  label: string;
  errors: FieldIssue[];
  onChange: (value: RangeDraft) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <div className="hours-range">
      {(["start", "end"] as const).map(key => {
        const name = `${path}.${value.id}.${key}`;
        const message = errors.find(item => item.path === name)?.message;
        return (
          <div className="hours-field" key={key}>
            <label htmlFor={`${id}-${key}`}>
              {key === "start" ? "Başlangıç" : "Bitiş"}
              <span className="sr-only"> {label}</span>
            </label>
            <TemporalInput
              id={`${id}-${key}`}
              name={name}
              value={value[key]}
              placeholder={key === "start" ? "SS:DD" : "24:00 dahil"}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={5}
              aria-invalid={!!message}
              aria-describedby={message ? `${id}-${key}-error` : undefined}
              onChange={event => onChange({ ...value, [key]: event.target.value })}
            />
            {message && (
              <p className="field-error" id={`${id}-${key}-error`}>
                {message}
              </p>
            )}
          </div>
        );
      })}
      <button type="button" aria-label={`${label} aralığını kaldır`} onClick={onRemove}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

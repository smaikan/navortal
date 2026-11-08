"use client";
import { Check, Plus } from "lucide-react";
import type { Preset, Settings } from "./model";
import { cycleSegments, longBreakLabel, shortTime } from "./rhythm";

export type RhythmChoice = { key: string; name: string; settings: Settings; presetId?: string; preset?: Preset };

/** Ritim kartları seçim yapıyor; başlatma ve düzenleme kartların altındaki alanda. */
export function RhythmPicker({
  choices,
  selected,
  disabled,
  pick,
  creating,
  create,
}: {
  choices: RhythmChoice[];
  selected?: string;
  disabled: boolean;
  pick: (choice: RhythmChoice) => void;
  creating: boolean;
  create: () => void;
}) {
  return (
    <ul className="focus-rhythms">
      {choices.map(choice => {
        const s = choice.settings;
        const minutes = s.workSeconds % 60 === 0;
        const on = choice.key === selected;
        return (
          <li key={choice.key}>
            <button
              type="button"
              className="focus-rhythm"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => pick(choice)}
            >
              <span className="focus-rhythm-title">
                {choice.name}
                {choice.presetId && <span className="focus-rhythm-tag">Kayıtlı</span>}
              </span>
              <span className="focus-rhythm-work">
                <strong>{minutes ? s.workSeconds / 60 : s.workSeconds}</strong> {minutes ? "dk" : "sn"}
              </span>
              <span className="focus-rhythm-break">{shortTime(s.shortBreakSeconds)} mola</span>
              <Strip settings={s} />
              <span className="focus-rhythm-foot">{longBreakLabel(s)}</span>
              {on && (
                <span className="focus-rhythm-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          className="focus-rhythm focus-rhythm-new"
          aria-pressed={creating}
          disabled={disabled}
          onClick={create}
        >
          <span className="focus-rhythm-plus" aria-hidden="true">
            <Plus size={16} />
          </span>
          <span className="focus-rhythm-title">Özel ritim</span>
          <span className="focus-rhythm-foot">Kendi sürelerini belirle</span>
        </button>
      </li>
    </ul>
  );
}

export function Strip({ settings }: { settings: Settings }) {
  return (
    <span className="focus-strip" aria-hidden="true">
      {cycleSegments(settings).map((segment, index) => (
        <i key={index} data-kind={segment.kind} style={{ flexGrow: segment.seconds }} />
      ))}
    </span>
  );
}

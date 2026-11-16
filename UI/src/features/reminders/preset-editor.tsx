"use client";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { maxMinutes, maxPresets, presetLabel, presetValid, type ReminderPreset } from "./presets";
import { defaultPresets } from "./presets";

type Row = { kind: "minutes" | "hours" | "tomorrow"; value: string };
const toRow = (preset: ReminderPreset): Row =>
  preset.kind === "tomorrow"
    ? { kind: "tomorrow", value: preset.time }
    : preset.minutes % 60 === 0
      ? { kind: "hours", value: String(preset.minutes / 60) }
      : { kind: "minutes", value: String(preset.minutes) };
function toPreset(row: Row): ReminderPreset {
  if (row.kind === "tomorrow") return { kind: "tomorrow", time: row.value };
  const n = Number(row.value);
  return { kind: "after", minutes: row.kind === "hours" ? n * 60 : n };
}

/** Kısayolları ekler, değiştirir, siler. Kaydedilince iki ekranda da güncellenir. */
export function PresetEditor({
  presets,
  onSave,
  onClose,
}: {
  presets: ReminderPreset[];
  onSave: (next: ReminderPreset[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<Row[]>(() => presets.map(toRow));
  const parsed = rows.map(toPreset);
  const invalid = parsed.some(item => !presetValid(item));
  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
  };
  /** Tutamaçtan sürükleme: imlecin hangi satırın ortasını geçtiğine göre sıra anında değişir. */
  function drag(event: PointerEvent<HTMLButtonElement>) {
    if (dragging === null) return;
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const box = items.current[i]?.getBoundingClientRect();
      if (box && event.clientY < box.top + box.height / 2) {
        target = i;
        break;
      }
    }
    if (target !== dragging) {
      move(dragging, target);
      setDragging(target);
    }
  }
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const by = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!by) return;
    event.preventDefault();
    move(index, index + by);
    requestAnimationFrame(() =>
      items.current[index + by]?.querySelector<HTMLButtonElement>(".reminder-preset-grip")?.focus(),
    );
  }
  return (
    <form
      className="reminder-preset-editor"
      aria-label="Kısayolları düzenle"
      onSubmit={event => {
        event.preventDefault();
        if (invalid) return;
        onSave(parsed);
        onClose();
      }}
    >
      <ul>
        {rows.map((row, index) => (
          <li
            key={index}
            ref={el => {
              items.current[index] = el;
            }}
            data-dragging={dragging === index || undefined}
          >
            <button
              type="button"
              className="reminder-preset-grip"
              aria-label={`${index + 1}. kısayolu sürükleyerek taşı. Yön tuşlarıyla da taşınır.`}
              onPointerDown={event => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(index);
              }}
              onPointerMove={drag}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
              onKeyDown={event => handleKey(event, index)}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
            <select
              aria-label={`${index + 1}. kısayol türü`}
              value={row.kind}
              onChange={event => {
                const kind = event.target.value as Row["kind"];
                update(index, { kind, value: kind === "tomorrow" ? "09:00" : kind === "hours" ? "1" : "10" });
              }}
            >
              <option value="minutes">Dakika sonra</option>
              <option value="hours">Saat sonra</option>
              <option value="tomorrow">Yarın, saat</option>
            </select>
            {row.kind === "tomorrow" ? (
              <input
                aria-label={`${index + 1}. kısayol saati`}
                type="time"
                required
                value={row.value}
                onChange={event => update(index, { value: event.target.value })}
              />
            ) : (
              <input
                aria-label={`${index + 1}. kısayol süresi`}
                type="number"
                inputMode="numeric"
                min={1}
                max={row.kind === "hours" ? maxMinutes / 60 : maxMinutes}
                required
                value={row.value}
                onChange={event => update(index, { value: event.target.value })}
              />
            )}
            <span className="reminder-preset-preview">
              {presetValid(parsed[index]) ? presetLabel(parsed[index]) : "Geçersiz"}
            </span>
            <button
              type="button"
              aria-label={`${index + 1}. kısayolu sil`}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="muted">Kısayol yok. Dilersen ekleyebilirsin.</p>}
      <div className="reminder-preset-actions" id={id}>
        <button
          type="button"
          disabled={rows.length >= maxPresets}
          onClick={() => setRows([...rows, { kind: "minutes", value: "30" }])}
        >
          <Plus size={16} aria-hidden="true" /> Kısayol ekle
        </button>
        <button type="button" onClick={() => setRows(defaultPresets.map(toRow))}>
          Varsayılana dön
        </button>
        <span />
        <button type="button" onClick={onClose}>
          Vazgeç
        </button>
        <button type="submit" className="primary" disabled={invalid}>
          Kaydet
        </button>
      </div>
    </form>
  );
}

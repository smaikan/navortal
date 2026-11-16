"use client";
import { useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useSession } from "../auth/provider";
import { reminderAfter, reminderFailure, reminderFields, readReminder } from "./model";
import { presetDue, presetLabel } from "./presets";
import { PresetEditor } from "./preset-editor";
import { useReminderPresets } from "./use-presets";
import { useReminderCache } from "./queries";

/** Modal açmadan hızlı ekleme: başlığı yaz, bir zaman kısayoluna bas. */
export function QuickReminder({
  zone,
  disabled,
  onCreated,
}: {
  zone: string;
  disabled: boolean;
  onCreated?: () => void;
}) {
  const id = useId();
  const { session } = useSession();
  const cache = useReminderCache();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState("");
  const { presets, save } = useReminderPresets();
  const [editing, setEditing] = useState(false);
  async function add(due: string) {
    if (busy.current) return;
    if (!title.trim()) {
      setIssue("Önce ne hatırlatılacağını yaz.");
      input.current?.focus();
      return;
    }
    setIssue("");
    busy.current = true;
    setPending(true);
    try {
      const body = reminderFields(title, due, zone, "", "");
      const raw = await session.api.mutation("/api/notifications/reminders", "post", { body }).execute();
      readReminder(raw);
      if (!cache.current()) return;
      setTitle("");
      cache.changed();
      onCreated?.();
    } catch (error) {
      if (cache.current()) setIssue(reminderFailure(error));
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  return (
    <div className="reminder-quick">
      <div className="reminder-quick-row">
        <label htmlFor={`${id}-title`} className="sr-only">
          Hızlı hatırlatma
        </label>
        <input
          ref={input}
          id={`${id}-title`}
          type="text"
          maxLength={200}
          value={title}
          placeholder="Ne hatırlatayım?"
          disabled={disabled || pending}
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add(reminderAfter(10, zone));
            }
          }}
        />
        <div className="reminder-quick-presets" role="group" aria-label="Zaman seç">
          {presets.map(preset => (
            <button
              key={presetLabel(preset)}
              type="button"
              disabled={disabled || pending}
              onClick={() => void add(presetDue(preset, zone))}
            >
              {presetLabel(preset)}
            </button>
          ))}
          <button
            type="button"
            className="reminder-preset-edit"
            aria-label="Kısayolları düzenle"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {editing && <PresetEditor presets={presets} onSave={save} onClose={() => setEditing(false)} />}
      {issue && (
        <p role="alert" className="field-error">
          {issue}
        </p>
      )}
    </div>
  );
}

"use client";
import { useId, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { useSession } from "../auth/provider";
import { reminderAfter, reminderFailure, reminderFields, reminderToday, readReminder } from "./model";
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
  const presets: { label: string; due: () => string }[] = [
    { label: "10 dk sonra", due: () => reminderAfter(10, zone) },
    { label: "1 saat sonra", due: () => reminderAfter(60, zone) },
    {
      label: "Yarın sabah",
      due: () => `${Temporal.PlainDate.from(reminderToday(zone)).add({ days: 1 }).toString()}T09:00`,
    },
  ];
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
              key={preset.label}
              type="button"
              disabled={disabled || pending}
              onClick={() => void add(preset.due())}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {issue && (
        <p role="alert" className="field-error">
          {issue}
        </p>
      )}
    </div>
  );
}

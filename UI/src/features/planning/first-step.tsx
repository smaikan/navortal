"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { noteFailure, noteFields, readNote } from "../notes/model";
import { useNotesCache } from "../notes/queries";

/** İlk adımı yaz/Önemli not ekle tek satırla görev altında görünen kısa notu sorar, mevcut API'de NextStep notu olarak kaydeder. Not önbelleği ve gün özeti yenilenir. */
export function FirstStepEditor({
  taskId,
  prompt,
  close,
}: {
  taskId: string;
  prompt: "first" | "important";
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const notes = useNotesCache(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  async function save() {
    if (busy) return;
    let body;
    try {
      body = noteFields("NextStep", text, { taskId }, "", null);
    } catch (error) {
      setFailure((error as Error).message);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      readNote(await session.api.mutation("/api/notes", "post", { body }).execute());
      notes.changed();
      await client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "plan-glance").slice(0, 3) });
      close();
    } catch (error) {
      setFailure(noteFailure(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="first-step-editor"
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <label>
        {prompt === "important" ? "Önemli not" : "İlk adım"}
        <input
          ref={field}
          value={text}
          maxLength={2000}
          readOnly={busy}
          placeholder={prompt === "important" ? "Aklında kalması gereken kısa not" : "Başlamak için ilk küçük hareket"}
          onChange={event => setText(event.target.value)}
        />
      </label>
      <button type="submit" className="r2-soft" disabled={busy || !text.trim()}>
        {busy ? "Kaydediliyor…" : "Kaydet"}
      </button>
      <button type="button" className="r2-quiet" disabled={busy} onClick={close}>
        Vazgeç
      </button>
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
    </form>
  );
}

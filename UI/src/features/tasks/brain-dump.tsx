"use client";
import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";

export const dumpLimit = 50;
/** Her dolu satır bir görev. Boşluklar kırpılır, harf farkı gözetmeden tekrarlar atılır, en fazla 50. Testte de kullanılır. */
export function dumpLines(text: string) {
  const seen = new Set<string>();
  const titles: string[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const title = raw.trim().slice(0, 200);
    if (!title) continue;
    const key = title.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    titles.push(title);
  }
  return { titles: titles.slice(0, dumpLimit), skipped, over: Math.max(0, titles.length - dumpLimit) };
}

/** Kafamı boşalt satırları tek atomik istekte kök görevlere çevirir. Kayıp yanıtta yalnız aynı anahtar/gövde denenir. Sunucu onaylayana kadar metin kalır. */
export function BrainDump({ done }: { done?: () => void }) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const pending = useRef<{
    body: string;
    command: ReturnType<typeof session.api.mutation<"/api/tasks/batch", "post">>;
  } | null>(null);
  const preview = dumpLines(text);
  async function save() {
    if (busy || !preview.titles.length) return;
    setBusy(true);
    setFailure("");
    setMessage("");
    const body = JSON.stringify(preview.titles);
    if (pending.current?.body !== body)
      pending.current = {
        body,
        command: session.api.mutation("/api/tasks/batch", "post", { body: { titles: preview.titles } }),
      };
    try {
      const result = await pending.current.command.execute({ retryUnknownResult: true });
      pending.current = null;
      setText("");
      setMessage(`${result.items.length} görev eklendi.`);
      for (const resource of ["tasks", "task-tree", "task-children"])
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, resource).slice(0, 3) });
      done?.();
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.outcomeUnknown
          ? "Kaydedildi mi anlaşılamadı. Metnin duruyor; yeniden gönderirsen aynı istek gider ve görevler iki kez oluşmaz."
          : error instanceof ApiError && error.status === 400
            ? "Her satır 1–200 karakter olmalı ve en çok 50 satır gönderilebilir."
            : "Eklenemedi. Metnin duruyor; bağlantını kontrol edip yeniden dene.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="brain-dump"
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
      aria-busy={busy}
    >
      <label htmlFor={`${id}-text`}>Aklındakileri alt alta yaz</label>
      <textarea
        id={`${id}-text`}
        rows={8}
        value={text}
        readOnly={busy}
        aria-describedby={`${id}-preview`}
        onChange={event => {
          setText(event.target.value);
          setMessage("");
        }}
      />
      <p id={`${id}-preview`} className="muted" aria-live="polite">
        {preview.titles.length ? `${preview.titles.length} görev eklenecek` : "Her dolu satır bir görev olur."}
        {preview.skipped ? ` · ${preview.skipped} tekrar satırı atlandı` : ""}
        {preview.over ? ` · ilk ${dumpLimit} satır alınır` : ""}
      </p>
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button type="submit" className="primary" disabled={busy || !preview.titles.length}>
        {busy ? "Ekleniyor…" : "Görevleri ekle"}
      </button>
    </form>
  );
}

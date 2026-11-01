"use client";
import { useState } from "react";
import { useResources } from "../collections/queries";
export function NotePoolChoice({ id, select }: { id: string; select: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const q = useResources("pools", { offset, limit: 25, includeArchived: false });
  return (
    <div className="note-choice">
      {q.isError && (
        <p role="alert">
          Havuzlar okunamadı.
          <button type="button" onClick={() => void q.refetch()}>
            Havuzları yeniden oku
          </button>
        </p>
      )}
      <label>
        Görevin havuzu
        <select value={id} onChange={e => select(e.target.value)}>
          <option value="">Havuz seçmeden oluştur</option>
          {q.data?.items.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={!offset || q.isFetching}
          onClick={() => {
            setOffset(offset - 25);
            select("");
          }}
        >
          Önceki havuzlar
        </button>
        <button
          type="button"
          disabled={q.isFetching || offset + 25 >= Number(q.data?.total ?? 0) || offset >= 100000}
          onClick={() => {
            setOffset(offset + 25);
            select("");
          }}
        >
          Sonraki havuzlar
        </button>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";
import { pickerRows, useTaskPicker } from "../tasks/picker";
import { localToday } from "../preferences/model";
import { usePreferences } from "../preferences/queries";

/** Sınırlı sunucu sayfalarına kaydırarak ulaşılıyor. Arama veya sayfa düğmesi yok. */
export function TaskChoice({
  value,
  selected,
  choose,
}: {
  value: string;
  selected?: { id: string; title: string };
  choose: (id: string) => void;
}) {
  // Rutin oluşumu yalnız kendi gününde seçilir, bu yüzden bugünü gönderiyoruz.
  const preferences = usePreferences();
  const zone = preferences.data?.values.timeZoneId;
  const query = useTaskPicker(zone ? localToday(zone) : undefined, "", !!zone);
  const rows = [...pickerRows(query.data?.pages, "assigned"), ...pickerRows(query.data?.pages, "other")];
  const list = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, fetchNextPage, isError } = query;
  useEffect(() => {
    if (!hasNextPage || isFetching || isError || !end.current) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void fetchNextPage({ cancelRefetch: false });
      },
      { root: list.current },
    );
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isError, fetchNextPage]);
  return (
    <div>
      <div ref={list} className="focus-task-choices" role="group" aria-label="Görev seç">
        {selected && !rows.some(row => row.id === selected.id) && (
          <label>
            <input
              type="radio"
              name="focus-task"
              value={selected.id}
              checked={value === selected.id}
              onChange={() => choose(selected.id)}
            />
            <span>{selected.title}</span>
          </label>
        )}
        {rows.map(row => (
          <label key={row.id}>
            <input
              type="radio"
              name="focus-task"
              value={row.id}
              checked={value === row.id}
              onChange={() => choose(row.id)}
            />
            <span>
              {row.parentTitle && <small>{row.parentTitle} › </small>}
              {row.title}
            </span>
          </label>
        ))}
        {query.isPending && <p role="status">Görevler okunuyor…</p>}
        {query.isSuccess && rows.length === 0 && !selected && <p>Henüz seçilebilecek bir görev yok.</p>}
        {query.isFetchingNextPage && <p role="status">Diğer görevler okunuyor…</p>}
        <div ref={end} aria-hidden="true" />
      </div>
      {query.isError && (
        <p role="alert">
          Görevler okunamadı.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Yeniden dene
          </button>
        </p>
      )}
    </div>
  );
}

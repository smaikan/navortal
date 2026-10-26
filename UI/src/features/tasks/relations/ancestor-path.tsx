"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api/errors";
import type { Task } from "../model";
import { treeMessage } from "../tree/model";
import { visiblePath } from "./model";
import { useAncestors } from "./queries";

const separator = (
  <span aria-hidden="true" className="path-separator">
    ›
  </span>
);
/** Aynı adlı görevleri ayırmak için yol isteğe göre açılır. Uzun zincirin ortası kapanır. */
export function AncestorPath({ task, initiallyOpen = false }: { task: Task; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (!task.parentTaskId) return <p className="muted relation-path-root">Kök düzeyindeki görev; üst görevi yok.</p>;
  return (
    <details className="relation-path" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Üst görev yolu</summary>
      {open && <AncestorContent task={task} />}
    </details>
  );
}
/** Kapatınca okuyucu bırakılır, paylaşılmayan devam isteği iptal sinyalini kullanır. */
function AncestorContent({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const path = useAncestors(task, true);
  const revealed = useRef<HTMLLIElement>(null);
  const moved = useRef(false);
  useLayoutEffect(() => {
    if (expanded && !moved.current) {
      moved.current = true;
      revealed.current?.focus();
    }
  }, [expanded]);
  const ancestors = path.data?.pages.flatMap(page => page.items).reverse();
  // Çizimle tıklama arasında canlı yenileme başlayabilir, fetchNextPage onunla sonuçlanabilir.
  // İptal etmek yerine bitmesini bekleyip kullanıcının istediği sonraki sayfayı yine okuyoruz.
  async function more() {
    const loaded = path.data?.pages.length ?? 0;
    const result = await path.fetchNextPage({ cancelRefetch: false });
    if (!result.isError && result.hasNextPage && (result.data?.pages.length ?? 0) <= loaded)
      await path.fetchNextPage({ cancelRefetch: false });
  }
  const staleCursor = path.error instanceof ApiError && path.error.code === "ancestor_cursor_stale";
  const parts = ancestors ? visiblePath(ancestors, expanded) : null;
  return (
    <>
      {path.isError && (
        <div role="alert">
          <p>
            {treeMessage(path.error)}
            {ancestors?.length ? " Okunan üst görevler korunuyor." : ""}
          </p>
          <button
            type="button"
            disabled={path.isFetching}
            onClick={() => {
              if (path.isFetchNextPageError && !staleCursor) void more();
              else void path.refetch();
            }}
          >
            Üst görev yolunu yeniden yükle
          </button>
        </div>
      )}
      {!path.data && !path.isError && <p role="status">Üst görev yolu okunuyor…</p>}
      {parts && ancestors && (
        <ol
          className="ancestor-path"
          aria-label={`Üst görev yolu, ${ancestors.length} düzey${path.hasNextPage ? " yüklendi" : ""}`}
        >
          {parts.head.map((item, index) => (
            <li
              key={item.id}
              ref={expanded && index === 1 ? revealed : undefined}
              tabIndex={expanded && index === 1 ? -1 : undefined}
            >
              {index > 0 && separator}
              {item.title}
            </li>
          ))}
          {parts.hidden > 0 && (
            <li>
              {separator}
              <button type="button" onClick={() => setExpanded(true)}>
                {parts.hidden} ara üst görevi göster
              </button>
            </li>
          )}
          {parts.tail.map(item => (
            <li key={item.id}>
              {separator}
              {item.title}
            </li>
          ))}
        </ol>
      )}
      {path.hasNextPage && (
        <>
          <p className="muted form-hint">Yolun yakın bölümü yüklendi. Daha üst görevler henüz okunmadı.</p>
          <button type="button" disabled={path.isFetching} onClick={() => void more()}>
            {path.isFetchingNextPage ? "Üst görevler okunuyor…" : "Daha üst görevleri yükle"}
          </button>
        </>
      )}
    </>
  );
}

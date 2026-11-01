"use client";
import { Fragment, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import type { MenuItem } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { CategoryDot } from "./attach";
import { NoteCard } from "./note-card";
import { noteFailure, type Category, type CategoryList, type Note, type ViewMode } from "./model";
import { useNoteFeed, type FeedScope } from "./queries";

export type NoteOpen = (note: Note, trigger: HTMLElement, editing?: boolean) => void;

/** Her sunucu not listesi kendi sayfasını, yükleme/boş/hata durumunu ve devam düğmesini tutuyor. Göreve bağlı liste görev sıralı geliyor, aynı görevin ardışık notları ortak başlıkta. */
export function NoteSection({
  heading,
  category,
  scope,
  mode,
  zone,
  categories,
  menu,
  open,
  groupByTask = false,
  hideWhenEmpty = false,
  empty,
}: {
  heading: string;
  category?: Category | null;
  scope: FeedScope;
  mode: ViewMode;
  zone: string;
  categories: CategoryList | undefined;
  menu: (note: Note) => MenuItem[];
  open: NoteOpen;
  groupByTask?: boolean;
  hideWhenEmpty?: boolean;
  empty: React.ReactNode;
}) {
  const feed = useNoteFeed(scope);
  const openTask = useTaskPanel();
  const client = useQueryClient();
  const { state } = useSession();
  const items = feed.data?.pages.flatMap(page => page.items) ?? [];
  // Başka yerde açılan kategori henüz listede yoksa kategorileri yeniden okuyoruz;
  // notu yanlışlıkla Kategorisiz diye göstermiyoruz.
  const unknown = !!categories && items.some(n => n.categoryId && !categories.items.some(c => c.id === n.categoryId));
  useEffect(() => {
    if (unknown)
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "note-categories").slice(0, 3) });
  }, [unknown, client, state.user]);
  const total = Number(feed.data?.pages.at(-1)?.total ?? 0);
  // Bu kapsamda kullanıcının istediği sayfalar. Devam yüklenirken canlı yenileme gelirse
  // o sayfa iptal olabilir; listeyi sessizce kısaltmak yerine tekrar istiyoruz.
  const scopeKey = JSON.stringify(scope);
  const [wanted, setWanted] = useState({ scopeKey, pages: 1 });
  const want = wanted.scopeKey === scopeKey ? wanted.pages : 1;
  const loaded = feed.data?.pages.length ?? 0;
  useEffect(() => {
    if (feed.data && !feed.isFetching && !feed.isFetchNextPageError && feed.hasNextPage && loaded < want)
      void feed.fetchNextPage();
  }, [feed, loaded, want]);
  if (hideWhenEmpty && feed.data && !items.length) return null;
  const card = (note: Note) => (
    <li key={note.id}>
      <NoteCard
        note={note}
        category={categories?.items.find(c => c.id === note.categoryId) ?? null}
        zone={zone}
        compact={mode === "List"}
        showTask={!groupByTask}
        menu={menu(note)}
        onOpen={open}
      />
    </li>
  );
  const groups: { taskId: string; title: string; notes: Note[] }[] = [];
  if (groupByTask)
    for (const note of items) {
      const last = groups.at(-1);
      if (last && last.taskId === note.taskId) last.notes.push(note);
      else groups.push({ taskId: note.taskId!, title: note.taskTitle ?? "Bağlı görev", notes: [note] });
    }
  return (
    <section className="notes-section" aria-label={heading}>
      <h2 className="notes-section-head">
        {category !== undefined && <CategoryDot category={category} />}
        <span>{heading}</span>
        {feed.data && total > 0 && <span className="notes-count">· {total}</span>}
      </h2>
      {feed.isPending && (
        <p role="status" className="r2-hint">
          Notlar okunuyor…
        </p>
      )}
      {feed.isError && (
        <div role="alert" className="form-error">
          <p>{noteFailure(feed.error)}</p>
          <button type="button" onClick={() => void feed.refetch()}>
            Notları yeniden oku
          </button>
        </div>
      )}
      {feed.data && !items.length && <div className="notes-empty">{empty}</div>}
      {groupByTask ? (
        groups.map(group => (
          <Fragment key={`${group.taskId}-${group.notes[0].id}`}>
            <h3 className="notes-task-head">
              <button type="button" className="note-task-link" onClick={e => openTask(group.taskId, e.currentTarget)}>
                {group.title}
              </button>
            </h3>
            <ul className={`notes-grid ${mode === "List" ? "list" : "cards"}`}>{group.notes.map(card)}</ul>
          </Fragment>
        ))
      ) : items.length > 0 ? (
        <ul className={`notes-grid ${mode === "List" ? "list" : "cards"}`}>{items.map(card)}</ul>
      ) : null}
      {feed.hasNextPage && (
        <button
          type="button"
          className="r2-quiet-link notes-more"
          disabled={feed.isFetchingNextPage}
          onClick={() => {
            setWanted({ scopeKey, pages: loaded + 1 });
            void feed.fetchNextPage();
          }}
        >
          {feed.isFetchingNextPage ? "Okunuyor…" : `Daha fazla göster (${items.length} / ${total})`}
        </button>
      )}
    </section>
  );
}

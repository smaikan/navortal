"use client";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, Link2, List, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, type MenuItem } from "../../components/ui/menu";
import { useToast } from "../../components/ui/toast";
import { useTaskPanel } from "../../components/layout/task-panel";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useDisplayPreferences } from "../workspace/queries";
import { isOffline, offlineWrite } from "../tasks/model";
import { CategoryDot } from "./attach";
import { NoteComposer } from "./composer";
import { useNoteRemoval } from "./actions";
import { NoteSection, type NoteOpen } from "./section";
import {
  activeCategories,
  noteFailure,
  readCategory,
  readSystemViews,
  type Category,
  type CategoryList,
  type Note,
  type ViewMode,
} from "./model";
import { useNoteCategories, useNotesCache } from "./queries";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";
const Detail = lazy(() => import("./detail").then(m => ({ default: m.NoteDetail })));
const Convert = lazy(() => import("./dialog").then(m => ({ default: m.ConvertDialog })));
const Categories = lazy(() => import("./categories-panel").then(m => ({ default: m.CategoriesPanel })));

type View = { kind: "all" } | { kind: "tasks" } | { kind: "category"; category: Category };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function viewOf(param: string | null, list: CategoryList | undefined): View {
  if (param === "tasks") return { kind: "tasks" };
  const category = param && uuid.test(param) ? list?.items.find(c => c.id === param) : undefined;
  return category ? { kind: "category", category } : { kind: "all" };
}

const phoneQuery = "(max-width: 640px)";
function watchPhone(change: () => void) {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const isPhone = () => window.matchMedia(phoneQuery).matches;

/** Kullanıcının renkli kategorileri, görev notları ve üstte sakin uyarıları olan not kütüphanesi. */
export function NotesPage() {
  const prefs = useDisplayPreferences();
  const categories = useNoteCategories();
  const zone = prefs.data?.values.timeZoneId;
  return (
    <main className="workspace-main notes-page" id="main" tabIndex={-1}>
      {zone && categories.data ? (
        <Library zone={zone} list={categories.data} />
      ) : (
        <>
          <header className="page-header">
            <h1 tabIndex={-1}>Notlar</h1>
          </header>
          {prefs.isError || categories.isError ? (
            <div role="alert" className="form-error">
              <p>{prefs.isError ? "Tercihler okunamadı." : noteFailure(categories.error)}</p>
              <button type="button" onClick={() => void (prefs.isError ? prefs.refetch() : categories.refetch())}>
                Yeniden dene
              </button>
            </div>
          ) : (
            <ListSkeleton label="Notlar hazırlanıyor…" rows={3} />
          )}
        </>
      )}
    </main>
  );
}

function Library({ zone, list }: { zone: string; list: CategoryList }) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const { session, state } = useSession();
  const client = useQueryClient();
  const cache = useNotesCache(true);
  const toast = useToast();
  const openTask = useTaskPanel();
  const remove = useNoteRemoval();
  const view = viewOf(params.get("view"), list);
  const query = params.get("q") ?? "";
  const [search, setSearch] = useState(query),
    [adding, setAdding] = useState(false),
    [detail, setDetail] = useState<{ note: Note; trigger: HTMLElement; editing: boolean } | null>(null),
    [convert, setConvert] = useState<{ note: Note; trigger: HTMLElement } | null>(null),
    [manage, setManage] = useState<HTMLElement | null>(null),
    [status, setStatus] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const active = activeCategories(list);
  const href = (next: string | null, q = query) => {
    const p = new URLSearchParams();
    if (next) p.set("view", next);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  useEffect(() => {
    if (search.trim() === query) return;
    // Görünümü süre dolunca okuyoruz. Yazarken seçilen yeni görünümü eski değerle ezmeyelim.
    const timer = setTimeout(
      () =>
        router.replace(href(new URLSearchParams(window.location.search).get("view"), search.trim()), { scroll: false }),
      300,
    );
    return () => clearTimeout(timer);
    // href yalnız URL hazırlıyor. Her çizimde yeniden başlatmak bekleme süresini sıfırlardı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, query]);
  const mode: ViewMode =
    view.kind === "all" ? list.allViewMode : view.kind === "tasks" ? list.taskViewMode : view.category.viewMode;
  async function setMode(next: ViewMode) {
    if (next === mode) return;
    if (isOffline()) return toast({ text: offlineWrite, tone: "error" });
    try {
      if (view.kind === "category") {
        const c = view.category;
        const saved = readCategory(
          await session.api
            .mutation("/api/note-categories/{id}", "put", {
              path: { id: c.id },
              body: {
                version: c.version,
                name: c.name,
                color: c.color,
                showInBar: c.showInBar,
                pinInAll: c.pinInAll,
                viewMode: next,
              },
            })
            .execute(),
        );
        client.setQueryData<CategoryList>(queryKeys.resource(state.user!.id, "note-categories"), old =>
          old ? { ...old, items: old.items.map(x => (x.id === saved.id ? saved : x)) } : old,
        );
      } else {
        const views = readSystemViews(
          await session.api
            .mutation("/api/notes/view-modes", "put", {
              body: {
                allViewMode: view.kind === "all" ? next : list.allViewMode,
                taskViewMode: view.kind === "tasks" ? next : list.taskViewMode,
              },
            })
            .execute(),
        );
        client.setQueryData<CategoryList>(queryKeys.resource(state.user!.id, "note-categories"), old =>
          old ? { ...old, ...views } : old,
        );
      }
      cache.changed();
    } catch (error) {
      cache.invalidate();
      toast({ text: noteFailure(error), tone: "error" });
    }
  }
  const open: NoteOpen = (note, trigger, editing = false) => setDetail({ note, trigger, editing });
  const menu = (note: Note): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Düzenle", onSelect: t => open(note, t, true) }];
    if (note.taskId) items.push({ label: "İlgili görevi aç", onSelect: t => openTask(note.taskId!, t) });
    // Yalnız kısa notlar göreve dönüştürülür; ayrıntılı notlarda seçenek yok. Önceden dönüştürülmüşse görev bağlantısı kalır.
    if (note.convertedTaskId)
      items.push({ label: "Dönüştürülen görevi aç", onSelect: t => openTask(note.convertedTaskId!, t) });
    else if (note.display === "Short")
      items.push({ label: "Göreve dönüştür", onSelect: t => setConvert({ note, trigger: t }) });
    items.push({ label: "Sil", danger: true, separator: true, onSelect: () => void remove(note) });
    return items;
  };
  const bar = active.filter(c => c.showInBar || (view.kind === "category" && view.category.id === c.id));
  const others = active.filter(c => !bar.includes(c));
  const pinned = active.filter(c => c.pinInAll);
  // Telefonda kart ve liste aynı görünüyor; kayıtlı seçim masaüstü için korunur.
  const phone = useSyncExternalStore(watchPhone, isPhone, () => false);
  const common = { mode: phone ? ("List" as const) : mode, zone, categories: list, menu, open };
  const addFirst = (
    <>
      <p>{query ? `“${query}” için not bulunamadı.` : "Henüz not yok."}</p>
      {!query && (
        <button type="button" className="r2-soft" onClick={() => setAdding(true)}>
          İlk notunu ekle
        </button>
      )}
    </>
  );
  return (
    <>
      <header className="page-header notes-header">
        <h1 tabIndex={-1}>Notlar</h1>
        <label className="notes-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Notlarda ara</span>
          <input
            type="search"
            placeholder="Notlarda ara"
            maxLength={200}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <button
          ref={addButton}
          type="button"
          className="primary head-action"
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" size={16} />
          Not ekle
        </button>
      </header>
      <p role="status" className="sr-only">
        {status}
      </p>
      {adding && (
        <NoteComposer
          zone={zone}
          categories={active}
          initialCategoryId={view.kind === "category" && !view.category.removedAt ? view.category.id : null}
          onManageCategories={t => setManage(t)}
          onDone={() => {
            setAdding(false);
            setStatus("Not kaydedildi.");
            addButton.current?.focus();
          }}
          onCancel={() => {
            setAdding(false);
            addButton.current?.focus();
          }}
        />
      )}
      <div className="notes-toolbar">
        <nav aria-label="Not görünümü" className="notes-views">
          <Link
            href={href(null)}
            prefetch={false}
            scroll={false}
            aria-current={view.kind === "all" ? "page" : undefined}
          >
            Tümü
          </Link>
          <Link
            href={href("tasks")}
            prefetch={false}
            scroll={false}
            aria-current={view.kind === "tasks" ? "page" : undefined}
          >
            <Link2 aria-hidden="true" size={13} />
            Görev notları
          </Link>
          {bar.map(c => (
            <Link
              key={c.id}
              href={href(c.id)}
              prefetch={false}
              scroll={false}
              aria-current={view.kind === "category" && view.category.id === c.id ? "page" : undefined}
            >
              <CategoryDot category={c} />
              {c.name}
            </Link>
          ))}
          {others.length > 0 && (
            <Menu
              label={`Diğer kategoriler (${others.length})`}
              className="notes-other"
              items={others.map(c => ({
                label: c.name,
                content: (
                  <>
                    <CategoryDot category={c} />
                    {c.name}
                  </>
                ),
                onSelect: () => router.push(href(c.id), { scroll: false }),
              }))}
            >
              <span>Diğer ({others.length})</span>
              <ChevronDown aria-hidden="true" size={14} />
            </Menu>
          )}
        </nav>
        <button type="button" className="r2-quiet notes-manage" onClick={e => setManage(e.currentTarget)}>
          <SlidersHorizontal aria-hidden="true" size={15} />
          Kategoriler
        </button>
        <div role="group" aria-label="Görünüm" className="notes-mode">
          <button type="button" aria-pressed={mode === "Cards"} onClick={() => void setMode("Cards")}>
            <LayoutGrid aria-hidden="true" size={14} />
            Kartlar
          </button>
          <button type="button" aria-pressed={mode === "List"} onClick={() => void setMode("List")}>
            <List aria-hidden="true" size={14} />
            Liste
          </button>
        </div>
      </div>
      {view.kind === "all" && (
        <>
          {pinned.map(c => (
            <NoteSection
              key={c.id}
              heading={c.name}
              category={c}
              scope={{ categoryId: c.id, search: query || undefined }}
              hideWhenEmpty
              empty={null}
              {...common}
            />
          ))}
          <NoteSection
            heading="Tüm notlar"
            scope={{ excludePinned: pinned.length > 0, search: query || undefined }}
            empty={pinned.length && !query ? <p>Başka not yok.</p> : addFirst}
            {...common}
          />
        </>
      )}
      {view.kind === "tasks" && (
        <NoteSection
          heading="Görev notları"
          scope={{ taskLinked: true, search: query || undefined }}
          groupByTask
          empty={
            <p>
              {query
                ? `“${query}” için görev notu bulunamadı.`
                : "Göreve bağlı not yok. Görev panelindeki Notlar bölümünden ekleyebilirsin."}
            </p>
          }
          {...common}
        />
      )}
      {view.kind === "category" && (
        <NoteSection
          heading={view.category.removedAt ? `${view.category.name} (kaldırıldı)` : view.category.name}
          category={view.category}
          scope={{ categoryId: view.category.id, search: query || undefined }}
          empty={
            <>
              <p>{query ? `“${query}” için bu kategoride not bulunamadı.` : "Bu kategoride henüz not yok."}</p>
              {!query && !view.category.removedAt && (
                <button type="button" className="r2-soft" onClick={() => setAdding(true)}>
                  Bu kategoriye not ekle
                </button>
              )}
            </>
          }
          {...common}
        />
      )}
      {detail && (
        <Suspense fallback={<p role="status">Not açılıyor…</p>}>
          <Detail
            key={detail.note.id}
            note={detail.note}
            categories={list}
            zone={zone}
            trigger={detail.trigger}
            editing={detail.editing}
            onManageCategories={t => setManage(t)}
            close={() => setDetail(null)}
          />
        </Suspense>
      )}
      {convert && (
        <Suspense fallback={<p role="status">Dönüştürme açılıyor…</p>}>
          <Convert note={convert.note} trigger={convert.trigger} close={() => setConvert(null)} />
        </Suspense>
      )}
      {manage && (
        <Suspense fallback={<p role="status">Kategoriler açılıyor…</p>}>
          <Categories list={list} trigger={manage} close={() => setManage(null)} />
        </Suspense>
      )}
    </>
  );
}

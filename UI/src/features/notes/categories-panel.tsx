"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Archive, GripVertical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { Menu } from "../../components/ui/menu";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite } from "../tasks/model";
import { CategoryDot } from "./attach";
import {
  activeCategories,
  categoryNameLimit,
  colors,
  noteFailure,
  readCategory,
  type Category,
  type CategoryColor,
  type CategoryList,
} from "./model";
import { useNoteCategories, useNotesCache } from "./queries";

type Change = Partial<Pick<Category, "name" | "color" | "showInBar" | "pinInAll">>;

/** Kategori ekleme, ad, renk, sıra ve sabitleme burada. Kaldırılan kategori gizlenir, not bağı kalır ve geri getirilebilir. Görev notları sabit sistem görünümü. */
export function CategoriesPanel({
  list: initial,
  trigger,
  close,
}: {
  list: CategoryList;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const cache = useNotesCache();
  const query = useNoteCategories();
  const list = query.data ?? initial;
  const active = activeCategories(list);
  const removed = list.items.filter(c => c.removedAt);
  const [busy, setBusy] = useState<string | null>(null),
    [failure, setFailure] = useState(""),
    [name, setName] = useState(""),
    [color, setColor] = useState<CategoryColor>("Blue"),
    [dragged, setDragged] = useState<string | null>(null),
    [undo, setUndo] = useState<Category | null>(null);
  // Genel bildirim modalın arkasında kalıyor. Geri al bu panelin içinde aynı 8 saniye duruyor.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo]);
  const nameField = useRef<HTMLInputElement>(null);
  const key = queryKeys.resource(state.user!.id, "note-categories");
  const store = (saved: Category) =>
    client.setQueryData<CategoryList>(key, old =>
      old
        ? {
            ...old,
            items: old.items.some(x => x.id === saved.id)
              ? old.items.map(x => (x.id === saved.id ? saved : x))
              : [...old.items, saved],
          }
        : old,
    );
  async function run(id: string, write: () => Promise<Category>, after?: (saved: Category) => void) {
    if (busy) return;
    if (isOffline()) return setFailure(offlineWrite);
    setBusy(id);
    setFailure("");
    try {
      const saved = readCategory(await write());
      store(saved);
      cache.changed();
      after?.(saved);
    } catch (error) {
      setFailure(noteFailure(error));
      cache.invalidate();
    } finally {
      setBusy(null);
    }
  }
  const change = (c: Category, patch: Change) =>
    run(c.id, () =>
      session.api
        .mutation("/api/note-categories/{id}", "put", {
          path: { id: c.id },
          body: {
            version: c.version,
            name: c.name,
            color: c.color,
            showInBar: c.showInBar,
            pinInAll: c.pinInAll,
            viewMode: c.viewMode,
            ...patch,
          },
        })
        .execute(),
    );
  const move = (c: Category, beforeId: string | null) =>
    run(c.id, () =>
      session.api
        .mutation("/api/note-categories/{id}/move", "post", {
          path: { id: c.id },
          body: { version: c.version, beforeCategoryId: beforeId },
        })
        .execute(),
    ).then(() => void query.refetch());
  const restore = (c: Category) =>
    run(c.id, () =>
      session.api
        .mutation("/api/note-categories/{id}/restore", "post", { path: { id: c.id }, body: { version: c.version } })
        .execute(),
    );
  const remove = (c: Category) =>
    run(
      c.id,
      () =>
        session.api
          .mutation("/api/note-categories/{id}/remove", "post", { path: { id: c.id }, body: { version: c.version } })
          .execute(),
      saved => setUndo(saved),
    );
  const place = (c: Category, index: number) => {
    const others = active.filter(x => x.id !== c.id);
    void move(c, index >= others.length ? null : others[index].id);
  };
  function drop(event: DragEvent, target: Category) {
    event.preventDefault();
    const source = active.find(c => c.id === dragged);
    setDragged(null);
    if (!source || source.id === target.id) return;
    const others = active.filter(x => x.id !== source.id);
    const at = others.findIndex(x => x.id === target.id);
    const from = active.findIndex(x => x.id === source.id),
      to = active.findIndex(x => x.id === target.id);
    void move(source, to > from ? (others[at + 1]?.id ?? null) : target.id);
  }
  return (
    <Surface title="Kategoriler" modal placement="center" returnTo={trigger} onClose={() => (busy ? false : close())}>
      <div className="note-categories" aria-busy={!!busy || undefined}>
        <p id="note-order-help" className="sr-only">
          Sürükleyerek ya da tutamaçta Yukarı/Aşağı ok tuşlarıyla sırala.
        </p>
        <ul aria-label="Kategori listesi" className="note-category-list">
          {active.map((c, index) => (
            <li
              key={c.id}
              className={`note-category-row${dragged === c.id ? " dragging" : ""}`}
              draggable={!busy}
              onDragStart={() => setDragged(c.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => drop(e, c)}
            >
              <span className="note-category-order">
                {/* Satır fareyle sürükleniyor. Klavyede aynı tutamaç oklarla taşıyor. */}
                <button
                  type="button"
                  className="note-grip"
                  aria-label={`${c.name} sırasını değiştir`}
                  aria-describedby="note-order-help"
                  disabled={!!busy}
                  onKeyDown={e => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    const next = index + (e.key === "ArrowUp" ? -1 : 1);
                    if (next >= 0 && next < active.length) place(c, next);
                  }}
                >
                  <GripVertical aria-hidden="true" size={16} />
                </button>
              </span>
              <span className="note-category-name">
                <Menu
                  label={`${c.name} rengini değiştir (${colors[c.color]})`}
                  className="note-color-menu"
                  floating
                  items={(Object.keys(colors) as CategoryColor[]).map(k => ({
                    label: colors[k],
                    content: (
                      <>
                        <CategoryDot category={{ color: k }} />
                        {colors[k]}
                      </>
                    ),
                    disabled: k === c.color || !!busy,
                    onSelect: () => void change(c, { color: k }),
                  }))}
                >
                  <CategoryDot category={c} />
                </Menu>
                <RenameField category={c} disabled={!!busy} save={value => void change(c, { name: value })} />
              </span>
              <span className="note-category-switches">
                <Switch
                  text="Çubukta göster"
                  label={`${c.name}: çubukta göster`}
                  checked={c.showInBar}
                  disabled={!!busy}
                  onChange={() => void change(c, { showInBar: !c.showInBar })}
                />
                <Switch
                  text="Tümü'nde üstte sabitle"
                  label={`${c.name}: Tümü'nde üstte sabitle`}
                  checked={c.pinInAll}
                  disabled={!!busy}
                  onChange={() => void change(c, { pinInAll: !c.pinInAll })}
                />
              </span>
              <button
                type="button"
                className="r2-quiet"
                aria-label={`${c.name} kategorisini kaldır`}
                title="Kategoriyi kaldır"
                disabled={!!busy}
                onClick={() => void remove(c)}
              >
                <Archive aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
        {!active.length && <p className="r2-hint">Etkin kategori yok. Aşağıdan ilk kategorini ekle.</p>}
        {removed.length > 0 && (
          <details className="note-removed">
            <summary>Kaldırılan kategoriler ({removed.length})</summary>
            <ul>
              {removed.map(c => (
                <li key={c.id}>
                  <CategoryDot category={c} />
                  <span className="note-category-name">
                    <strong>{c.name}</strong>
                    <span className="r2-hint">Notları bu kategoride duruyor · çubukta ve seçicide görünmez</span>
                  </span>
                  <button type="button" disabled={!!busy} onClick={() => void restore(c)}>
                    Geri getir
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <form
          className="note-category-new"
          aria-label="Yeni kategori"
          onSubmit={e => {
            e.preventDefault();
            const value = name.trim();
            if (!value) {
              setFailure("Kategori adı yaz.");
              nameField.current?.focus();
              return;
            }
            void run("new", () =>
              session.api
                .mutation("/api/note-categories", "post", {
                  body: { name: value, color, showInBar: true, pinInAll: false },
                })
                .execute(),
            ).then(() => {
              setName("");
              nameField.current?.focus();
            });
          }}
        >
          <label>
            Yeni kategori
            <span className="note-category-new-row">
              <input
                ref={nameField}
                maxLength={categoryNameLimit}
                placeholder="Örneğin: Okul, Ev, Fikirler"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <button type="submit" className="primary" disabled={!!busy}>
                Ekle
              </button>
            </span>
          </label>
          <fieldset className="note-palette">
            <legend>Renk</legend>
            {(Object.keys(colors) as CategoryColor[]).map(k => (
              <label key={k} className="note-swatch" data-note-color={k}>
                <input
                  type="radio"
                  name="note-category-color"
                  value={k}
                  checked={color === k}
                  onChange={() => setColor(k)}
                />
                <span className="note-swatch-dot" aria-hidden="true" />
                <span className="sr-only">{colors[k]}</span>
              </label>
            ))}
          </fieldset>
        </form>
        {failure && (
          <p role="alert" className="form-error">
            {failure}
          </p>
        )}
        <div role="status" className="note-undo">
          {undo && (
            <>
              <span>“{undo.name}” kaldırıldı. Notları bu kategoride kalır.</span>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const target = undo;
                  setUndo(null);
                  void restore(target);
                }}
              >
                Geri al
              </button>
            </>
          )}
        </div>
        <div className="actions">
          <button type="button" disabled={!!busy} onClick={close}>
            Bitti
          </button>
        </div>
      </div>
    </Surface>
  );
}

function Switch({
  text,
  label,
  checked,
  disabled,
  onChange,
}: {
  /** Görünen yazı bu. Erişilebilir ad kategori adını da ekliyor ve bu yazıyı içeriyor. */
  text: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <span className="note-category-switch">
      <button
        type="button"
        role="switch"
        className="note-switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
      >
        <span className="note-switch-text">{text}</span>
        <span className="note-switch-track" aria-hidden="true" />
      </button>
    </span>
  );
}

/** Ad Enter veya alandan çıkışta kaydoluyor. Escape kayıtlı adı geri getiriyor. */
function RenameField({
  category,
  disabled,
  save,
}: {
  category: Category;
  disabled: boolean;
  save: (name: string) => void;
}) {
  const [value, setValue] = useState(category.name),
    [seen, setSeen] = useState(category.name);
  if (seen !== category.name) {
    setSeen(category.name);
    setValue(category.name);
  }
  const commit = () => {
    const next = value.trim();
    if (!next) setValue(category.name);
    else if (next !== category.name) save(next);
  };
  return (
    <input
      className="note-category-input"
      aria-label={`${category.name} kategorisinin adı`}
      maxLength={categoryNameLimit}
      value={value}
      disabled={disabled}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape" && value !== category.name) {
          e.preventDefault();
          e.stopPropagation();
          setValue(category.name);
        }
      }}
    />
  );
}

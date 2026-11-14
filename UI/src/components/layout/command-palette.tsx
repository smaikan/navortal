"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Surface } from "../ui/surface";
import { useSession } from "../../features/auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useTaskPanel } from "./task-panel";

type Command = {
  id: string;
  group: "Görevler" | "Eylemler" | "Git";
  label: string;
  context?: string;
  hint?: string;
  run: (trigger: HTMLElement) => void;
};
const pages: [string, string][] = [
  ["Gün Planlama", "/planning"],
  ["Görevler", "/tasks"],
  ["Eisenhower Matrisi", "/matrix"],
  ["Biten görevler", "/tasks/completed"],
  ["Takvim", "/calendar"],
  ["Özel günler", "/reminders/special-days"],
  ["Pomodoro", "/focus"],
  ["Havuz", "/pool"],
  ["Projeler", "/projects"],
  ["Notlar", "/notes"],
  ["Rutin", "/recurrences"],
  ["Hatırlatmalar", "/reminders"],
  ["Ayarlar", "/settings"],
];
const fold = (v: string) =>
  v
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
/** Her kelimeyi arayan filtre, büyük harf ve aksan farkını önemsemiyor. Testte de kullanılıyor. */
export function matches(query: string, text: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const target = fold(text);
  return words.every(word => target.includes(word));
}

/** Ctrl/⌘+K paletinde sayfalar, birkaç işlem ve görev araması var. Oklarla geziliyor, Enter çalıştırıyor, Escape kapatıp odağı geri veriyor. Mevcut uçtan en fazla 8 görev okunuyor. */
export function CommandPalette({
  trigger,
  close,
  quickAdd,
  brainDump,
}: {
  trigger: HTMLElement;
  close: () => void;
  quickAdd: (trigger: HTMLElement) => void;
  brainDump: (trigger: HTMLElement) => void;
}) {
  const router = useRouter();
  const { session, state } = useSession();
  const openTask = useTaskPanel();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const tasks = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "palette-tasks", { term }),
    networkMode: "always",
    enabled: term.length >= 2,
    queryFn: async ({ signal }) =>
      (
        await session.api.read("/api/tasks", {
          query: { search: term, limit: 8, includeArchived: false, includeCompleted: false, orderBy: "Title" },
          signal,
        })
      ).items,
  });
  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      close();
      router.push(path);
    };
    const actions: Command[] = [
      { id: "new", group: "Eylemler", label: "Yeni görev", hint: "N", run: t => (close(), quickAdd(t)) },
      { id: "dump", group: "Eylemler", label: "Çoklu görev", run: t => (close(), brainDump(t)) },
      { id: "add-today", group: "Eylemler", label: "Bugüne görev ekle", run: go("/planning#plana-ekle") },
      { id: "focus", group: "Eylemler", label: "Pomodoro başlat", run: go("/focus") },
    ];
    const found: Command[] = (tasks.data ?? []).map(task => ({
      id: `task:${task.id}`,
      group: "Görevler",
      label: task.title,
      hint: "Görevi aç",
      run: t => {
        close();
        openTask(task.id, t);
      },
    }));
    const nav: Command[] = pages.map(([label, path]) => ({ id: `go:${path}`, group: "Git", label, run: go(path) }));
    return [
      ...found,
      ...actions.filter(c => !term || matches(term, c.label)),
      ...nav.filter(c => !term || matches(term, c.label)),
    ];
  }, [tasks.data, term, close, router, quickAdd, brainDump, openTask]);
  const groups = (["Görevler", "Eylemler", "Git"] as const).map(group => ({
    group,
    items: commands.filter(c => c.group === group),
  }));
  // Arama bitince sonuç sayısı azalabilir. Seçili satırı listenin içinde tutuyoruz.
  const selected = Math.min(active, Math.max(commands.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;
  function key(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!commands.length) return;
      setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commands[selected]?.run(trigger);
    }
  }
  let index = -1;
  return (
    <Surface title="Komut paleti" modal placement="center" initialFocus="field" onClose={close} returnTo={trigger}>
      <div className="palette">
        <div className="palette-field">
          <Search aria-hidden="true" size={16} />
          <label htmlFor={`${listId}-input`} className="sr-only">
            Komut veya görev ara
          </label>
          <input
            ref={input}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={commands.length ? optionId(selected) : undefined}
            placeholder="Komut veya görev ara…"
            autoComplete="off"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={key}
          />
        </div>
        <div id={listId} role="listbox" aria-label="Sonuçlar" className="palette-list">
          {groups.map(({ group, items }) =>
            items.length ? (
              <div role="group" aria-label={group} key={group}>
                <div className="palette-group" aria-hidden="true">
                  {group}
                </div>
                {items.map(command => {
                  index += 1;
                  const at = index;
                  return (
                    <div
                      key={command.id}
                      id={optionId(at)}
                      role="option"
                      aria-selected={at === selected}
                      className={`palette-option${at === selected ? " active" : ""}`}
                      onPointerMove={() => setActive(at)}
                      onClick={() => command.run(trigger)}
                    >
                      <span>{command.label}</span>
                      {command.hint && <span className="muted">{command.hint}</span>}
                    </div>
                  );
                })}
              </div>
            ) : null,
          )}
          {!commands.length && <p className="muted palette-empty">Eşleşen bir şey yok.</p>}
          {term.length >= 2 && tasks.isFetching && (
            <p role="status" className="muted palette-empty">
              Görevler aranıyor…
            </p>
          )}
        </div>
        <p className="palette-keys muted" aria-hidden="true">
          ↑ ↓ seç · Enter aç · Esc kapat
        </p>
      </div>
    </Surface>
  );
}

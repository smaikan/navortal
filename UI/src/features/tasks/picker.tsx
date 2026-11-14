"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { components } from "../../lib/api/generated/schema";
import { queryKeys } from "../../lib/api/query-client";
import { readCoverage } from "../workspace/read-coverage";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { estimateText, priorities } from "./model";
import { energies } from "../support/model";
import "../planning/styles.css";

export type PickerRow = components["schemas"]["TaskPickerRow"];
export type NewTaskFields = { priority: PickerRow["priority"]; energyDemand: PickerRow["energyDemand"] };
type PickerView = components["schemas"]["TaskPickerView"];
const empty = new Set<string>();
function decode(value: PickerView) {
  readCoverage(value?.coverage);
  for (const page of [value?.assigned, value?.other]) {
    if (
      !page ||
      !Array.isArray(page.items) ||
      page.items.length > 25 ||
      Number(page.limit) !== 25 ||
      Number(page.total) < page.items.length
    )
      throw new ApiError("protocol", "Görev önerileri doğrulanamadı.");
    for (const row of page.items)
      if (
        !row ||
        typeof row.id !== "string" ||
        !row.title ||
        !Object.hasOwn(priorities, row.priority) ||
        (row.energyDemand != null && !Object.hasOwn(energies, row.energyDemand))
      )
        throw new ApiError("protocol", "Görev önerisi eksik.");
  }
  if (typeof value.hasExactMatch !== "boolean") throw new ApiError("protocol", "Görev eşleşmesi doğrulanamadı.");
  return value;
}
export function useTaskPicker(date: string | undefined, search: string, enabled = true, hierarchy = false) {
  const { session, state } = useSession();
  return useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-picker", { date, search, hierarchy }),
    enabled,
    networkMode: "always",
    staleTime: 30_000,
    initialPageParam: { offset: 0, assignedOffset: 0 },
    getNextPageParam: (last: PickerView) => {
      const moreA = Number(last.assigned.offset) + last.assigned.items.length < Number(last.assigned.total);
      const moreB = Number(last.other.offset) + last.other.items.length < Number(last.other.total);
      return moreA || moreB
        ? {
            offset: moreB ? Number(last.other.offset) + last.other.items.length : Number(last.other.offset),
            assignedOffset: moreA
              ? Number(last.assigned.offset) + last.assigned.items.length
              : Number(last.assigned.offset),
          }
        : undefined;
    },
    queryFn: async ({ signal, pageParam }) =>
      decode(
        await session.api.read("/api/tasks/picker", {
          query: { date, search: search || undefined, ...pageParam, limit: 25, hierarchy },
          signal,
        }),
      ),
  });
}
export function pickerRows(
  pages: PickerView[] | undefined,
  group: "assigned" | "other",
  excluded: ReadonlySet<string> = empty,
) {
  const seen = new Set(excluded);
  return (pages ?? [])
    .flatMap(p => p[group].items)
    .filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}
export function PickerLabel({ row }: { row: PickerRow }) {
  const estimate = estimateText(row.directEstimatedSeconds);
  return (
    <>
      <span className="r2-option-title">
        {row.parentTitle && <span className="r2-plan-parent">{row.parentTitle} › </span>}
        {row.title}
      </span>
      <span className="picker-facts">
        <span className="r2-chip">{priorities[row.priority]}</span>
        <span className="r2-chip">
          {row.energyDemand ? `Efor: ${energies[row.energyDemand]}` : "Efor belirtilmedi"}
        </span>
        {estimate && <span className="r2-option-meta">{estimate}</span>}
      </span>
    </>
  );
}
export function TaskPicker({
  date,
  choose,
  create,
  createLabel,
  excluded = empty,
  excludedTitles = empty,
  disabled = false,
  placeholder = "Görev ekle",
  leadingIcon,
  hierarchical = false,
}: {
  date?: string;
  choose: (row: PickerRow, scope?: "Single" | "Subtree") => Promise<boolean>;
  hierarchical?: boolean;
  create?: (title: string, fields: NewTaskFields) => Promise<boolean>;
  createLabel?: (title: string) => string;
  excluded?: ReadonlySet<string>;
  excludedTitles?: ReadonlySet<string>;
  disabled?: boolean;
  placeholder?: string;
  leadingIcon?: ReactNode;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState(false),
    [active, setActive] = useState(0),
    [navigated, setNavigated] = useState(false),
    [pending, setPending] = useState(false);
  const flight = useRef(false);
  const [priority, setPriority] = useState<NewTaskFields["priority"]>("Normal");
  const [energy, setEnergy] = useState<NewTaskFields["energyDemand"]>(null);
  const wanted = text.trim();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(wanted), 200);
    return () => clearTimeout(timer);
  }, [wanted]);
  const showing = expanded && !disabled;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const depthById = new Map<string, number>();
  const flatten = (roots: PickerRow[], depth = 0): PickerRow[] =>
    roots.flatMap(row => {
      depthById.set(row.id, depth);
      return [row, ...(collapsed.has(row.id) ? [] : flatten(row.children ?? [], depth + 1))];
    });
  const query = useTaskPicker(date, search, showing, hierarchical);
  const assignedRoots = pickerRows(query.data?.pages, "assigned", hierarchical ? empty : excluded),
    otherRoots = pickerRows(query.data?.pages, "other", hierarchical ? empty : excluded);
  const assigned = hierarchical ? flatten(assignedRoots) : assignedRoots,
    other = hierarchical ? flatten(otherRoots) : otherRoots;
  const matches = (row: PickerRow) =>
    hierarchical ||
    `${row.parentTitle ?? ""} ${row.title}`.toLocaleLowerCase("tr-TR").includes(wanted.toLocaleLowerCase("tr-TR"));
  const a = assigned.filter(matches),
    b = other.filter(matches),
    rows = [...a, ...b];
  const already = !!wanted && excludedTitles.has(wanted.toLocaleLowerCase("tr-TR"));
  const fresh = search === wanted && query.isSuccess;
  const canCreate = !!create && !!wanted && fresh && !query.data?.pages[0].hasExactMatch && !already;
  const count = rows.length + (canCreate ? 1 : 0),
    current = Math.min(active, Math.max(0, count - 1));
  // Liste açılırken hiçbir satır seçili görünmez; ok tuşuyla gezilince veya arama yazılınca ilk eşleşme vurgulanır.
  const lit = navigated || wanted !== "";
  async function select(index: number) {
    if (flight.current || disabled) return;
    const row = rows[index];
    if (!row && !(canCreate && index === rows.length)) return;
    if (
      row &&
      hierarchical &&
      excluded.has(row.id) &&
      !(row.children?.length && !row.parentTaskId && depthById.get(row.id) === 0)
    )
      return;
    flight.current = true;
    setPending(true);
    try {
      if (
        await (row
          ? choose(
              row,
              hierarchical && !!row.children?.length && !row.parentTaskId && depthById.get(row.id) === 0
                ? "Subtree"
                : "Single",
            )
          : create!(wanted, { priority, energyDemand: energy }))
      ) {
        setText("");
        setSearch("");
        setActive(0);
      }
    } finally {
      flight.current = false;
      setPending(false);
      input.current?.focus();
    }
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setExpanded(true);
      setNavigated(true);
      setActive(Math.max(0, Math.min(count - 1, current + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showing && lit) void select(current);
    } else if (e.key === "Escape" && showing) {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(false);
      setNavigated(false);
    }
  }
  const hasKids = rows.some(r => !!r.children?.length);
  const option = (row: PickerRow, index: number) => {
    const nested = hierarchical && (depthById.get(row.id) ?? 0) > 0;
    const planned = hierarchical && excluded.has(row.id);
    const canRefresh = !!row.children?.length && !row.parentTaskId && !nested;
    return (
      <div
        key={row.id}
        className={hierarchical ? "r2-picker-tree-line" : undefined}
        style={hierarchical ? { paddingInlineStart: `${Math.min(depthById.get(row.id) ?? 0, 12) * 18}px` } : undefined}
      >
        {hierarchical && !!row.children?.length && (
          <button
            type="button"
            className="r2-picker-toggle"
            aria-label={`${row.title} alt görevleri`}
            aria-expanded={!collapsed.has(row.id)}
            onMouseDown={e => e.preventDefault()}
            onClick={() =>
              setCollapsed(before => {
                const next = new Set(before);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              })
            }
          >
            <ChevronRight
              size={14}
              aria-hidden
              style={{ transform: !collapsed.has(row.id) ? "rotate(90deg)" : undefined }}
            />
          </button>
        )}
        {hierarchical && hasKids && !row.children?.length && <span className="r2-picker-spacer" aria-hidden="true" />}
        <div
          id={`${id}-${index}`}
          role="option"
          aria-selected={lit && current === index}
          aria-disabled={(planned && !canRefresh) || undefined}
          className={`r2-option r2-option-rows${lit && current === index ? " active" : ""}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => void select(index)}
        >
          <PickerLabel row={nested ? { ...row, parentTitle: null } : row} />
          <span className="r2-option-planned" aria-hidden={planned ? undefined : true}>
            {planned ? "Planda" : ""}
          </span>
        </div>
      </div>
    );
  };
  return (
    <div
      className="r2-add-plan"
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setExpanded(false);
          setNavigated(false);
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="r2-add-plan-field">
        {leadingIcon}
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? `${id}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showing && lit && count ? `${id}-${current}` : undefined}
          aria-busy={pending || query.isFetching}
          autoComplete="off"
          maxLength={200}
          placeholder={placeholder}
          value={text}
          readOnly={disabled || pending}
          onFocus={() => {
            if (!disabled) setExpanded(true);
          }}
          onChange={e => {
            setText(e.target.value);
            setExpanded(true);
            setActive(0);
          }}
          onKeyDown={key}
        />
      </div>
      {showing && (
        <div className="r2-suggestions">
          {/* Arama yazılırken veya okunurken seçenekler kısa süre boş kalabilir. Liste güncellendiğini söyler. */}
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Görev önerileri"
            aria-busy={search !== wanted || query.isFetching || undefined}
          >
            {date && (
              <div role="group" aria-labelledby={`${id}-assigned`}>
                <div id={`${id}-assigned`} className="r2-option-group">
                  Bu güne atanmış
                </div>
                {a.map((row, i) => option(row, i))}
                {!a.length && <p className="r2-option-note">Bu grupta görev yok.</p>}
              </div>
            )}
            <div role="group" aria-labelledby={`${id}-other`}>
              <div id={`${id}-other`} className="r2-option-group">
                Tüm görevler
              </div>
              {b.map((row, i) => option(row, a.length + i))}
            </div>
            {canCreate && (
              <div
                id={`${id}-${rows.length}`}
                role="option"
                aria-selected={lit && current === rows.length}
                className={`r2-option${lit && current === rows.length ? " active" : ""}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => void select(rows.length)}
              >
                {createLabel?.(wanted) ?? `“${wanted}” görevini oluştur ve plana ekle`}
              </div>
            )}
          </div>
          {query.isFetching && (
            <p role="status" className="r2-option-note">
              Görevler okunuyor…
            </p>
          )}
          {query.isError && (
            <p role="alert" className="r2-option-note">
              Görevler alınamadı.{" "}
              <button type="button" onClick={() => void query.refetch()}>
                Yeniden oku
              </button>
            </p>
          )}
          {already && <p className="r2-option-note">Bu görev bu günün planında zaten var.</p>}
          {canCreate && (
            <fieldset className="picker-create-facts" disabled={pending || disabled}>
              <legend className="sr-only">Yeni görevin özellikleri</legend>
              <label>
                Öncelik{" "}
                <select
                  aria-label="Yeni görevin önceliği"
                  value={priority}
                  onChange={e => setPriority(e.target.value as NewTaskFields["priority"])}
                >
                  {Object.entries(priorities).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Efor{" "}
                <select
                  aria-label="Yeni görevin eforu"
                  value={energy ?? ""}
                  onChange={e => setEnergy((e.target.value || null) as NewTaskFields["energyDemand"])}
                >
                  <option value="">Belirtilmedi</option>
                  {Object.entries(energies).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
          {fresh && !count && !already && <p className="r2-option-note">Uygun görev yok.</p>}
          {query.hasNextPage && (
            <button
              type="button"
              className="r2-picker-more"
              disabled={query.isFetchingNextPage}
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                input.current?.focus();
                void query.fetchNextPage();
              }}
            >
              Diğer görevleri göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}

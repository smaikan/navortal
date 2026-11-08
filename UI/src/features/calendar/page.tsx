"use client";
import { useState } from "react";
import { Menu } from "../../components/ui/menu";
import { useOccurrences } from "../special-days/queries";
import { byDate, kindClass, occurrenceName, type Occurrence } from "../special-days/model";
import { kindIcon } from "../special-days/icons";
import "../special-days/styles.css";
import type { ProjectionItem } from "../recurrence/model";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useDisplayPreferences } from "../workspace/queries";
import { localToday } from "../preferences/model";
import { shortTime } from "../planning/agenda-blocks";
import { DayNotes, type DayNoteEditor } from "../notes/day-section";
import { estimateText } from "../tasks/model";
import { calendarFailure, readRange } from "./model";
import {
  byDay,
  dayTitle,
  groupByRoot,
  itemPageLimit,
  monthGrid,
  monthLabel,
  readItemPage,
  shiftAnchor,
  shortWeekdays,
  weekDays,
  weekLabel,
  type CalendarItem,
  type CalendarItemPage,
  type RootGroup,
} from "./items";
import { readCalendarOverview } from "./overview";
import { byProjectionDate, ProjectedRoutines, projectionTime, useProjection } from "../recurrence/projection";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";

type View = "month" | "week";
function SpecialMarks({ items }: { items: Occurrence[] }) {
  if (!items.length) return null;
  return (
    <span className="r2-day-special" aria-hidden="true">
      {items.slice(0, 2).map(o => {
        const Icon = kindIcon[o.kind];
        return (
          <span key={o.specialDayId} className={`special-cell-mark ${kindClass(o.kind)}`}>
            <Icon size={12} />
            <span>{o.title}</span>
          </span>
        );
      })}
      {items.length > 2 && <span className="r2-more">+{items.length - 2}</span>}
    </span>
  );
}
const specialLabel = (items: Occurrence[]) => (items.length ? `, ${items.map(occurrenceName).join(", ")}` : "");

export function CalendarPage() {
  const prefs = useDisplayPreferences();
  if (prefs.isError)
    return (
      <p role="alert">
        Takvim tercihleri okunamadı.<button onClick={() => void prefs.refetch()}>Tercihleri yeniden oku</button>
      </p>
    );
  if (!prefs.data) return <ListSkeleton label="Takvim hazırlanıyor…" rows={6} />;
  return (
    <Workspace
      zone={prefs.data.values.timeZoneId}
      format={prefs.data.values.timeFormat}
      weekStartsOn={Number(prefs.data.values.weekStartsOn)}
    />
  );
}

/** Görünen aralık veya gün için sınırlı tek sayfa okunuyor. Devamını kullanıcı istiyor, gizli 3000 kayıt sınırı yok. */
function useCalendarItems(from: string, to: string, enabled = true) {
  const { session, state } = useSession();
  return useInfiniteQuery({
    queryKey: queryKeys.resource(state.user!.id, "calendar-items", { from, to }),
    networkMode: "always",
    enabled,
    initialPageParam: 0,
    getNextPageParam: (last: CalendarItemPage) =>
      Number(last.offset) + last.items.length < Number(last.total) && last.items.length > 0
        ? Number(last.offset) + last.items.length
        : undefined,
    queryFn: async ({ signal, pageParam }) =>
      readItemPage(
        await session.api.read("/api/calendar/items", {
          query: { FromDate: from, ToDate: to, Offset: pageParam, Limit: itemPageLimit },
          signal,
        }),
        from,
        to,
        pageParam,
      ),
  });
}
function useMonthOverview(from: string, to: string, enabled: boolean) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "calendar-overview", { from, to }),
    networkMode: "always",
    enabled,
    queryFn: async ({ signal }) =>
      readCalendarOverview(
        await session.api.read("/api/calendar/overview", {
          query: { FromDate: from, ToDate: to },
          signal,
        }),
        from,
        to,
      ),
  });
}

function Workspace({ zone, format, weekStartsOn }: { zone: string; format: string; weekStartsOn: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = localToday(zone);
  const view: View = params.get("view") === "hafta" ? "week" : "month";
  const requested = params.get("date");
  let anchor = today;
  try {
    if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) anchor = Temporal.PlainDate.from(requested).toString();
  } catch {
    /* Bozuk bağlantıda bugüne dönüyoruz. */
  }
  const month = monthGrid(anchor, weekStartsOn),
    week = weekDays(anchor, weekStartsOn);
  const range = view === "month" ? { from: month.from, to: month.to } : { from: week.from, to: week.to };
  const weekItems = useCalendarItems(range.from, range.to, view === "week");
  const overview = useMonthOverview(range.from, range.to, view === "month");
  const items = view === "month" ? overview : weekItems;
  const days = byDay(weekItems.data?.pages.flatMap(page => page.items) ?? []);
  const monthDays = new Map(overview.data?.days.map(day => [day.localDate, day]));
  // Görünen aralığın tekrarlarını bir kere okuyoruz. Okuma hata verirse plan görünümü yerinde kalıyor.
  const special = byDate(useOccurrences(range.from, range.to).data?.items ?? []);
  const projected = byProjectionDate(useProjection(range.from, range.to).data?.items);
  const [open, setOpen] = useState<{ date: string; trigger: HTMLElement } | null>(null);
  function go(next: { date?: string; view?: View }) {
    const query = new URLSearchParams(params);
    const date = next.date ?? anchor;
    const v = next.view ?? view;
    if (date === today) query.delete("date");
    else query.set("date", date);
    if (v === "week") query.set("view", "hafta");
    else query.delete("view");
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  const label = view === "month" ? monthLabel(month.month) : weekLabel(week.from, week.to);
  const order = Array.from({ length: 7 }, (_, i) => shortWeekdays[(weekStartsOn + i) % 7]);
  return (
    <div className="r2-calendar">
      <div className="r2-cal-head">
        <div role="group" aria-label="Görünüm" className="r2-segment">
          <button type="button" aria-pressed={view === "month"} onClick={() => go({ view: "month" })}>
            Ay
          </button>
          <button type="button" aria-pressed={view === "week"} onClick={() => go({ view: "week" })}>
            Hafta
          </button>
        </div>
        <span className="r2-spacer" />
        <button
          type="button"
          className="r2-icon"
          aria-label={view === "month" ? "Önceki ay" : "Önceki hafta"}
          onClick={() => go({ date: shiftAnchor(anchor, view, -1) })}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <span className="r2-cal-label" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          className="r2-icon"
          aria-label={view === "month" ? "Sonraki ay" : "Sonraki hafta"}
          onClick={() => go({ date: shiftAnchor(anchor, view, 1) })}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
        <button type="button" className="r2-cal-today" onClick={() => go({ date: today })}>
          {view === "month" ? "Bu ay" : "Bu hafta"}
        </button>
        <span className="r2-cal-menu">
          <Menu
            label="Takvim menüsü"
            items={[{ label: "Özel günler", onSelect: () => router.push("/reminders/special-days") }]}
          />
        </span>
      </div>
      {items.isError && (
        <div role="alert" className="form-error">
          {calendarFailure(items.error)}
          <button onClick={() => void items.refetch()}>Takvimi yeniden oku</button>
        </div>
      )}
      {items.isPending && (
        <p role="status" className="r2-hint">
          Takvim okunuyor…
        </p>
      )}
      {view === "month" ? (
        <div
          className="r2-month"
          style={{ gridTemplateRows: `28px repeat(${month.days.length / 7}, minmax(96px, 1fr))` }}
          aria-label={`${label} takvimi`}
          role="grid"
          aria-readonly="true"
        >
          <div role="row" className="r2-month-row">
            {order.map(w => (
              <span role="columnheader" key={w} className="r2-weekday">
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: month.days.length / 7 }, (_, row) => (
            <div role="row" className="r2-month-row" key={row}>
              {month.days.slice(row * 7, row * 7 + 7).map(d => {
                const summary = monthDays.get(d.date);
                const groups = summary?.roots ?? [];
                const groupCount = Number(summary?.rootGroupCount ?? 0);
                const shown = groups;
                const routines = projected.get(d.date) ?? [];
                const routineRoom = Math.max(0, 3 - shown.length);
                const hidden = Math.max(0, groupCount - 3) + Math.max(0, routines.length - routineRoom);
                return (
                  <div
                    role="gridcell"
                    key={d.date}
                    className={`r2-day-cell${d.inMonth ? "" : " out"}${d.date === today ? " today" : ""}`}
                  >
                    <button
                      type="button"
                      className="r2-day-button"
                      aria-label={`${dayTitle(d.date)}${specialLabel(special.get(d.date) ?? [])}${groupCount ? `, ${groupCount} ana görev` : ", plan yok"}${routines.length ? `, ${routines.length} rutin önizlemesi` : ""}${d.date === today ? ", bugün" : ""}`}
                      onClick={event => setOpen({ date: d.date, trigger: event.currentTarget })}
                    >
                      <span className="r2-day-number" aria-hidden="true">
                        {d.day}
                      </span>
                      <SpecialMarks items={special.get(d.date) ?? []} />
                      <span className="r2-day-items" aria-hidden="true">
                        {shown.map(g => (
                          <span
                            key={g.rootTaskId}
                            className={`r2-day-item${g.done ? " done" : ""}${d.date < today ? " past" : ""}`}
                          >
                            <span className="r2-dot" />
                            {g.rootTitle}
                          </span>
                        ))}
                        {routines.slice(0, routineRoom).map(r => (
                          <span key={r.templateId} className="routine-projected-chip">
                            {r.title}
                          </span>
                        ))}
                        {hidden > 0 && <span className="r2-more">+{hidden} daha</span>}
                      </span>
                      <span className="r2-day-dots" aria-hidden="true">
                        {groups.slice(0, 3).map(g => (
                          <span key={g.rootTaskId} className={`r2-dot${g.done ? " done" : ""}`} />
                        ))}
                        {routines.slice(0, routineRoom).map(r => (
                          <span key={r.templateId} className="r2-dot routine-projected-dot" />
                        ))}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="r2-week" role="group" aria-label={`${label} haftası`}>
          {week.days.map(date => {
            const groups = groupByRoot(days.get(date) ?? []);
            const routines = projected.get(date) ?? [];
            const d = Temporal.PlainDate.from(date);
            return (
              <section
                key={date}
                className={`r2-week-day${date === today ? " today" : ""}${groups.length || routines.length ? "" : " empty"}`}
                aria-label={`${dayTitle(date)}${specialLabel(special.get(date) ?? [])}${date === today ? ", bugün" : ""}`}
              >
                <button
                  type="button"
                  className="r2-week-head"
                  onClick={event => setOpen({ date, trigger: event.currentTarget })}
                >
                  <span>{shortWeekdays[d.dayOfWeek % 7]}</span>
                  <strong>{d.day}</strong>
                </button>
                <SpecialMarks items={special.get(date) ?? []} />
                {groups.length > 0 && (
                  <ul className="r2-week-groups">
                    {groups.map(g => (
                      <WeekGroup key={g.rootTaskId} group={g} zone={zone} format={format} />
                    ))}
                  </ul>
                )}
                {routines.length > 0 && (
                  <ul className="routine-projected-week" aria-label="Rutin önizlemesi">
                    {routines.map(r => (
                      <li key={r.templateId} className="routine-projected-chip">
                        {[projectionTime(r), r.title].filter(Boolean).join(" ")}
                      </li>
                    ))}
                  </ul>
                )}
                {!groups.length && !routines.length && !items.isPending && !weekItems.hasNextPage && (
                  <span className="r2-hint r2-week-empty">Plan yok</span>
                )}
              </section>
            );
          })}
        </div>
      )}
      {view === "week" && weekItems.hasNextPage && (
        <p className="r2-hint">
          Haftanın bütün öğeleri henüz yüklenmedi.{" "}
          <button
            type="button"
            disabled={weekItems.isFetching}
            onClick={() => void weekItems.fetchNextPage({ cancelRefetch: false })}
          >
            Kalan plan öğelerini yükle
          </button>
        </p>
      )}
      {open && (
        <DayDialog
          date={open.date}
          today={today}
          zone={zone}
          format={format}
          counts={monthDays.get(open.date)}
          special={special.get(open.date) ?? []}
          routines={projected.get(open.date) ?? []}
          trigger={open.trigger}
          close={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Kök görevin kendi öğelerinde başlık tekrar yazılmıyor, yalnız saatleri gösteriliyor. Alt görevler başlığın altında sıralanıyor. */
function WeekGroup({ group, zone, format }: { group: RootGroup; zone: string; format: string }) {
  const own = group.items.filter(item => item.taskId === group.rootTaskId && item.startsAt),
    children = group.items.filter(item => item.taskId !== group.rootTaskId);
  return (
    <li className="r2-week-group">
      {own.length > 0 && (
        <span className="r2-week-times">
          {own.map(item => (
            <span key={item.id} className={`r2-week-time${item.completedAt ? " done" : ""}`}>
              {shortTime(item.startsAt!, zone, format)}
            </span>
          ))}
        </span>
      )}
      <span className={`r2-week-root${group.done ? " done" : ""}`}>{group.rootTitle}</span>
      {children.length > 0 && (
        <ul className="r2-week-items">
          {children.map(item => (
            <li key={item.id} className={item.completedAt ? "done" : undefined}>
              {item.startsAt && <span className="r2-week-time">{shortTime(item.startsAt, zone, format)}</span>}
              <span className="r2-week-title">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Plan öğeleri Bugün ekranında düzenlenir. Gün notları iki ekranda da düzenlenebilir. */
function DayDialog({
  date,
  today,
  zone,
  format,
  counts,
  special,
  routines,
  trigger,
  close,
}: {
  date: string;
  today: string;
  zone: string;
  format: string;
  counts?: { itemCount: number | string; completedItemCount: number | string };
  special: Occurrence[];
  routines: ProjectionItem[];
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteEditor, setNoteEditor] = useState<DayNoteEditor | null>(null);
  const canLeave = () => !noteDirty || window.confirm("Kaydedilmemiş notu bırakmak istiyor musun?");
  const past = date < today;
  const page = useCalendarItems(date, date);
  const items = page.data?.pages.flatMap(p => p.items) ?? [];
  const total = Number(page.data?.pages[0]?.total ?? counts?.itemCount ?? 0);
  const summary = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "calendar-range", { from: date, to: date }),
    networkMode: "always",
    enabled: past,
    queryFn: async ({ signal }) =>
      readRange(
        await session.api.read("/api/calendar", { query: { FromDate: date, ToDate: date }, signal }),
        date,
        date,
      ).days[0],
  });
  const timed = items.filter(item => !!item.startsAt),
    untimed = items.filter(item => !item.startsAt);
  const done = items.filter(item => item.completedAt).length;
  const actual = summary.data ? estimateText(summary.data.actualSeconds) || "0 dk" : null;
  return (
    <Surface
      title={dayTitle(date)}
      modal
      returnTo={trigger}
      onClose={() => {
        if (!canLeave()) return false;
        close();
      }}
    >
      <div className="r2-cal-dialog">
        {special.length > 0 && (
          <ul className="special-strip" aria-label="Özel günler">
            {special.map(o => {
              const Icon = kindIcon[o.kind];
              return (
                <li key={o.specialDayId} className={`special-chip ${kindClass(o.kind)}`}>
                  <Icon aria-hidden="true" size={14} />
                  <span className="sr-only">{occurrenceName(o)}</span>
                  <span aria-hidden="true">
                    {o.title}
                    {o.nonWorking ? " · çalışma dışı" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <DayNotes
          key={date}
          date={date}
          zone={zone}
          editor={noteEditor}
          setEditor={setNoteEditor}
          onDirty={setNoteDirty}
          inDialog
        />
        <p className="r2-day-summary">
          {page.isPending
            ? "Gün öğeleri okunuyor…"
            : total
              ? counts
                ? `${total} plan öğesi · ${counts.completedItemCount} bitti`
                : page.hasNextPage
                  ? `${items.length}/${total} öğe yüklendi · yüklenenlerden ${done} bitti`
                  : `${total} plan öğesi · ${done} bitti`
              : "Bu gün için plan yok."}
        </p>
        {past &&
          (actual !== null ? (
            <p className="r2-actual">
              Gerçek çalışma: <strong>{actual}</strong>
            </p>
          ) : summary.isError ? (
            <p role="alert" className="field-error">
              Gerçek çalışma okunamadı.
            </p>
          ) : (
            <p role="status" className="r2-hint">
              Gerçek çalışma okunuyor…
            </p>
          ))}
        {page.isError && (
          <p role="alert">
            Gün öğeleri okunamadı. <button onClick={() => void page.refetch()}>Günü yeniden oku</button>
          </p>
        )}
        {page.hasNextPage && (
          <p className="r2-hint">
            Bütün öğeler henüz yüklenmedi.{" "}
            <button
              type="button"
              disabled={page.isFetching}
              onClick={() => void page.fetchNextPage({ cancelRefetch: false })}
            >
              Günün kalan öğelerini yükle
            </button>
          </p>
        )}
        {timed.length > 0 && <Groups items={timed} zone={zone} format={format} />}
        {untimed.length > 0 && (
          <>
            <h3 className="r2-plan-group">Saati belirlenmemiş</h3>
            <Groups items={untimed} zone={zone} format={format} />
          </>
        )}
        <ProjectedRoutines items={routines} />
        <div className="r2-cal-dialog-actions">
          <Link
            className="button primary"
            href={`/planning?date=${date}`}
            prefetch={false}
            onNavigate={event => {
              if (!canLeave()) event.preventDefault();
            }}
          >
            Gün planını düzenle
          </Link>
        </div>
      </div>
    </Surface>
  );
}
function Groups({ items, zone, format }: { items: CalendarItem[]; zone: string; format: string }) {
  return (
    <ul className="r2-cal-groups">
      {groupByRoot(items).map(g => {
        const single = g.items.length === 1 && g.items[0].taskId === g.rootTaskId;
        return (
          <li key={g.rootTaskId}>
            {!single && <span className="r2-cal-root">{g.rootTitle}</span>}
            <ul className={single ? "r2-cal-items" : "r2-cal-items nested"}>
              {g.items.map(item => (
                <li key={item.id} className={item.completedAt ? "done" : undefined}>
                  <span className="r2-cal-mark" aria-label={item.completedAt ? "Bitti" : "Açık"} role="img">
                    {item.completedAt && <Check aria-hidden="true" size={12} />}
                  </span>
                  {item.startsAt && (
                    <span className="r2-cal-time">
                      {shortTime(item.startsAt, zone, format)}
                      {item.endsAt ? `–${shortTime(item.endsAt, zone, format)}` : ""}
                    </span>
                  )}
                  <span className="r2-cal-title">
                    {item.title}
                    {item.parentTitle && item.parentTaskId !== item.rootTaskId && (
                      <span className="r2-plan-parent"> · {item.parentTitle}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

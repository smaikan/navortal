"use client";
import { lazy, Suspense, useState } from "react";
import { Surface } from "../../components/ui/surface";
import { useOptionalWork } from "../work/coordinator";
import { useDialogGuard } from "../work/draft-guard";
import { entryFacts } from "./day-plan";
import { shiftDate } from "./day-nav";
import type { Day } from "./model";

type Entry = Parameters<typeof entryFacts>[0];
const LightenDefer = lazy(() => import("./lighten-defer").then(m => ({ default: m.LightenDefer })));
const LightenPool = lazy(() => import("./lighten-pool").then(m => ({ default: m.LightenPool })));
const key = (e: Entry) => `${e.kind}:${e.kind === "block" ? e.block.id : e.item.id}`;
export function LightenDialog({
  day,
  entries,
  trigger,
  close,
  complete = true,
  loadMore,
  loadingMore = false,
}: {
  day: Day;
  entries: Entry[];
  trigger: HTMLElement | null;
  close: () => void;
  complete?: boolean;
  loadMore?: () => void;
  loadingMore?: boolean;
}) {
  const work = useOptionalWork();
  const open = entries.filter(e => !entryFacts(e).done && !!entryFacts(e).taskId);
  const [kept, setKept] = useState(() => new Set(open.slice(0, 3).map(key)));
  const [destination, setDestination] = useState<"tomorrow" | "pool">("tomorrow");
  const [busy, setBusy] = useState(false);
  const protectedEntry = (e: Entry) =>
    (e.kind === "block" && (e.block.isFixed || e.block.isLocked)) ||
    (work?.work?.state === "Running" && work.work.taskId === entryFacts(e).taskId);
  const leaving = open.filter(e => !protectedEntry(e) && !kept.has(key(e)));
  const keptTasks = new Set(open.filter(e => protectedEntry(e) || kept.has(key(e))).map(e => entryFacts(e).taskId));
  const poolTasks = [...new Set(leaving.map(e => entryFacts(e).taskId!))].sort();
  const guard = useDialogGuard({
    dirty: false,
    pending: busy,
    close,
    trigger,
    message: "Taşıma sürerken bu işlem bırakılamaz.",
  });
  return (
    <Surface title="Bugünü hafiflet" modal returnTo={trigger} closeDisabled={busy} onClose={guard.requestClose}>
      <div className="lighten">
        <p>İlk 3 işi bu günde tutmayı öneriyorum. Tutmak istediklerini seç; kalanları tek adımda ayırabilirsin.</p>
        <p className="muted">Sabit, kilitli ve şu an çalışılan işler bu günde kalır.</p>
        {!complete && (
          <p role="status">
            Planın devamı var. Tüm öğeleri gördükten sonra uygulayabilirsin.{" "}
            <button type="button" disabled={busy || loadingMore} onClick={loadMore}>
              {loadingMore ? "Okunuyor…" : "Diğer plan öğelerini göster"}
            </button>
          </p>
        )}
        <ul className="lighten-choices" aria-label="Bu günde tutulacak işler">
          {open.map(e => {
            const protectedItem = protectedEntry(e),
              selected = protectedItem || kept.has(key(e));
            const facts = entryFacts(e);
            return (
              <li key={key(e)}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Bu günde tut: ${facts.title}`}
                  disabled={busy || protectedItem}
                  onClick={() =>
                    setKept(old => {
                      const next = new Set(old);
                      if (next.has(key(e))) next.delete(key(e));
                      else next.add(key(e));
                      return next;
                    })
                  }
                >
                  <span>{facts.title}</span>
                  <span className="r2-chip">
                    {protectedItem ? "Korunuyor" : selected ? "Bu günde kalacak" : "Ayrılacak"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="r2-segment" role="group" aria-label="Ayrılan işlerin yeri">
          <button
            type="button"
            aria-pressed={destination === "tomorrow"}
            disabled={busy}
            onClick={() => setDestination("tomorrow")}
          >
            Yarına ayır
          </button>
          <button
            type="button"
            aria-pressed={destination === "pool"}
            disabled={busy}
            onClick={() => setDestination("pool")}
          >
            Havuzda beklet
          </button>
        </div>
        <Suspense fallback={<p role="status">Taşıma hazırlanıyor…</p>}>
          {destination === "tomorrow" ? (
            <LightenDefer
              day={day}
              targetDate={shiftDate(day.localDate, 1)}
              entries={leaving}
              pending={setBusy}
              close={close}
              disabled={!complete}
            />
          ) : (
            <LightenPool
              day={day}
              taskIds={poolTasks}
              conflict={!complete || poolTasks.some(id => keptTasks.has(id))}
              pending={setBusy}
              close={close}
            />
          )}
        </Suspense>
      </div>
    </Surface>
  );
}

"use client";
import Link from "next/link";
import { lazy, Suspense, useState } from "react";
import type { Day } from "../planning/model";
import { localToday } from "../preferences/model";
import { useDisplayPreferences } from "../workspace/queries";
import { CriticalNames } from "./critical-choice";
import { energies, quickSettings, supportFailure } from "./model";
import { useSupportDay } from "./queries";
const Edit = lazy(() => import("./preferences-dialog").then(m => ({ default: m.SupportPreferencesDialog })));
const Rescue = lazy(() => import("../planning/auto-planner").then(m => ({ default: m.AutoPlanner })));
const End = lazy(() => import("./end-preparation").then(m => ({ default: m.EndPreparationDialog })));
const Start = lazy(() => import("../focus/start-dialog").then(m => ({ default: m.StartDialog })));
export function SupportPanel({ day, format }: { day: Day; format: string }) {
  const q = useSupportDay(day.localDate);
  const prefs = useDisplayPreferences();
  const [action, setAction] = useState<{ kind: "edit" | "start" | "rescue" | "end"; trigger: HTMLElement } | null>(
    null,
  );
  const enabled =
    q.data?.enabled === true && prefs.data?.values.supportEnabled === true && !q.isError && !prefs.isError;
  const today = prefs.data ? day.localDate === localToday(prefs.data.values.timeZoneId) : false;
  return (
    <div className="support-panel">
      <p>İstersen bugün için küçük bir destek seç. Efor ve kritik iş seçimi zorunlu değil.</p>
      {q.isPending && <p role="status">Günlük destekler okunuyor…</p>}
      {q.isError && (
        <p role="alert">
          {supportFailure(q.error)}
          <button onClick={() => void q.refetch()}>Destekleri yeniden oku</button>
        </p>
      )}
      {q.data && (
        <>
          <p>Efor: {q.data.availableEnergy ? energies[q.data.availableEnergy] : "Belirtilmemiş"}</p>
          {q.data.criticalTaskIds.length ? (
            <CriticalNames ids={q.data.criticalTaskIds} />
          ) : (
            <p>Kritik iş seçilmemiş. İstersen en fazla 3 iş belirleyebilirsin.</p>
          )}
          {!enabled && (
            <p>
              İsteğe bağlı destekler kapalı veya güncel tercih doğrulanamadı. Notların ve normal çalışma akışların
              kullanılabilir.{" "}
              <Link href="/settings?section=supports" prefetch={false}>
                Destek ayarlarını aç
              </Link>
            </p>
          )}
          <div className="actions">
            <button
              disabled={!enabled || !!action}
              onClick={e => setAction({ kind: "edit", trigger: e.currentTarget })}
            >
              Kritik işler ve efor seç
            </button>
            {/* Genel beş dakika başlangıcı görevsizdir. Gün satırı ve tek görev kendi görevi seçili açar. */}
            <button
              disabled={!enabled || !!action}
              onClick={e => setAction({ kind: "start", trigger: e.currentTarget })}
            >
              Beş dakika başla
            </button>
            <button
              disabled={!enabled || !today || !!action}
              onClick={e => setAction({ kind: "rescue", trigger: e.currentTarget })}
            >
              Kalan günü kurtar
            </button>
            <button disabled={!!action} onClick={e => setAction({ kind: "end", trigger: e.currentTarget })}>
              Gün sonunu gözden geçir
            </button>
          </div>
          {!today && <p className="muted">Kalan günü kurtar yalnız bugün için kullanılabilir.</p>}
        </>
      )}
      {action && (
        <Suspense fallback={<p role="status">Destek açılıyor…</p>}>
          {action.kind === "edit" && q.data && (
            <Edit source={{ kind: "day", value: q.data }} trigger={action.trigger} close={() => setAction(null)} />
          )}
          {action.kind === "start" && (
            <Start
              quick
              selection={{ name: "Beş dakikalık küçük başlangıç", settings: quickSettings }}
              zone={prefs.data?.values.timeZoneId ?? day.timeZoneId}
              trigger={action.trigger}
              close={() => setAction(null)}
            />
          )}
          {action.kind === "rescue" && (
            <Rescue
              rescue
              day={day}
              format={format}
              trigger={action.trigger}
              close={() => setAction(null)}
              onApplied={() => {}}
            />
          )}
          {action.kind === "end" && (
            <End date={day.localDate} format={format} trigger={action.trigger} close={() => setAction(null)} />
          )}
        </Suspense>
      )}
    </div>
  );
}

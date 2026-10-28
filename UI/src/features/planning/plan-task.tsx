"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { localToday, validDate } from "../preferences/model";
import { useDisplayPreferences } from "../workspace/queries";
import { isOffline, offlineWrite } from "../tasks/model";
import { dayItemLimit, readDayItems } from "./model";
import { acceptTaskPlan, blocksTaskPlanRetry, taskPlanFailure } from "./plan-task-model";

/** Mevcut görev kimliği ve sunucunun saatsiz öğe komutu kullanılır. Görev kopyası veya istemci plan hesabı yok. */
export function PlanTask({
  task,
  trigger,
  close,
  report,
}: {
  task: { id: string; title: string };
  trigger: HTMLElement;
  close: () => void;
  report: (value: { pending: boolean }) => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const preferences = useDisplayPreferences();
  const [date, setDate] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issue, setIssue] = useState("");
  const busy = useRef(false),
    mounted = useRef(true);
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () =>
    mounted.current && session.getIdentity().epoch === epoch && session.getSnapshot().user?.id === owner;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      report({ pending: false });
    };
  }, [report]);
  const selected = date ?? (preferences.data ? localToday(preferences.data.values.timeZoneId) : "");
  function invalidate() {
    for (const resource of ["day-items", "day-overview", "plan-day", "plan-allocation", "calendar-items"])
      void client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) });
  }
  async function run(reconcile: boolean) {
    if (busy.current || !validDate(selected) || saved || (blocked && !reconcile)) return;
    if (isOffline()) {
      setIssue(offlineWrite);
      return;
    }
    busy.current = true;
    setDate(selected);
    setPending(true);
    report({ pending: true });
    setIssue("");
    try {
      if (reconcile) {
        // Okuma başarıyı gösterebilir. Kaydın görünmemesi anahtarsız POST'u tekrar gönderme izni değildir.
        const page = readDayItems(
          await session.api.read("/api/daily-plans/{date}/items", {
            path: { date: selected },
            query: { Offset: 0, Limit: dayItemLimit },
          }),
          selected,
        );
        if (!current()) return;
        if (page.items.some(item => item.taskId === task.id)) {
          setSaved(true);
          invalidate();
        } else
          setIssue(
            "Görev okunan plan sayfasında görünmüyor. Sonuç hâlâ doğrulanamadı; işlem tekrar gönderilmedi. Günün planını kontrol edebilirsin.",
          );
      } else {
        acceptTaskPlan(
          await session.api
            .mutation("/api/daily-plans/{date}/items", "post", { path: { date: selected }, body: { taskId: task.id } })
            .execute(),
          task.id,
          selected,
        );
        if (!current()) return;
        // Yazı makbuzu yeterli. Yavaş takip GET'i doğrulanmış kaydı gizlememeli.
        setSaved(true);
        invalidate();
      }
    } catch (error) {
      if (current()) {
        if (!reconcile && blocksTaskPlanRetry(error)) setBlocked(true);
        setIssue(taskPlanFailure(error));
      }
    } finally {
      busy.current = false;
      if (current()) {
        setPending(false);
        report({ pending: false });
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(false);
  }
  return (
    <Surface
      title="Güne planla"
      modal
      returnTo={trigger}
      closeDisabled={pending}
      onClose={() => {
        if (busy.current) return false;
        close();
      }}
    >
      <p>{task.title}</p>
      <p className="muted form-hint">
        Aynı görev seçtiğin güne saatsiz eklenir. Saatini günün planında belirleyebilirsin; görevin tahmini ve havuz
        bağı korunur.
      </p>
      <form onSubmit={submit}>
        <label>
          Plan günü
          <TemporalInput
            type="date"
            required
            min="0002-01-01"
            max="9998-12-31"
            value={selected}
            disabled={!preferences.data || pending || blocked || saved}
            onChange={event => {
              setDate(event.target.value);
              setIssue("");
            }}
          />
        </label>
        {preferences.isError && !preferences.data && (
          <p role="alert">
            Gün bilgisi alınamadı.{" "}
            <button type="button" onClick={() => void preferences.refetch()}>
              Yeniden oku
            </button>
          </p>
        )}
        {!saved && (
          <button type="submit" className="primary" disabled={!validDate(selected) || pending || blocked}>
            {pending ? "İşlem sürüyor…" : "Güne ekle"}
          </button>
        )}
        {blocked && !saved && (
          <button type="button" disabled={pending} onClick={() => void run(true)}>
            Güncel planı oku
          </button>
        )}
        {issue && (
          <p role="alert" className="form-error">
            {issue}
          </p>
        )}
        {saved && <p role="status">Görev günün planında.</p>}
        {validDate(selected) && (saved || blocked) && !pending && (
          <p>
            <Link href={`/planning?date=${selected}`} onClick={close}>
              Günün planını aç
            </Link>
          </p>
        )}
      </form>
    </Surface>
  );
}

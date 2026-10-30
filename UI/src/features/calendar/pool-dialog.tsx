"use client";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import { useResources } from "../collections/queries";
import { readTask, type Task } from "../tasks/model";
import { useTaskCache } from "../tasks/queries";
import { readTime, duration } from "../tasks/work/model";
import { planFailure, readDay, readResult, type Day, type Result } from "../planning/model";
type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Result> };
export function PoolDialog({
  day,
  task,
  trigger,
  close,
}: {
  day: Day;
  task: Task;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession(),
    client = useQueryClient(),
    taskCache = useTaskCache();
  const [base, setBase] = useState({ day, task }),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [text, setText] = useState(""),
    [pool, setPool] = useState(""),
    [protectedIntent, setProtected] = useState(false),
    [reason, setReason] = useState("");
  const [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState<Command | null>(null),
    [saved, setSaved] = useState<Result | null>(null),
    [stale, setStale] = useState(false),
    [failure, setFailure] = useState(""),
    [refreshFailed, setRefreshFailed] = useState(false),
    [latest, setLatest] = useState<typeof base | null>(null);
  const busy = useRef(false);
  const locked = pending || !!unknown;
  const guard = useDialogGuard({
    dirty: !saved && !!pool,
    pending: locked,
    close,
    trigger,
    message: "Havuz seçimi kaydedilmeden kapatılacak. Devam edilsin mi?",
  });
  const pools = useResources("pools", { offset, limit: 25, search: search || undefined, includeArchived: false });
  const time = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-time", { id: task.id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readTime(await session.api.read("/api/tasks/{id}/time", { path: { id: task.id }, signal }), task.id),
  });
  async function refresh() {
    setRefreshFailed(false);
    try {
      await Promise.all([
        taskCache.manyChanged(),
        ...[
          "day-overview",
          "plan-day",
          "plan-blocks",
          "day-items",
          "calendar-items",
          "calendar-overview",
          "calendar-range",
          "calendar-day",
          "calendar-revisions",
          "plan-revisions",
          "task-time",
        ].map(r =>
          client.invalidateQueries(
            { queryKey: queryKeys.resource(state.user!.id, r).slice(0, 3), refetchType: "active" },
            { throwOnError: true },
          ),
        ),
      ]);
    } catch {
      setRefreshFailed(true);
    }
  }
  async function run(command: Command, retry = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      const result = readResult(await command.execute({ retryUnknownResult: retry }));
      setSaved(result);
      setUnknown(null);
      guard.markSaved();
      await refresh();
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.code === "work_running"
          ? "Bu işte gerçek çalışma sürüyor. Havuzda bekletmeden önce çalışma sayacından açıkça duraklat; bu işlem çalışmayı kendiliğinden kesmez."
          : planFailure(error),
      );
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUnknown(command);
      else {
        setUnknown(null);
        if (
          error instanceof ApiError &&
          [404, 409].includes(error.status ?? 0) &&
          !["work_running", "schedule_protected"].includes(error.code ?? "")
        )
          setStale(true);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (locked || saved || stale || !pool) return;
    const command = session.api.mutation("/api/calendar/days/{date}/tasks/{id}/pool", "post", {
      path: { date: day.localDate, id: task.id },
      body: {
        version: base.task.version,
        expectedPlanningVersion: base.day.planningVersion,
        poolId: pool,
        allowProtectedChange: protectedIntent,
        reason: reason.trim() || null,
      },
    });
    void run(command);
  }
  async function rebase() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const [d, t] = await Promise.all([
        session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        session.api.read("/api/tasks/{id}", { path: { id: task.id } }),
      ]);
      const taskValue = readTask(t);
      if (taskValue.id !== task.id) throw new ApiError("protocol", "Görev kimliği uyuşmuyor.");
      setLatest({ day: readDay(d, day.localDate), task: taskValue });
    } catch (e) {
      setFailure(planFailure(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Surface title="İşi havuzda beklet" modal returnTo={trigger} onClose={guard.requestClose} closeDisabled={locked}>
      <div className="calendar-pool">
        <p>
          <strong>{base.task.title}</strong> · Kaynak gün {day.localDate}
        </p>
        <p>
          Yalnız bu görevin havuzu değişir. Gelecekteki iş tahsisleri kaldırılır; geçmiş plan, gerçek çalışma ve görev
          kimliği korunur. İş tamamlanmaz veya iptal edilmez; alt görevlerin havuzu değişmez.
        </p>
        {time.data && (
          <p>
            Gerçek çalışma: {duration(time.data.subtreeActualSeconds)} · Kalan iş:{" "}
            {time.data.remainingSeconds === null ? "Bilinmiyor" : duration(time.data.remainingSeconds)}
          </p>
        )}
        {time.isError && (
          <p role="alert">
            Güncel süreler okunamadı.<button onClick={() => void time.refetch()}>Süreleri yeniden oku</button>
          </p>
        )}
        {!saved && (
          <>
            <form
              onSubmit={e => {
                e.preventDefault();
                setSearch(text.trim());
                setOffset(0);
              }}
            >
              <fieldset disabled={locked || stale}>
                <legend>Hedef havuz</legend>
                <label>
                  Havuz ara
                  <input maxLength={200} value={text} onChange={e => setText(e.target.value)} />
                </label>
                <button>Ara</button>
              </fieldset>
            </form>
            {pool && (
              <p>
                Seçilen havuz: <code>{pool}</code>
              </p>
            )}
            {pools.isError && (
              <p role="alert">
                Havuzlar okunamadı.
                <button disabled={locked} onClick={() => void pools.refetch()}>
                  Havuzları yeniden oku
                </button>
              </p>
            )}
            {pools.isPending && <p role="status">Havuzlar okunuyor…</p>}
            {pools.data && (
              <>
                <ul className="proposal-list">
                  {pools.data.items.map(p => (
                    <li key={p.id}>
                      <label>
                        <input
                          type="radio"
                          name="day-pool"
                          checked={pool === p.id}
                          disabled={locked || stale || pools.isFetching}
                          onChange={() => setPool(p.id)}
                        />
                        {p.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="actions">
                  <button disabled={locked || !offset || pools.isFetching} onClick={() => setOffset(offset - 25)}>
                    Önceki havuzlar
                  </button>
                  <button
                    disabled={locked || offset + 25 >= Number(pools.data.total) || offset >= 100000 || pools.isFetching}
                    onClick={() => setOffset(offset + 25)}
                  >
                    Sonraki havuzlar
                  </button>
                </div>
              </>
            )}
            <form onSubmit={submit}>
              <fieldset disabled={locked || stale}>
                <legend>Açık işlem onayı</legend>
                <label>
                  <input type="checkbox" checked={protectedIntent} onChange={e => setProtected(e.target.checked)} />
                  Sabit veya kilitli gelecek tahsislerini kaldırmaya açıkça izin veriyorum
                </label>
                <label>
                  Bekletme nedeni (isteğe bağlı)
                  <textarea rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />
                </label>
                <button className="primary" disabled={!pool}>
                  Seçili havuzda beklet
                </button>
              </fieldset>
            </form>
          </>
        )}
        {saved && (
          <section aria-label="Havuzda bekletme onayı">
            <p role="status">Görev havuza alındı. Gerçek çalışma korunuyor.</p>
            <p>{saved.revisionIds.length} gün planı güncellendi.</p>
            {refreshFailed && (
              <p role="alert">
                Onay korunuyor; güncel görünüm okunamadı.
                <button disabled={pending} onClick={() => void refresh()}>
                  Görünümü yeniden oku
                </button>
              </p>
            )}
          </section>
        )}
        {pending && <p role="status">{saved ? "Onay alındı; güncel görünüm okunuyor…" : "İşlem sonucu bekleniyor…"}</p>}
        {failure && <p role="alert">{failure}</p>}
        {unknown && (
          <section aria-label="Belirsiz havuz sonucu">
            <p>Kaydedilmiş olabilir. Yeni bir işlem gönderilmez; aynı komut ve anahtarla kontrol et.</p>
            <button disabled={pending} onClick={() => void run(unknown, true)}>
              Aynı havuz isteğini yeniden dene
            </button>
          </section>
        )}
        {stale && !saved && (
          <section aria-label="Havuz sürüm karşılaştırması">
            <p>Görev veya plan değişti. Seçimin korundu; kendiliğinden yeniden gönderilmedi.</p>
            <button disabled={locked} onClick={() => void rebase()}>
              Güncel görev ve planı oku
            </button>
            {latest && (
              <>
                <p>
                  Görev sürümü {latest.task.version} · Planlama sürümü {latest.day.planningVersion}
                </p>
                <button
                  disabled={locked}
                  onClick={() => {
                    setBase(latest);
                    setLatest(null);
                    setStale(false);
                    setFailure("");
                  }}
                >
                  Bu sürümlerle yeniden hazırla
                </button>
              </>
            )}
          </section>
        )}
        <button disabled={locked} onClick={guard.requestClose}>
          Kapat
        </button>
      </div>
    </Surface>
  );
}

"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { usePreferences } from "../preferences/queries";
import { localToday } from "../preferences/model";
import { useTasks } from "../tasks/queries";
import { readTime } from "../tasks/work/model";
import { minutes } from "../planning/model";
import { RemainingPlan } from "../planning/remaining-plan";
import { useWork } from "./coordinator";
import { WorkFeedback } from "./player";
import { useDialogGuard } from "./draft-guard";
import { prepareImmediate } from "./immediate-model";
import { workFailure } from "./model";

function WorkAmounts({ id }: { id: string }) {
  const { session, state } = useSession();
  const result = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task-time", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readTime(await session.api.read("/api/tasks/{id}/time", { path: { id }, signal }), id),
  });
  if (!result.data)
    return result.isError ? (
      <p role="alert">
        Süre özeti alınamadı.<button onClick={() => void result.refetch()}>Süreleri yeniden oku</button>
      </p>
    ) : (
      <p role="status">Süre özeti okunuyor…</p>
    );
  const t = result.data;
  return (
    <>
      <dl className="task-metrics">
        <dt>Kendi gerçek çalışması</dt>
        <dd>{minutes(t.directActualSeconds)}</dd>
        <dt>Kalan iş</dt>
        <dd>{minutes(t.remainingSeconds)}</dd>
        <dt>Bilinen tahmin aşımı</dt>
        <dd>{minutes(t.knownOvertimeSeconds)}</dd>
      </dl>
      {Number(t.knownOvertimeSeconds) > 0 && (
        <p className="form-notice">
          Tahmin aşılmış. Çalışma devam eder; görev kendiliğinden tamamlanmaz. Görev ayrıntısından ek tahmin verebilir
          veya bitirme kararını alabilirsin.
        </p>
      )}
    </>
  );
}
export function ImmediateDialog({
  trigger,
  close,
  review = false,
}: {
  trigger: HTMLElement;
  close: () => void;
  review?: boolean;
}) {
  const work = useWork(),
    { session } = useSession(),
    prefs = usePreferences();
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null),
    [prepared, setPrepared] = useState<ReturnType<typeof prepareImmediate> | null>(null),
    [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false),
    [planLocked, setPlanLocked] = useState(false),
    [failure, setFailure] = useState("");
  const preparing = useRef(false);
  const tasks = useTasks({
    search: query || undefined,
    offset,
    limit: 25,
    includeCompleted: false,
    includeArchived: false,
    orderBy: "Title",
  });
  const receipt = review ? null : work.immediate?.receipt;
  const locked = pending || work.busy || !!work.uncertain || planLocked;
  const guard = useDialogGuard({
    dirty: !receipt && !!target,
    pending: locked,
    close,
    trigger,
    message: "Kaydedilmemiş iş seçimi kapatılsın mı?",
  });
  async function prepare() {
    if (!target || preparing.current || locked) return;
    preparing.current = true;
    setPending(true);
    setFailure("");
    setConsent(false);
    try {
      setPrepared(prepareImmediate(await session.api.read("/api/work-sessions/current"), target.id));
    } catch (error) {
      setFailure(workFailure(error));
    } finally {
      preparing.current = false;
      setPending(false);
    }
  }
  const current = work.work;
  const ids = receipt?.taskIds ?? (current?.taskId ? [current.taskId] : []);
  const zone = receipt?.session.timeZoneId ?? prefs.data?.values.timeZoneId;
  const date = receipt?.localDate ?? (zone ? localToday(zone) : null);
  const names = new Map<string, string>();
  if (receipt?.session.taskId) names.set(receipt.session.taskId, receipt.session.taskAtStart?.title ?? "Seçilen iş");
  if (receipt?.pausedSession?.taskId)
    names.set(receipt.pausedSession.taskId, receipt.pausedSession.taskAtStart?.title ?? "Önceki iş");
  return (
    <Surface
      title={review ? "Çalışma ve kalan plan" : "Acil işe geç"}
      modal
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={locked}
    >
      <div className="auto-planner immediate-planner">
        {review ? (
          <>
            <p>Gerçek çalışma devam eder. Süreyi görmek veya kalan planı gözden geçirmek çalışma kaydını kesmez.</p>
            {current?.taskId && <WorkAmounts id={current.taskId} />}
          </>
        ) : receipt ? (
          <section aria-label="Gerçek çalışma sonucu">
            <h3>Çalışma başladı</h3>
            <p role="status" className="form-notice">
              {receipt.session.taskAtStart?.title ?? "Seçilen iş"}:{" "}
              {receipt.resumed ? "mevcut oturuma devam edildi" : "yeni oturum başladı"}. Bu başlangıç kaydıdır; canlı
              durum çalışma çubuğundadır.
            </p>
            {receipt.pausedSession && (
              <>
                <p>
                  Önceki iş duraklatıldı: {receipt.pausedSession.taskAtStart?.title}. Kaydedilen gerçek çalışma:{" "}
                  {minutes(receipt.pausedSession.activeSeconds)}. Geçmiş silinmedi.
                </p>
                {receipt.pausedSession.taskId && (
                  <section aria-label="Önceki işin güncel süreleri">
                    <h4>Önceki işin güncel süreleri</h4>
                    <WorkAmounts id={receipt.pausedSession.taskId} />
                  </section>
                )}
              </>
            )}
            <p>
              Geçiş sırasındaki plan sonucu:{" "}
              {work.immediate?.planInvalid
                ? "Plan yanıtı doğrulanamadı"
                : (
                    {
                      Preview: "Önizleme onay bekliyor",
                      Applied: "Uygulandı",
                      NeedsPreview: "Yeni önizleme gerekiyor",
                      Unavailable: "Plan oluşturulamadı",
                    } as Record<string, string>
                  )[work.immediate?.status ?? ""]}
              . Güncel plan aşağıda gösterilir.
            </p>
            {(work.immediate?.planInvalid ||
              ["Unavailable", "NeedsPreview"].includes(work.immediate?.status ?? "")) && (
              <p role="alert" className="form-notice">
                Çalışma başladı; geçiş sırasında kalan plan güncellenemedi. Çalışma korunuyor. Güncel plan sonucu ve
                yalnız planı yeniden deneme aşağıda.
              </p>
            )}
            {work.immediate?.planInvalid && <p>Plan yanıtı doğrulanamadı; uygulanmış kabul edilmedi.</p>}
          </section>
        ) : (
          <>
            <p>
              Bu işlem şimdi gerçekleşir. Devam eden çalışma varsa duraklatılır; seçtiğin işe geçilir. Kalan plan ayrıca
              değerlendirilir.
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                setQuery(search.trim());
                setOffset(0);
              }}
            >
              <label htmlFor="immediate-search">Şimdi başlanacak görevi ara</label>
              <div className="quick-add-controls">
                <input
                  id="immediate-search"
                  maxLength={200}
                  disabled={locked}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <button disabled={locked}>Ara</button>
              </div>
            </form>
            {tasks.isError && (
              <p role="alert">
                Görevler okunamadı.
                <button disabled={locked} onClick={() => void tasks.refetch()}>
                  Görevleri yeniden oku
                </button>
              </p>
            )}
            {tasks.isPending && <p role="status">Görevler okunuyor…</p>}
            <div role="radiogroup" aria-label="Şimdi başlanacak iş" className="proposal-choices">
              {tasks.data?.items.map(t => (
                <label key={t.id}>
                  <input
                    type="radio"
                    name="immediate-task"
                    checked={target?.id === t.id}
                    disabled={locked || !t.hasDirectWork}
                    onChange={() => {
                      setTarget({ id: t.id, title: t.title });
                      setPrepared(null);
                      setConsent(false);
                    }}
                  />
                  {t.title}
                  {!t.hasDirectWork && " (kendi işi yok; alt işini seç)"}
                </label>
              ))}
            </div>
            {tasks.data && (
              <nav aria-label="Acil iş sayfaları" className="task-pagination">
                <button disabled={locked || offset === 0} onClick={() => setOffset(offset - 25)}>
                  Önceki
                </button>
                <span>
                  {offset + tasks.data.items.length} / {tasks.data.total}
                </span>
                <button
                  disabled={locked || offset + 25 >= Number(tasks.data.total) || offset >= 100000}
                  onClick={() => setOffset(offset + 25)}
                >
                  Sonraki
                </button>
              </nav>
            )}
            {target && <p>Seçilen iş: {target.title}</p>}
            <button disabled={locked || !target} onClick={() => void prepare()}>
              Geçişi hazırla
            </button>
            {prepared && (
              <section aria-label="Açık geçiş onayı">
                <p>
                  {prepared.previous
                    ? `Duraklatılacak iş: ${prepared.previous.taskAtStart?.title ?? "Şu anki çalışma"}. Gerçek çalışma aynı anda kapanır ve seçilen iş başlar.`
                    : "Şu anda devam eden çalışma yok. Seçilen iş şimdi başlar."}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={locked}
                    onChange={e => setConsent(e.target.checked)}
                  />
                  Seçilen işe şimdi geçmeyi ve varsa mevcut çalışmayı duraklatmayı onaylıyorum.
                </label>
                <button
                  className="primary"
                  disabled={locked || !consent || !work.online}
                  onClick={() =>
                    void work.startNow(prepared.body).then(ok => {
                      if (ok) guard.markSaved();
                      setPrepared(null);
                      setConsent(false);
                    })
                  }
                >
                  Çalışmayı şimdi değiştir
                </button>
              </section>
            )}
          </>
        )}
        {(pending || work.busy) && (
          <p role="status">{work.immediate ? "Çalışma onayı alındı; görünüm okunuyor…" : "Geçiş sonucu bekleniyor…"}</p>
        )}
        {failure && (
          <div role="alert" className="form-error">
            {failure}
          </div>
        )}
        {work.origin === "immediate" && <WorkFeedback className="work-transition-feedback" />}
        {(receipt || review) && zone && date && ids.length > 0 && (
          <RemainingPlan
            key={receipt?.session.id ?? current?.id}
            date={date}
            taskIds={ids}
            zone={zone}
            format={prefs.data?.values.timeFormat ?? "24h"}
            names={names}
            initial={review ? null : (work.immediate?.plan ?? null)}
            lock={setPlanLocked}
            includeDayTasks={review}
          />
        )}
        {receipt && (
          <button
            disabled={locked}
            onClick={() => {
              work.clearImmediate();
              setTarget(null);
              setPrepared(null);
            }}
          >
            Başka bir işe geç
          </button>
        )}
        <button disabled={locked} onClick={guard.requestClose}>
          Kapat
        </button>
      </div>
    </Surface>
  );
}

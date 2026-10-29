"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Temporal } from "temporal-polyfill";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { usePreferences } from "../preferences/queries";
import { useDialogGuard } from "../work/draft-guard";
import type { Task } from "../tasks/model";
import { readDay, type Day } from "./model";
import { canApply, readApplied, type Applied } from "./proposal-model";
import { ProposalSelection } from "./proposal-selection";
import { DistributionView } from "./distribution-view";
import { DistributionTimes } from "./distribution-times";
import { distributionBody, rangeDates, readDistribution, multiFailure, type Distribution } from "./distribution-model";
type Command = {
  kind: "preview" | "plan" | "apply";
  id?: string;
  execute: (options?: { retryUnknownResult?: boolean }) => Promise<unknown>;
};
export function DistributionPlanner({
  day,
  task,
  source,
  carryFrom,
  initialTasks = [],
  format,
  trigger,
  close,
}: {
  day: Day;
  task?: Task;
  source?: string;
  carryFrom?: string;
  initialTasks?: readonly { id: string; title: string }[];
  format: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const prefs = usePreferences();
  const [from, setFrom] = useState(() =>
      carryFrom ? Temporal.PlainDate.from(carryFrom).add({ days: 1 }).toString() : day.localDate,
    ),
    [to, setTo] = useState(() => {
      const last = Temporal.PlainDate.from(day.localDate).add({ days: carryFrom ? 7 : 6 });
      return Temporal.PlainDate.compare(last, "9998-12-31") > 0 ? "9998-12-31" : last.toString();
    });
  const [selected, setSelected] = useState(
      () => new Map(task ? [[task.id, task.title]] : initialTasks.map(t => [t.id, t.title])),
    ),
    [protectedIntent, setProtected] = useState(false);
  const [proposal, setProposal] = useState<Distribution | null>(null),
    [accepted, setAccepted] = useState<Applied | null>(null),
    [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<Command | null>(null),
    [stale, setStale] = useState(false),
    [readFailed, setReadFailed] = useState(false),
    [failure, setFailure] = useState("");
  const busy = useRef(false),
    issue = useRef<HTMLDivElement>(null);
  const locked = pending || !!uncertain;
  const guard = useDialogGuard({
    dirty: !accepted && (!!source || selected.size > 0),
    pending: locked,
    close,
    trigger,
    message: "Dağıtım seçimi ve önizleme kapatılacak. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) issue.current?.focus();
  }, [failure, pending]);
  const binding = () => (source ? { source, day: day.localDate } : { range: { fromDate: from, toDate: to } });
  async function refresh() {
    await Promise.all(
      ["day-overview", "plan-day", "plan-blocks", "plan-allocation", "plan-revisions"].map(r =>
        client.invalidateQueries(
          { queryKey: queryKeys.resource(state.user!.id, r).slice(0, 3), refetchType: "active" },
          { throwOnError: true },
        ),
      ),
    );
  }
  function accept(value: Applied) {
    setAccepted(value);
    setUncertain(null);
    guard.markSaved();
  }
  async function check(id: string) {
    try {
      const next = readDistribution(
        await session.api.read("/api/scheduling/distribution-proposals/{id}", { path: { id } }),
        { ...binding(), id },
      );
      setProposal(next);
      setReadFailed(false);
      if (next.status === "Expired") setStale(true);
      if (next.applied) {
        accept(next.applied);
        await refresh();
      }
    } catch (error) {
      setReadFailed(true);
      setFailure(`Güncel dağıtım sonucu okunamadı. ${multiFailure(error)}`);
    }
  }
  async function perform(command: Command, retry = false) {
    let id: string;
    try {
      const raw = await command.execute({ retryUnknownResult: retry });
      if (command.kind === "apply") {
        accept(readApplied(raw as Applied, command.id));
        id = command.id!;
      } else {
        const next = readDistribution(raw as Distribution, binding());
        setProposal(next);
        setUncertain(null);
        setStale(next.status === "Expired");
        id = next.proposalId;
        if (next.applied) accept(next.applied);
      }
    } catch (error) {
      setFailure(multiFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUncertain(command);
      else {
        setUncertain(null);
        if (error instanceof ApiError && [404, 409].includes(error.status ?? 0)) setStale(true);
      }
      return;
    }
    await check(id);
  }
  async function guarded(action: () => Promise<void>, resolving = false) {
    if (busy.current || (uncertain && !resolving)) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
    } catch (error) {
      setFailure(multiFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function generate(kind: "preview" | "plan") {
    void guarded(async () => {
      if (!navigator.onLine)
        throw new ApiError("offline", "Bağlantı yok. Dağıtım isteği gönderilmedi; kendiliğinden gönderilmeyecek.");
      if (!source) rangeDates(from, to);
      if (carryFrom && from <= carryFrom) throw new RangeError("Hedef aralık kaynak günden sonra başlamalı.");
      setStale(true);
      setReadFailed(false);
      const current = readDay(
        await session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        day.localDate,
      );
      if (source) {
        const command = session.api.mutation("/api/scheduling/undo-multi-preview", "post", {
          body: {
            changeSetId: source,
            expectedPlanningVersion: current.planningVersion,
            allowProtectedChange: protectedIntent,
          },
        });
        await perform({ kind: "preview", execute: command.execute });
      } else {
        const body = distributionBody(from, to, [...selected.keys()], current.planningVersion);
        const command = carryFrom
          ? session.api.mutation("/api/calendar/days/{date}/carry", "post", { path: { date: carryFrom }, body })
          : kind === "preview"
            ? session.api.mutation("/api/scheduling/distribute-preview", "post", { body })
            : session.api.mutation("/api/scheduling/distribute-plan", "post", { body });
        await perform({ kind: carryFrom ? "plan" : kind, execute: command.execute });
      }
    });
  }
  function apply() {
    if (!proposal || !canApply(proposal) || stale || readFailed || locked) return;
    void guarded(async () => {
      const command = session.api.mutation("/api/scheduling/distribute-apply", "post", {
        body: { proposalId: proposal.proposalId },
      });
      await perform({ kind: "apply", id: proposal.proposalId, execute: command.execute });
    });
  }
  function reset() {
    setProposal(null);
    setAccepted(null);
    setStale(false);
    setReadFailed(false);
    setFailure("");
  }
  const title = source ? "Çok günlük geri alma" : carryFrom ? "Kalan işi başka günlere ayır" : "Günlere dağıt";
  return (
    <Surface title={title} modal returnTo={trigger} onClose={guard.requestClose} closeDisabled={locked}>
      <div className="auto-planner distribution-planner">
        <p>
          {source
            ? "Değişiklik grubunun geçerli gelecek etkileri için yeni telafi önerilir. Gerçek çalışma, tamamlanma ve düzeltmeler silinmez. Auto olsa da onay bekler."
            : "Aynı görevleri seçtiğin 1–31 güne dağıt. Gerçek çalışma başlatılmaz; başka gün tahsisleri sunucu tarafından bir kez sayılır."}
        </p>
        {carryFrom && (
          <p>
            Kaynak gün: {carryFrom}. Yalnız kalan tahsis edilmemiş iş önerilir. Başka günlere ayrılmış bloklar silinmez;
            onları değiştirmek için bloğu taşı. Preview onay bekler; Auto tercihi uygun öneriyi bu düğmeyle hemen
            uygulayabilir.
          </p>
        )}
        {source ? (
          <>
            <p>
              Kaynak grup: <code>{source}</code>
            </p>
            <label>
              <input
                type="checkbox"
                checked={protectedIntent}
                disabled={locked || !!proposal}
                onChange={e => setProtected(e.target.checked)}
              />
              Sabit veya kilitli blokların ters değişikliğine açıkça izin veriyorum.
            </label>
          </>
        ) : (
          <>
            <fieldset disabled={locked || !!proposal} className="distribution-range">
              <legend>Tarih aralığı</legend>
              <label>
                İlk gün
                <TemporalInput
                  type="date"
                  min="0002-01-01"
                  max="9998-12-31"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </label>
              <label>
                Son gün
                <TemporalInput
                  type="date"
                  min="0002-01-01"
                  max="9998-12-31"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </label>
            </fieldset>
            <p>
              Kaydedilmiş tercih: <strong>{prefs.data?.values.planningMode ?? "Okunuyor"}</strong>. “Tercihime göre
              dağıt”, Auto ise uygun öneriyi hemen uygular. “Yalnız dağıtımı önizle” onay bekler.
            </p>
            <ProposalSelection selected={selected} change={setSelected} disabled={locked || !!proposal} />
            {!!selected.size && <DistributionTimes selected={selected} />}
          </>
        )}
        {!accepted && (
          <div className="actions">
            <button
              className="primary"
              disabled={locked || (!source && !selected.size) || (!!carryFrom && (!prefs.data || prefs.isError))}
              onClick={() => generate(carryFrom ? "plan" : "preview")}
            >
              {carryFrom
                ? "Tercihime göre kalan işi ayır"
                : proposal
                  ? "Yeni dağıtım önizlemesi al"
                  : source
                    ? "Grup telafisini önizle"
                    : "Yalnız dağıtımı önizle"}
            </button>
            {!source && !carryFrom && !proposal && (
              <button
                disabled={locked || !selected.size || !prefs.data || prefs.isError}
                onClick={() => generate("plan")}
              >
                Tercihime göre dağıt
              </button>
            )}
          </div>
        )}
        {pending && (
          <p role="status">{accepted ? "Onay alındı; güncel planlar okunuyor…" : "Dağıtım sonucu bekleniyor…"}</p>
        )}
        {accepted && (
          <section aria-label="Dağıtım onayı">
            <p role="status">
              {accepted.noChanges
                ? "Değişiklik yok; yeni revizyon oluşturulmadı."
                : "Günler birlikte uygulandı. Ortak değişiklik grubu kaydedildi."}
            </p>
            {accepted.changeSetId && (
              <p>
                Ortak ChangeSet: <code>{accepted.changeSetId}</code> · {accepted.revisionIds.length} revizyon
              </p>
            )}
          </section>
        )}
        {proposal && (
          <>
            <p role="status">
              Dağıtım durumu:{" "}
              {accepted ? "Uygulandı" : proposal.status === "Expired" ? "Süresi doldu" : "Onay bekliyor"}
            </p>
            <DistributionView key={proposal.proposalId} proposal={proposal} selected={selected} format={format} />
            {!accepted && (
              <button
                className="primary"
                disabled={locked || stale || readFailed || !canApply(proposal)}
                onClick={apply}
              >
                Günleri birlikte uygula
              </button>
            )}
            <button disabled={locked} onClick={() => void guarded(() => check(proposal.proposalId))}>
              Dağıtım durumunu yeniden oku
            </button>
            <button disabled={locked} onClick={reset}>
              Dağıtım seçimini değiştir
            </button>
          </>
        )}
        {stale && !accepted && (
          <p className="form-notice">
            Uygulamadan önce yeni dağıtım önizlemesi gerekiyor. GET eski taslağı kendiliğinden geçerli yapmaz.
          </p>
        )}
        {readFailed && accepted && <p>Onay korunuyor. Tekrar uygulama; güncel sonucu yeniden oku.</p>}
        {failure && (
          <div role="alert" tabIndex={-1} ref={issue} className="form-error">
            {failure}
          </div>
        )}
        {uncertain && (
          <section aria-label="Belirsiz dağıtım sonucu">
            <p>Seçim ve kapanış kilitli; yeni yazı gönderilmez.</p>
            {uncertain.kind === "preview" ? (
              <button
                disabled={pending}
                onClick={() =>
                  void guarded(async () => {
                    readDay(
                      await session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
                      day.localDate,
                    );
                    await refresh();
                    setUncertain(null);
                  }, true)
                }
              >
                Güncel planları kontrol et
              </button>
            ) : (
              <button disabled={pending} onClick={() => void guarded(() => perform(uncertain, true), true)}>
                Aynı dağıtım isteğini yeniden dene
              </button>
            )}
            {uncertain.id && (
              <button disabled={pending} onClick={() => void guarded(() => check(uncertain.id!), true)}>
                Dağıtımın güncel sonucunu oku
              </button>
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

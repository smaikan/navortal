"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { readDay, type Day } from "./model";
import { readUndo, undoFailure, type Revision } from "./history-model";
import { canApply, readApplied, type Applied, type Proposal } from "./proposal-model";
import { ProposalView } from "./proposal-view";

type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<unknown>; id: string };
export function UndoPanel({
  revision,
  day,
  format,
  lock,
}: {
  revision: Revision;
  day: Day;
  format: string;
  lock: (v: boolean) => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [protectedIntent, setProtected] = useState(false),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [applied, setApplied] = useState<Applied | null>(null);
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState<Command | "preview" | null>(null),
    [stale, setStale] = useState(false),
    [readFailed, setReadFailed] = useState(false),
    [failure, setFailure] = useState("");
  const busy = useRef(false),
    alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lock(pending || !!uncertain);
    return () => lock(false);
  }, [pending, uncertain, lock]);
  useEffect(() => {
    if (failure && !pending) alert.current?.focus();
  }, [failure, pending]);
  async function refresh() {
    await Promise.all(
      ["day-overview", "plan-day", "plan-blocks", "plan-allocation", "plan-revisions"].map(resource =>
        client.invalidateQueries(
          { queryKey: queryKeys.resource(state.user!.id, resource).slice(0, 3), refetchType: "active" },
          { throwOnError: true },
        ),
      ),
    );
  }
  function accept(value: Applied) {
    setApplied(value);
    setUncertain(null);
  }
  async function check(id: string) {
    try {
      const value = readUndo(
        await session.api.read("/api/scheduling/proposals/{id}", { path: { id } }),
        revision.changeSetId,
        id,
      );
      setProposal(value);
      setReadFailed(false);
      if (value.applied) {
        accept(value.applied);
        await refresh();
      }
    } catch (error) {
      setReadFailed(true);
      setFailure(`Güncel telafi sonucu okunamadı. ${undoFailure(error)}`);
    }
  }
  async function guarded(action: () => Promise<void>, resolving = false) {
    if (busy.current || (uncertain && !resolving)) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
    } catch (error) {
      setFailure(undoFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function preview() {
    void guarded(async () => {
      if (!navigator.onLine)
        throw new ApiError(
          "offline",
          "Bağlantı yok. Telafi önizlemesi gönderilmedi; bağlantı kurulduğunda yeniden deneyebilirsin.",
        );
      setStale(true);
      setReadFailed(false);
      const current = readDay(
        await session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        day.localDate,
      );
      let next: Proposal;
      try {
        const raw = await session.api
          .mutation("/api/scheduling/undo-preview", "post", {
            body: {
              changeSetId: revision.changeSetId,
              expectedPlanningVersion: current.planningVersion,
              allowProtectedChange: protectedIntent,
            },
          })
          .execute();
        next = readUndo(raw, revision.changeSetId);
        setProposal(next);
        setApplied(next.applied ?? null);
        setStale(false);
        setUncertain(null);
      } catch (error) {
        if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUncertain("preview");
        throw error;
      }
      await check(next.proposalId);
    });
  }
  async function perform(command: Command, retry = false) {
    try {
      const value = readApplied((await command.execute({ retryUnknownResult: retry })) as Applied, command.id);
      accept(value);
    } catch (error) {
      setFailure(undoFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUncertain(command);
      else {
        setUncertain(null);
        if (error instanceof ApiError && error.status === 409) setStale(true);
      }
      return;
    }
    // Sonraki okuma hata verse de doğrulanmış etki görünür kalsın.
    await check(command.id);
  }
  const locked = pending || !!uncertain;
  return (
    <section aria-label="Geleceğe dönük geri alma">
      <h3>Bu değişikliği geri almayı önizle</h3>
      <p>
        Yalnız geçerli gelecek etkiler için yeni bir plan telafisi önerilir. Gerçek çalışma, görev tamamlama ve süre
        düzeltmeleri geri silinmez. Auto tercihi olsa da bu işlem onay bekler.
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
      {!applied && (
        <div className="actions">
          <button disabled={locked} onClick={preview}>
            {proposal ? "Yeni telafi önizlemesi al" : "Telafiyi önizle"}
          </button>
          {proposal && (
            <button
              disabled={locked}
              onClick={() => {
                setProposal(null);
                setStale(false);
                setReadFailed(false);
                setFailure("");
              }}
            >
              Telafi seçimini değiştir
            </button>
          )}
        </div>
      )}
      {pending && (
        <p role="status">{applied ? "Telafi onayı alındı; güncel plan okunuyor…" : "Telafi sonucu bekleniyor…"}</p>
      )}
      {applied && (
        <p role="status" className="form-notice">
          {applied.noChanges
            ? "Değişiklik yok; yeni revizyon oluşturulmadı. Etkisiz telafi onayı kaydedildi."
            : "Geleceğe dönük telafi uygulandı. Yeni revizyon kaydedildi; geçmiş kayıtlar korundu."}
        </p>
      )}
      {proposal && (
        <>
          <p role="status">
            Telafi durumu: {applied ? "Uygulandı" : proposal.status === "Expired" ? "Süresi doldu" : "Onay bekliyor"}
          </p>
          <p className="form-notice">
            {proposal.isPartial
              ? "Kısmi telafi: yalnız gösterilen uygun değişiklikler uygulanabilir. Geri alınamayan bölümler uyarılarda açıklanıyor."
              : "Öneri, gösterilen geleceğe dönük değişiklikleri kapsıyor."}
          </p>
          <ProposalView proposal={proposal} zone={day.timeZoneId} format={format} selected={new Map()} />
          {!applied && (
            <button
              className="primary"
              disabled={locked || stale || readFailed || !canApply(proposal)}
              onClick={() =>
                void guarded(async () => {
                  const mutation = session.api.mutation("/api/scheduling/apply", "post", {
                    body: { proposalId: proposal.proposalId },
                  });
                  await perform({ id: proposal.proposalId, execute: mutation.execute });
                })
              }
            >
              Telafiyi uygula
            </button>
          )}
          <button disabled={locked} onClick={() => void guarded(() => check(proposal.proposalId))}>
            Telafi durumunu yeniden oku
          </button>
        </>
      )}
      {stale && (
        <p className="form-notice">
          Uygulamadan önce yeni telafi önizlemesi gerekiyor. Eski istek kendiliğinden tekrarlanmaz.
        </p>
      )}
      {failure && (
        <div ref={alert} tabIndex={-1} role="alert" className="form-error">
          {failure}
        </div>
      )}
      {uncertain && (
        <section aria-label="Belirsiz telafi sonucu">
          <p>Yeni yazı gönderilmez. Sonuç okunana kadar seçim ve kapanış kilitli.</p>
          {uncertain === "preview" ? (
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
              Güncel günü kontrol et
            </button>
          ) : (
            <>
              <button disabled={pending} onClick={() => void guarded(() => perform(uncertain, true), true)}>
                Aynı telafi isteğini yeniden dene
              </button>
              <button disabled={pending} onClick={() => void guarded(() => check(uncertain.id), true)}>
                Telafinin güncel sonucunu oku
              </button>
            </>
          )}
        </section>
      )}
    </section>
  );
}

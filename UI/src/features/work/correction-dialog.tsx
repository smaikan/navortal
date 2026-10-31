"use client";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { announceWorkChange } from "./changed";
import { useDialogGuard } from "./draft-guard";
import { correctionFailure, localInput, rangeBody, rangeText, type RangeDraft } from "./journal";
import { readWork, type Segment, type Work } from "./model";
import { RangeFields } from "./range-fields";

type Draft = RangeDraft & { voided: boolean };
const draftOf = (segment: Segment, zone: string): Draft => ({
  start: localInput(segment.startedAt, zone),
  end: segment.endedAt ? localInput(segment.endedAt, zone) : "",
  startChoice: "",
  endChoice: "",
  reason: "",
  voided: segment.isVoided,
});
const same = (a: Draft, b: Draft) => a.start === b.start && a.end === b.end && a.voided === b.voided;

/** Gerekçeli tek düzeltme. Kullanıcının gördüğü sürümler gider, 409'da taslak açık seçimi bekler. Anahtar yok; belirsiz sonuçta yalnız okuma yapılır. */
export function CorrectionDialog({
  work,
  segment,
  index,
  trigger,
  close,
  reread,
}: {
  work: Work;
  segment: Segment;
  index: number;
  trigger: HTMLElement;
  close: () => void;
  reread: () => Promise<unknown>;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const zone = work.timeZoneId;
  const [base, setBase] = useState(() => ({
    version: work.version,
    segmentVersion: segment.version,
    draft: draftOf(segment, zone),
  }));
  const [draft, setDraft] = useState<Draft>(base.draft);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [stale, setStale] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const changed = !same(draft, base.draft);
  const dirty = changed || draft.reason.trim() !== "";
  const { requestClose, markSaved } = useDialogGuard({
    dirty,
    pending,
    close,
    trigger,
    message: "Kaydedilmemiş düzeltme taslağı silinecek. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) errorBox.current?.focus();
  }, [failure, pending]);
  const openEnd = segment.endedAt === null && work.state === "Running";
  const moved =
    String(segment.version) !== String(base.segmentVersion) || String(work.version) !== String(base.version);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || stale || unknown || !changed) return;
    let range;
    try {
      if (draft.voided && !draft.end) throw new RangeError("Geçersiz sayılan aralığın bitişi olmalı.");
      range = rangeBody(draft, zone, openEnd);
    } catch (error) {
      setFailure(correctionFailure(error));
      return;
    }
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      readWork(
        await session.api
          .mutation("/api/work-sessions/{id}/segments/{segmentId}/corrections", "post", {
            path: { id: work.id, segmentId: segment.id },
            body: { version: base.version, segmentVersion: base.segmentVersion, ...range, isVoided: draft.voided },
          })
          .execute(),
      );
      markSaved();
      announceWorkChange(client, state.user!.id);
      await reread();
      close();
    } catch (error) {
      setFailure(correctionFailure(error));
      if (error instanceof ApiError && error.outcomeUnknown) setUnknown(true);
      else if (error instanceof ApiError && ["version_conflict", "segment_not_found"].includes(error.code ?? "")) {
        await reread();
        setStale(true);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function check() {
    setPending(true);
    try {
      await reread();
      setUnknown(false);
      setStale(true);
    } finally {
      setPending(false);
    }
  }
  function adopt(keep: boolean) {
    const next = { version: work.version, segmentVersion: segment.version, draft: draftOf(segment, zone) };
    setBase(next);
    setDraft(keep ? { ...draft } : { ...next.draft, reason: draft.reason });
    setStale(false);
    setFailure("");
  }
  return (
    <Surface title={`Aralık ${index + 1} düzelt`} modal returnTo={trigger} onClose={requestClose}>
      <p className="relation-title">{work.taskAtStart?.title ?? "Görev"}</p>
      <p className="muted form-hint">
        Şu anki değer: {rangeText(segment, zone)}. Eski değer ve neden kayıt geçmişinde saklanır; geçmiş silinmez.
      </p>
      <form noValidate aria-label="Aralık düzeltmesi" onSubmit={event => void submit(event)}>
        <fieldset disabled={pending || stale || unknown}>
          <RangeFields
            id="correction"
            draft={draft}
            change={next => {
              setDraft({ ...draft, ...next });
              setFailure("");
            }}
            zone={zone}
            openEnd={openEnd}
            issue={failure}
          />
          <label className="support-toggle">
            <input
              id="correction-void"
              type="checkbox"
              checked={draft.voided}
              onChange={event => {
                setDraft({ ...draft, voided: event.target.checked });
                setFailure("");
              }}
            />{" "}
            Bu aralığı geçersiz say (gerçek çalışmaya eklenmez)
          </label>
          {segment.isVoided && (
            <p className="muted form-hint">
              Bu aralık şu an geçersiz sayılıyor. İşareti kaldırmak aralığı geri getirir.
            </p>
          )}
          {segment.endedAt === null && !openEnd && (
            <p className="muted form-hint">Oturum çalışmıyor; açık aralığı kapatmak için bitiş gir.</p>
          )}
          {!changed && (
            <p className="muted form-hint" id="correction-unchanged">
              Kaydetmek için saatleri veya geçersizlik durumunu değiştir.
            </p>
          )}
          <button
            className="primary"
            disabled={!changed}
            aria-describedby={changed ? undefined : "correction-unchanged"}
          >
            {pending ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}
          </button>
        </fieldset>
      </form>
      {failure && (
        <div role="alert" tabIndex={-1} ref={errorBox} id="correction-issue" className="form-error">
          <p>{failure}</p>
          {unknown && (
            <button type="button" disabled={pending} onClick={() => void check()}>
              Güncel kaydı kontrol et
            </button>
          )}
        </div>
      )}
      {stale && moved && (
        <section className="reconcile-panel" aria-label="Sunucudaki güncel aralık">
          <h3>Sunucudaki güncel aralık</h3>
          <p>{rangeText(segment, zone)}</p>
          <p className="muted">
            Değişiklik başka bir yerde yapılmış olabilir. Hiçbir şey otomatik tekrar gönderilmedi.
          </p>
          <div className="actions">
            <button type="button" onClick={() => adopt(false)}>
              Güncel değerlerle yeniden başla
            </button>
            <button type="button" onClick={() => adopt(true)}>
              Taslağımı güncel kayda uygula
            </button>
          </div>
        </section>
      )}
      {stale && !moved && (
        <section className="reconcile-panel" aria-label="Sunucudaki güncel aralık">
          <h3>Sunucudaki aralık değişmemiş</h3>
          <p>{rangeText(segment, zone)}</p>
          <p className="muted">Düzeltme uygulanmamış. Taslağın duruyor; kontrol edip yeniden kaydedebilirsin.</p>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setStale(false);
                setFailure("");
              }}
            >
              Taslağa dön
            </button>
          </div>
        </section>
      )}
    </Surface>
  );
}

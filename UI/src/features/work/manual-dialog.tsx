"use client";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import type { Task } from "../tasks/model";
import { announceWorkChange } from "./changed";
import { useDialogGuard } from "./draft-guard";
import { correctionFailure, emptyRange, rangeBody, rangeText, type RangeDraft } from "./journal";
import { clock, readWork, type Work } from "./model";
import { RangeFields } from "./range-fields";

/** Elle çalışma komutunun anahtarı hazırlanırken sabitlenir. */
type Manual = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Work> };

/** Unutulmuş gerçek çalışma kaydı. Anahtar her niyette sabit; belirsiz sonuç yeni kayıtla değil aynı anahtarla denenir. */
export function ManualWorkDialog({
  task,
  zone,
  trigger,
  close,
}: {
  task: Task;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [draft, setDraft] = useState<RangeDraft>(emptyRange);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [uncertain, setUncertain] = useState<Manual | null>(null);
  const [saved, setSaved] = useState<Work | null>(null);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(emptyRange);
  const { requestClose, markSaved } = useDialogGuard({
    dirty: dirty || !!uncertain,
    pending,
    close,
    trigger,
    message: "Kaydedilmemiş manuel çalışma taslağı silinecek. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) errorBox.current?.focus();
  }, [failure, pending]);
  async function run(mutation: Manual, retry: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      const result = readWork(await mutation.execute({ retryUnknownResult: retry }));
      setUncertain(null);
      setSaved(result);
      markSaved();
      announceWorkChange(client, state.user!.id);
    } catch (error) {
      if (error instanceof ApiError && error.outcomeUnknown) setUncertain(mutation);
      setFailure(correctionFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || uncertain) return;
    let body;
    try {
      body = { taskId: task.id, ...rangeBody(draft, zone, false) };
    } catch (error) {
      setFailure(correctionFailure(error));
      return;
    }
    void run(
      session.api.mutation("/api/work-sessions/manual", "post", { body: { ...body, endedAt: body.endedAt! } }),
      false,
    );
  }
  return (
    <Surface title="Manuel çalışma ekle" modal returnTo={trigger} onClose={requestClose}>
      <p className="relation-title">{task.title}</p>
      <p className="muted form-hint">
        Sayaçla kaydedilmemiş gerçek çalışmayı ekle. Başka bir çalışmayla çakışan aralık kabul edilmez. Bu kayıt görevi
        tamamlamaz.
      </p>
      {saved ? (
        <div className="work-saved">
          <p role="status">
            Manuel çalışma kaydedildi:{" "}
            {rangeText(
              { id: saved.id, startedAt: saved.startedAt, endedAt: saved.endedAt, isVoided: false, version: 1 },
              saved.timeZoneId,
            )}{" "}
            · {clock(Number(saved.activeSeconds))}
          </p>
          <div className="actions">
            <Link href={`/work?oturum=${saved.id}`} prefetch={false}>
              Kaydı ve geçmişini aç
            </Link>
            <button
              type="button"
              onClick={() => {
                setSaved(null);
                setDraft(emptyRange);
              }}
            >
              Başka kayıt ekle
            </button>
          </div>
        </div>
      ) : (
        <form noValidate aria-label="Manuel çalışma" onSubmit={submit}>
          <fieldset disabled={pending || !!uncertain}>
            <RangeFields
              id="manual"
              draft={draft}
              change={next => {
                setDraft(next);
                setFailure("");
              }}
              zone={zone}
              openEnd={false}
              issue={failure}
            />
            <button className="primary">{pending ? "Kaydediliyor…" : "Manuel çalışmayı kaydet"}</button>
          </fieldset>
        </form>
      )}
      {failure && (
        <div role="alert" tabIndex={-1} ref={errorBox} id="manual-issue" className="form-error">
          <p>{failure}</p>
          {uncertain && (
            <div className="actions">
              <button type="button" disabled={pending} onClick={() => void run(uncertain, true)}>
                Aynı kaydı güvenle yeniden gönder
              </button>
              <Link href="/work" prefetch={false}>
                Çalışma kayıtlarını kontrol et
              </Link>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}

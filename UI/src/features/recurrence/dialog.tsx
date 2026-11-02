"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useRef, useState } from "react";
import Link from "next/link";
import { Temporal } from "temporal-polyfill";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import { useOptionalWork } from "../work/coordinator";
import { localDate } from "../notes/model";
import { TemplateFields } from "./fields";
import {
  draftTemplate,
  noDaysMessage,
  pageSize,
  readEffect,
  readTemplate,
  readOccurrence,
  readPage,
  recurrenceFailure,
  ruleSummary,
  templateFields,
  windowDates,
  type Template,
  type Occurrence,
  type Effect,
} from "./model";
import { useRecurrenceCache } from "./queries";
import type { RecurrenceStarter } from "./starters";
import "./styles.css";
export type Action = "create" | "update" | "materialize" | "enable" | "skip" | "cancel";
export type Intent = {
  action: Action;
  template?: Template;
  occurrence?: Occurrence;
  date?: string;
  from?: string;
  to?: string;
  trigger: HTMLElement;
  starter?: RecurrenceStarter;
};
const titles: Record<Action, string> = {
  create: "Rutin oluştur",
  update: "Rutini düzenle",
  materialize: "Seçili günler için görev oluştur",
  enable: "Serinin etkinliğini değiştir",
  skip: "Tek oluşumu atla",
  cancel: "Tek oluşumu iptal et",
};
export function RecurrenceDialog({
  intent,
  zone,
  close,
  created,
}: {
  intent: Intent;
  zone: string;
  close: () => void;
  created: (id: string) => void;
}) {
  const { session } = useSession();
  const cache = useRecurrenceCache();
  const work = useOptionalWork();
  const action = intent.action;
  const [base, setBase] = useState(intent.template);
  const [occurrence, setOccurrence] = useState(intent.occurrence);
  const [today] = useState(() =>
    Temporal.Now.zonedDateTimeISO(base?.rule.timeZoneId ?? zone)
      .toPlainDate()
      .toString(),
  );
  const initialDraft = () => ({ ...draftTemplate(zone, today, base), ...(action === "create" && intent.starter) });
  const [draft, setDraft] = useState(initialDraft);
  // Düzenleme bugünden başlar ve önceden oluşmuş uygun gelecek görevleri (en çok 93 gün) de yeniler.
  const effective = today,
    refresh = true,
    through = Temporal.PlainDate.from(today).add({ days: 92 }).toString();
  const [from, setFrom] = useState(intent.from ?? today),
    [to, setTo] = useState(intent.to ?? today),
    [date, setDate] = useState(intent.occurrence?.localDate ?? intent.date ?? today);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [unknown, setUnknown] = useState(false),
    [checked, setChecked] = useState(false),
    [failure, setFailure] = useState(""),
    [daysError, setDaysError] = useState(false);
  const [latest, setLatest] = useState<Template | null>(null),
    [latestOccurrence, setLatestOccurrence] = useState<Occurrence | undefined>(),
    [effect, setEffect] = useState<Effect | null>(null);
  const busy = useRef(false);
  const prepared = useRef<{ execute: (options?: { retryUnknownResult?: boolean }) => Promise<Effect> } | null>(null);
  const errorBox = useRef<HTMLParagraphElement>(null);
  const form = action === "create" || action === "update";
  const dirty =
    !effect &&
    (JSON.stringify(draft) !== JSON.stringify(initialDraft()) ||
      from !== (intent.from ?? today) ||
      to !== (intent.to ?? today) ||
      date !== (intent.occurrence?.localDate ?? intent.date ?? today));
  const guard = useDialogGuard({
    dirty,
    pending: pending || (unknown && !checked),
    trigger: intent.trigger,
    close,
    message: "Kaydedilmemiş tekrar seçimlerini bırakmak istiyor musun?",
  });
  async function save(retry = false) {
    if (busy.current || effect || (blocked && !retry) || (retry && !prepared.current)) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      if (!retry) {
        const path = { id: base?.id ?? "" };
        if (action === "create")
          prepared.current = session.api.mutation("/api/recurrence-templates", "post", { body: templateFields(draft) });
        else if (!base) throw new RangeError("Güncel şablonu yeniden aç.");
        else if (action === "update") {
          localDate(effective);
          if (effective < Temporal.Now.zonedDateTimeISO(draft.timeZoneId).toPlainDate().toString())
            throw new RangeError("Seri değişimi bugünden veya gelecekten başlamalı.");
          if (refresh) windowDates(effective, through);
          prepared.current = session.api.mutation("/api/recurrence-templates/{id}", "put", {
            path,
            body: {
              ...templateFields(draft),
              version: base.version,
              effectiveFrom: effective,
              refreshExisting: refresh,
              refreshThrough: refresh ? through : null,
            },
          });
        } else if (action === "enable")
          prepared.current = session.api.mutation("/api/recurrence-templates/{id}/enabled", "put", {
            path,
            body: { version: base.version, enabled: !base.enabled },
          });
        else if (action === "materialize")
          prepared.current = session.api.mutation("/api/recurrence-templates/{id}/materialize", "post", {
            path,
            body: { version: base.version, ...windowDates(from, to) },
          });
        else {
          localDate(date);
          if (
            date <
            Temporal.Now.zonedDateTimeISO(occurrence?.originalTimeZoneId ?? base.rule.timeZoneId)
              .toPlainDate()
              .toString()
          )
            throw new RangeError("Geçmiş oluşum değiştirilemez.");
          // Gün seçilerek açıldıysa o günün oluşumu okunur; görev varsa sürümü yazma isteğine eklenir.
          let found = occurrence;
          if (!found) {
            const page = readPage(
              await session.api.read("/api/recurrence-templates/{id}/occurrences", {
                path: { id: base.id },
                query: { FromDate: date, ToDate: date, Offset: 0, Limit: pageSize },
              }),
              0,
              o => readOccurrence(o, base.id),
              o => o.localDate,
            );
            if (page.items.some(o => o.localDate !== date)) throw new ApiError("protocol", "Oluşum tarihi uyuşmuyor.");
            found = page.items[0];
          }
          const body = { version: base.version, taskVersion: found?.taskVersion ?? null };
          prepared.current =
            action === "skip"
              ? session.api.mutation("/api/recurrence-templates/{id}/occurrences/{date}/skip", "post", {
                  path: { ...path, date },
                  body,
                })
              : session.api.mutation("/api/recurrence-templates/{id}/occurrences/{date}/cancel", "post", {
                  path: { ...path, date },
                  body,
                });
        }
      }
      const result = readEffect(await prepared.current!.execute({ retryUnknownResult: retry }), base?.id);
      if (!cache.current()) return;
      setEffect(result);
      setBlocked(false);
      setUnknown(false);
      guard.markSaved();
      cache.changed();
      void work?.refresh();
      if (action === "create") {
        created(result.template.id);
        close();
      } else if (action === "update" && !result.protectedTaskIds.length && !Number(result.retractedDayItemCount ?? 0))
        close();
    } catch (e) {
      if (!cache.current()) return;
      const uncertain = e instanceof ApiError && (e.outcomeUnknown || e.kind === "protocol");
      setUnknown(uncertain);
      setBlocked(uncertain || (e instanceof ApiError && [404, 409].includes(e.status)));
      setChecked(false);
      if (!uncertain) prepared.current = null;
      setDaysError(e instanceof RangeError && e.message === noDaysMessage);
      setFailure(recurrenceFailure(e));
      requestAnimationFrame(() => errorBox.current?.focus());
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      if (base) {
        const value = readTemplate(
          await session.api.read("/api/recurrence-templates/{id}", { path: { id: base.id } }),
          base.id,
        );
        let found: Occurrence | undefined;
        if (action === "skip" || action === "cancel") {
          localDate(date);
          const p = readPage(
            await session.api.read("/api/recurrence-templates/{id}/occurrences", {
              path: { id: base.id },
              query: { FromDate: date, ToDate: date, Offset: 0, Limit: pageSize },
            }),
            0,
            o => readOccurrence(o, base.id),
            o => o.localDate,
          );
          if (p.items.some(o => o.localDate !== date)) throw new ApiError("protocol", "Oluşum tarihi uyuşmuyor.");
          found = p.items[0];
        }
        if (!cache.current()) return;
        setLatest(value);
        setLatestOccurrence(found);
      } else {
        readPage(
          await session.api.read("/api/recurrence-templates", { query: { offset: 0, limit: pageSize } }),
          0,
          t => readTemplate(t),
          t => t.id,
        );
      }
      if (cache.current()) {
        setChecked(true);
        cache.changed();
      }
    } catch (e) {
      if (cache.current()) setFailure(recurrenceFailure(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function rebase() {
    if (!latest || !base || unknown) return;
    const original = draftTemplate(zone, today, base),
      remote = draftTemplate(zone, today, latest);
    setDraft(
      Object.fromEntries(
        Object.entries(remote).map(([k, v]) => [
          k,
          JSON.stringify(draft[k as keyof typeof draft]) === JSON.stringify(original[k as keyof typeof draft])
            ? v
            : draft[k as keyof typeof draft],
        ]),
      ) as typeof draft,
    );
    setBase(latest);
    setOccurrence(latestOccurrence);
    setLatest(null);
    setBlocked(false);
    setFailure("");
    setChecked(false);
    prepared.current = null;
  }
  const locked = pending || blocked || !!effect;
  return (
    <Surface
      title={titles[action]}
      modal
      returnTo={intent.trigger}
      onClose={guard.requestClose}
      closeDisabled={pending || (unknown && !checked)}
    >
      <form
        className="recurrence-form"
        noValidate
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked}>
          <legend>{base?.task.title || "Yeni serinin bilgileri"}</legend>
          {form && (
            <TemplateFields
              draft={draft}
              daysError={daysError}
              change={next => {
                setDraft(next);
                if (daysError) {
                  setDaysError(false);
                  setFailure("");
                }
              }}
            />
          )}
          {action === "create" && (
            <p>
              {draft.autoAddToPlan
                ? "Rutin seçili günlerin planına kendiliğinden eklenir: önümüzdeki 31 gün hazır olur, daha ilerisi takvimde önizleme olarak görünür."
                : "Şablon oluşturmak tek başına plan bloğu oluşturmaz. Görevler sunucuda oluşturulur; onları istediğin güne kendin ekleyebilirsin."}
            </p>
          )}
          {action === "update" && (
            <p className="muted">
              Değişiklik yarından sonraki plana yansır. Bugün, geçmiş ve senin değiştirdiğin plan öğeleri korunur.
            </p>
          )}
          {action === "materialize" && (
            <>
              <label>
                Görev üretimi başlangıcı
                <TemporalInput type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </label>
              <label>
                Görev üretimi bitişi
                <TemporalInput type="date" value={to} onChange={e => setTo(e.target.value)} />
              </label>
              <p>
                İki uç dahil 1–93 gün. Aynı tarihe tekrar istek aynı görev kimliğini korur. Atlanan/iptal edilen
                tarihler tekrar görev üretmez.
              </p>
            </>
          )}
          {action === "enable" && (
            <p>
              {base?.enabled
                ? "Seri pasif yapılacak. Yarından sonraki, dokunmadığın plan öğeleri kaldırılır; bugün ve geçmiş kalır."
                : "Seri etkinleştirilecek. Duraklatırken kaldırılan günler aynı görevlerle geri gelir."}
            </p>
          )}
          {(action === "skip" || action === "cancel") && (
            <>
              <label>
                Tek oluşumun günü
                <TemporalInput
                  type="date"
                  value={date}
                  readOnly={!!intent.occurrence}
                  onChange={e => {
                    setDate(e.target.value);
                    setOccurrence(undefined);
                  }}
                />
              </label>
              <p>
                Yalnız seçili oluşum {action === "skip" ? "atlanacak" : "iptal edilecek"}.{" "}
                {occurrence?.taskId
                  ? "Bağlı gerçek görevin durumu değişir; devam eden çalışma kapanabilir, gerçek çalışma ve geçmiş korunur."
                  : "Görev henüz oluşmadıysa kalıcı işaret bırakılır ve bu tarih için yeni görev üretilmez."}{" "}
                Serinin diğer günleri değişmez.
              </p>
            </>
          )}
        </fieldset>
        {failure && (
          <p ref={errorBox} role="alert" tabIndex={-1} className="form-error">
            {failure}
          </p>
        )}
        {blocked && !effect && (
          <div className="actions">
            <button type="button" disabled={pending} onClick={() => void check()}>
              Güncel tekrar kaydını oku
            </button>
            {unknown && (
              <button type="button" disabled={pending} onClick={() => void save(true)}>
                Aynı işlemi güvenle yeniden dene
              </button>
            )}
          </div>
        )}
        {checked && (
          <section className="reconcile-panel" aria-label="Güncel tekrar kaydı">
            {latest ? (
              <>
                <h3>Sunucudaki şablon</h3>
                <p>
                  {latest.task.title} · sürüm {latest.version} · {latest.enabled ? "Etkin" : "Pasif"}
                </p>
                <p>{ruleSummary(latest.rule)}</p>
                {latestOccurrence && (
                  <p>
                    Seçili oluşum: {latestOccurrence.state} · görev sürümü {latestOccurrence.taskVersion ?? "Görev yok"}
                  </p>
                )}
                {!unknown && (
                  <button type="button" disabled={pending} onClick={rebase}>
                    Seçimlerimi güncel sürümle yeniden hazırla
                  </button>
                )}
              </>
            ) : (
              <p>
                İlk 25 şablon yeniden okundu. Benzer bir başlık kayıt onayı değildir; aynı işlem kimliğiyle yanıtı
                alabilir veya listeyi inceleyebilirsin.
              </p>
            )}
            <p>Bu okuma eski komutu yeniden göndermedi.</p>
          </section>
        )}
        {effect && (
          <section aria-label="Tekrar işlemi sonucu">
            <p role="status">
              {action === "create"
                ? "Rutin oluşturuldu."
                : action === "update"
                  ? "Rutin güncellendi."
                  : "Tekrar işlemi kaydedildi."}
            </p>
            <p>
              Yanıttaki oluşum: {effect.occurrences.length} · Yenilenen görev: {effect.refreshedTaskIds.length} ·
              Korunan görev: {effect.protectedTaskIds.length}
            </p>
            {Number(effect.retractedDayItemCount ?? 0) > 0 && (
              <p>Plandan kaldırılan öğe: {Number(effect.retractedDayItemCount)}</p>
            )}
            {effect.protectedTaskIds.length > 0 && (
              <>
                <p>Korunan işler seri değişikliğiyle ezilmedi. Tek görevi açıp kendi bağlamında düzenleyebilirsin.</p>
                <ul>
                  {effect.protectedTaskIds.map((id, i) => (
                    <li key={id}>
                      <Link prefetch={false} href={`/tasks?taskId=${id}`}>
                        Korunan görevi aç · {i + 1}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {effect.occurrences.length > 0 && (
              <p>
                Güncel oluşum listesini yeniden okuyarak görevlere ulaşabilirsin.{" "}
                {effect.replayed && "Özgün işlem yanıtı tekrar alındı; yeni işlem yapılmadı."}
              </p>
            )}
            {action === "create" && (
              <button
                type="button"
                onClick={() => {
                  close();
                  created(effect.template.id);
                }}
              >
                Oluşturulan seriyi aç
              </button>
            )}
          </section>
        )}
        <div className="actions">
          <button className="primary" disabled={locked}>
            {pending
              ? "Kaydediliyor…"
              : action === "create"
                ? "Rutin oluştur"
                : action === "update"
                  ? "Kaydet"
                  : action === "materialize"
                    ? "Bu aralık için görev oluştur"
                    : "Değişikliği onayla"}
          </button>
          <button type="button" disabled={pending || (unknown && !checked)} onClick={guard.requestClose}>
            {effect ? "Kapat" : "Vazgeç"}
          </button>
        </div>
      </form>
    </Surface>
  );
}

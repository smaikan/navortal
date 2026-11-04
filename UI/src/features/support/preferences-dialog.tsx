"use client";
import { useId, useRef, useState } from "react";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { readTask, type Task } from "../tasks/model";
import { useDialogGuard } from "../work/draft-guard";
import { CriticalChoice, CriticalNames } from "./critical-choice";
import { energies, readSupportDay, supportChange, supportFailure, type Energy, type SupportDay } from "./model";
import { useSupportCache } from "./queries";
import "./styles.css";
export type Source = { kind: "day"; value: SupportDay } | { kind: "task"; value: Task };
const valueEnergy = (s: Source) => (s.kind === "day" ? s.value.availableEnergy : (s.value.energyDemand ?? null));
export function SupportPreferencesDialog({
  source,
  trigger,
  close,
}: {
  source: Source;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session } = useSession();
  const cache = useSupportCache();
  const id = useId();
  const [base, setBase] = useState(source),
    [energy, setEnergy] = useState<Energy | null>(valueEnergy(source)),
    [ids, setIds] = useState(source.kind === "day" ? source.value.criticalTaskIds : []);
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [unknown, setUnknown] = useState(false),
    [saved, setSaved] = useState(false),
    [checked, setChecked] = useState(false),
    [latest, setLatest] = useState<Source | null>(null),
    [failure, setFailure] = useState("");
  const busy = useRef(false);
  const dirty =
    !saved &&
    (energy !== valueEnergy(base) ||
      (base.kind === "day" && JSON.stringify(ids) !== JSON.stringify(base.value.criticalTaskIds)));
  const guard = useDialogGuard({
    dirty,
    pending: pending || (unknown && !checked),
    trigger,
    close,
    message: "Kaydedilmemiş destek seçimini bırakmak istiyor musun?",
  });
  async function save() {
    if (busy.current || blocked || saved) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      let result: Source;
      if (base.kind === "day")
        result = {
          kind: "day",
          value: readSupportDay(
            await session.api
              .mutation("/api/support/days/{date}", "put", {
                path: { date: base.value.localDate },
                body: supportChange(base.value, energy, ids),
              })
              .execute(),
            base.value.localDate,
          ),
        };
      else {
        const t = readTask(
          await session.api
            .mutation("/api/tasks/{id}/energy", "put", {
              path: { id: base.value.id },
              body: { version: base.value.version, energyDemand: energy },
            })
            .execute(),
        );
        if (t.id !== base.value.id) throw new ApiError("protocol", "Görev kimliği uyuşmuyor.");
        result = { kind: "task", value: t };
      }
      if (!cache.current()) return;
      setBase(result);
      setSaved(true);
      guard.markSaved();
      cache.changed();
    } catch (e) {
      if (!cache.current()) return;
      if (e instanceof ApiError) {
        if (e.outcomeUnknown || e.kind === "protocol") {
          setUnknown(true);
          setBlocked(true);
          setChecked(false);
        }
        if ([404, 409].includes(e.status)) setBlocked(true);
      }
      setFailure(supportFailure(e));
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
      const next: Source =
        base.kind === "day"
          ? {
              kind: "day",
              value: readSupportDay(
                await session.api.read("/api/support/days/{date}", { path: { date: base.value.localDate } }),
                base.value.localDate,
              ),
            }
          : {
              kind: "task",
              value: readTask(await session.api.read("/api/tasks/{id}", { path: { id: base.value.id } })),
            };
      if (next.kind === "task" && base.kind === "task" && next.value.id !== base.value.id)
        throw new ApiError("protocol", "Görev kimliği uyuşmuyor.");
      if (!cache.current()) return;
      setLatest(next);
      setChecked(true);
      cache.changed();
    } catch (e) {
      if (cache.current()) setFailure(supportFailure(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function rebase() {
    if (!latest || unknown) return;
    if (energy === valueEnergy(base)) setEnergy(valueEnergy(latest));
    if (
      base.kind === "day" &&
      latest.kind === "day" &&
      JSON.stringify(ids) === JSON.stringify(base.value.criticalTaskIds)
    )
      setIds(latest.value.criticalTaskIds);
    setBase(latest);
    setLatest(null);
    setBlocked(false);
    setChecked(false);
    setFailure("");
  }
  const locked = pending || blocked || saved;
  return (
    <Surface
      title={base.kind === "day" ? "Günlük destek seçimi" : "İşin efor ihtiyacı"}
      modal
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={pending || (unknown && !checked)}
    >
      <form
        className="support-form"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked}>
          <legend>{base.kind === "day" ? base.value.localDate : base.value.title}</legend>
          <label htmlFor={id}>
            {base.kind === "day" ? "Günlük efor düzeyi (isteğe bağlı)" : "İşin gerektirdiği efor (isteğe bağlı)"}
          </label>
          <select id={id} value={energy ?? ""} onChange={e => setEnergy((e.target.value || null) as Energy | null)}>
            <option value="">Belirtmek istemiyorum</option>
            {Object.entries(energies).map(([v, label]) => (
              <option value={v} key={v}>
                {label}
              </option>
            ))}
          </select>
          <p className="muted">
            Efor bir sağlık değerlendirmesi değildir. Yalnız planlamada yumuşak bir tercih; süre, son teslim ve ön
            koşulların yerine geçmez.
          </p>
          {base.kind === "day" && <CriticalChoice ids={ids} change={setIds} />}
        </fieldset>
        {failure && (
          <p role="alert" className="form-error">
            {failure}
          </p>
        )}
        {blocked && !saved && (
          <button type="button" disabled={pending} onClick={() => void check()}>
            Güncel destek kaydını kontrol et
          </button>
        )}
        {latest && (
          <section aria-label="Sunucudaki destek seçimi">
            <h3>Sunucudaki güncel seçim</h3>
            <p>Efor: {valueEnergy(latest) ? energies[valueEnergy(latest)!] : "Belirtilmemiş"}</p>
            {latest.kind === "day" && <CriticalNames ids={latest.value.criticalTaskIds} />}
            {!unknown && (
              <button type="button" disabled={pending} onClick={rebase}>
                Taslağımı güncel kayıtla hazırla
              </button>
            )}
            {unknown && (
              <p>Kayıt yeniden okundu; bu okuma kaybolan komutun yanıtı değildir. Eski istek tekrar gönderilmedi.</p>
            )}
          </section>
        )}
        {saved && <p role="status">Destek seçimi kaydedildi.</p>}
        <div className="actions">
          <button className="primary" disabled={locked || !dirty}>
            {pending ? "Kaydediliyor…" : "Destek seçimini kaydet"}
          </button>
          <button type="button" disabled={pending || (unknown && !checked)} onClick={guard.requestClose}>
            {saved || checked ? "Kapat" : "Vazgeç"}
          </button>
        </div>
      </form>
    </Surface>
  );
}

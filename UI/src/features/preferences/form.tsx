"use client";
import { useLayoutEffect, useRef, useState, type FormEvent, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import {
  buildValues,
  clock,
  days,
  readSnapshot,
  toDraft,
  type Draft,
  type FieldIssue,
  type Preferences,
  type Snapshot,
} from "./model";
import { CalendarFields } from "./calendar-fields";
import { TimeZoneField } from "./time-zone-field";
import { useUnsaved } from "./use-unsaved";
import { updateDisplayPreferences } from "../workspace/queries";

/** onDirty Ayarlar penceresinin bölüm değiştirirken ve kapanırken taslağı sormasını sağlar. */
export function PreferencesForm({ initial, onDirty }: { initial: Snapshot; onDirty?: (dirty: boolean) => void }) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial.values));
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const focusFailure = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(base.values));
  const key = queryKeys.resource(state.user!.id, "preferences");
  const mutation = useMutation({
    mutationFn: async (values: Preferences) => {
      const result = await session.api
        .mutation("/api/preferences", "put", { body: { version: base.version, values } })
        .execute();
      try {
        return readSnapshot(result);
      } catch {
        throw new ApiError(
          "protocol",
          "Kayıt yanıtı eksik. Sunucudaki durumu kontrol et.",
          200,
          undefined,
          {},
          undefined,
          undefined,
          true,
        );
      }
    },
  });
  useLayoutEffect(() => {
    if (focusFailure.current && failure && !mutation.isPending && !checking) {
      focusFailure.current = false;
      errorBox.current?.focus();
    }
  }, [failure, mutation.isPending, checking]);
  useUnsaved(dirty || mutation.isPending);
  useEffect(() => {
    onDirty?.(dirty || mutation.isPending);
  }, [dirty, mutation.isPending, onDirty]);
  function change(next: Draft) {
    setDraft(next);
    setMessage("");
    setIssues([]);
  }
  function focusError() {
    focusFailure.current = true;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current || blocked) return;
    setMessage("");
    setFailure("");
    const built = buildValues(base.values, draft);
    setIssues(built.errors);
    if (built.errors.length) {
      const first = built.errors[0].path;
      requestAnimationFrame(() => {
        const control = [
          ...(form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]") ?? []),
        ].find(element => element.name === first);
        control?.closest("details")?.setAttribute("open", "");
        control?.focus();
      });
      return;
    }
    busy.current = true;
    try {
      const result = await mutation.mutateAsync(built.values);
      if (session.getSnapshot().user?.id !== state.user!.id) return;
      client.setQueryData(key, result);
      await updateDisplayPreferences(client, state.user!.id, result);
      setBase(result);
      setDraft(toDraft(result.values));
      setLatest(null);
      setMessage("Çalışma saatlerin ve tercihlerin kaydedildi.");
      await client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "working-hours").slice(0, 3) });
    } catch (error) {
      if (session.getSnapshot().user?.id !== state.user!.id) return;
      if (error instanceof ApiError && ["identity-changed", "not-authenticated"].includes(error.kind)) return;
      const conflict = error instanceof ApiError && error.status === 409;
      const uncertain = error instanceof ApiError && error.outcomeUnknown;
      setBlocked(conflict || uncertain);
      setFailure(
        conflict
          ? "Tercihler başka bir yerde değişti. Taslağın burada duruyor. Yeniden kaydetmeden önce güncel kaydı kontrol et."
          : uncertain
            ? "Kaydın sonucu alınamadı. Kaydedilmiş olabilir; otomatik tekrar gönderilmedi. Sunucudaki durumu kontrol et."
            : error instanceof ApiError && error.kind === "offline"
              ? error.message
              : error instanceof ApiError && error.status === 400
                ? "Sunucu bu değerleri kabul etmedi. Saat dilimini, tarihleri ve aralıkları kontrol et."
                : "Tercihler kaydedilemedi. Taslağın burada duruyor; yeniden deneyebilirsin.",
      );
      focusError();
    } finally {
      busy.current = false;
    }
  }
  async function check() {
    if (checking) return;
    setChecking(true);
    setLatest(null);
    try {
      const result = readSnapshot(await session.api.read("/api/preferences"));
      if (session.getSnapshot().user?.id === state.user!.id) setLatest(result);
    } catch {
      setFailure("Güncel tercihler alınamadı. Taslağın korundu; bağlantını kontrol edip yeniden yükle.");
      focusError();
    } finally {
      setChecking(false);
    }
  }
  function reconcile(keep: boolean) {
    if (!latest) return;
    setDraft(
      keep
        ? {
            ...toDraft(latest.values),
            timeZoneId: draft.timeZoneId,
            weekly: draft.weekly,
            exceptions: draft.exceptions,
          }
        : toDraft(latest.values),
    );
    setBase(latest);
    client.setQueryData(key, latest);
    void updateDisplayPreferences(client, state.user!.id, latest);
    setBlocked(false);
    setLatest(null);
    setFailure("");
    setIssues([]);
    setMessage(
      keep
        ? "Taslağın güncel kayıt üzerinden düzenlemeye açıldı. Kontrol edip Kaydet'i seç."
        : "Sunucudaki güncel tercihler yüklendi.",
    );
  }
  function issue(path: string) {
    return issues.find(item => item.path === path)?.message;
  }
  return (
    <>
      <form
        ref={form}
        className="preferences-form"
        onSubmit={event => void save(event)}
        noValidate
        aria-label="Çalışma saatleri ve tercihler"
      >
        <fieldset disabled={mutation.isPending || checking}>
          <CalendarFields draft={draft} errors={issues} change={change} />
          <TimeZoneField
            value={draft.timeZoneId}
            error={issue("timeZoneId")}
            change={value => change({ ...draft, timeZoneId: value })}
          />
        </fieldset>
        {failure && (
          <div ref={errorBox} className="form-error" role="alert" tabIndex={-1}>
            <p>{failure}</p>
            {blocked && (
              <button type="button" disabled={checking} onClick={() => void check()}>
                {checking ? "Kontrol ediliyor…" : "Sunucudaki durumu kontrol et"}
              </button>
            )}
          </div>
        )}
        {latest && (
          <section className="reconcile-panel" aria-label="Güncel tercihler">
            <h2>Sunucudaki güncel kayıt</h2>
            <p>{latest.values.timeZoneId}</p>
            <details>
              <summary>Güncel saatleri ve tercihleri incele</summary>
              <ul>
                {latest.values.weekly.map((item, i) => (
                  <li key={i}>
                    {days[item.dayOfWeek]} {clock(item.startMinute)}–{clock(item.endMinute)}
                  </li>
                ))}
              </ul>
              {!latest.values.weekly.length && <p>Haftalık saat yok; varsayılan olarak günün tamamı kullanılabilir.</p>}
              <ul>
                {latest.values.exceptions.map(item => (
                  <li key={item.date}>
                    {item.date}:{" "}
                    {item.intervals.length
                      ? item.intervals.map(range => `${clock(range.startMinute)}–${clock(range.endMinute)}`).join(", ")
                      : "Çalışma yok"}
                  </li>
                ))}
              </ul>
            </details>
            <div className="actions">
              <button type="button" onClick={() => reconcile(false)}>
                Sunucudaki değerleri kullan
              </button>
              <button type="button" onClick={() => reconcile(true)}>
                Taslağımı güncel kayıt üzerinden düzenle
              </button>
            </div>
            <p className="muted">
              Taslağını korursan buradaki saatler, istisnalar ve düzenlediğin tercihler sonraki kayıtta güncel
              değerlerin yerini alır.
            </p>
          </section>
        )}
        <p className="muted preferences-save-status" role="status">
          {message || (dirty ? "Kaydedilmemiş değişiklikler var." : "Kaydedilmemiş değişiklik yok.")}
        </p>
        <div className={`preferences-save r2-save-bar${dirty ? " dirty" : ""}`}>
          <button type="submit" className="primary" disabled={!dirty || mutation.isPending || blocked || checking}>
            {mutation.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            disabled={!dirty || mutation.isPending || checking || blocked}
            onClick={() => {
              if (window.confirm("Bu formdaki değişiklikleri bırakıp son yüklenen değerlere dönmek istiyor musun?")) {
                setDraft(toDraft(base.values));
                setIssues([]);
                setFailure("");
                setMessage("");
              }
            }}
          >
            Değişiklikleri bırak
          </button>
        </div>
      </form>
    </>
  );
}

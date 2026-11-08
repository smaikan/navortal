"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { useDisplayPreferences } from "../workspace/queries";
import { useWork } from "../work/coordinator";
import { clock } from "../work/model";
import { FocusClock, FocusMetrics } from "./clock";
import { FocusControls } from "./controls";
import { focusFailure, labels, pageSize, settingsLabel, type Focus, type Preset } from "./model";
import { useFocusCurrent, useFocusList, usePresets } from "./queries";
import { rhythmName, rhythmSummary } from "./rhythm";
import { RhythmPicker, type RhythmChoice } from "./rhythm-picker";
import { FeatureInfo } from "../../components/ui/feature-info";
import { DeferredInline } from "../../components/ui/deferred-inline";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";
const loadStart = () => import("./start-form").then(m => m.InlineStart);
const loadPreset = () => import("./preset-form").then(m => m.PresetForm);
type View = { kind: "start" } | { kind: "new" } | { kind: "edit"; preset: Preset };

export function FocusPage() {
  const preferences = useDisplayPreferences(),
    current = useFocusCurrent();
  return preferences.data ? (
    <Workspace zone={preferences.data.values.timeZoneId} current={current} />
  ) : preferences.isError ? (
    <p role="alert">
      Pomodoro tercihleri okunamadı.<button onClick={() => void preferences.refetch()}>Tercihleri yeniden oku</button>
    </p>
  ) : (
    <ListSkeleton label="Pomodoro hazırlanıyor…" rows={3} />
  );
}

const fromPreset = (p: Preset): RhythmChoice => ({
  key: `preset:${p.id}`,
  name: p.name,
  settings: p.settings,
  presetId: p.id,
  preset: p,
});
/** Alan değişince klavye odağı kaybolmasın; hedef çizilene kadar birkaç kare bekleyip sonraki doğal adıma geçiyor. */
function focusLater(selector: string) {
  let frames = 0;
  const attempt = () => {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) target.focus({ preventScroll: true });
    else if (++frames < 30) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
/** Sayaçtaki durum etiketi kısa; ayrıntı ayrı bir satırda. */
function stateTitle(f: Focus) {
  if (f.state === "Working" && f.effectiveTargetReached) return "Hedefe ulaştın";
  if (f.state === "AwaitingNext") return "Mola bitti";
  return labels[f.state];
}
function stateNotice(f: Focus) {
  if (f.settings.notificationsEnabled && f.targetEventId)
    return f.effectiveTargetReached
      ? "Hedefe ulaştın. Görev tamamlanmadı; hazır olduğunda molaya geç."
      : "Önceki hedef olayı korundu; güncel süre hedefin altında.";
  if (f.state === "AwaitingNext") return "Mola bitti. Hazır olduğunda sonraki döngüyü başlat.";
  return "";
}
const tone = (f: Focus) =>
  f.state === "Paused"
    ? "paused"
    : f.state === "Break" || f.state === "AwaitingNext"
      ? "break"
      : f.effectiveTargetReached
        ? "reached"
        : "work";

/** Oturum varsa sayaç, yoksa ritim seçimi görünüyor. Başlatma ve özel ritim ritimlerin altında açılıyor; yan panel yok. */
function Workspace({ zone, current }: { zone: string; current: ReturnType<typeof useFocusCurrent> }) {
  const work = useWork();
  const [presetOffset, setPresetOffset] = useState(0),
    [listOffset, setListOffset] = useState(0),
    [historyOpen, setHistoryOpen] = useState(false);
  // Sonraki okumada aktif oturum kalmasa da sonucu çözülemeyen komut görünür kalsın.
  const [controlsOpen, setControlsOpen] = useState(false),
    [startHeld, setStartHeld] = useState(false);
  const [picked, setPicked] = useState<RhythmChoice | null>(null),
    [view, setView] = useState<View>({ kind: "start" }),
    [notice, setNotice] = useState("");
  const draft = useRef({ dirty: false, pending: false });
  const reportDraft = useCallback((state: { dirty: boolean; pending: boolean }) => {
    draft.current = state;
  }, []);
  const focus = current.data?.session;
  const presets = usePresets(presetOffset, !focus && !current.isPending);
  const history = useFocusList(listOffset, historyOpen);
  const stage = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false),
    [fullMessage, setFullMessage] = useState("");
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else
        setFullMessage("Bu tarayıcıda tam ekran desteklenmiyor. Odak denetimlerini normal görünümde kullanabilirsin.");
    } catch {
      setFullMessage("Tam ekran açılamadı. Odak denetimlerini normal görünümde kullanabilirsin.");
    }
  }
  // Sayfadan başlatılan odak açılınca klavye odağı sayacın ana düğmesine geçiyor.
  const started = useRef(false);
  const onStarted = useCallback(() => {
    started.current = true;
  }, []);
  useEffect(() => {
    if (!focus || !started.current) return;
    started.current = false;
    requestAnimationFrame(() =>
      stage.current
        ?.querySelector<HTMLElement>('[role="group"] button.primary:not(:disabled)')
        ?.focus({ preventScroll: true }),
    );
  }, [focus]);

  const builtIns: RhythmChoice[] = (presets.data?.builtIns ?? []).map((settings, index) => ({
    key: `built:${index}`,
    name: rhythmName(settings),
    settings,
  }));
  const choices = [...builtIns, ...(presets.data?.items.map(fromPreset) ?? [])];
  // Varsayılan seçim Klasik 25/5; kayıtlı ritim güncel listeden okunuyor ki sürümü eski kalmasın.
  const fallback = builtIns.find(c => c.settings.workSeconds === 1500) ?? builtIns[0];
  const fresh = picked?.presetId ? presets.data?.items.find(p => p.id === picked.presetId) : undefined;
  const selected = fresh ? fromPreset(fresh) : (picked ?? fallback);
  const selectedPreset = fresh ?? picked?.preset;
  const unavailable = controlsOpen || current.isPending || current.isError || work.busy || !!work.uncertain;
  const blocked = unavailable || startHeld;

  /** Taslak varken başka seçime geçmeden önce soruyoruz; kayıt sürerken hiç geçmiyoruz. */
  function leaveDraft() {
    if (view.kind === "start") return true;
    if (draft.current.pending) return false;
    return !draft.current.dirty || window.confirm("Kaydedilmemiş ritmi bırakmak istiyor musun?");
  }
  function pick(choice: RhythmChoice) {
    if (!leaveDraft()) return;
    setPicked(choice);
    setView({ kind: "start" });
    setNotice("");
  }
  const closeForm = useCallback(() => {
    setView({ kind: "start" });
    focusLater('.focus-edit, .focus-rhythm[aria-pressed="true"]:not(.focus-rhythm-new)');
  }, []);
  const savedForm = useCallback((preset: Preset) => {
    setPicked(fromPreset(preset));
    setView({ kind: "start" });
    setNotice(`“${preset.name}” kaydedildi ve seçildi.`);
    focusLater(".focus-start-button");
  }, []);

  if (current.isPending) return <p role="status">Güncel pomodoro okunuyor…</p>;
  return (
    <div className="focus-page">
      {(focus || current.isPending || current.isError || controlsOpen) && (
        <section ref={stage} className="focus-stage" aria-label="Güncel pomodoro">
          {current.isPending && <p role="status">Güncel pomodoro okunuyor…</p>}
          {current.isError && (
            <p role="alert" className="form-error">
              {focusFailure(current.error)}
              <button onClick={() => void current.refetch()}>Güncel odağı yeniden oku</button>
            </p>
          )}
          {focus && (
            <>
              <p className="focus-state" role="status" aria-live="polite" data-tone={tone(focus)}>
                {stateTitle(focus)}
              </p>
              <div className="focus-title">
                <h2>
                  {focus.taskId
                    ? work.work?.id === focus.workSessionId
                      ? (work.work.taskAtStart?.title ?? "Göreve bağlı pomodoro")
                      : "Göreve bağlı pomodoro"
                    : "Genel odak"}
                </h2>
                <p className="muted">{`${focus.presetName ?? rhythmName(focus.settings)} · ${settingsLabel(focus.settings)}`}</p>
              </div>
              <FocusClock
                focus={focus}
                zone={zone}
                receivedAt={current.data!.receivedAt}
                refresh={() => {
                  void current.refetch();
                }}
              />
              {stateNotice(focus) && (
                <p className="focus-notice" role="status">
                  {stateNotice(focus)}
                </p>
              )}
              {fullMessage && <p role="status">{fullMessage}</p>}
              {!work.online && (
                <p role="status">Bağlantı yok. Son sunucu durumu gösteriliyor; komutlar kuyruğa alınmaz.</p>
              )}
            </>
          )}
          <FocusControls
            focus={current.isError ? null : (focus ?? null)}
            refresh={() => {
              void current.refetch();
            }}
            hold={setControlsOpen}
            extra={[
              { label: full ? "Tam ekrandan çık" : "Tam ekran odak", onSelect: () => void fullscreen() },
              {
                label: "Güncel odağı kontrol et",
                disabled: current.isPending,
                onSelect: () => void current.refetch(),
              },
            ]}
          />
          {focus && <FocusMetrics focus={focus} receivedAt={current.data!.receivedAt} />}
        </section>
      )}
      {!focus && (
        <section className="focus-presets" aria-labelledby="focus-presets-title">
          <div className="focus-presets-head">
            <h2 id="focus-presets-title" tabIndex={-1}>
              Ritmini seç
            </h2>
            <FeatureInfo title="Pomodoro nedir?">
              <p>
                Pomodoro, tek bir işe ayırdığın çalışma süresini kısa molalarla bölmene yardımcı olan bir yöntemdir.
              </p>
              <h3>Kendi ritmini seç</h3>
              <p>
                25 dakika çalışma ve 5 dakika mola ile başlayabilir, daha kısa veya uzun bir ritim seçebilirsin. Genel
                odak açabilir ya da bir görev seçebilirsin.
              </p>
              <h3>Süre ve görev ayrı</h3>
              <p>
                Çalışma süresi gerçek çalışma kaydındır; molalar bu süreye eklenmez. Sürenin dolması görevi tamamlamaz.
                Duraklatabilir, devam edebilir veya oturumu bitirebilirsin.
              </p>
            </FeatureInfo>
          </div>
          {presets.isPending && <p role="status">Ritimler okunuyor…</p>}
          {presets.isError && (
            <p role="alert">
              {focusFailure(presets.error)}
              <button onClick={() => void presets.refetch()}>Ritimleri yeniden oku</button>
            </p>
          )}
          {presets.data && (
            <RhythmPicker
              choices={choices}
              selected={view.kind === "new" ? undefined : selected?.key}
              disabled={blocked}
              pick={pick}
              creating={view.kind === "new"}
              create={() => {
                if (view.kind === "new" || !leaveDraft()) return;
                setView({ kind: "new" });
                setNotice("");
                focusLater(".focus-composer h3[tabindex]");
              }}
            />
          )}
          {Number(presets.data?.total ?? 0) > pageSize && (
            <div className="actions">
              <button
                disabled={!presetOffset || presets.isFetching}
                onClick={() => setPresetOffset(presetOffset - pageSize)}
              >
                Önceki ritimler
              </button>
              <button
                disabled={
                  presets.isFetching ||
                  presetOffset + pageSize >= Number(presets.data?.total ?? 0) ||
                  presetOffset >= 100000
                }
                onClick={() => setPresetOffset(presetOffset + pageSize)}
              >
                Sonraki ritimler
              </button>
            </div>
          )}
          {presets.data && view.kind === "start" && selected && (
            <section className="focus-composer" aria-label="Pomodoro başlat">
              <div className="focus-composer-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="muted">{rhythmSummary(selected.settings)}</p>
                </div>
                {selectedPreset && (
                  <button
                    type="button"
                    className="focus-edit"
                    disabled={blocked}
                    aria-label={`${selectedPreset.name} ritmini düzenle`}
                    onClick={() => {
                      setNotice("");
                      setView({ kind: "edit", preset: selectedPreset });
                      focusLater(".focus-composer h3[tabindex]");
                    }}
                  >
                    <Pencil aria-hidden="true" size={14} />
                    Ritmi düzenle
                  </button>
                )}
              </div>
              {notice && (
                <p role="status" className="focus-saved">
                  {notice}
                </p>
              )}
              <DeferredInline
                load={loadStart}
                props={{
                  selectionKey: selected.key,
                  selection: { name: selected.name, settings: selected.settings, presetId: selected.presetId },
                  zone,
                  started: onStarted,
                  hold: setStartHeld,
                  disabled: unavailable,
                }}
              />
            </section>
          )}
          {view.kind !== "start" && (
            <section className="focus-composer" aria-label={view.kind === "new" ? "Özel ritim" : "Ritmi düzenle"}>
              <div className="focus-composer-head">
                <h3 tabIndex={-1}>
                  {view.kind === "new" ? "Yeni özel ritim" : `“${view.preset.name}” ritmini düzenle`}
                </h3>
              </div>
              <DeferredInline
                key={view.kind === "new" ? "new" : view.preset.id}
                load={loadPreset}
                props={{
                  preset: view.kind === "edit" ? view.preset : undefined,
                  saved: savedForm,
                  close: closeForm,
                  report: reportDraft,
                }}
              />
            </section>
          )}
        </section>
      )}
      <section className="focus-history" aria-labelledby="focus-history-title">
        <button
          type="button"
          className="r2-fold"
          aria-expanded={historyOpen}
          aria-controls="focus-history-list"
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <ChevronRight aria-hidden="true" size={14} />
          <span id="focus-history-title">Geçmiş oturumlar</span>
          {history.data && <span className="r2-count">{String(history.data.total)}</span>}
        </button>
        {historyOpen && (
          <div id="focus-history-list">
            {history.isError && (
              <p role="alert">
                {focusFailure(history.error)}
                <button onClick={() => void history.refetch()}>Oturumları yeniden oku</button>
              </p>
            )}
            {history.isPending && <p role="status">Oturumlar okunuyor…</p>}
            {history.data && !history.data.total && <p className="r2-hint">Henüz pomodoro oturumu yok.</p>}
            <ul className="focus-history-list">
              {history.data?.items.map(f => (
                <li key={f.id}>
                  <time dateTime={f.startedAt}>
                    {new Intl.DateTimeFormat("tr-TR", {
                      timeZone: zone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(f.startedAt))}
                  </time>
                  <strong>{f.taskId ? "Göreve bağlı pomodoro" : "Genel odak"}</strong>
                  <span>
                    Döngü {f.cycleNumber} · {labels[f.state]}
                  </span>
                  <span>{clock(Number(f.activeSeconds))}</span>
                </li>
              ))}
            </ul>
            {Number(history.data?.total ?? 0) > pageSize && (
              <div className="actions">
                <button
                  disabled={!listOffset || history.isFetching}
                  onClick={() => setListOffset(listOffset - pageSize)}
                >
                  Önceki oturumlar
                </button>
                <button
                  disabled={
                    history.isFetching ||
                    listOffset + pageSize >= Number(history.data?.total ?? 0) ||
                    listOffset >= 100000
                  }
                  onClick={() => setListOffset(listOffset + pageSize)}
                >
                  Sonraki oturumlar
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

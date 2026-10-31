"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useDisplayPreferences } from "../workspace/queries";
import { useWork } from "../work/coordinator";
import { clock } from "../work/model";
import { FocusClock } from "./clock";
import { FocusControls } from "./controls";
import { focusFailure, labels, pageSize, settingsLabel, type Preset, type Settings } from "./model";
import { useFocusCurrent, useFocusList, usePresets } from "./queries";
import { FeatureInfo } from "../../components/ui/feature-info";
import { DeferredPanel } from "../../components/ui/deferred-panel";
import "./styles.css";
import { ListSkeleton } from "../../components/ui/skeleton";
const loadPreset = () => import("./preset-dialog").then(m => m.PresetDialog);
const loadStart = () => import("./start-dialog").then(m => m.StartDialog);
type Action =
  | { kind: "preset"; preset?: Preset; trigger: HTMLElement }
  | { kind: "start"; name: string; presetId?: string; settings: Settings; trigger: HTMLElement };
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
/** Oturum varsa onu gösteriyoruz. Yoksa ritme basınca başlatma seçimi açılıyor. Geçmiş kapalı başlıyor. */
function Workspace({ zone, current }: { zone: string; current: ReturnType<typeof useFocusCurrent> }) {
  const work = useWork();
  const [presetOffset, setPresetOffset] = useState(0),
    [listOffset, setListOffset] = useState(0),
    [action, setAction] = useState<Action | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Sonraki okumada aktif oturum kalmasa da sonucu çözülemeyen komut görünür kalsın.
  const [controlsOpen, setControlsOpen] = useState(false);
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
  const blocked = controlsOpen || !!action || current.isPending || current.isError || work.busy || !!work.uncertain;
  if (current.isPending) return <p role="status">Güncel pomodoro okunuyor…</p>;
  return (
    <div className="focus-page">
      <div className="focus-info">
        <FeatureInfo title="Pomodoro nedir?">
          <p>Pomodoro, tek bir işe ayırdığın çalışma süresini kısa molalarla bölmene yardımcı olan bir yöntemdir.</p>
          <h3>Kendi ritmini seç</h3>
          <p>
            25 dakika çalışma ve 5 dakika mola ile başlayabilir, daha kısa veya uzun bir ritim seçebilirsin. Genel odak
            açabilir ya da bir görev seçebilirsin.
          </p>
          <h3>Süre ve görev ayrı</h3>
          <p>
            Çalışma süresi gerçek çalışma kaydındır; molalar bu süreye eklenmez. Sürenin dolması görevi tamamlamaz.
            Duraklatabilir, devam edebilir veya oturumu bitirebilirsin.
          </p>
        </FeatureInfo>
      </div>
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
              <p className="focus-state" role="status" aria-live="polite">
                <span>{labels[focus.state]}</span>
                <span>
                  {focus.settings.notificationsEnabled && focus.targetEventId
                    ? focus.effectiveTargetReached
                      ? " · Hedefe ulaştın. Görev tamamlanmadı."
                      : " · Önceki hedef olayı korundu; güncel süre hedefin altında."
                    : ""}
                </span>
              </p>
              <h2>
                {focus.taskId
                  ? work.work?.id === focus.workSessionId
                    ? (work.work.taskAtStart?.title ?? "Göreve bağlı pomodoro")
                    : "Göreve bağlı pomodoro"
                  : "Genel odak"}
              </h2>
              <p className="muted">
                {`${focus.presetName ?? "Özel ritim"} · ${settingsLabel(focus.settings)} · Döngü ${focus.cycleNumber}`}
              </p>
              <FocusClock
                focus={focus}
                receivedAt={current.data!.receivedAt}
                refresh={() => {
                  void current.refetch();
                }}
              />
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
                disabled: !!action || current.isPending,
                onSelect: () => void current.refetch(),
              },
            ]}
          />
        </section>
      )}
      {!focus && (
        <section className="focus-presets" aria-labelledby="focus-presets-title">
          <h2 id="focus-presets-title" tabIndex={-1} className="r2-small-heading">
            Ritim
          </h2>
          {presets.isPending && <p role="status">Ritimler okunuyor…</p>}
          {presets.isError && (
            <p role="alert">
              {focusFailure(presets.error)}
              <button onClick={() => void presets.refetch()}>Ritimleri yeniden oku</button>
            </p>
          )}
          <ul className="r2-rhythms">
            {presets.data?.builtIns.map((s, i) => {
              const name = `${s.workSeconds / 60}/${s.shortBreakSeconds / 60}`;
              return (
                <li key={i}>
                  <button
                    className="r2-rhythm"
                    disabled={blocked}
                    onClick={e => setAction({ kind: "start", name, settings: s, trigger: e.currentTarget })}
                  >
                    <strong>{name}</strong>
                    <span>{settingsLabel(s)}</span>
                  </button>
                </li>
              );
            })}
            {presets.data?.items.map(p => (
              <li key={p.id} className="r2-rhythm-saved">
                <button
                  className="r2-rhythm"
                  disabled={blocked}
                  onClick={e =>
                    setAction({
                      kind: "start",
                      name: p.name,
                      presetId: p.id,
                      settings: p.settings,
                      trigger: e.currentTarget,
                    })
                  }
                >
                  <strong>{p.name}</strong>
                  <span>{settingsLabel(p.settings)}</span>
                </button>
                <button
                  className="r2-quiet"
                  disabled={!!action}
                  aria-label={`${p.name} ayarını düzenle`}
                  onClick={e => setAction({ kind: "preset", preset: p, trigger: e.currentTarget })}
                >
                  Düzenle
                </button>
              </li>
            ))}
            <li>
              <button
                className="r2-rhythm r2-rhythm-new"
                disabled={!!action}
                onClick={e => setAction({ kind: "preset", trigger: e.currentTarget })}
              >
                <Plus aria-hidden="true" size={14} />
                Özel ritim
              </button>
            </li>
          </ul>
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
      {action && (
        <>
          {action.kind === "preset" ? (
            <DeferredPanel
              key="preset"
              load={loadPreset}
              title="Özel ritim"
              trigger={action.trigger}
              close={() => setAction(null)}
              props={{ preset: action.preset, trigger: action.trigger, close: () => setAction(null) }}
            />
          ) : (
            <DeferredPanel
              key="start"
              load={loadStart}
              title="Pomodoro başlat"
              trigger={action.trigger}
              close={() => setAction(null)}
              props={{ selection: action, zone, trigger: action.trigger, close: () => setAction(null) }}
            />
          )}
        </>
      )}
    </div>
  );
}

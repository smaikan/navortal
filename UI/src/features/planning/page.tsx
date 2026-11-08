"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { openSettings } from "../preferences/settings-url";
import { lazy, Suspense, useCallback, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { shiftDate } from "../../lib/time/date-only";
import { Surface } from "../../components/ui/surface";
import { Menu } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useDisplayPreferences } from "../workspace/queries";
import { localToday, validDate } from "../preferences/model";
import { FirstSteps } from "../preferences/first-steps";
import { useWork } from "../work/coordinator";
import { useSession } from "../auth/provider";
import { readTask, type Task } from "../tasks/model";
import { ImmediateSwitch, WorkFeedback } from "../work/player";
import { Shuffle } from "lucide-react";
import { energies, quickSettings } from "../support/model";
import { useSupports } from "../preferences/supports";
import { useDaySignals } from "./signals-queries";
import { NewTip } from "../../components/ui/new-tip";
import { DayNav } from "./day-nav";
import { ListSkeleton } from "../../components/ui/skeleton";
import { useFirstData } from "../../lib/first-data";
import { phaseOf, useMinute } from "./agenda-blocks";
import { useDayActions, type DayActions } from "./day-actions";
import { AddToPlan, AssignedList } from "./add-to-plan";
import type { DayNoteEditor } from "../notes/day-section";
import { entryFacts, orderEntries, PlanRow } from "./day-plan";
import { useOverviewDay, useOverviewItems, useOverviewSchedules, useOverviewSupport } from "./overview-queries";
import { hintsByTask, useDayHints } from "./glance";
import { LiveDayBar } from "./day-bar";
import { LiveNudges } from "./live-nudges";
import { useAccuracy } from "./calibration";
import { planFailure, type Day, type DayItem, type Schedule } from "./model";
import "./styles.css";
import "./day-tools.css";
const MoveDialog = lazy(() => import("./move-dialog").then(m => ({ default: m.MoveDialog })));
const PoolDialog = lazy(() => import("../calendar/pool-dialog").then(m => ({ default: m.PoolDialog })));
// Bazı günlerde gereken destekler isteğe göre yüklenir. Bugün ilk JS yükü küçük kalsın.
const OneThing = lazy(() => import("./one-thing").then(m => ({ default: m.OneThing })));
const ResumeCard = lazy(() => import("./resume-card").then(m => ({ default: m.ResumeCard })));
const SpecialToday = lazy(() => import("../special-days/today").then(m => ({ default: m.SpecialToday })));
const TaskDeferralDialog = lazy(() => import("./task-deferral-dialog").then(m => ({ default: m.TaskDeferralDialog })));
const DayReview = lazy(() => import("../support/end-preparation").then(m => ({ default: m.EndPreparationDialog })));
const CardPick = lazy(() => import("./card-pick").then(m => ({ default: m.CardPick })));
// Notlar ve rutin önizlemesi tarih kitaplığını çeker; plan listesi onları beklemeden açılır.
const DayNotes = lazy(() => import("../notes/day-section").then(m => ({ default: m.DayNotes })));
const ProjectedDay = lazy(() => import("../recurrence/projection").then(m => ({ default: m.ProjectedDay })));
const FocusStart = lazy(() => import("../focus/start-dialog").then(m => ({ default: m.StartDialog })));

export function TodayAgenda() {
  const prefs = useDisplayPreferences();
  const values = useFirstData(prefs.data)?.values;
  if (!values)
    return prefs.isError ? (
      <p role="alert">
        Çalışma tercihlerin alınamadı.<button onClick={() => void prefs.refetch()}>Yeniden yükle</button>
      </p>
    ) : (
      <ListSkeleton label="Gün planı okunuyor…" />
    );
  return <Agenda zone={values.timeZoneId} format={values.timeFormat} setupDone={values.hasWorkingWindows} />;
}
/** Gün date sorgusundan gelir, yoksa bugün gösterilir. Gün değişince başlık ve menü durur, yalnız liste güne göre yenilenir. */
function Agenda({ zone, format, setupDone }: { zone: string; format: string; setupDone: boolean }) {
  const today = localToday(zone);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("date");
  const date = requested ?? today;
  const valid = validDate(date);
  const day = useOverviewDay(valid ? date : today);
  const blocks = useOverviewSchedules(valid ? date : today);
  const items = useOverviewItems(valid ? date : today);
  const work = useWork();
  const [dialog, setDialog] = useState<MenuDialog | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ date: string; editor: DayNoteEditor; dirty: boolean } | null>(null);
  const activeDraft = noteDraft?.date === date ? noteDraft : null;
  const noteEditor = activeDraft?.editor ?? null;
  const setNoteDirty = useCallback(
    (dirty: boolean) =>
      setNoteDraft(current => (current?.date === date && current.dirty !== dirty ? { ...current, dirty } : current)),
    [date],
  );
  const { supports, set: setSupports, pending: supportsPending } = useSupports();
  const calm = supports.calmView;
  const close = () => {
    setDialog(null);
  };
  const current = useFirstData(valid && day.data?.localDate === date ? day.data : undefined) ?? null;
  function setNoteEditor(editor: DayNoteEditor | null) {
    if (editor) setNoteDraft({ date, editor, dirty: false });
    else setNoteDraft(current => (current?.date === date ? null : current));
  }
  function change(next: string) {
    if (next === date || (activeDraft?.dirty && !window.confirm("Kaydedilmemiş notu bırakmak istiyor musun?"))) return;
    setNoteEditor(null);
    const query = new URLSearchParams(params);
    if (next === today) query.delete("date");
    else query.set("date", next);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  /** Seçili görünüm URL'de kalır. Geri ve bağlantılar onu korur. */
  function setParam(name: string, value: string | null) {
    const query = new URLSearchParams(params);
    if (value === null) query.delete(name);
    else query.set(name, value);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }
  const oneThing = params.get("gorunum") === "tek" || (!params.has("gorunum") && supports.openTodayAsOneThing);
  return (
    <>
      <div className="r2-day-head">
        <DayNav date={valid ? date : today} today={today} change={change} />
        <div className="day-view-switch" role="radiogroup" aria-label="Görünüm">
          <button
            type="button"
            role="radio"
            aria-checked={!oneThing}
            onClick={() => setParam("gorunum", supports.openTodayAsOneThing ? "liste" : null)}
          >
            Liste
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={oneThing}
            onClick={() => setParam("gorunum", supports.openTodayAsOneThing ? null : "tek")}
          >
            Tek görev
          </button>
        </div>
        <Menu
          label="Plan menüsü"
          items={[
            {
              label: "Sakin görünüm",
              ariaLabel: calm ? "Sakin görünüm: açık, kapat" : "Sakin görünüm: kapalı, aç",
              disabled: supportsPending,
              content: (
                <span className={`calm-toggle${calm ? " on" : ""}`}>
                  <span>Sakin görünüm</span>
                  <span className="calm-switch" aria-hidden="true" />
                </span>
              ),
              onSelect: () => void setSupports({ calmView: !calm }),
            },
            { label: "Görev Ertele", disabled: !current, onSelect: trigger => setDialog({ kind: "defer", trigger }) },
            {
              label: "Güne not ekle",
              disabled: !valid || !!noteEditor,
              onSelect: trigger => setNoteEditor({ trigger }),
            },
            {
              label: "Gün sonunu gözden geçir",
              disabled: !current,
              onSelect: trigger => setDialog({ kind: "review", trigger }),
            },
            {
              label: "Acil işe geç",
              disabled: work.busy,
              onSelect: trigger => setDialog({ kind: "immediate", trigger }),
            },
            { label: "Çalışma saatleri", separator: true, onSelect: () => openSettings("hours") },
          ]}
        />
      </div>
      {valid && (
        <Suspense fallback={null}>
          <DayNotes
            key={`notes-${date}`}
            date={date}
            zone={zone}
            editor={noteEditor}
            setEditor={setNoteEditor}
            onDirty={setNoteDirty}
          />
        </Suspense>
      )}
      {!valid ? (
        <p role="alert">Geçerli bir plan günü seç.</p>
      ) : !current ? (
        day.isError ? (
          <div role="alert" className="form-error">
            {planFailure(day.error)}
            <button onClick={() => void day.refetch()}>Planı yeniden yükle</button>
          </div>
        ) : (
          <ListSkeleton label="Gün planı okunuyor…" />
        )
      ) : (
        <DayContent
          key={date}
          day={current}
          blocks={blocks}
          items={items}
          today={today}
          format={format}
          stale={day.isError}
          retry={() => void day.refetch()}
          calm={calm}
          oneThing={oneThing}
        />
      )}
      {/* Liste doluyken kurulum metni yer kaplamaz; çalışma saatleri plan menüsünden açılır. */}
      {!setupDone && blocks.data && items.data && Number(blocks.data.total) + Number(items.data.total) === 0 && (
        <details open className="agenda-setup">
          <summary>Çalışma saatleri ve ilk adımlar</summary>
          <FirstSteps />
        </details>
      )}
      {current && dialog?.kind === "defer" && (
        <Suspense fallback={<p role="status">Erteleme açılıyor…</p>}>
          <TaskDeferralDialog key={date} day={current} trigger={dialog.trigger} close={close} />
        </Suspense>
      )}
      {current && dialog?.kind === "review" && (
        <Suspense fallback={<p role="status">Gün özeti açılıyor…</p>}>
          <DayReview key={date} date={date} format={format} trigger={dialog.trigger} close={close} />
        </Suspense>
      )}
      {dialog?.kind === "immediate" && <ImmediateSwitch trigger={dialog.trigger} close={close} date={date} />}
    </>
  );
}
type MenuDialog = {
  kind: "defer" | "review" | "immediate";
  trigger: HTMLElement;
};
type RowDialog =
  | { kind: "move"; block: Schedule; trigger: HTMLElement }
  | { kind: "move-item"; item: DayItem; trigger: HTMLElement }
  | { kind: "pool"; task: Task; trigger: HTMLElement };

function DayContent({
  day,
  blocks,
  items,
  today,
  format,
  stale,
  retry,
  calm,
  oneThing,
}: {
  day: Day;
  blocks: ReturnType<typeof useOverviewSchedules>;
  items: ReturnType<typeof useOverviewItems>;
  today: string;
  format: string;
  stale: boolean;
  retry: () => void;
  calm: boolean;
  oneThing: boolean;
}) {
  const date = day.localDate,
    zone = day.timeZoneId,
    isToday = date === today;
  const actions = useDayActions(date, zone);
  const blockData = useFirstData(blocks.data),
    itemData = useFirstData(items.data);
  const work = useWork();
  const openTask = useTaskPanel();
  const now = useMinute();
  const [dialog, setDialog] = useState<RowDialog | null>(null);
  const close = () => setDialog(null);
  const { supports } = useSupports();
  const dayHints = useDayHints(date).data;
  const hints = hintsByTask(dayHints ? { hints: dayHints } : undefined);
  const support = useOverviewSupport(date);
  const signals = useDaySignals(
    date,
    isToday && (supports.nudges || (supports.resumeCard && work.ready && work.work?.state !== "Running")),
  );
  const hinting = supports.calibrationHints && !calm;
  // Saat düzenleyicisi açılınca okunur, Bugün ilk çizimde beklemez.
  const [wantRatio, setWantRatio] = useState(false);
  const accuracy = useAccuracy(today, hinting && wantRatio);
  const ratio = hinting ? (accuracy.data?.medianRatio ?? null) : null;
  const supportsEnabled = support.data?.enabled === true;
  const [picking, setPicking] = useState<HTMLElement | null>(null);
  const [five, setFive] = useState<{ taskId: string; title: string; trigger: HTMLElement } | null>(null);
  const { session } = useSession();
  const [poolFailure, setPoolFailure] = useState("");
  // Havuza taşıma için görevin son sürümü pencere açılmadan hemen önce okunur.
  async function openPool(taskId: string, trigger: HTMLElement) {
    setPoolFailure("");
    try {
      setDialog({
        kind: "pool",
        task: readTask(await session.api.read("/api/tasks/{id}", { path: { id: taskId } })),
        trigger,
      });
    } catch (error) {
      setPoolFailure(planFailure(error));
    }
  }
  const canStart = !work.busy && !work.uncertain && work.online && work.work?.state !== "Running";
  const loaded = !!blockData && !!itemData;
  const { timed, untimed } = orderEntries(
    blockData?.items.filter(block => block.state === "Planned") ?? [],
    itemData?.items ?? [],
  );
  const planned = new Set(
    [...timed, ...untimed].map(entry => entryFacts(entry).taskId).filter((id): id is string => !!id),
  );
  const plannedTitles = new Set(
    [...timed, ...untimed]
      .filter(entry => !!entryFacts(entry).taskId)
      .map(entry => entryFacts(entry).title.toLocaleLowerCase("tr")),
  );
  const total = Number(blockData?.total ?? 0) + Number(itemData?.total ?? 0);
  const all = [...timed, ...untimed];
  const nextEntry = all.find(entry => !entryFacts(entry).done);
  const cards = untimed.flatMap(entry => {
    const facts = entryFacts(entry);
    if (!facts.taskId || facts.done) return [];
    const energy = hints.get(facts.taskId)?.energyDemand ?? (entry.kind === "item" ? entry.item.energyDemand : null);
    const meta = [energy && `Efor: ${energies[energy]}`, facts.estimate].filter(Boolean).join(" · ");
    return [{ taskId: facts.taskId, title: facts.title, meta }];
  });
  const currentBlock = isToday
    ? timed
        .map(entry => (entry.kind === "block" ? entry.block : null))
        .find(block => !!block && !block.completedAt && phaseOf(block, now) === "current")
    : undefined;
  const { state: auth } = useSession();
  const row = (entry: (typeof timed)[number]) => {
    const facts = entryFacts(entry);
    const block = entry.kind === "block" ? entry.block : null;
    return (
      <PlanRow
        hint={facts.taskId ? hints.get(facts.taskId) : undefined}
        ratio={ratio}
        onEdit={() => setWantRatio(true)}
        supportsEnabled={supportsEnabled}
        next={entry === nextEntry}
        five={trigger => {
          if (facts.taskId) setFive({ taskId: facts.taskId, title: facts.title, trigger });
        }}
        key={`${entry.kind}:${block?.id ?? (entry.kind === "item" ? entry.item.id : "")}`}
        entry={entry}
        date={date}
        zone={zone}
        format={format}
        now={now}
        actions={actions}
        canStart={canStart}
        phase={block && isToday ? phaseOf(block, now) : null}
        start={() => {
          if (facts.taskId) void work.start(facts.taskId, block && block.kind === "Work" ? block : undefined);
        }}
        openTask={trigger => {
          if (facts.taskId) openTask(facts.taskId, trigger);
        }}
        move={trigger =>
          setDialog(
            block
              ? { kind: "move", block, trigger }
              : { kind: "move-item", item: (entry as { item: DayItem }).item, trigger },
          )
        }
        pool={block?.kind === "Work" && facts.taskId ? trigger => void openPool(facts.taskId!, trigger) : undefined}
      />
    );
  };
  return (
    <>
      {stale && (
        <div role="alert" className="form-error">
          Güncel plan okunamadı; son doğrulanan görünüm korunuyor.<button onClick={retry}>Planı yeniden yükle</button>
        </div>
      )}
      {isToday && (
        <Suspense fallback={null}>
          <SpecialToday date={date} />
        </Suspense>
      )}
      {isToday && supports.resumeCard && work.ready && work.work?.state !== "Running" && (
        <Suspense fallback={null}>
          <ResumeCard
            key={`${auth.user!.id}:${date}`}
            date={date}
            thresholdSeconds={Number(signals.data?.returnThresholdSeconds ?? 1800)}
          />
        </Suspense>
      )}
      {isToday && supports.nudges && (
        <LiveNudges date={date} blocks={blockData?.items ?? []} loaded={loaded} calm={calm} />
      )}
      {supports.dayBar && total > 0 && <LiveDayBar date={date} calm={calm} isToday={isToday} />}
      {(blocks.loadingMore || items.loadingMore) && (
        <p role="status" className="r2-hint">
          Kalan plan öğeleri okunuyor…
        </p>
      )}
      {oneThing && loaded && (blocks.hasMore || items.hasMore) && (
        <p className="r2-hint">
          {all.length}/{total} öğe yüklendi.
          {blocks.hasMore && (
            <button type="button" disabled={blocks.loadingMore} onClick={blocks.loadMore}>
              Kalan saatli öğeleri yükle
            </button>
          )}
          {items.hasMore && (
            <button type="button" disabled={items.loadingMore} onClick={items.loadMore}>
              Kalan saatsiz öğeleri yükle
            </button>
          )}
        </p>
      )}
      {oneThing && loaded ? (
        <>
          <NewTip id="one-thing">
            Tek görev görünümü yalnız şu anki işi gösterir; listeye istediğin an dönebilirsin.
          </NewTip>
          <Suspense fallback={<p role="status">Tek görev hazırlanıyor…</p>}>
            <OneThing
              date={date}
              zone={zone}
              format={format}
              entries={all}
              currentKey={currentBlock ? `block:${currentBlock.id}` : null}
              hints={hints}
              canStart={canStart}
              supportsEnabled={supportsEnabled}
              now={now}
              start={entry => {
                const facts = entryFacts(entry);
                const block = entry.kind === "block" ? entry.block : null;
                if (facts.taskId) void work.start(facts.taskId, block && block.kind === "Work" ? block : undefined);
              }}
              finish={entry => actions.toggle(entry)}
              five={(taskId, title, trigger) => setFive({ taskId, title, trigger })}
            />
          </Suspense>
        </>
      ) : (
        <section className="r2-dayplan" aria-label="Gün planı" data-plan-date={date}>
          {work.origin === "agenda" && <WorkFeedback className="agenda-feedback" />}
          {poolFailure && (
            <p role="alert" className="field-error">
              {poolFailure}
            </p>
          )}
          {(blocks.isError || items.isError) && (
            <div role="alert" className="form-error">
              {planFailure(blocks.error ?? items.error)}
              <button
                onClick={() => {
                  void blocks.refetch();
                  void items.refetch();
                }}
              >
                Planı yeniden yükle
              </button>
            </div>
          )}
          {!loaded ? (
            !blocks.isError && !items.isError && <ListSkeleton label="Gün planı okunuyor…" />
          ) : total === 0 ? (
            <EmptyDay date={date} planned={planned} actions={actions} />
          ) : (
            <>
              {!supports.dayBar && !calm && (
                <p className="r2-day-summary">{`${total} plan öğesi · ${blockData?.completedItemCount ?? 0} bitti`}</p>
              )}
              {(blocks.hasMore || items.hasMore) && (
                <p className="r2-day-summary">
                  {all.length}/{total} öğe yüklendi.
                </p>
              )}
              {timed.length > 0 && (
                <ol className="r2-plan-list" aria-label="Saatli plan öğeleri">
                  {timed.map(row)}
                </ol>
              )}
              {untimed.length > 0 && (
                <>
                  <div className="r2-plan-group-row">
                    <h2 className="r2-plan-group" id="r2-untimed">
                      Saati belirlenmemiş
                    </h2>
                    {cards.length > 0 && (
                      <button type="button" className="r2-card-pick" onClick={event => setPicking(event.currentTarget)}>
                        <Shuffle aria-hidden="true" size={14} />
                        Kart seç
                      </button>
                    )}
                  </div>
                  <ol className="r2-plan-list" aria-labelledby="r2-untimed">
                    {untimed.map(row)}
                  </ol>
                </>
              )}
              {blocks.hasMore && (
                <button type="button" disabled={blocks.loadingMore} onClick={blocks.loadMore}>
                  Kalan saatli öğeleri yükle
                </button>
              )}
              {items.hasMore && (
                <button type="button" disabled={items.loadingMore} onClick={items.loadMore}>
                  Kalan saatsiz öğeleri yükle
                </button>
              )}
              {date >= today && (
                <Suspense fallback={null}>
                  <ProjectedDay date={date} />
                </Suspense>
              )}
              <AddToPlan date={date} planned={planned} plannedTitles={plannedTitles} actions={actions} />
            </>
          )}
        </section>
      )}
      {picking && cards.length > 0 && (
        <Suspense fallback={null}>
          <CardPick
            cards={cards}
            canStart={canStart}
            start={taskId => void work.start(taskId)}
            close={() => setPicking(null)}
            trigger={picking}
          />
        </Suspense>
      )}
      {five && (
        <Suspense fallback={<p role="status">Başlangıç açılıyor…</p>}>
          <FocusStart
            quick
            immediate
            task={{ id: five.taskId, title: five.title }}
            selection={{ name: "Beş dakikalık küçük başlangıç", settings: quickSettings }}
            zone={zone}
            trigger={five.trigger}
            close={() => setFive(null)}
          />
        </Suspense>
      )}
      {dialog?.kind === "move" && (
        <Suspense fallback={<p role="status">Taşıma açılıyor…</p>}>
          <MoveDialog day={day} block={dialog.block} trigger={dialog.trigger} close={close} />
        </Suspense>
      )}
      {dialog?.kind === "move-item" && (
        <MoveItemDialog item={dialog.item} actions={actions} trigger={dialog.trigger} close={close} />
      )}
      {dialog?.kind === "pool" && (
        <Suspense fallback={<p role="status">Havuz seçimi açılıyor…</p>}>
          <PoolDialog day={day} task={dialog.task} trigger={dialog.trigger} close={close} />
        </Suspense>
      )}
    </>
  );
}

function EmptyDay({ date, planned, actions }: { date: string; planned: ReadonlySet<string>; actions: DayActions }) {
  return (
    <div className="r2-empty-day">
      <p className="r2-empty-title">Bu gün için henüz plan yok</p>
      <ProjectedDay date={date} />
      <AddToPlan date={date} planned={planned} plannedTitles={new Set()} actions={actions} large />
      <AssignedList date={date} planned={planned} actions={actions} />
    </div>
  );
}

/** Saatsiz öğe aynı haliyle başka güne gider, saat uydurmuyoruz. */
function MoveItemDialog({
  item,
  actions,
  trigger,
  close,
}: {
  item: DayItem;
  actions: DayActions;
  trigger: HTMLElement;
  close: () => void;
}) {
  const [target, setTarget] = useState(() => shiftDate(item.localDate, 1));
  const [issue, setIssue] = useState("");
  const busy = actions.pending === item.id;
  const failure = actions.failure?.id === item.id ? actions.failure.text : "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setIssue("");
    if (!validDate(target)) {
      setIssue("Geçerli bir gün seç.");
      return;
    }
    if (target === item.localDate) {
      setIssue("Başka bir gün seç.");
      return;
    }
    if (await actions.moveItem(item, target)) close();
  }
  return (
    <Surface title="Başka güne taşı" modal returnTo={trigger} onClose={close} closeDisabled={busy}>
      <form className="r2-move-item" onSubmit={submit}>
        <p>{item.taskTitle}</p>
        <label>
          Hedef gün
          <TemporalInput
            type="date"
            value={target}
            min="0002-01-01"
            max="9998-12-31"
            readOnly={busy}
            onChange={event => setTarget(event.target.value)}
          />
        </label>
        {(issue || failure) && (
          <p role="alert" className="field-error">
            {issue || failure}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Taşınıyor…" : "Taşı"}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            Vazgeç
          </button>
        </div>
      </form>
    </Surface>
  );
}

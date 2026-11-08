"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, type MenuItem } from "../../components/ui/menu";
import { useTaskPanel } from "../../components/layout/task-panel";
import { useSession } from "../auth/provider";
import { useWork } from "../work/coordinator";
import { useFocusCommand } from "./use-command";
import { continueQuick, quickContinued } from "./quick-intent";
import { actionLabels, availableActions, primaryFocusAction, type Focus, type FocusAction } from "./model";
import { useMiniPlayerItem } from "../mini-player/bridge";

/** Hedefe ulaşınca mola öne çıkıyor. Sık kullanılan geçişler sahnede, iptal ve diğerleri menüde. */
const visible: FocusAction[] = ["pause", "resume", "break", "next", "finish"];
function moveFocus(trigger: HTMLElement) {
  const active = document.activeElement;
  // Kullanıcı odağı başka bir yere taşıdıysa dokunmuyoruz.
  if (active && active !== document.body && active !== trigger) return;
  requestAnimationFrame(() => {
    const next =
      document.querySelector<HTMLElement>('.focus-controls [role="group"] button.primary:not(:disabled)') ??
      document.getElementById("focus-presets-title");
    next?.focus({ preventScroll: true });
  });
}
export function FocusControls({
  focus,
  refresh,
  hold,
  extra = [],
}: {
  focus: Focus | null;
  refresh: () => void;
  hold?: (open: boolean) => void;
  extra?: MenuItem[];
}) {
  const command = useFocusCommand(refresh);
  const root = useRef<HTMLDivElement>(null);
  const held = command.blocked || !!command.failure;
  useEffect(() => {
    hold?.(held);
  }, [held, hold]);
  // Geçişten sonra klavye odağı yeni ana düğmeye geçiyor. Yeni durum çizilmeden taşımıyoruz; eski düğme kaybolunca odak boşa düşerdi.
  const key = focus ? `${focus.id}:${focus.version}` : "none";
  const shown$ = useRef(key);
  const pendingFocus = useRef<{ trigger: HTMLElement; key: string } | null>(null);
  useEffect(() => {
    shown$.current = key;
    const pending = pendingFocus.current;
    if (pending && pending.key !== key) {
      pendingFocus.current = null;
      moveFocus(pending.trigger);
    }
  }, [key]);
  useEffect(
    () => () => {
      // Oturum bitince sahne kalkıyor; odak ritim başlığına geçiyor.
      if (pendingFocus.current) moveFocus(pendingFocus.current.trigger);
    },
    [],
  );
  async function send(action: FocusAction, trigger: HTMLElement) {
    if (!focus) return;
    const before = key;
    const ok = await command.run(focus, action);
    if (!ok) return;
    if (shown$.current !== before) moveFocus(trigger);
    else pendingFocus.current = { trigger, key: before };
  }
  const work = useWork();
  const miniPlayerItem = useMiniPlayerItem(focus?.state === "Working" || focus?.state === "Break");
  const { state } = useSession();
  const client = useQueryClient();
  const [continued, setContinued] = useState(() => quickContinued(client, state.user!.id));
  const cycle = focus ? `${focus.id}:${focus.cycleNumber}` : "";
  const quickQuestion =
    !!focus &&
    focus.settings.workSeconds === 300 &&
    focus.state === "Working" &&
    focus.effectiveTargetReached &&
    continued !== cycle;
  const open = useTaskPanel();
  async function task(trigger: HTMLElement) {
    if (document.fullscreenElement) await document.exitFullscreen();
    if (focus?.taskId) open(focus.taskId, trigger);
  }
  const actions = focus ? availableActions(focus.state) : [];
  const primary = focus ? primaryFocusAction(focus) : null;
  const shown = actions.filter(action => visible.includes(action) || action === primary);
  const disabled = work.busy || !!work.uncertain || command.blocked;
  return (
    <div className="focus-controls" ref={root}>
      {quickQuestion && (
        <section aria-label="Beş dakikadan sonra" className="focus-quick-choice">
          <p role="status">Beş dakikalık hedefe ulaştın.</p>
          <div className="actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                continueQuick(client, state.user!.id, cycle);
                setContinued(cycle);
              }}
            >
              Devam et
            </button>
            <button type="button" disabled={disabled} onClick={event => void send("finish", event.currentTarget)}>
              Burada bırakalım
            </button>
          </div>
        </section>
      )}
      <div className="actions" role="group" aria-label="Odak denetimleri">
        {focus &&
          shown
            .filter(action => !quickQuestion || action === primary)
            .sort((a, b) => Number(b === primary) - Number(a === primary))
            .map(action => (
              <button
                key={action}
                disabled={disabled}
                className={action === primary ? "primary" : undefined}
                onClick={e => void send(action, e.currentTarget)}
              >
                {actionLabels[action]}
              </button>
            ))}
        {focus && (
          <Menu
            label="Odak işlemleri"
            items={[
              miniPlayerItem,
              ...actions
                .filter(action => !shown.includes(action))
                .map((action): MenuItem => ({
                  label: actionLabels[action],
                  disabled,
                  danger: action === "cancel",
                  onSelect: trigger => void send(action, trigger),
                })),
              !!focus.taskId && {
                label: "Görevi aç / tamamla…",
                disabled: command.blocked,
                onSelect: t => void task(t),
              },
              ...extra,
            ]}
          />
        )}
      </div>
      {(command.pending || command.failure) && (
        <section aria-label={command.label} className="focus-command-feedback">
          {command.pending && <p role="status">Kaydediliyor…</p>}
          {command.failure && (
            <p role="alert" className="form-error">
              {command.failure}
            </p>
          )}
          {command.canRetry && (
            <button disabled={command.pending} onClick={() => void command.retry()}>
              Aynı odak geçişini güvenle yeniden dene
            </button>
          )}
          {(command.phase === "uncertain" || command.phase === "stale") && (
            <button disabled={command.pending} onClick={() => void command.review()}>
              Geçiş sonucunu kontrol et
            </button>
          )}
          {!command.blocked && <button onClick={command.dismiss}>Mesajı kapat</button>}
        </section>
      )}
      {command.message && <p role="status">{command.message}</p>}
    </div>
  );
}

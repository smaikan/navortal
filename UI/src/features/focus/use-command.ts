"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { useWork } from "../work/coordinator";
import { announceWorkChange } from "../work/changed";
import { miniPlayerFor } from "../mini-player/controller";
import {
  actionLabels,
  focusCommand,
  focusFailure,
  readCurrent,
  readFocus,
  type Focus,
  type FocusAction,
} from "./model";

type Phase = "idle" | "pending" | "uncertain" | "stale";
export function useFocusCommand(refresh: () => void) {
  const { session, state } = useSession();
  const client = useQueryClient(),
    cache = useTaskCache(),
    work = useWork();
  const [phase, setPhase] = useState<Phase>("idle"),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState(""),
    [retryable, setRetryable] = useState(false),
    [intent, setIntent] = useState<{ focus: Focus; action: FocusAction } | null>(null);
  const status = useRef<Phase>("idle"),
    busy = useRef(false);
  const prepared = useRef<ReturnType<
    typeof session.api.mutation<"/api/focus-sessions/{id}/{operation}", "post">
  > | null>(null);
  function change(next: Phase) {
    status.current = next;
    setPhase(next);
  }
  async function run(focus: Focus, action: FocusAction, retry = false) {
    if (busy.current || work.busy || work.uncertain || (!retry && ["uncertain", "stale"].includes(status.current)))
      return;
    const wasUncertain = status.current === "uncertain";
    busy.current = true;
    change("pending");
    setFailure("");
    setMessage("");
    setIntent({ focus, action });
    let miniTicket: ReturnType<ReturnType<typeof miniPlayerFor>["prepare"]> | undefined;
    let miniAccepted = false;
    try {
      if (!retry)
        prepared.current = session.api.mutation("/api/focus-sessions/{id}/{operation}", "post", {
          path: { id: focus.id, operation: action },
          // Sonraki düğmesine basmak mevcut moladan çıkma isteği demek.
          body: focusCommand(focus, action, action === "next" && focus.state === "Break"),
        });
      if (!prepared.current) {
        change("idle");
        return;
      }
      setRetryable(!!prepared.current.key);
      if (action === "resume" || action === "next") miniTicket = miniPlayerFor(session).prepare();
      const result = readFocus(await prepared.current.execute({ retryUnknownResult: retry }));
      if (!cache.current()) return;
      miniAccepted = result.state === "Working" || result.state === "Break";
      client.setQueryData(queryKeys.resource(state.user!.id, "focus-current"), {
        session: ["Finished", "Interrupted"].includes(result.state) ? null : result,
        serverNow: result.serverNow,
        receivedAt: performance.now(),
      });
      prepared.current = null;
      setRetryable(false);
      change("idle");
      setIntent(null);
      setMessage("Odak geçişi kaydedildi.");
      announceWorkChange(client, state.user!.id);
      void work.refresh();
      refresh();
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-list").slice(0, 3) });
      return true;
    } catch (error) {
      if (!cache.current()) return;
      if (
        prepared.current &&
        ((error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) || wasUncertain)
      )
        change("uncertain");
      else if (error instanceof ApiError && [404, 409].includes(error.status)) {
        change("stale");
        refresh();
        void work.refresh();
      } else change("idle");
      setFailure(error instanceof RangeError ? error.message : focusFailure(error));
    } finally {
      miniTicket?.settle(miniAccepted);
      busy.current = false;
    }
  }
  async function review() {
    if (busy.current) return;
    busy.current = true;
    const previous = status.current;
    change("pending");
    try {
      const value = readCurrent(await session.api.read("/api/focus-sessions/current"));
      if (!cache.current()) return;
      client.setQueryData(queryKeys.resource(state.user!.id, "focus-current"), {
        ...value,
        receivedAt: performance.now(),
      });
      prepared.current = null;
      setRetryable(false);
      setIntent(null);
      setFailure("");
      change("idle");
      setMessage("Güncel durum okundu. Önceki geçiş tekrarlanmadı.");
      void work.refresh();
    } catch (error) {
      if (cache.current()) {
        change(previous);
        setFailure(focusFailure(error));
      }
    } finally {
      busy.current = false;
    }
  }
  function dismiss() {
    if (status.current !== "idle") return;
    setFailure("");
    setMessage("");
    setIntent(null);
    prepared.current = null;
  }
  return {
    run,
    review,
    dismiss,
    failure,
    message,
    phase,
    label: intent ? actionLabels[intent.action] : "Pomodoro işlemi",
    pending: phase === "pending",
    blocked: phase !== "idle",
    canRetry: phase === "uncertain" && retryable,
    retry: () => (intent && prepared.current?.key ? run(intent.focus, intent.action, true) : Promise.resolve()),
  };
}

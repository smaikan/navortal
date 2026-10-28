"use client";
import { useQuery } from "@tanstack/react-query";
import type { components } from "../../lib/api/generated/schema";
import { ApiError } from "../../lib/api/errors";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";

export type Glance = components["schemas"]["DayGlanceView"];
export type Hint = components["schemas"]["DayGlanceHint"];
const seconds = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number(v) >= 0;
const count = (v: unknown) => seconds(v) && Number.isSafeInteger(Number(v));

/** Gün özetindeki bütün sayıları sunucu hesaplıyor. İstemci yalnız biçimlendiriyor ve görünüm eşikleriyle karşılaştırıyor. */
export function readGlance(v: Glance, date: string): Glance {
  if (
    !v ||
    v.localDate !== date ||
    ![v.workingRemainingSeconds, v.plannedRemainingSeconds, v.actualSeconds].every(seconds) ||
    ![v.unknownEstimateCount, v.completedItemCount, v.openItemCount].every(count) ||
    typeof v.overCapacity !== "boolean" ||
    (v.unboundedItemCount !== undefined && !count(v.unboundedItemCount)) ||
    !Array.isArray(v.hints) ||
    typeof v.serverNow !== "string"
  )
    throw new ApiError("protocol", "Gün özeti okunamadı.");
  for (const h of v.hints)
    if (
      !h ||
      typeof h.taskId !== "string" ||
      (h.nextStep && (typeof h.nextStep.text !== "string" || !h.nextStep.noteId))
    )
      throw new ApiError("protocol", "Gün özeti okunamadı.");
  return v;
}

/** Dakikada bir ve canlı değişiklikte yenilenir. Plan listesinin ilk çizimini bekletmez. */
export function useGlance(date: string, interval: number | false = 60_000) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-glance", { date }),
    networkMode: "always",
    refetchInterval: interval,
    queryFn: async ({ signal }) =>
      readGlance(await session.api.read("/api/daily-plans/{date}/glance", { path: { date }, signal }), date),
  });
}
export const glanceHints = (value: Glance) => value.hints;
/** Plan satırlarına yalnız ipucu değişikliği gider. Dakikalık okuma bağımsız gün çubuğuyla ortaktır. */
export function useDayHints(date: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "plan-glance", { date }),
    networkMode: "always",
    refetchInterval: 60_000,
    select: glanceHints,
    queryFn: async ({ signal }) =>
      readGlance(await session.api.read("/api/daily-plans/{date}/glance", { path: { date }, signal }), date),
  });
}
export const hintsByTask = (glance: Pick<Glance, "hints"> | undefined) =>
  new Map((glance?.hints ?? []).map(h => [h.taskId, h]));

/** 4 sa 20 dk veya 35 dk biçimi. Tam dakikaya aşağı yuvarlanır. */
export function span(value: number | string) {
  const total = Math.max(0, Math.floor(Number(value) / 60));
  const h = Math.floor(total / 60),
    m = total % 60;
  return h ? (m ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
}

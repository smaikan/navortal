"use client";
import { useQuery } from "@tanstack/react-query";
import { shiftDate } from "../../lib/time/date-only";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { ApiError } from "../../lib/api/errors";

/** Bugün biten son 90 yerel gün. Beş örnek şartının sağlanıp sağlanmadığını sunucu seçiyor. */
export function useAccuracy(today: string, enabled: boolean) {
  const { session, state } = useSession();
  const from = shiftDate(today, -89);
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "estimate-accuracy", { from, today }),
    networkMode: "always",
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const v = await session.api.read("/api/analytics/estimate-accuracy", {
        query: { fromDate: from, toDate: today },
        signal,
      });
      if (!v || (typeof v.sampleCount !== "number" && typeof v.sampleCount !== "string"))
        throw new ApiError("protocol", "Tahmin isabeti okunamadı.");
      return v;
    },
  });
}

/** Kendi tahmini sunucu medyan oranıyla çarpıp 5 dakikaya yuvarlıyoruz. Yalnız en az 5 dakika ve yüzde 10 daha uzun öneri var. Tahmin veya medyan bilinmiyorsa öneri yok; saf kural testte de kullanılıyor. */
export function calibratedMinutes(
  estimateSeconds: number | string | null | undefined,
  medianRatio: number | string | null | undefined,
) {
  if (estimateSeconds === null || estimateSeconds === undefined || medianRatio === null || medianRatio === undefined)
    return null;
  const estimate = Number(estimateSeconds) / 60,
    ratio = Number(medianRatio);
  if (!(estimate > 0) || !(ratio > 1.1)) return null;
  const suggested = Math.round((estimate * ratio) / 5) * 5;
  return suggested - estimate >= 5 ? suggested : null;
}
export const calibrationText = (minutes: number) =>
  `Benzer işler genelde biraz daha uzun sürüyor; ${minutes} dk ayırmak ister misin?`;

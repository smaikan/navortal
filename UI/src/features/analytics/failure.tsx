"use client";
import type { UseQueryResult } from "@tanstack/react-query";
import { analyticsFailure } from "./model";
import { planFailure } from "./plan-model";
/** Bir bölüm okunamazsa diğerleri çalışmaya devam ediyor. Eski veri altta görünür kalıyor. */
export function Failure({ query, what }: { query: UseQueryResult<unknown>; what: string }) {
  if (!query.isError) return null;
  return (
    <div role="alert">
      <p>
        {what}: {planFailure(query.error) ?? analyticsFailure(query.error)}
        {query.data !== undefined && " Önceki okumanın verisi gösteriliyor."}
      </p>
      <button onClick={() => void query.refetch()}>Yeniden dene</button>
    </div>
  );
}

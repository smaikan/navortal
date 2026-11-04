import type { QueryClient } from "@tanstack/react-query";
import { decodeChange, eventWindow, resources, type ChangeKind } from "./model";
import { invalidateSignalReads } from "../workspace/invalidation";
type Options = {
  client: QueryClient;
  owner: string;
  current: () => boolean;
  refresh: () => Promise<void>;
  resolveRevision: (id: string) => Promise<string>;
};
/** Saniyede en fazla tek boşaltma. Bellek bilinen türler ve 1024 makbuz kimliğiyle sınırlı. */
export function changeRouter(o: Options) {
  const receipts = eventWindow();
  const pending = new Set<ChangeKind>();
  let revision: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined,
    last = -Infinity,
    disposed = false;
  function schedule() {
    if (!timer && !disposed)
      timer = setTimeout(
        () => {
          timer = undefined;
          void flush();
        },
        Math.max(200, 1000 - (Date.now() - last)),
      );
  }
  async function flush() {
    if (disposed || !o.current()) return;
    last = Date.now();
    const kinds = [...pending];
    pending.clear();
    const source = revision;
    revision = null;
    if (source) {
      // sourceId revizyon kimliğidir, DailyPlanId değil. Her grupta tek temsilci çözülür;
      // sonra görünen bütün planlar yeniden okunur. Olayların genel sırası yoktur.
      try {
        await o.resolveRevision(source);
      } catch {
        /* Eksik veya eski sinyali görünen planların HTTP okuması da uzlaştırır. */
      }
    }
    if (disposed || !o.current()) return;
    const names = new Set<string>(kinds.flatMap(k => [...resources[k]]));
    if (kinds.some(k => ["TaskChanged", "WorkChanged", "FocusChanged"].includes(k))) await o.refresh();
    await invalidateSignalReads(o.client, o.owner, names, () => !disposed && o.current());
  }
  return {
    accept(raw: unknown) {
      if (disposed || !o.current()) return;
      const e = decodeChange(raw);
      if (!e || !receipts.accept(e.eventId)) return;
      pending.add(e.kind);
      if (e.kind === "PlanChanged") revision = e.sourceId;
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      receipts.clear();
      pending.clear();
      revision = null;
    },
  };
}

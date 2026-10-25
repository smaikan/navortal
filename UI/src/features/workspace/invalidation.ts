import type { Query, QueryClient } from "@tanstack/react-query";
import type { DayOverviewView, WorkspaceSnapshotView } from "./read-types";
import type { ReadCoverage } from "./read-coverage";

const belongs = (q: Query, owner: string) => q.queryKey[0] === "user" && q.queryKey[1] === owner;
export function dayCoversQuery(client: QueryClient, owner: string, q: Query) {
  if (!["plan-glance", "support-day"].includes(String(q.queryKey[2]))) return false;
  const date = (q.queryKey[3] as { date?: string } | undefined)?.date;
  return (
    !!date &&
    !!client
      .getQueryCache()
      .find({
        queryKey: ["user", owner, "day-overview", { date }],
        exact: true,
      })
      ?.isActive()
  );
}
function reusable(q: Query, snapshot: WorkspaceSnapshotView | undefined) {
  const day = q.state.data as DayOverviewView | undefined;
  if (!snapshot?.versions || !day?.versions || !day.glance || q.state.isInvalidated || q.state.status !== "success")
    return false;
  const age = Date.parse(snapshot.serverNow) - Date.parse(day.glance.serverNow);
  return (
    age >= -15000 &&
    age <= 15000 &&
    (["planning", "notes", "specialDays"] as const).every(
      key => String(day.versions[key]) === String(snapshot.versions[key]),
    )
  );
}
function coveredPage(q: Query, snapshot: WorkspaceSnapshotView | undefined) {
  if (!snapshot?.versions || q.state.status !== "success" || q.state.isInvalidated) return false;
  const name = q.queryKey[2];
  if (name === "task-picker") {
    const data = q.state.data as { pages?: { coverage?: ReadCoverage | null }[] } | undefined;
    return (
      !!data?.pages?.length &&
      data.pages.every(page => {
        const coverage = page.coverage;
        if (!coverage?.versions) return false;
        const age = Date.parse(snapshot.serverNow) - Date.parse(coverage.serverNow);
        return (
          age >= -15000 && age <= 15000 && String(coverage.versions.planning) === String(snapshot.versions.planning)
        );
      })
    );
  }

  const filters = q.queryKey[3] as { assignedOn?: string } | undefined;
  const source =
    name === "special-day-occurrences"
      ? "specialDays"
      : name === "task-detail" ||
          name === "calendar-overview" ||
          name === "focus-current" ||
          (name === "tasks" && !!filters?.assignedOn)
        ? "planning"
        : null;
  const data = q.state.data as
    { coverage?: ReadCoverage | null; serverNow?: string; planningVersion?: number | string } | undefined;
  const coverage =
    ["calendar-overview", "task-detail"].includes(String(q.queryKey[2])) &&
    data?.serverNow &&
    data.planningVersion !== undefined
      ? { serverNow: data.serverNow, versions: { ...snapshot.versions, planning: data.planningVersion } }
      : data?.coverage;
  if (!source || !coverage?.versions) return false;
  const age = Date.parse(snapshot.serverNow) - Date.parse(coverage.serverNow);
  return age >= -15000 && age <= 15000 && String(coverage.versions[source]) === String(snapshot.versions[source]);
}
/** Zil sayısı bağlantıdan sonra okunur. Telafiyle aynı 15sn penceresindeki veya süren okuma güncel sayılır; eski sayı yenilenir. */
function freshBadge(q: Query, snapshotAt: number | undefined) {
  if (q.queryKey[2] !== "notifications" || (q.queryKey[3] as { kind?: string } | undefined)?.kind !== "badge")
    return false;
  return q.state.fetchStatus === "fetching" || (!!snapshotAt && snapshotAt - q.state.dataUpdatedAt <= 15000);
}
function certifiablePage(q: Query) {
  return (
    q.queryKey[2] === "task-picker" ||
    q.queryKey[2] === "special-day-occurrences" ||
    q.queryKey[2] === "calendar-overview" ||
    q.queryKey[2] === "task-detail" ||
    (q.queryKey[2] === "tasks" && !!(q.queryKey[3] as { assignedOn?: string } | undefined)?.assignedOn)
  );
}
/** Çalışma alanı okumasından sonra telafi yapılır. Eski bekleyen yanıt yeni okumadan önce iptal edilir. */
export async function invalidateWorkspaceReads(client: QueryClient, owner: string, current: () => boolean) {
  if (!current()) return;
  const state = client.getQueryState<WorkspaceSnapshotView>(["user", owner, "workspace-snapshot", {}]);
  const snapshot = state?.status === "success" ? state.data : undefined;
  // Bu uçlar atomik kaynak belgesi döndürür. İlk okuma bitsin, sonra belgeyi kontrol edelim;
  // yalnız değişikliği gerçekten kaçırdıysa iptal edip yeniden başlatalım. Diğer okumalar temkinli yolu kullanır.
  const pending = client
    .getQueryCache()
    .findAll()
    .filter(
      q =>
        belongs(q, owner) &&
        certifiablePage(q) &&
        q.state.status === "pending" &&
        q.state.fetchStatus === "fetching" &&
        q.promise,
    );
  const waiting = new Set(pending);
  const selected = new Set(
    client
      .getQueryCache()
      .findAll()
      .filter(
        q =>
          belongs(q, owner) &&
          !waiting.has(q) &&
          q.queryKey[2] !== "workspace-snapshot" &&
          !dayCoversQuery(client, owner, q) &&
          !(q.queryKey[2] === "day-overview" && reusable(q, snapshot)) &&
          !coveredPage(q, snapshot) &&
          !freshBadge(q, state?.dataUpdatedAt),
      ),
  );
  const predicate = (q: Query) => selected.has(q);
  await client.cancelQueries({ predicate });
  if (current()) await client.invalidateQueries({ predicate, refetchType: "active" }, { cancelRefetch: false });
  await Promise.allSettled(
    pending.map(async q => {
      await q.promise?.catch(() => {});
      if (!current() || client.getQueryCache().get(q.queryHash) !== q) return;
      const latest = client.getQueryData<WorkspaceSnapshotView>(["user", owner, "workspace-snapshot", {}]);
      if (!coveredPage(q, latest)) {
        await client.cancelQueries({ predicate: candidate => candidate === q });
        if (current())
          await client.invalidateQueries({ predicate: candidate => candidate === q, refetchType: "active" });
      }
    }),
  );
}

export async function invalidateSignalReads(
  client: QueryClient,
  owner: string,
  names: ReadonlySet<string>,
  current: () => boolean,
) {
  if (!current()) return;
  const predicate = (q: Query) =>
    belongs(q, owner) &&
    names.has(String(q.queryKey[2])) &&
    !(names.has("day-overview") && dayCoversQuery(client, owner, q));
  await client.cancelQueries({ predicate });
  if (current()) await client.invalidateQueries({ predicate, refetchType: "active" }, { cancelRefetch: false });
}

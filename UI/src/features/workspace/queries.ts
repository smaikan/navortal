"use client";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { Session } from "../auth/session";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readWorkspace, type WorkspaceSnapshot } from "./model";
import type { Snapshot } from "../preferences/model";

export const workspaceKey = (owner: string) => queryKeys.resource(owner, "workspace-snapshot");
export const workspaceRead = (session: Session, signal: AbortSignal) =>
  session.api.read("/api/workspace/snapshot", { signal }).then(readWorkspace);
const displayPreferences = (snapshot: WorkspaceSnapshot) => ({
  version: snapshot.preferences.version,
  values: snapshot.preferences,
});

/** Küçük görünümün kendi önbelleği var. Tam tercihler anahtarına eksik belge koymuyoruz. */
export function useDisplayPreferences() {
  const { session, state } = useSession();
  return useQuery({
    queryKey: workspaceKey(state.user!.id),
    queryFn: ({ signal }) => workspaceRead(session, signal),
    select: displayPreferences,
    networkMode: "always",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export async function updateDisplayPreferences(client: QueryClient, owner: string, full: Snapshot) {
  const p = full.values;
  const key = workspaceKey(owner);
  // Başarılı ayar yazısından önce başlayan okuma sonradan eski tercihi geri getirmemeli.
  await client.cancelQueries({ queryKey: key, exact: true });
  client.setQueryData<WorkspaceSnapshot>(
    key,
    old =>
      old && {
        ...old,
        preferences: {
          version: full.version,
          timeZoneId: p.timeZoneId,
          timeFormat: p.timeFormat,
          weekStartsOn: p.weekStartsOn,
          supportEnabled: p.supportEnabled,
          hasWorkingWindows: p.weekly.length > 0,
          uiSupports: p.uiSupports,
        },
      },
  );
  await client.invalidateQueries({ queryKey: queryKeys.resource(owner, "day-overview").slice(0, 3) });
  if (!client.getQueryData(key)) await client.invalidateQueries({ queryKey: key, exact: true });
}

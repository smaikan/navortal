"use client";
import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import type { MenuItem } from "../../components/ui/menu";
import { useSession } from "../auth/provider";
import { useLocal } from "../../lib/local-preference";
import { initialMiniPlayer, miniPlayerFor, miniPlayerKey } from "./controller";

const MiniPlayerView = lazy(() => import("./view").then(m => ({ default: m.MiniPlayerView })));

export function MiniPlayerBridge() {
  const { session, state } = useSession();
  const enabled = useLocal(miniPlayerKey(state.user!.id)) === "true";
  const player = miniPlayerFor(session);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, () => initialMiniPlayer);
  useEffect(() => {
    if (!enabled) player.close();
  }, [enabled, player]);
  useEffect(() => () => player.close(), [player]);
  return enabled && snapshot.window ? (
    <Suspense fallback={null}>
      <MiniPlayerView player={player} target={snapshot.window} waiting={snapshot.waiting} />
    </Suspense>
  ) : null;
}

export function useMiniPlayerItem(running: boolean): MenuItem | false {
  const { session, state } = useSession();
  const enabled = useLocal(miniPlayerKey(state.user!.id)) === "true";
  const player = miniPlayerFor(session);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, () => initialMiniPlayer);
  if (!enabled || !running || snapshot.window) return false;
  return { label: "Mini sayacı aç", onSelect: () => player.prepare().settle(true) };
}

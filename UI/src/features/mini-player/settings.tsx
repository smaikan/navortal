"use client";
import { useSyncExternalStore } from "react";
import { useSession } from "../auth/provider";
import { useLocal, writeLocal } from "../../lib/local-preference";
import { initialMiniPlayer, isPhone, miniPlayerFor, miniPlayerKey, pictureInPicture } from "./controller";

const subscribeCapability = () => () => {};
export function MiniPlayerSettings() {
  const { session, state } = useSession();
  const key = miniPlayerKey(state.user!.id);
  const enabled = useLocal(key) === "true";
  const supported = useSyncExternalStore(
    subscribeCapability,
    () => !!pictureInPicture(),
    () => false,
  );
  const phone = useSyncExternalStore(subscribeCapability, isPhone, () => false);
  const player = miniPlayerFor(session);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, () => initialMiniPlayer);
  return (
    <div className="mini-player-setting">
      <label className="support-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!supported}
          aria-describedby="mini-player-description"
          onChange={event => {
            writeLocal(key, String(event.target.checked));
            if (!event.target.checked) player.close();
          }}
        />
        <span>Mini sayaç</span>
      </label>
      <p className="muted" id="mini-player-description">
        {supported
          ? "Görev süresini veya Pomodoro’yu başlattığında küçük bir pencere açılır. Başka uygulamadayken de süreyi görebilirsin."
          : phone
            ? "Mini sayaç telefonda kullanılmıyor. Masaüstü tarayıcısında açabilirsin."
            : "Bu tarayıcı mini pencereyi desteklemiyor. Destekleyen bir masaüstü tarayıcısında kullanabilirsin."}
      </p>
      <p className="muted">Bu tarayıcı için geçerlidir. Duraklatınca veya oturum bitince pencere kapanır.</p>
      {snapshot.failure && (
        <p role="status" className="muted">
          {snapshot.failure}
        </p>
      )}
    </div>
  );
}

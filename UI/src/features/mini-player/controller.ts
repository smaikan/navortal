import type { Session } from "../auth/session";
import { readLocal } from "../../lib/local-preference";

export const miniPlayerKey = (owner: string) => `adhd.mini-player.v1:${owner}`;
type PictureInPicture = { requestWindow: (options: { width: number; height: number }) => Promise<Window> };
/** Telefonda mini sayaç yok: dokunmatik, fare imleci olmayan ve kısa kenarı 768px'ten dar ekran. */
export const isPhone = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
  Math.min(screen.width, screen.height) < 768;
export const pictureInPicture = () =>
  typeof window === "undefined" || isPhone()
    ? undefined
    : (window as Window & { documentPictureInPicture?: PictureInPicture }).documentPictureInPicture;

type Snapshot = Readonly<{ window: Window | null; waiting: boolean; failure: string }>;
export const initialMiniPlayer: Snapshot = { window: null, waiting: false, failure: "" };
const noTicket: { settle: (ok: boolean) => void } = { settle() {} };
export type MiniPlayer = ReturnType<typeof createMiniPlayer>;

/** Yalnız pencere niyeti tutulur. Görev ve süre sunucu önbelleğinde kalır. */
export function createMiniPlayer(options: {
  identity: () => { owner?: string; epoch: number; verified: boolean };
  enabled: (owner: string) => boolean;
  request: () => Promise<Window> | undefined;
}) {
  let snapshot = initialMiniPlayer;
  let generation = 0;
  let opening: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const erase = (target: Window) => {
    // Çıkışta özel metin, pencerenin kapanma animasyonunda bile kalmasın.
    try {
      target.document.body.style.visibility = "hidden";
      target.close();
    } catch {
      /* Tarayıcı pencereyi zaten kapatmış olabilir. */
    }
  };
  const close = () => {
    const target = snapshot.window;
    generation++;
    opening = null;
    publish(initialMiniPlayer);
    if (target) erase(target);
  };
  function prepare() {
    const identity = { ...options.identity() };
    const owner = identity.owner;
    if (!owner || !identity.verified || !options.enabled(owner)) return noTicket;
    if (snapshot.window && !snapshot.window.closed) return noTicket;
    if (opening) return noTicket;
    const token = ++generation;
    let accepted: boolean | undefined;
    const current = () => {
      const now = options.identity();
      return (
        generation === token &&
        now.verified &&
        now.owner === owner &&
        now.epoch === identity.epoch &&
        options.enabled(owner)
      );
    };
    try {
      // requestWindow tıklama yığınında, ilk await'ten önce çağrılır.
      const request = options.request();
      if (!request) return noTicket;
      opening = request
        .then(target => {
          if (!current() || accepted === false) {
            erase(target);
            return;
          }
          target.document.title = "Mini sayaç";
          target.document.documentElement.lang = "tr";
          const boot = target.document.createElement("p");
          boot.id = "mini-player-loading";
          boot.textContent = "Sayaç hazırlanıyor…";
          target.document.body.replaceChildren(boot);
          if (typeof window !== "undefined") {
            const theme = getComputedStyle(window.document.documentElement);
            target.document.body.style.background = theme.getPropertyValue("--surface");
            target.document.body.style.color = theme.getPropertyValue("--text");
            target.document.body.style.fontFamily = theme.getPropertyValue("--font-ui");
          }
          target.addEventListener(
            "pagehide",
            () => {
              if (snapshot.window === target) close();
            },
            { once: true },
          );
          publish({ window: target, waiting: accepted !== true, failure: "" });
        })
        .catch(() => {
          if (current())
            publish({
              window: null,
              waiting: false,
              failure: "Mini pencere açılamadı. Sayaç normal görünümde sürüyor.",
            });
        })
        .finally(() => {
          if (generation === token) opening = null;
        });
    } catch {
      if (current())
        publish({ window: null, waiting: false, failure: "Mini pencere açılamadı. Sayaç normal görünümde sürüyor." });
    }
    return {
      settle(ok: boolean) {
        accepted = ok;
        if (!current()) return;
        if (!ok) close();
        else if (snapshot.window) publish({ ...snapshot, waiting: false });
      },
    };
  }
  return {
    prepare,
    close,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const players = new WeakMap<Session, MiniPlayer>();
export function miniPlayerFor(session: Session) {
  let player = players.get(session);
  if (!player) {
    player = createMiniPlayer({
      identity: () => ({ ...session.getIdentity(), owner: session.getSnapshot().user?.id }),
      enabled: owner => readLocal(miniPlayerKey(owner)) === "true",
      request: () => pictureInPicture()?.requestWindow({ width: 240, height: 84 }),
    });
    players.set(session, player);
    session.onIdentityChange(player.close);
  }
  return player;
}

/** API yazısı pencere hatasından etkilenmez; başarısız veya belirsiz yazıda yeni pencere kapanır. */
export async function withMiniPlayer(session: Session, command: () => Promise<boolean>) {
  const ticket = miniPlayerFor(session).prepare();
  let accepted = false;
  try {
    accepted = await command();
    return accepted;
  } finally {
    ticket.settle(accepted);
  }
}

export const miniPlayerStyles = `
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--text); font: 14px/1.4 var(--font-ui); }
button { font: inherit; cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.mini-player { display: flex; align-items: center; height: 100vh; padding: 4px 8px 4px 14px; }
.mini-player-info { min-width: 0; flex: 1; }
.mini-player-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mini-player-kind { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
.mini-player-kind::before { content: ''; width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--teal); }
.mini-player-kind span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-player-time { margin: 0; font-size: 32px; font-weight: 500; line-height: 1.15; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.mini-player-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.mini-player-actions button { display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--radius);
  background: transparent; color: var(--muted); }
.mini-player-actions button:hover:not(:disabled) { background: var(--hover); color: var(--text); }
@media (pointer: coarse) { .mini-player-actions button { width: 44px; height: 44px; } }
.mini-player-pending { padding: 16px 14px; margin: 0; color: var(--muted); font-size: 12px; }
@media (forced-colors: active) { .mini-player-actions button { border: 1px solid ButtonText; } }
`;

const tokens = [
  "--surface",
  "--text",
  "--muted",
  "--primary",
  "--teal",
  "--divider",
  "--hover",
  "--radius",
  "--font-ui",
] as const;

export function styleMiniPlayer(target: Window) {
  const document = target.document;
  const viewport = document.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  document.head.append(viewport);
  document.body.style.removeProperty("background");
  document.body.style.removeProperty("color");
  document.body.style.removeProperty("font-family");
  const style = document.createElement("style");
  // PiP belgesi açan sayfanın CSP'sini devralır. Yalnız güvenilir style metnine nonce aktarılır.
  const nonce = window.document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  if (nonce) style.nonce = nonce;
  style.textContent = miniPlayerStyles;
  document.head.append(style);
  const copy = () => {
    const source = getComputedStyle(window.document.documentElement);
    for (const token of tokens) document.documentElement.style.setProperty(token, source.getPropertyValue(token));
    document.documentElement.style.colorScheme = source.colorScheme;
  };
  copy();
  const observer = new MutationObserver(copy);
  observer.observe(window.document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", copy);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", copy);
    style.remove();
    viewport.remove();
  };
}

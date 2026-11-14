/** Kapatmayı başlatan dokunuşun click'i panel kalkınca arka plana geçmesin. */
export function consumeDismissalClick() {
  const stop = () => {
    window.removeEventListener("click", click, true);
    window.removeEventListener("pointerdown", stop, true);
    window.clearTimeout(timer);
  };
  const click = (event: MouseEvent) => {
    stop();
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const timer = window.setTimeout(stop, 750);
  window.addEventListener("click", click, true);
  window.addEventListener("pointerdown", stop, true);
}

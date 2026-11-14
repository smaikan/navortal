/** Native behavior on modern engines; local fallback without patching AbortSignal.any. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);

  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  let reason: unknown;
  // Chrome 92 also lacks AbortSignal.reason and ignores abort(reason).
  if (!("reason" in controller.signal)) {
    Object.defineProperty(controller.signal, "reason", { get: () => reason });
  }
  const abort = (source: AbortSignal) => {
    if (controller.signal.aborted) return;
    reason = "reason" in source ? source.reason : new DOMException("This operation was aborted", "AbortError");
    for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    listeners.clear();
    controller.abort(reason);
  };
  const aborted = signals.find(signal => signal.aborted);
  if (aborted) abort(aborted);
  else {
    for (const signal of new Set(signals)) {
      const listener = () => abort(signal);
      listeners.set(signal, listener);
      signal.addEventListener("abort", listener, { once: true });
    }
  }
  return controller.signal;
}

let issue = "";
const listeners = new Set<() => void>();
export const alertHealth = {
  getSnapshot: () => issue,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  report(next: string) {
    if (issue === next) return;
    issue = next;
    listeners.forEach(listener => listener());
  },
};

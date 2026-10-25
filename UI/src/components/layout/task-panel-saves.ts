export type PanelSave = { dirty: () => boolean; save: () => Promise<boolean> };

/** Yalnız ekrandaki alan grupları kaydoluyor. Bir kayıt hata verirse panel ve kalan taslaklar açık kalmalı. */
export function createPanelSaves() {
  const entries = new Set<PanelSave>();
  return {
    register(entry: PanelSave) {
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },
    dirty: () => [...entries].some(entry => entry.dirty()),
    async flush() {
      try {
        const visited = new Set<PanelSave>();
        for (;;) {
          const entry = [...entries].find(candidate => !visited.has(candidate) && candidate.dirty());
          if (!entry) return true;
          visited.add(entry);
          if (!(await entry.save())) return false;
        }
      } catch {
        return false;
      }
    },
  };
}

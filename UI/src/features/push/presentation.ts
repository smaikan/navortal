/** Aynı olay zaten görünüyorsa push bildiriminin yerini alabilir. Tek başına tercih bunu yapmaz. */
const resumeCards = new WeakMap<object, Map<string, { workSessionId: string }>>();
/** Görünür sunumun ömrü bileşen kadardır. Sunucu önbelleğinin beş dakikalık temizliğine bağlı değildir. */
export function presentResume(scope: object, owner: string, workSessionId: string) {
  let owners = resumeCards.get(scope);
  if (!owners) {
    owners = new Map();
    resumeCards.set(scope, owners);
  }
  const value = { workSessionId };
  owners.set(owner, value);
  return () => {
    if (owners.get(owner) === value) owners.delete(owner);
    if (!owners.size && resumeCards.get(scope) === owners) resumeCards.delete(scope);
  };
}
export const presentedResume = (scope: object, owner: string) => resumeCards.get(scope)?.get(owner)?.workSessionId;

export function alreadyPresented(
  n: { kind: string; sourceId: string },
  view: {
    pathname: string;
    focusId?: string;
    focusTargetEvent?: boolean;
    resumeWorkId?: string;
  },
) {
  return (
    view.pathname.startsWith("/notifications") ||
    (view.pathname === "/focus" &&
      n.kind === "FocusTarget" &&
      view.focusTargetEvent === true &&
      view.focusId === n.sourceId) ||
    (view.pathname === "/planning" && n.kind === "ReturnToTask" && view.resumeWorkId === n.sourceId)
  );
}

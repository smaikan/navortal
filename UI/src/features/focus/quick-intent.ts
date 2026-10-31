// Bir çalışma alanında tek aktif odak döngüsü var. Arayüz niyeti sunucu önbelleğinin temizlenmesinden bağımsız.
const continued = new WeakMap<object, Map<string, string>>();
export const quickContinued = (scope: object, owner: string) => continued.get(scope)?.get(owner);
export function continueQuick(scope: object, owner: string, cycle: string) {
  let owners = continued.get(scope);
  if (!owners) {
    owners = new Map();
    continued.set(scope, owners);
  }
  owners.set(owner, cycle);
}

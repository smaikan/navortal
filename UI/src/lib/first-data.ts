import { useDeferredValue } from "react";

/** İlk sonuç bütün listeyi açabiliyor. O değişiklik yükleme dururken transition ile parça parça çizilir. Sonraki yenileme ve iyimser değişiklikler hemen işlenir. */
export function useFirstData<T>(value: T | undefined): T | undefined {
  const deferred = useDeferredValue(value);
  return deferred === undefined ? undefined : value;
}

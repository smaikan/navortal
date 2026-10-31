/** Aynı anda gelen sinyalleri birleştiriyoruz. Eski okuma sürerken değişiklik gelirse tek takip okuması tutulur. */
export function readQueue(read: () => Promise<void>, canRead: () => boolean) {
  let flight: Promise<void> | null = null,
    queued = false;
  function refresh(): Promise<void> {
    if (!canRead()) return Promise.resolve();
    queued = true;
    if (flight) return flight;
    const request = Promise.resolve()
      .then(async () => {
        while (queued && canRead()) {
          queued = false;
          await read();
        }
      })
      .finally(() => {
        if (flight === request) flight = null;
        // Döngü bitip temizlik mikroişi çalışmadan sinyal gelebilir.
        if (queued && canRead()) return refresh();
      });
    flight = request;
    return request;
  }
  return {
    refresh,
    clear: () => {
      queued = false;
    },
  };
}

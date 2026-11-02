// Görünür sekme ve worker ortak kullanır. Yalnız teslim kimliği ve zaman damgası saklanır.
const database = "adhd-alert-sound-v1";
const ttl = 10 * 60 * 1000;
const capacity = 2048;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Bildirim sesi kaydı açılamadı."));
    };
    const timer = setTimeout(fail, 1500);
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      request.result.createObjectStore("seen").createIndex("at", "at");
    };
    request.onblocked = request.onerror = fail;
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else {
        settled = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
  });
}

/** Tek okuma/yazma işlemi, sekmeler ve yerel push arasında sesi kimin çalacağını seçer. */
export async function claimAlertSound(owner, notificationId, snoozeCount, allowed = () => true, play = () => true) {
  if (typeof owner !== "string" || !guid.test(owner) || typeof notificationId !== "string" || !guid.test(notificationId) || !Number.isSafeInteger(snoozeCount) || snoozeCount < 0 || snoozeCount > 2147483647) return false;
  let db;
  try {
    if (!allowed()) return false;
    db = await open();
    if (!allowed()) return false;
    return await new Promise(resolve => {
      const tx = db.transaction("seen", "readwrite");
      const store = tx.objectStore("seen");
      const key = `${owner.toLowerCase()}:${notificationId.toLowerCase()}:${snoozeCount}`;
      const now = Date.now();
      let claimed = false;
      tx.onabort = tx.onerror = () => resolve(false);
      tx.oncomplete = () => {
        try { resolve(claimed && allowed()); } catch { resolve(false); }
      };
      const receipt = store.get(key);
      receipt.onsuccess = () => {
        try {
          if (!allowed()) { tx.abort(); return; }
          if (receipt.result && receipt.result.at > now - ttl) return;
          const cursor = store.index("at").openCursor(IDBKeyRange.upperBound(now - ttl));
          cursor.onsuccess = () => {
            const expired = cursor.result;
            if (expired) { expired.delete(); expired.continue(); return; }
            const count = store.count();
            count.onsuccess = () => {
              try {
                if (!allowed()) { tx.abort(); return; }
                // Canlı makbuzu yer açmak için silmiyoruz. Depo doluysa sesi atlarız, tekrar çalmayız.
                if (count.result >= capacity) return;
                // Görünür sekme ortak kilidi tutarken sesi planlar. Çalma başarısızsa makbuz tüketilmez.
                if (!play()) return;
                store.put({ at: now }, key);
                claimed = true;
              } catch { tx.abort(); }
            };
          };
        } catch { tx.abort(); }
      };
    });
  } catch {
    // Kaydedilmiş makbuz yoksa bütün sekmelerde çalmak yerine sessiz kalıyoruz.
    return false;
  } finally { db?.close(); }
}

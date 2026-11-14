import { getRecipient } from "./recipient-store.js";
const database = "adhd-notification-receipts-v1";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ttl = 24 * 60 * 60 * 1000;
const inflight = new Map();
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Receipt storage unavailable"));
    };
    const timer = setTimeout(fail, 1500);
    request.onerror = request.onblocked = fail;
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      request.result.createObjectStore("pending", { keyPath: "key" }).createIndex("at", "at");
    };
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
async function storage(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("pending", mode);
      let result;
      const timer = setTimeout(() => {
        tx.abort();
      }, 1500);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(new Error("Receipt storage unavailable"));
      };
      action(tx.objectStore("pending"), value => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}
function valid(value) {
  return (
    value &&
    guid.test(value.owner) &&
    guid.test(value.notificationId) &&
    Number.isSafeInteger(value.snoozeCount) &&
    value.snoozeCount >= 0 &&
    value.snoozeCount <= 2147483647 &&
    ["Displayed", "Opened"].includes(value.stage)
  );
}
/** Yalnız kimlik, tur ve aşama tutulur. Başlık, içerik, endpoint ve token saklanmaz. */
export async function queueReceipt(owner, notificationId, snoozeCount, stage) {
  const value = { owner, notificationId, snoozeCount, stage };
  if (!valid(value)) return;
  try {
    await storage("readwrite", store => {
      store.put({ ...value, key: `${owner}:${notificationId}:${snoozeCount}:${stage}`, at: Date.now() });
      const count = store.count();
      count.onsuccess = () => {
        let extra = count.result - 256;
        if (extra <= 0) return;
        const cursor = store.index("at").openCursor();
        cursor.onsuccess = () => {
          if (cursor.result && extra-- > 0) {
            cursor.result.delete();
            cursor.result.continue();
          }
        };
      };
    });
  } catch {
    /* Gösterilmiş bildirimin başarısı teknik makbuza bağlı değildir. */
  }
}
export async function clearReceipts(owner) {
  if (!guid.test(owner)) return;
  try {
    await storage("readwrite", store => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        if (cursor.result.value.owner === owner) cursor.result.delete();
        cursor.result.continue();
      };
    });
  } catch {
    /* Yeni hesabın verisi silinmez. */
  }
}
async function flush(owner, allowed) {
  try {
    if (
      !guid.test(owner) ||
      !allowed() ||
      (await getRecipient()) !== owner ||
      (typeof navigator !== "undefined" && navigator.onLine === false)
    )
      return;
    const rows = await storage("readonly", (store, done) => {
      const read = store.getAll();
      read.onsuccess = () => done(read.result);
    });
    const deadline = Date.now() + 5000;
    let processed = 0;
    for (const row of rows) {
      if (!allowed() || (await getRecipient()) !== owner || Date.now() >= deadline || processed >= 20) break;
      if (row.owner !== owner) continue;
      if (!valid(row) || row.at < Date.now() - ttl) {
        await storage("readwrite", store => store.delete(row.key));
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
      let response;
      try {
        response = await fetch(`/api/notifications/${row.notificationId}/delivery-receipts`, {
          method: "POST",
          credentials: "same-origin",
          mode: "same-origin",
          redirect: "error",
          headers: { "Content-Type": "application/json", "X-ADHD-CSRF": "1" },
          body: JSON.stringify({ expectedUserId: owner, snoozeCount: row.snoozeCount, stage: row.stage }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      processed++;
      if (response.ok || [400, 404, 410].includes(response.status))
        await storage("readwrite", store => store.delete(row.key));
      else break;
    }
  } catch {
    /* Ağ/oturum dönünce yeni bir açık uygulama olayı tekrar dener. */
  }
}
export function flushReceipts(owner, allowed = () => true) {
  if (inflight.has(owner)) return inflight.get(owner);
  const pending = flush(owner, allowed).finally(() => {
    if (inflight.get(owner) === pending) inflight.delete(owner);
  });
  inflight.set(owner, pending);
  return pending;
}

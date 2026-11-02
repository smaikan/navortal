const database = "adhd-push-recipient-v1";
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore("context"); db.createObjectStore("seen").createIndex("at", "at"); };
    request.onerror = () => reject(new Error("Push alıcı bağlamı açılamadı."));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transaction(mode, action) {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(["context", "seen"], mode); let result;
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(new Error("Push alıcı bağlamı kaydedilemedi."));
    action(tx.objectStore("context"), tx.objectStore("seen"), value => { result = value; });
  }); } finally { db.close(); }
}
export function getRecipient() { return transaction("readonly", (context, seen, done) => { const r = context.get("owner"); r.onsuccess = () => done(r.result ?? null); }); }
export function setRecipient(owner, generation, allowed = () => true) { return transaction("readwrite", (context, seen, done) => { const r = context.get("owner"); r.onsuccess = () => { if (!allowed()) { done(false); return; } if (r.result !== owner) { seen.clear(); context.put(generation ?? crypto.randomUUID(), "generation"); } else if (generation) context.put(generation, "generation"); context.put(owner, "owner"); done(true); }; }); }
/** Silmeden hesabı karşılaştırıyoruz. Eski sekmenin temizliği yeni hesabı silemez. */
export function clearRecipient(expected, generation, allowed = () => true) { return transaction("readwrite", (context, seen, done) => { const r = context.get("owner"); r.onsuccess = () => { if (r.result !== expected) { done(false); return; } const g = context.get("generation"); g.onsuccess = () => { if (!allowed() || generation && g.result !== generation) { done(false); return; } context.delete("owner"); context.delete("generation"); seen.clear(); done(true); }; }; }); }
/** Ön plan ve worker tek işlemde sıraya girer. Yalnız kimlik ve tur saklanır, içerik/kimlik bilgisi yok. */
export function claimDelivery(owner, key) { return transaction("readwrite", (context, seen, done) => {
  const r = context.get("owner"); r.onsuccess = () => {
    if (r.result !== owner) { done(false); return; }
    const receipt = seen.get(key); receipt.onsuccess = () => {
      if (receipt.result) { done(false); return; }
      seen.put({ at: Date.now() }, key); done(true);
      const count = seen.count(); count.onsuccess = () => { let extra = count.result - 256; if (extra <= 0) return; const cursor = seen.index("at").openCursor(); cursor.onsuccess = () => { const value = cursor.result; if (value && extra-- > 0) { value.delete(); value.continue(); } }; };
    };
  };
}); }

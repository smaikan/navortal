// Only missing APIs used by the application. Existing native implementations stay intact.
if (!("size" in URLSearchParams.prototype)) {
  Object.defineProperty(URLSearchParams.prototype, "size", {
    configurable: true,
    enumerable: true,
    get() {
      let count = 0;
      URLSearchParams.prototype.forEach.call(this, () => count++);
      return count;
    },
  });
}

if (typeof AbortSignal.prototype.throwIfAborted !== "function") {
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!;
  Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function throwIfAborted(this: AbortSignal) {
      if (aborted.call(this)) {
        throw "reason" in this ? this.reason : new DOMException("This operation was aborted", "AbortError");
      }
    },
  });
}

// Some early Chromium 92 builds lack randomUUID even in a secure context.
if (typeof crypto.randomUUID !== "function") {
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function randomUUID() {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}

export {};

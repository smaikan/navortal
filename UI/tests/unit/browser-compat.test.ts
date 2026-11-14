import { afterEach, describe, expect, it, vi } from "vitest";
import { anySignal } from "../../src/lib/compat/abort";

const uuid = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
const nativeUUID = crypto.randomUUID;
const any = Object.getOwnPropertyDescriptor(AbortSignal, "any")!;
const reason = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "reason")!;
const throwIfAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "throwIfAborted")!;
const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, "size")!;
afterEach(() => {
  if (uuid) Object.defineProperty(crypto, "randomUUID", uuid);
  else Reflect.deleteProperty(crypto, "randomUUID");
  Object.defineProperty(AbortSignal, "any", any);
  Object.defineProperty(AbortSignal.prototype, "reason", reason);
  Object.defineProperty(AbortSignal.prototype, "throwIfAborted", throwIfAborted);
  Object.defineProperty(URLSearchParams.prototype, "size", size);
  vi.restoreAllMocks();
});
function oldAny() {
  Reflect.deleteProperty(AbortSignal, "any");
}

describe("combined abort signals", () => {
  it("delegates to native any without replacing it", () => {
    const source = new AbortController();
    const expected = new AbortController().signal;
    const native = vi.spyOn(AbortSignal, "any").mockReturnValue(expected);
    expect(anySignal([source.signal])).toBe(expected);
    expect(native).toHaveBeenCalledWith([source.signal]);
  });
  it("uses the first already aborted input and adds no listeners", () => {
    oldAny();
    const pending = new AbortController(),
      first = new AbortController(),
      second = new AbortController();
    first.abort("first");
    second.abort("second");
    const listen = vi.spyOn(pending.signal, "addEventListener");
    const signal = anySignal([pending.signal, first.signal, second.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("first");
    expect(listen).not.toHaveBeenCalled();
  });
  it.each([null, 0, "cancelled", new Error("cancelled")])("forwards the first cancellation reason (%s)", value => {
    oldAny();
    const first = new AbortController(),
      second = new AbortController();
    const removeFirst = vi.spyOn(first.signal, "removeEventListener");
    const removeSecond = vi.spyOn(second.signal, "removeEventListener");
    const signal = anySignal([first.signal, second.signal, first.signal]);
    const event = vi.fn();
    signal.addEventListener("abort", event);
    expect(signal.aborted).toBe(false);
    second.abort(value);
    first.abort("later");
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(value);
    expect(event).toHaveBeenCalledTimes(1);
    expect(removeFirst).toHaveBeenCalledTimes(1);
    expect(removeSecond).toHaveBeenCalledTimes(1);
    expect(first.signal.reason).toBe("later");
  });
  it("leaves an empty combination pending", () => {
    oldAny();
    const signal = anySignal([]);
    expect(signal.aborted).toBe(false);
    expect(signal.reason).toBeUndefined();
  });
  it.each([false, true])("supports engines without reason (already aborted: %s)", already => {
    oldAny();
    Reflect.deleteProperty(AbortSignal.prototype, "reason");
    const source = new AbortController();
    if (already) source.abort();
    const signal = anySignal([source.signal]);
    const event = vi.fn(() => expect(signal.reason).toMatchObject({ name: "AbortError" }));
    signal.addEventListener("abort", event);
    if (!already) source.abort();
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect(signal.reason.name).toBe("AbortError");
    expect(event).toHaveBeenCalledTimes(already ? 0 : 1);
  });
});

describe("missing browser APIs", () => {
  it("keeps native methods and getters unchanged", async () => {
    vi.resetModules();
    await import("../../src/lib/compat/browser");
    expect(Object.getOwnPropertyDescriptor(URLSearchParams.prototype, "size")).toEqual(size);
    expect(Object.getOwnPropertyDescriptor(AbortSignal.prototype, "throwIfAborted")).toEqual(throwIfAborted);
    expect(Object.getOwnPropertyDescriptor(AbortSignal, "any")).toEqual(any);
    expect(crypto.randomUUID).toBe(nativeUUID);
  });
  it("counts duplicate URL parameters and does not count empty queries", async () => {
    Reflect.deleteProperty(URLSearchParams.prototype, "size");
    vi.resetModules();
    await import("../../src/lib/compat/browser");
    expect(new URLSearchParams().size).toBe(0);
    expect(new URLSearchParams("a=1&a=2&b=").size).toBe(3);
    const query = new URLSearchParams("a=1");
    query.append("b", "2");
    expect(query.size).toBe(2);
    query.delete("a");
    expect(query.size).toBe(1);
  });
  it("throws the original reason only when aborted", async () => {
    Reflect.deleteProperty(AbortSignal.prototype, "throwIfAborted");
    vi.resetModules();
    await import("../../src/lib/compat/browser");
    const source = new AbortController();
    expect(() => source.signal.throwIfAborted()).not.toThrow();
    const error = new Error("cancelled");
    source.abort(error);
    expect(() => source.signal.throwIfAborted()).toThrow(error);
    const nullable = new AbortController();
    nullable.abort(null);
    try {
      nullable.signal.throwIfAborted();
      expect.fail("expected cancellation");
    } catch (value) {
      expect(value).toBeNull();
    }
  });
  it("generates RFC 4122 v4 UUIDs with cryptographic randomness only when missing", async () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    const random = vi.spyOn(crypto, "getRandomValues");
    vi.resetModules();
    await import("../../src/lib/compat/browser");
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    expect(new Set(ids).size).toBe(100);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(
      true,
    );
    expect(random).toHaveBeenCalledTimes(100);
  });
  it("uses AbortError when the engine cannot record reasons", async () => {
    Reflect.deleteProperty(AbortSignal.prototype, "throwIfAborted");
    Reflect.deleteProperty(AbortSignal.prototype, "reason");
    vi.resetModules();
    await import("../../src/lib/compat/browser");
    const source = new AbortController();
    source.abort();
    expect(() => source.signal.throwIfAborted()).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});

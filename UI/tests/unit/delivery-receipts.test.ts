import { afterEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ owner: "00000000-0000-0000-0000-000000000001" as string | null }));
vi.mock("../../public/recipient-store.js", () => ({ getRecipient: async () => identity.owner }));
import { queueReceipt, clearReceipts, flushReceipts } from "../../public/delivery-receipts.js";
const owner = "00000000-0000-0000-0000-000000000001",
  id = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  identity.owner = owner;
});
describe("optional contentless delivery receipts", () => {
  it("rejects invalid identities, rounds and stages before opening storage", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    await queueReceipt("bad", id, 0, "Displayed");
    await queueReceipt(owner, "bad", 0, "Displayed");
    for (const round of [-1, 0.5, 2147483648, NaN]) await queueReceipt(owner, id, round, "Displayed");
    await queueReceipt(owner, id, 0, "Wrong" as "Displayed");
    await clearReceipts("bad");
    expect(open).not.toHaveBeenCalled();
  });
  it("a blocked storage open times out without failing the displayed notification or leaving a timer", async () => {
    vi.useFakeTimers();
    const request = {};
    vi.stubGlobal("indexedDB", { open: () => request });
    const pending = queueReceipt(owner, id, 0, "Displayed");
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("storage errors do not escape receipt recording or cleanup", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("private storage detail");
      },
    });
    await expect(queueReceipt(owner, id, 0, "Displayed")).resolves.toBeUndefined();
    await expect(clearReceipts(owner)).resolves.toBeUndefined();
  });
  it("does not flush another account, a canceled owner or an offline device", async () => {
    const open = vi.fn(),
      fetch = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    vi.stubGlobal("fetch", fetch);
    await flushReceipts(other);
    await flushReceipts(owner, () => false);
    vi.stubGlobal("navigator", { onLine: false });
    await flushReceipts(owner);
    expect(open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

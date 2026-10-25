import { expect, test, vi } from "vitest";
import { readQueue } from "../../src/features/work/read-queue";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
test("a change during an old read causes one fresh read; a burst stays bounded", async () => {
  const gate = deferred();
  const read = vi
    .fn()
    .mockImplementationOnce(() => gate.promise)
    .mockResolvedValue(undefined);
  const queue = readQueue(read, () => true);
  const first = queue.refresh();
  await Promise.resolve();
  for (let i = 0; i < 100; i++) expect(queue.refresh()).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  gate.resolve();
  await first;
  expect(read).toHaveBeenCalledTimes(2);
});
test("a newer signal during the follow-up is retained too", async () => {
  const gates = [deferred(), deferred()];
  const read = vi
    .fn()
    .mockImplementationOnce(() => gates[0].promise)
    .mockImplementationOnce(() => gates[1].promise)
    .mockResolvedValue(undefined);
  const queue = readQueue(read, () => true),
    first = queue.refresh();
  await Promise.resolve();
  void queue.refresh();
  gates[0].resolve();
  await Promise.resolve();
  await Promise.resolve();
  void queue.refresh();
  gates[1].resolve();
  await first;
  expect(read).toHaveBeenCalledTimes(3);
});
test("identity or offline guard stops queued reads; lifecycle cleanup discards pending signals", async () => {
  for (const close of [false, true]) {
    let active = true;
    const gate = deferred(),
      read = vi.fn(() => gate.promise);
    const queue = readQueue(read, () => active);
    const first = queue.refresh();
    await Promise.resolve();
    void queue.refresh();
    if (close) queue.clear();
    else active = false;
    gate.resolve();
    await first;
    expect(read).toHaveBeenCalledTimes(1);
    active = false;
    await queue.refresh();
    expect(read).toHaveBeenCalledTimes(1);
  }
});
test("a failed read releases the queue for a later explicit reconciliation", async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue(undefined);
  const queue = readQueue(read, () => true);
  await expect(queue.refresh()).rejects.toThrow("read failed");
  await queue.refresh();
  expect(read).toHaveBeenCalledTimes(2);
});

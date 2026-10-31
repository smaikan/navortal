import { describe, expect, it, vi } from "vitest";
import { createMiniPlayer, miniPlayerKey } from "../../src/features/mini-player/controller";
import { miniActivity } from "../../src/features/mini-player/activity";
import type { Work } from "../../src/features/work/model";
import type { Focus } from "../../src/features/focus/model";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fakeWindow() {
  const target = Object.assign(new EventTarget(), {
    closed: false,
    document: {
      title: "",
      documentElement: { lang: "" },
      body: { style: { visibility: "" }, replaceChildren: vi.fn() },
      createElement: () => ({ id: "", textContent: "" }),
    },
    close: vi.fn(() => {
      target.closed = true;
      target.dispatchEvent(new Event("pagehide"));
    }),
  });
  return { target, window: target as unknown as Window };
}
function setup() {
  const identity = { owner: "owner-a", epoch: 1, verified: true };
  let enabled = true;
  const popup = fakeWindow();
  let resolve!: (value: Window) => void;
  let reject!: (error: Error) => void;
  const request = vi.fn(
    () =>
      new Promise<Window>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  );
  const player = createMiniPlayer({ identity: () => identity, enabled: () => enabled, request });
  return {
    player,
    identity,
    request,
    popup,
    resolve: () => resolve(popup.window),
    reject: () => reject(new Error("NotAllowedError")),
    disable: () => {
      enabled = false;
    },
  };
}

describe("mini player window lifecycle", () => {
  it("never opens by default or before a verified owner", () => {
    const x = setup();
    x.disable();
    x.player.prepare().settle(true);
    expect(x.request).not.toHaveBeenCalled();
    const y = setup();
    y.identity.verified = false;
    y.player.prepare().settle(true);
    expect(y.request).not.toHaveBeenCalled();
    expect(miniPlayerKey("a")).not.toBe(miniPlayerKey("b"));
  });
  it("requests synchronously in the initiating gesture, but waits for the accepted command", async () => {
    const x = setup();
    const ticket = x.player.prepare();
    expect(x.request).toHaveBeenCalledTimes(1);
    x.resolve();
    await flush();
    expect(x.player.getSnapshot().waiting).toBe(true);
    ticket.settle(true);
    expect(x.player.getSnapshot().waiting).toBe(false);
    expect(x.popup.target.document.title).toBe("Mini sayaç");
  });
  it("handles a command receipt arriving before the native window", async () => {
    const x = setup();
    x.player.prepare().settle(true);
    x.resolve();
    await flush();
    expect(x.player.getSnapshot().window).toBe(x.popup.window);
    expect(x.player.getSnapshot().waiting).toBe(false);
  });
  it("closes a late window when the API command fails or is uncertain", async () => {
    const x = setup();
    x.player.prepare().settle(false);
    x.resolve();
    await flush();
    expect(x.popup.target.close).toHaveBeenCalledOnce();
    expect(x.player.getSnapshot().window).toBeNull();
  });
  it.each(["owner", "epoch", "verified", "preference"])(
    "discards a late native window after %s changes",
    async kind => {
      const x = setup();
      x.player.prepare().settle(true);
      if (kind === "owner") x.identity.owner = "owner-b";
      if (kind === "epoch") x.identity.epoch++;
      if (kind === "verified") x.identity.verified = false;
      if (kind === "preference") x.disable();
      x.resolve();
      await flush();
      expect(x.popup.target.close).toHaveBeenCalledOnce();
      expect(x.player.getSnapshot().window).toBeNull();
    },
  );
  it("deduplicates pending requests and preserves an existing window after an unrelated failed command", async () => {
    const x = setup();
    const ticket = x.player.prepare();
    x.player.prepare().settle(false);
    expect(x.request).toHaveBeenCalledTimes(1);
    ticket.settle(true);
    x.resolve();
    await flush();
    x.player.prepare().settle(false);
    expect(x.popup.target.close).not.toHaveBeenCalled();
    expect(x.request).toHaveBeenCalledTimes(1);
  });
  it("tolerates denied native permission without an unhandled rejection", async () => {
    const x = setup();
    x.player.prepare().settle(true);
    x.reject();
    await flush();
    expect(x.player.getSnapshot().window).toBeNull();
    expect(x.player.getSnapshot().failure).toContain("normal görünümde sürüyor");
  });
  it("hides private content and handles a synchronous native pagehide without recursive close", async () => {
    const x = setup();
    x.player.prepare().settle(true);
    x.resolve();
    await flush();
    x.player.close();
    expect(x.popup.target.document.body.style.visibility).toBe("hidden");
    expect(x.popup.target.close).toHaveBeenCalledOnce();
    expect(x.player.getSnapshot().window).toBeNull();
  });
  it("closing a native window never reopens it or sends a work command", async () => {
    const x = setup();
    x.player.prepare().settle(true);
    x.resolve();
    await flush();
    x.popup.target.close();
    expect(x.player.getSnapshot().window).toBeNull();
    expect(x.request).toHaveBeenCalledTimes(1);
  });
});

describe("only active server snapshots are shown", () => {
  const work = (id: string, state: Work["state"]) => ({ id, state }) as Work;
  const focus = (id: string, state: Focus["state"]) => ({ workSessionId: id, state }) as Focus;
  it("does not let stale focus data replace a newly running task", () => {
    const next = work("new-work", "Running");
    const shown = miniActivity(next, focus("old-work", "Working"));
    expect(shown.runningWork).toBe(next);
    expect(shown.runningFocus).toBeNull();
  });
  it("keeps a running break and suppresses an acknowledged focus pause over stale Running work", () => {
    expect(miniActivity(work("same", "Paused"), focus("same", "Break")).runningFocus?.state).toBe("Break");
    expect(miniActivity(work("same", "Running"), focus("same", "Paused"))).toEqual({
      runningWork: null,
      runningFocus: null,
    });
  });
  it("accepts a focus receipt while its workspace read is still in flight; idle/paused work never appears active", () => {
    expect(miniActivity(null, focus("same", "Working")).runningFocus?.state).toBe("Working");
    expect(miniActivity(work("same", "Paused"), null)).toEqual({ runningWork: null, runningFocus: null });
    expect(miniActivity(null, null)).toEqual({ runningWork: null, runningFocus: null });
  });
});

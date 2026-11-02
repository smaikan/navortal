import { afterEach, describe, expect, it, vi } from "vitest";
import { createAlertAudio } from "../../src/features/notifications/alert-audio";
import { alertTones } from "../../src/features/notifications/alert-tones";
import { alertSoundIds } from "../../public/alert-tones.js";
import { readEnvelope } from "../../public/push-protocol.js";
import { claimAlertSound } from "../../public/alert-sound-store.js";

function audioFixture() {
  const oscillators: ReturnType<typeof oscillator>[] = [];
  const gains: ReturnType<typeof gain>[] = [];
  function oscillator() {
    return {
      type: "",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
  }
  function gain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  const context = {
    state: "suspended",
    currentTime: 12,
    destination: {},
    onstatechange: null as (() => void) | null,
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
    createOscillator: vi.fn(() => {
      const node = oscillator();
      oscillators.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = gain();
      gains.push(node);
      return node;
    }),
  };
  const create = vi.fn(() => context as unknown as AudioContext);
  return { context, create, oscillators, gains, audio: createAlertAudio(create) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("foreground alert audio lifecycle", () => {
  it("never creates or resumes audio before activation and shares one running context", async () => {
    const f = audioFixture();
    expect(f.audio.getSnapshot()).toBe("locked");
    expect(f.audio.play()).toBe(false);
    expect(f.create).not.toHaveBeenCalled();
    const activated = f.audio.activate();
    expect(f.context.resume).toHaveBeenCalledTimes(1);
    expect(await activated).toBe(true);
    expect(f.audio.getSnapshot()).toBe("ready");
    expect(await f.audio.activate()).toBe(true);
    expect(f.context.resume).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.audio.play()).toBe(true);
    expect(f.oscillators).toHaveLength(2);
    expect(f.oscillators[0].start).toHaveBeenCalledWith(12.01);
    expect(f.oscillators[1].stop).toHaveBeenCalledWith(12.49);
    expect(f.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.22, 12.035);
    f.oscillators.forEach(node => node.onended?.());
    expect(f.oscillators.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(f.gains.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("coalesces pending resume, and a late completion cannot enable a reset owner", async () => {
    const f = audioFixture();
    let finish!: () => void;
    f.context.resume.mockImplementation(() => new Promise<void>(resolve => (finish = resolve)));
    const pending = f.audio.activate();
    expect(f.audio.activate()).toBe(pending);
    expect(f.context.resume).toHaveBeenCalledTimes(1);
    f.audio.reset();
    f.audio.reset();
    expect(f.context.close).toHaveBeenCalledTimes(1);
    f.context.state = "running";
    finish();
    expect(await pending).toBe(false);
    expect(f.audio.getSnapshot()).toBe("locked");
    expect(f.audio.play()).toBe(false);
    expect(f.context.createOscillator).not.toHaveBeenCalled();
  });

  it("does not play after a rejected or ineffective resume; a later gesture may retry", async () => {
    const f = audioFixture();
    f.context.resume.mockRejectedValueOnce(new Error("Autoplay blocked"));
    expect(await f.audio.test()).toBe(false);
    expect(f.audio.getSnapshot()).toBe("locked");
    expect(f.context.createOscillator).not.toHaveBeenCalled();
    f.context.resume.mockImplementationOnce(async () => {});
    expect(await f.audio.test()).toBe(false);
    expect(await f.audio.test()).toBe(true);
    expect(f.context.createOscillator).toHaveBeenCalledTimes(2);
  });

  it("reports suspension to subscribers and waits for another user activation", async () => {
    const f = audioFixture();
    const listener = vi.fn();
    const unsubscribe = f.audio.subscribe(listener);
    await f.audio.activate();
    f.context.state = "suspended";
    f.context.onstatechange?.();
    expect(f.audio.getSnapshot()).toBe("locked");
    expect(f.audio.play()).toBe(false);
    expect(f.context.resume).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await f.audio.activate();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("handles unavailable audio and node failures without an unhandled rejection", async () => {
    const unavailable = createAlertAudio(() => {
      throw new Error("Audio unsupported");
    });
    expect(await unavailable.test()).toBe(false);
    expect(unavailable.getSnapshot()).toBe("unavailable");
    const f = audioFixture();
    await f.audio.activate();
    f.context.createGain.mockImplementationOnce(() => {
      throw new Error("Device disconnected");
    });
    expect(f.audio.play()).toBe(false);
    expect(f.audio.getSnapshot()).toBe("unavailable");
    expect(f.context.close).toHaveBeenCalledTimes(1);
  });
});

const owner = "00000000-0000-0000-0000-000000000001";
const id = "00000000-0000-0000-0000-000000000002";

describe("shared sound receipt failure boundary", () => {
  it("rejects invalid identifiers and snooze rounds without opening storage", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    for (const [o, n, round] of [
      ["bad", id, 0],
      [owner, "bad", 0],
      [owner, id, -1],
      [owner, id, 0.5],
      [owner, id, 2147483648],
    ] as const)
      expect(await claimAlertSound(o, n, round)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("fails closed for stale owner, unavailable storage and opening failures", async () => {
    const open = vi.fn(() => {
      throw new Error("Storage disabled");
    });
    vi.stubGlobal("indexedDB", { open });
    expect(await claimAlertSound(owner, id, 0, () => false)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(await claimAlertSound(owner, id, 0)).toBe(false);
    vi.stubGlobal("indexedDB", undefined);
    expect(await claimAlertSound(owner, id, 0)).toBe(false);
  });

  it("bounds blocked opens and closes a connection that succeeds after the deadline", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const request = {
      result: { close },
      onsuccess: null as (() => void) | null,
    };
    vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });
    const pending = claimAlertSound(owner, id, 0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe(false);
    request.onsuccess?.();
    expect(close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("selectable notification sounds", () => {
  it.each(alertSoundIds)(
    "schedules bounded distinct %s audio with release envelopes and disconnects nodes",
    async sound => {
      const f = audioFixture();
      await f.audio.activate();
      expect(f.audio.play(sound)).toBe(true);
      const notes = alertTones[sound].notes;
      expect(f.oscillators.map(node => node.frequency.setValueAtTime.mock.calls[0][0])).toEqual(
        notes.map(note => note[1]),
      );
      expect(Math.max(...notes.map(note => note[0] + note[2]))).toBeLessThan(1.4);
      for (const [index, [offset, , duration, gain]] of notes.entries()) {
        expect(gain).toBeGreaterThan(0);
        expect(gain).toBeLessThanOrEqual(0.3);
        expect(f.oscillators[index].stop.mock.calls[0][0]).toBeCloseTo(12.01 + offset + duration);
        expect(f.gains[index].gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(0.0001);
      }
      f.oscillators.forEach(node => node.onended?.());
      expect(f.oscillators.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    },
  );
  it("keeps every timbre/sequence distinct, including the legacy sound", () => {
    expect(new Set(alertSoundIds.map(id => JSON.stringify(alertTones[id].notes))).size).toBe(6);
  });
  it("push validates selected sound IDs and accepts an older envelope without the new field", () => {
    const envelope = {
      notificationId: id,
      recipientUserId: owner,
      snoozeCount: 0,
      tag: `notification:${id}`,
      title: "Bildirim",
      body: "Hatırlatma",
      url: `/notifications/${id}`,
      silent: false,
    };
    expect(readEnvelope(envelope)?.sound).toBe("soft");
    for (const sound of alertSoundIds) expect(readEnvelope({ ...envelope, sound })?.sound).toBe(sound);
    for (const sound of [null, "", "Bell", "https://example.test/tone.mp3"])
      expect(readEnvelope({ ...envelope, sound })).toBeNull();
  });
});

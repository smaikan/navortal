import { describe, expect, test } from "vitest";
import type { Page } from "@playwright/test";
import { trackFaults } from "../e2e/helpers/faults";

type Handler = (value: never) => void;
const frame = {};
function fakePage() {
  const handlers = new Map<string, Handler[]>();
  const page = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return page;
    },
    mainFrame: () => frame,
  };
  const emit = (event: string, value: unknown) => handlers.get(event)?.forEach(handler => handler(value as never));
  const request = (url: string, options: { navigation?: boolean; failure?: string; frameless?: boolean } = {}) => ({
    url: () => url,
    isNavigationRequest: () => !!options.navigation,
    frame: () => {
      if (options.frameless) throw new Error("service worker request");
      return frame;
    },
    failure: () => (options.failure ? { errorText: options.failure } : null),
  });
  return { page: page as unknown as Page, emit, request };
}
const message = (url: string) => `${url.replace(/^https?:\//, "")} due to access control checks.`;

describe("trackFaults (WebKit navigation cancellation filter)", () => {
  test("a request cut by a new main-frame document is dropped in either event order", () => {
    const { page, emit, request } = fakePage();
    const list: string[] = [];
    trackFaults(page, list);
    emit("request", request("http://127.0.0.1:3400/api/tasks"));
    emit("pageerror", new Error(message("http://127.0.0.1:3400/api/tasks")));
    expect(list).toHaveLength(1);
    emit("request", request("http://127.0.0.1:3400/planning", { navigation: true }));
    expect(list).toEqual([]);
    emit("pageerror", new Error(message("http://127.0.0.1:3400/api/tasks")));
    expect(list).toEqual([]);
  });

  test("a 'Load request cancelled' failure is dropped; a finished request's later CORS error stays", () => {
    const { page, emit, request } = fakePage();
    const list: string[] = [];
    trackFaults(page, list);
    const cancelled = request("http://127.0.0.1:3400/api/me", { failure: "Load request cancelled" });
    emit("request", cancelled);
    emit("requestfailed", cancelled);
    emit("pageerror", new Error(message("http://127.0.0.1:3400/api/me")));
    const finished = request("http://127.0.0.1:3400/api/notes");
    emit("request", finished);
    emit("requestfinished", finished);
    emit("request", request("http://127.0.0.1:3400/notes", { navigation: true }));
    emit("pageerror", new Error(message("http://127.0.0.1:3400/api/notes")));
    expect(list).toEqual([message("http://127.0.0.1:3400/api/notes")]);
  });

  test("a real access-control failure without navigation and every other page error stay recorded", () => {
    const { page, emit, request } = fakePage();
    const list: string[] = [];
    trackFaults(page, list);
    emit("request", request("https://other.example.test/x", { frameless: true }));
    emit("pageerror", new Error(message("https://other.example.test/x")));
    emit("pageerror", new Error("TypeError: boom"));
    const otherFailure = request("http://127.0.0.1:3400/api/x", { failure: "net::ERR_FAILED" });
    emit("request", otherFailure);
    emit("requestfailed", otherFailure);
    emit("pageerror", new Error(message("http://127.0.0.1:3400/api/x")));
    expect(list).toEqual([
      message("https://other.example.test/x"),
      "TypeError: boom",
      message("http://127.0.0.1:3400/api/x"),
    ]);
  });
});

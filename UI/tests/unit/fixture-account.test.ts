import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { APIRequestContext } from "@playwright/test";
const state = vi.hoisted(() => ({ info: { timeout: 30_000, setTimeout: vi.fn() } }));
vi.mock("@playwright/test", () => ({ test: { info: () => state.info } }));
import { registerFixture } from "../e2e/helpers/fixture-account";
const response = (status: number) => ({ status: () => status, headers: () => ({ "retry-after": "30" }) });
const context = (post: ReturnType<typeof vi.fn>) => ({ post }) as unknown as APIRequestContext;
beforeEach(() => {
  vi.useFakeTimers();
  state.info = { timeout: 30_000, setTimeout: vi.fn() };
});
afterEach(() => vi.useRealTimers());
test("fixture registration honors Retry-After beyond six refusals without weakening the API limit", async () => {
  let count = 0;
  const post = vi.fn(async () => response(++count <= 6 ? 429 : 201));
  const pending = registerFixture(context(post), "/api/auth/register", { data: {} });
  await vi.advanceTimersByTimeAsync(180_000);
  expect((await pending).status()).toBe(201);
  expect(post).toHaveBeenCalledTimes(7);
  expect(state.info.setTimeout).toHaveBeenCalledTimes(6);
});
test("an endlessly refusing fixture remains a failure after one window plus grace", async () => {
  const post = vi.fn(async () => response(429));
  const pending = registerFixture(context(post), "/api/auth/register", { data: {} });
  await vi.advanceTimersByTimeAsync(330_000);
  expect((await pending).status()).toBe(429);
  expect(post).toHaveBeenCalledTimes(12);
});
test("success and definitive other errors are immediate; normal scenario budgets remain untouched", async () => {
  for (const status of [201, 400, 500]) {
    const post = vi.fn(async () => response(status));
    expect((await registerFixture(context(post), "/api/auth/register", { data: {} })).status()).toBe(status);
    expect(post).toHaveBeenCalledTimes(1);
  }
  expect(state.info.setTimeout).not.toHaveBeenCalled();
});

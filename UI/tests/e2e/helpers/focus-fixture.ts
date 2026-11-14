import { randomUUID } from "node:crypto";
import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "../helpers/session";
import type { Focus, FocusAction, Settings } from "../../../src/features/focus/model";
import type { Work } from "../../../src/features/work/model";
import { registerFixture } from "./fixture-account";
export const steady: Settings = {
  workSeconds: 2100,
  shortBreakSeconds: 420,
  longBreakSeconds: 1200,
  longBreakEvery: 3,
  targetBehavior: "ContinueTracking",
  soundEnabled: false,
  notificationsEnabled: true,
};
export class FocusFixture {
  private constructor(
    readonly api: APIRequestContext,
    readonly token: string,
  ) {}
  static async create() {
    const setupHost = process.env.UI_E2E_SETUP_URL ?? "http://127.0.0.1:5182";
    const c = await request.newContext({ baseURL: setupHost });
    const r = await registerFixture(c, "/api/auth/register", {
      data: { email: `focus-controls-${randomUUID()}@example.test`, password: randomUUID() },
    });
    expect(r.status()).toBe(201);
    const token = (await r.json()).accessToken as string;
    await c.dispose();
    return new FocusFixture(
      await request.newContext({
        baseURL: setupHost,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      }),
      token,
    );
  }
  async login(page: Page) {
    await signIn(page, this.token);
  }
  async task() {
    const r = await this.api.post("/api/tasks", { data: { title: `Odak adımı ${randomUUID().slice(-8)}` } });
    expect(r.status()).toBe(201);
    const t = await r.json();
    const u = await this.api.put(`/api/tasks/${t.id}/work-definition`, {
      data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: 5400, targetBudgetSeconds: null },
    });
    expect(u.status()).toBe(200);
    return u.json();
  }
  async start(settings = steady, taskId?: string): Promise<Focus> {
    const r = await this.api.post("/api/focus-sessions", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { settings, ...(taskId && { taskId }) },
    });
    expect(r.status()).toBe(201);
    return r.json();
  }
  async current(): Promise<Focus | null> {
    const r = await this.api.get("/api/focus-sessions/current");
    expect(r.status()).toBe(200);
    return (await r.json()).session;
  }
  async detail(id: string): Promise<Focus> {
    const r = await this.api.get(`/api/focus-sessions/${id}`);
    expect(r.status()).toBe(200);
    return r.json();
  }
  async work(id: string): Promise<Work> {
    const r = await this.api.get(`/api/work-sessions/${id}`);
    expect(r.status()).toBe(200);
    return r.json();
  }
  async change(f: Focus, action: FocusAction, skipBreak = false): Promise<Focus> {
    const r = await this.api.post(`/api/focus-sessions/${f.id}/${action}`, {
      headers: { "Idempotency-Key": randomUUID() },
      data: { version: f.version, workSessionVersion: f.workSessionVersion, skipBreak },
    });
    expect(r.status()).toBe(200);
    return r.json();
  }
  async clean() {
    const f = await this.current();
    if (f && !["Finished", "Interrupted"].includes(f.state)) await this.change(f, "finish");
    for (const state of ["Running", "Paused"]) {
      const items = (await (await this.api.get(`/api/work-sessions?State=${state}&Limit=100`)).json()).items as Work[];
      for (const w of items)
        expect(
          (
            await this.api.post(`/api/work-sessions/${w.id}/finish`, {
              data: { version: (await this.work(w.id)).version },
            })
          ).status(),
        ).toBe(200);
    }
  }
}

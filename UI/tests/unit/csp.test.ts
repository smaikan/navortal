import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { pageSecurity, visiblePageURL } from "../../src/lib/security/csp";
import { themeBootstrap } from "../../src/lib/theme";
import { proxy } from "../../src/proxy";

it("public pages keep a nonce-free policy while private and auth pages get fresh nonces", () => {
  const url = new URL("https://example.test/planning");
  for (const path of ["/", "/features", "/privacy", "/missing", "/planner-sw.js"]) {
    const security = pageSecurity(path, url, false);
    expect(security.nonce).toBeNull();
    expect(security.policy).toContain("frame-ancestors 'none'");
  }
  const nonces = new Set<string>();
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/planning",
    "/tasks",
    "/focus",
    "/notes",
  ]) {
    const { policy, nonce } = pageSecurity(path, url, false);
    expect(nonce).toMatch(/^[a-zA-Z0-9+/]{32}$/);
    nonces.add(nonce!);
    const scripts = policy.split(";").find(x => x.trim().startsWith("script-src"))!;
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
    expect(scripts).toContain(`'sha256-${createHash("sha256").update(themeBootstrap).digest("base64")}'`);
    expect(policy).toContain("connect-src 'self' wss://example.test");
    expect(policy).not.toContain("ws://example.test");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
  }
  expect(nonces.size).toBe(8);
});

it("dev-only eval and loopback websocket exceptions do not widen production sources", () => {
  const local = new URL("http://127.0.0.1:3400/login");
  expect(pageSecurity("/login", local, true).policy).toContain("'unsafe-eval'");
  const production = pageSecurity("/login", local, false).policy;
  expect(production).not.toContain("'unsafe-eval'");
  expect(production).toContain("ws://127.0.0.1:3400");
  expect(production).not.toMatch(/(?:https?:|wss?:)\s|\*/);
});

it("permits canonical WSS behind a loopback proxy and accepts only loopback Host overrides", () => {
  const internal = new URL("http://127.0.0.1:3100/planning");
  const policy = pageSecurity("/planning", internal, false, "https://www.example.test").policy;
  expect(policy).toContain("wss://www.example.test");
  expect(visiblePageURL(internal, "localhost:3100").host).toBe("localhost:3100");
  for (const host of ["evil.example.test", "user@localhost:3100", "localhost:3100/other", "localhost:3100#bad"])
    expect(visiblePageURL(internal, host)).toBe(internal);
});

it("client headers cannot choose the SSR nonce or downgrade the document policy", () => {
  const response = proxy(
    new NextRequest("https://example.test/login", {
      headers: { "x-nonce": "attacker", "content-security-policy": "script-src 'unsafe-inline'" },
    }),
  );
  const policy = response.headers.get("Content-Security-Policy")!;
  expect(policy).not.toContain("attacker");
  const nonce = response.headers.get("x-middleware-request-x-nonce");
  expect(nonce).toBeTruthy();
  expect(policy).toContain(`'nonce-${nonce}'`);
  expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const reset = proxy(new NextRequest("https://example.test/reset-password"));
  expect(reset.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(reset.headers.get("x-middleware-request-content-security-policy")).toContain("'nonce-");
});

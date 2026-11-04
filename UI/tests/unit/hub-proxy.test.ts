import http from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { apiOrigin, hubPath, hubProxy, nextServerBoundary } from "../../tools/hub-proxy.mjs";
const owned: http.Server[] = [];
async function listen(server: http.Server) {
  owned.push(server);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  for (const s of owned.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>(r => s.close(() => r()));
  }
});
it("validates a fixed origin and matches only exact hub paths", () => {
  for (const value of [
    "https://u:p@example.test",
    "https://example.test/path",
    "https://example.test?a=b",
    "ftp://example.test",
    "https://example.test#x",
  ])
    expect(() => apiOrigin(value)).toThrow();
  expect(apiOrigin("https://example.test").origin).toBe("https://example.test");
  expect(hubPath("/api/hubs/planner?access_token=sample")).toBe("/api/hubs/planner");
  expect(hubPath("/api/hubs/planner/negotiate?x=y")).toContain("negotiate");
  expect(hubPath("/api/hubs/planner-other")).toBeNull();
});
it("keeps the automatic Next listener off the owned hub but preserves other upgrade paths", () => {
  const server = http.createServer();
  let nextCalls = 0;
  nextServerBoundary(server).on("upgrade", () => {
    nextCalls++;
  });
  server.emit("upgrade", { url: "/api/hubs/planner?access_token=sample" }, {}, Buffer.alloc(0));
  expect(nextCalls).toBe(0);
  server.emit("upgrade", { url: "/_next/webpack-hmr" }, {}, Buffer.alloc(0));
  expect(nextCalls).toBe(1);
});
it("forwards the session cookie and browser host to the hub and streams SSE while logs contain only method/path/status", async () => {
  const logs: object[] = [];
  let accept = "",
    authorization = "",
    cookie: string | undefined,
    forwardedHost: string | undefined;
  const upstream = await listen(
    http.createServer((req, res) => {
      accept = String(req.headers.accept);
      authorization = String(req.headers.authorization);
      cookie = req.headers.cookie;
      forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Set-Cookie": "unwanted=1" });
      res.write("data: first\n\n");
      setTimeout(() => res.end("data: second\n\n"), 5);
    }),
  );
  const proxy = hubProxy(upstream, (entry: object) => logs.push(entry));
  const front = await listen(
    http.createServer((req, res) => {
      if (!proxy.web(req, res)) res.end();
    }),
  );
  const r = await fetch(`${front}/api/hubs/planner`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: "Bearer sample-private-value",
      Cookie: "adhd_session=sample-private-value",
    },
  });
  expect(r.headers.get("set-cookie")).toBeNull();
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(await r.text()).toContain("data: second");
  expect(accept).toBe("text/event-stream");
  expect(authorization).toBe("Bearer sample-private-value");
  expect(cookie).toBe("adhd_session=sample-private-value");
  expect(forwardedHost).toBe(new URL(front).host);
  expect(JSON.stringify(logs)).not.toContain("sample-private-value");
  expect(logs).toEqual([{ method: "GET", path: "/api/hubs/planner", status: 200 }]);
  proxy.close();
});
it("does not leak raw query or Error on upstream failure, and never follows redirects", async () => {
  const logs: object[] = [];
  const upstream = await listen(
    http.createServer((_req, res) => {
      res.writeHead(302, { Location: "https://outside.example/" });
      res.end();
    }),
  );
  const proxy = hubProxy(upstream, (entry: object) => logs.push(entry));
  const front = await listen(http.createServer((req, res) => proxy.web(req, res)));
  expect((await fetch(`${front}/api/hubs/planner?access_token=sample-private-value`)).status).toBe(502);
  const server = owned[0];
  await new Promise<void>(r => server.close(() => r()));
  const failed = await fetch(`${front}/api/hubs/planner/negotiate?private=sample-private-value`, { method: "POST" });
  expect(failed.status).toBe(502);
  expect(JSON.stringify(logs)).not.toContain("sample-private-value");
  expect(logs.some(x => Object.keys(x).some(k => ["query", "url", "error", "headers"].includes(k)))).toBe(false);
  proxy.close();
});

import http from "node:http";
import https from "node:https";
export const HUB = "/api/hubs/planner";
export function apiOrigin(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("API_ORIGIN must be an HTTP(S) origin.");
  return url;
}
export function hubPath(raw) {
  try {
    const p = new URL(raw, "http://localhost").pathname;
    return p === HUB || p === `${HUB}/negotiate` ? p : null;
  } catch {
    return null;
  }
}
/** Next ilk HTTP isteğinde upgrade işleyicisini kurar. Hub'ı ondan ayırıp normal HMR ve diğer yükseltmeleri koruyoruz. */
export function nextServerBoundary(server) {
  return new Proxy(server, {
    get(target, key, receiver) {
      if (["on", "once", "addListener", "prependListener"].includes(key))
        return (event, listener) => {
          target[key](
            event,
            event === "upgrade"
              ? (req, socket, head) => {
                  if (!hubPath(req.url)) listener(req, socket, head);
                }
              : listener,
          );
          return receiver;
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
/** @type {(entry: object) => void} */
const noLog = () => {};
/** Ham URL, başlık, gövde veya Error nesnesi kayıtçıya gönderilmez. */
export function hubProxy(origin, log = noLog) {
  const target = apiOrigin(origin),
    transport = target.protocol === "https:" ? https : http;
  const sockets = new Set();
  function request(req) {
    // Hub HttpOnly cookie ile doğrular. Cookie yalnız sabit API kaynağına iletilir.
    // negotiate POST'un aynı-host CSRF kontrolü için tarayıcı host'u API'ye taşınır.
    const headers = { ...req.headers, host: target.host, "x-forwarded-host": req.headers.host ?? "" };
    delete headers["proxy-authorization"];
    return transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: req.url,
      headers,
    });
  }
  function web(req, res) {
    const path = hubPath(req.url);
    if (!path) return false;
    const upstream = request(req);
    upstream.on("response", incoming => {
      // Sabit aynı kaynak hub kimlik bilgisini başka yere yönlendirmemeli.
      if (incoming.statusCode >= 300 && incoming.statusCode < 400) {
        incoming.destroy();
        res.writeHead(502);
        res.end();
        return;
      }
      const headers = { ...incoming.headers, "cache-control": "no-store, private", "x-accel-buffering": "no" };
      delete headers["set-cookie"];
      res.writeHead(incoming.statusCode ?? 502, headers);
      res.flushHeaders();
      incoming.on("error", () => res.destroy());
      incoming.pipe(res);
      res.on("close", () => incoming.destroy());
      incoming.on("end", () => log({ method: req.method, path, status: incoming.statusCode }));
    });
    upstream.on("error", () => {
      log({ method: req.method, path, status: 502 });
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    upstream.setTimeout(75000, () => upstream.destroy());
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
    return true;
  }
  function upgrade(req, socket, head) {
    if (hubPath(req.url) !== HUB) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = request(req);
    sockets.add(socket);
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => {
      sockets.delete(socket);
      upstream.destroy();
    });
    upstream.on("upgrade", (res, peer, peerHead) => {
      sockets.add(peer);
      peer.on("error", () => socket.destroy());
      peer.on("close", () => {
        sockets.delete(peer);
        socket.destroy();
      });
      socket.on("close", () => peer.destroy());
      const headers = Object.entries(res.headers)
        .filter(([k]) => k !== "set-cookie")
        .flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => `${k}: ${x}`) : [`${k}: ${v}`]));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join("\r\n")}\r\n\r\n`);
      if (head.length) peer.write(head);
      if (peerHead.length) socket.write(peerHead);
      peer.pipe(socket);
      socket.pipe(peer);
      log({ method: "UPGRADE", path: HUB, status: 101 });
    });
    upstream.on("response", res => {
      log({ method: "UPGRADE", path: HUB, status: res.statusCode });
      res.resume();
      socket.end(`HTTP/1.1 ${res.statusCode ?? 502} Connection Rejected\r\nConnection: close\r\n\r\n`);
    });
    upstream.on("error", () => {
      log({ method: "UPGRADE", path: HUB, status: 502 });
      socket.destroy();
    });
    upstream.end();
  }
  return {
    web,
    upgrade,
    close() {
      for (const s of sockets) s.destroy();
      sockets.clear();
    },
  };
}

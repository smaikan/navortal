import http from 'node:http';
import next from 'next';
import { apiOrigin, hubPath, hubProxy, nextServerBoundary } from './hub-proxy.mjs';
import { ownedOperationAudit } from './operation-audit.mjs';
const args = process.argv.slice(2), dev = args.includes('--dev');
const at = args.indexOf('--port'), port = at < 0 ? 3100 : Number(args[at + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port.');
const host = process.env.UI_HOST ?? '127.0.0.1';
const origin = apiOrigin(process.env.API_ORIGIN ?? 'http://127.0.0.1:5080');
const proxy = hubProxy(origin.origin, entry => process.stdout.write(JSON.stringify({ kind: 'hub-proxy', ...entry }) + '\n'));
let handle;
const audit = ownedOperationAudit();
const server = http.createServer((req, res) => {
  audit(req, res);
  // Hub sorgusundaki kimlik bilgisi Next yönlendirme/hata kayıtçısına gitmeden yakalıyoruz.
  if (proxy.web(req, res)) return;
  void handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
});
server.on('upgrade', (req, socket, head) => { if (hubPath(req.url)) proxy.upgrade(req, socket, head); });
server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
const app = next({ dev, hostname: host, port, httpServer: nextServerBoundary(server) }); await app.prepare();
handle = app.getRequestHandler();
server.listen(port, host, () => process.stdout.write(`Planner ${dev ? 'development' : 'production'} server ready on port ${port}\n`));
let closing = false;
async function close() { if (closing) return; closing = true; proxy.close(); server.closeAllConnections(); server.close(); await app.close(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void close().finally(() => process.exit(0)); });

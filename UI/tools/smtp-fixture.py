"""Yalnız bize ait yerel SMTP/posta örneği. Mesaj ve sıfırlama kodu diske veya çıktıya yazılmaz."""
import asyncio
import email.policy
from email.parser import BytesParser
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import uuid
from urllib.parse import urlsplit, parse_qs

SMTP_PORT, HTTP_PORT = 5526, 5527
KEY = os.environ['ADHD_UI_MAILBOX_KEY']
DATABASE = os.environ['PGDATABASE']
if not re.fullmatch(r'adhd_ui_test_[a-f0-9]{32}', DATABASE):
    raise RuntimeError('Mailbox fixture requires its owned test database')
MAIL = {}
RESET_CODES = set()
LOCK = threading.Lock()

class Mailbox(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def answer(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            self.answer(200, {'ready': True})
        else:
            self.answer(404, {})

    def do_POST(self):
        if not hmac.compare_digest(self.headers.get('X-UI-Fixture-Key', ''), KEY):
            self.answer(403, {})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 2048:
                self.answer(400, {})
                return
            data = json.loads(self.rfile.read(length))
            if self.path == '/latest':
                recipient = data.get('recipient', '')
                if not isinstance(recipient, str) or not recipient.lower().endswith('@example.test'):
                    self.answer(400, {})
                    return
                with LOCK:
                    link = MAIL.get(recipient.lower())
                self.answer(200 if link else 404, {'resetLink': link} if link else {})
            elif self.path == '/expire':
                digest = data.get('tokenHash', '')
                owner = str(uuid.UUID(data.get('userId', '')))
                if not re.fullmatch(r'[A-F0-9]{64}', digest):
                    self.answer(400, {})
                    return
                # İki girdi biçim olarak kontrol edilir, DB adı yalnız rastgele test DB'sidir.
                sql = f'''UPDATE password_reset_requests SET "ExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    WHERE "TokenHash" = '{digest}' AND "UserId" = '{owner}' AND "UsedAt" IS NULL RETURNING "Id";'''
                run = subprocess.run([os.environ['ADHD_UI_TEST_PSQL'], '--no-psqlrc', '--dbname', DATABASE, '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', sql],
                                     capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                updated = run.returncode == 0 and len(re.findall(r'^[a-f0-9-]{36}$', run.stdout, re.M)) == 1
                self.answer(200 if updated else 409, {'updated': updated})
            elif self.path == '/audit':
                ui = Path(__file__).resolve().parents[1]
                with LOCK:
                    codes = set(RESET_CODES)
                started = time.perf_counter()
                files = []
                if codes:
                    files = [f for folder in ('../UI-docs/verification', 'test-results') for f in (ui / folder).rglob('*')
                             if f.is_file() and f.suffix in ('.json', '.md', '.txt', '.html')]
                    files += list((ui / '.local').glob('e2e-*.log'))
                leaks = []
                scanned = 0
                for file in files:
                    if not file.resolve().is_relative_to(ui):
                        continue
                    scanned += 1
                    body = file.read_text(encoding='utf-8', errors='replace')
                    if any(code in body for code in codes):
                        leaks.append(file.relative_to(ui).as_posix())
                        for code in codes:
                            body = body.replace(code, '<REDACTED_RESET_CODE>')
                        file.write_text(body, encoding='utf-8')
                self.answer(200, {'resetCodesChecked': len(codes), 'artifactFilesScanned': scanned, 'auditDurationMs': int((time.perf_counter() - started) * 1000), 'detectedAndRedactedLeaks': leaks})
            else:
                self.answer(404, {})
        except Exception:
            # Hata ve log içinde gövde, alıcı, SMTP metni, kod veya ortam değeri bulunmaz.
            self.answer(400, {})

async def smtp(reader, writer):
    recipients = []
    def reply(value):
        writer.write((value + '\r\n').encode())
    try:
        reply('220 ui-test ESMTP')
        await writer.drain()
        while line := await reader.readline():
            command = line.decode(errors='replace').strip()
            verb = command.split(' ', 1)[0].upper()
            if verb in ('EHLO', 'HELO'):
                reply('250-ui-test\r\n250-8BITMIME\r\n250 SIZE 1048576')
            elif command.upper().startswith('MAIL FROM:'):
                recipients = []
                reply('250 OK')
            elif command.upper().startswith('RCPT TO:'):
                match = re.search(r'<([^>]+)>', command)
                if match and match.group(1).lower().endswith('@example.test'):
                    recipients.append(match.group(1).lower())
                    reply('250 OK')
                else:
                    reply('550 Fixture recipients only')
            elif verb == 'DATA':
                reply('354 End with dot'); await writer.drain()
                chunks = []
                while row := await reader.readline():
                    if row in (b'.\r\n', b'.\n'):
                        break
                    chunks.append(row[1:] if row.startswith(b'..') else row)
                    if sum(map(len, chunks)) > 1024 * 1024:
                        raise ValueError('Fixture message too large')
                message = BytesParser(policy=email.policy.default).parsebytes(b''.join(chunks))
                body = message.get_body(preferencelist=('plain',)) if message.is_multipart() else message
                link = re.search(r'https?://[^\s<>]+', body.get_content() if body else '')
                if link:
                    with LOCK:
                        secret = parse_qs(urlsplit(link.group(0)).fragment.lstrip('?')).get('token', [''])[0]
                        if re.fullmatch(r'[A-Fa-f0-9]{64}', secret):
                            RESET_CODES.add(secret)
                        for recipient in recipients:
                            MAIL[recipient] = link.group(0)
                reply('250 Queued')
            elif verb == 'QUIT':
                reply('221 Bye'); await writer.drain(); break
            elif verb in ('RSET', 'NOOP'):
                recipients = [] if verb == 'RSET' else recipients
                reply('250 OK')
            else:
                reply('502 Unsupported')
            await writer.drain()
    except Exception:
        pass  # Bu özel testte SMTP içerik/hata kaydı bilerek tutulmaz.
    finally:
        writer.close()
        await writer.wait_closed()

async def main():
    server = await asyncio.start_server(smtp, '127.0.0.1', SMTP_PORT)
    http = ThreadingHTTPServer(('127.0.0.1', HTTP_PORT), Mailbox)
    threading.Thread(target=http.serve_forever, daemon=True).start()
    async with server:
        await server.serve_forever()

asyncio.run(main())

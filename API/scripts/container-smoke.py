"""Local isolated Docker acceptance; synthetic data only. Never prints JWTs, credentials or backup contents."""
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid

API = Path(__file__).resolve().parent.parent
ROOT = API / '.local' / 'container-smoke' / uuid.uuid4().hex[:12]
ROOT.mkdir(parents=True)
PROJECT = 'adhd_mvp29_' + ROOT.name
assert re.fullmatch(r'adhd_mvp29_[a-f0-9]{12}', PROJECT)
ENV = dict(os.environ, DOCKER_HOST='unix:///var/tmp/adhd-mvp29-docker/docker.sock', DOCKER_CONFIG=str(API / '.local/docker-tools/config'))
DOCKER = str(API / '.local/docker-tools/docker/docker')
ENV_FILE = ROOT / '.env'
OVERRIDE = ROOT / 'compose-smoke.yml'
COMMAND_LOG = ROOT / 'commands.log'
JWT_KEY = secrets.token_urlsafe(64)
DB_PASSWORD = secrets.token_urlsafe(32)
database = 'adhd'
proxy_ip = '127.0.0.1'

def write_env():
    ENV_FILE.write_text(f'POSTGRES_PASSWORD={DB_PASSWORD}\nJWT_SIGNING_KEY={JWT_KEY}\nSMOKE_DB={database}\nSMOKE_PROXY={proxy_ip}\n')
    ENV_FILE.chmod(0o600)

def execute(args, *, stdin=None, stdout=None):
    with COMMAND_LOG.open('ab') as log:
        result = subprocess.run(args, env=ENV, stdin=stdin, stdout=stdout or subprocess.PIPE, stderr=log)
        if result.returncode:
            raise RuntimeError('Local container command failed; inspect ignored commands.log.')
        return result.stdout or b''

def compose(*args, **kw):
    return execute([DOCKER, 'compose', '-p', PROJECT, '--env-file', str(ENV_FILE), '-f', str(API / 'docker-compose.yml'), '-f', str(OVERRIDE), *args], **kw)

def container(service):
    return compose('ps', '-q', service).decode().strip()

def sql(statement):
    return compose('exec', '-T', 'db', 'psql', '-U', 'adhd', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement).decode().strip()

def wait_until(predicate, label, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except (urllib.error.URLError, OSError, RuntimeError):
            pass
        time.sleep(1)
    raise AssertionError(label + ' did not become ready.')

def request(method, path, body=None, token=None, key=False):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if key:
        headers['Idempotency-Key'] = str(uuid.uuid4())
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request('https://localhost:18443' + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=TLS, timeout=10) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else raw
    except urllib.error.HTTPError as error:
        try:
            return error.code, {'code': json.loads(error.read()).get('code', 'http_error')}
        except (ValueError, AttributeError):
            return error.code, {'code': 'http_error'}

def ok(method, path, body=None, token=None, key=False):
    status, value = request(method, path, body, token, key)
    assert 200 <= status < 300, f'{method} {path.split("?")[0]} returned {status}; code={value.get("code") if isinstance(value, dict) else "none"}'
    return value

def register():
    return ok('POST', '/api/auth/register', {'email': uuid.uuid4().hex + '@example.test', 'password': '123456'})

def websocket(token):
    """Real TLS + nginx + Kestrel WebSocket and SignalR JSON handshake using the same JWT."""
    with socket.create_connection(('127.0.0.1', 18443), timeout=10) as raw:
        with TLS.wrap_socket(raw, server_hostname='localhost') as ws:
            key = base64.b64encode(secrets.token_bytes(16)).decode()
            wire = (f'GET /api/hubs/planner?access_token={token} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode()
            ws.sendall(wire)
            response = b''
            while b'\r\n\r\n' not in response:
                response += ws.recv(4096)
            assert response.startswith(b'HTTP/1.1 101'), 'TLS WebSocket upgrade failed: ' + response.split(b'\r\n', 1)[0].decode(errors='replace')
            payload = b'{"protocol":"json","version":1}\x1e'
            mask = secrets.token_bytes(4)
            ws.sendall(bytes([0x81, 0x80 | len(payload)]) + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(payload)))
            frame = ws.recv(4096)
            assert b'{}\x1e' in frame, 'SignalR handshake failed'

write_env()
OVERRIDE.write_text(f'''services:
  migrate:
    image: adhd-migrate:mvp29
    environment:
      ConnectionStrings__Planner: Host=db;Database=${{SMOKE_DB}};Username=adhd;Password=${{POSTGRES_PASSWORD}}
  api:
    image: adhd-api:mvp29
    environment:
      Jobs__Enabled: "false"
      ReverseProxy__KnownProxies__0: ${{SMOKE_PROXY}}
      ConnectionStrings__Planner: Host=db;Database=${{SMOKE_DB}};Username=adhd;Password=${{POSTGRES_PASSWORD}}
    ports: !override ["127.0.0.1:18080:8080"]
  proxy:
    image: nginx:stable-alpine
    depends_on: [api]
    ports: ["127.0.0.1:18443:8443"]
    volumes:
      - "{API / 'deploy/nginx.conf'}:/etc/nginx/nginx.conf:ro"
      - "{ROOT}:/etc/nginx/tls:ro"
''')
execute(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', str(ROOT / 'key.pem'), '-out', str(ROOT / 'cert.pem')])
TLS = ssl.create_default_context(cafile=str(ROOT / 'cert.pem'))
proof = {'project': PROJECT, 'productionDeployment': False, 'steps': []}
try:
    compose('up', '-d', '--no-build')
    wait_until(lambda: request('GET', '/health/ready')[0] == 200, 'Initial controlled migration/API')
    inspect = json.loads(execute([DOCKER, 'inspect', container('proxy')]))[0]
    proxy_ip = next(iter(inspect['NetworkSettings']['Networks'].values()))['IPAddress']
    write_env()
    compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', 'api')
    wait_until(lambda: request('GET', '/health/ready')[0] == 200, 'Trusted proxy API')
    assert request('GET', '/openapi/v1.json')[0] == 404
    auth = register()
    token = auth['accessToken']
    claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
    assert 'exp' not in claims and auth['tokenType'] == 'Bearer'
    prefs = ok('GET', '/api/preferences', token=token)
    ok('PUT', '/api/preferences', {'version': prefs['version'], 'values': prefs['values'] | {'timeZoneId': 'Europe/Istanbul'}}, token)
    task = ok('POST', '/api/tasks', {'title': 'Restore proof'}, token)
    task = ok('PUT', f'/api/tasks/{task["id"]}/work-definition', {'version': task['version'], 'hasDirectWork': True, 'directEstimatedSeconds': 3600}, token)
    start = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) + dt.timedelta(minutes=5)
    date = (start + dt.timedelta(hours=3)).date().isoformat()
    day = ok('GET', f'/api/daily-plans/{date}', token=token)
    mutation = ok('POST', '/api/schedules', {'localDate': date, 'taskId': task['id'], 'kind': 'Work', 'startsAt': start.isoformat(), 'endsAt': (start + dt.timedelta(minutes=30)).isoformat(), 'expectedPlanningVersion': day['planningVersion']}, token, True)
    schedule = mutation['schedules'][0]
    work = ok('POST', '/api/work-sessions/start', {'taskId': task['id'], 'scheduleId': schedule['id'], 'scheduleVersion': schedule['version']}, token, True)
    focus = ok('POST', '/api/focus-sessions', {'workSessionId': work['id'], 'workSessionVersion': work['version'], 'settings': {'workSeconds': 2100, 'shortBreakSeconds': 420}}, token, True)
    note = ok('POST', '/api/notes', {'kind': 'NextStep', 'text': 'Devam bağlamı', 'taskId': task['id'], 'workSessionId': work['id']}, token)
    old_day = ok('GET', f'/api/daily-plans/{date}', token=token)
    foreign = register()['accessToken']
    assert request('GET', f'/api/tasks/{task["id"]}', token=foreign)[0] == 404
    uid = int(compose('exec', '-T', 'api', 'id', '-u').decode().strip())
    assert uid != 0
    websocket(token)
    proof['steps'].append('TLS, owner isolation, non-root runtime, same-JWT SignalR handshake and exp-free token passed')
    compose('restart', 'api')
    wait_until(lambda: request('GET', '/api/auth/me', token=token)[0] == 200, 'API restart with original JWT')
    compose('restart', 'db')
    wait_until(lambda: request('GET', '/health/ready')[0] == 200, 'Database restart recovery')
    assert ok('GET', '/api/work-sessions/current', token=token)['activeSession']['id'] == work['id']
    proof['steps'].append('API/DB restart preserved JWT and running work')
    dump = ROOT / 'backup.dump'
    with dump.open('wb') as output:
        compose('exec', '-T', 'db', 'pg_dump', '-U', 'adhd', '-d', database, '-Fc', stdout=output)
    compose('exec', '-T', 'db', 'createdb', '-U', 'adhd', 'adhd_restore')
    with dump.open('rb') as source:
        compose('exec', '-T', 'db', 'pg_restore', '-U', 'adhd', '-d', 'adhd_restore', '--exit-on-error', '--no-owner', stdin=source)
    database = 'adhd_restore'
    write_env()
    compose('run', '--rm', '--no-deps', 'migrate')
    compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', 'api')
    wait_until(lambda: request('GET', '/api/auth/me', token=token)[0] == 200, 'Restore with preserved signing key')
    restored = ok('GET', f'/api/work-sessions/{work["id"]}', token=token)
    assert restored['state'] == 'Running' and restored['startedRevisionItemId'] == work['startedRevisionItemId'] and restored['activeSeconds'] >= work['activeSeconds']
    assert ok('GET', f'/api/daily-plans/{date}', token=token)['baselineRevisionId'] == old_day['baselineRevisionId']
    assert ok('GET', '/api/focus-sessions/current', token=token)['session']['id'] == focus['id']
    assert ok('GET', f'/api/tasks/{task["id"]}/return-context', token=token)['nextStepNote']['id'] == note['id']
    assert ok('GET', '/api/preferences', token=token)['values']['timeZoneId'] == 'Europe/Istanbul'
    assert request('GET', f'/api/tasks/{task["id"]}', token=foreign)[0] == 404
    proof['steps'].append('Custom-format pg_dump/pg_restore and no-op migration preserved users/tasks/plan/revision/work/focus/notes/preferences')
    current = ok('GET', '/api/focus-sessions/current', token=token)['session']
    ok('POST', f'/api/focus-sessions/{current["id"]}/finish', {'version': current['version'], 'workSessionVersion': current['workSessionVersion']}, token, True)
    # Ek ayarı değiştirip konteyneri yeniden kur. Normal API açılışında migration çalışmaz.
    OVERRIDE.write_text(OVERRIDE.read_text().replace('Jobs__Enabled: "false"', 'Jobs__Enabled: "true"'))
    compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', 'api')
    wait_until(lambda: request('GET', '/health/ready')[0] == 200, 'Persistent jobs enabled')
    short = ok('POST', '/api/focus-sessions', {'taskId': task['id'], 'settings': {'workSeconds': 1}}, token, True)
    focus_id = str(uuid.UUID(short['id']))
    wait_until(lambda: sql(f'''SELECT count(*) FROM focus_sessions WHERE "Id"='{focus_id}' AND "TargetReachedAt" IS NOT NULL''') == '1', 'Quartz target without HTTP tick')
    wait_until(lambda: sql(f'''SELECT count(*) FROM notification_intents WHERE "SourceId"='{focus_id}' AND "Kind"='FocusTarget' AND "State"='Ready' ''') == '1', 'Outbox notification preparation')
    assert ok('GET', f'/api/work-sessions/{short["workSessionId"]}', token=token)['state'] == 'Running'
    logs = compose('logs', '--no-color', 'api', 'proxy')
    assert token.encode() not in logs and foreign.encode() not in logs and JWT_KEY.encode() not in logs
    proof['steps'].append('Linux PostgreSQL Quartz/outbox target alarm passed; actual continued; query JWT absent from API/proxy logs')
    proof.update({'passed': True, 'runtimeUserId': uid, 'backupBytes': dump.stat().st_size, 'restoredDatabase': database,
                  'apiImage': execute([DOCKER, 'image', 'inspect', 'adhd-api:mvp29', '--format', '{{.Id}}']).decode().strip(),
                  'postgresVersion': sql('SHOW server_version'), 'quartzJobs': int(sql('SELECT count(*) FROM qrtz_job_details'))})
    (ROOT / 'proof.json').write_text(json.dumps(proof, indent=2, ensure_ascii=False))
    print(json.dumps(proof, ensure_ascii=False))
except Exception:
    try:
        diagnostic = compose('logs', '--no-color', 'migrate', 'api', 'db', 'proxy')
        for secret in (JWT_KEY, DB_PASSWORD):
            diagnostic = diagnostic.replace(secret.encode(), b'<redacted>')
        (ROOT / 'failure.log').write_bytes(diagnostic)
    except RuntimeError:
        pass
    raise
finally:
    # Proje adı ve Docker etiketleri sayesinde temizlik sadece bu testin kaynaklarını siler
    compose('down', '-v', '--remove-orphans')

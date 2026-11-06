"""UI testini bize ait DB ve yerel API ile çalıştırır. Yalnız o DB'yi temizler."""
from pathlib import Path
import argparse
import base64
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from e2e_build_cache import build_key, can_reuse, invalidate, record_success

UI = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', action='append', choices=['chromium', 'mobile-chromium', 'firefox', 'webkit'], help='Run a targeted project during a repair; omit for the full acceptance matrix.')
parser.add_argument('--test-file', action='append', choices=sorted(path.name for path in (UI / 'tests/e2e').glob('*.spec.ts')), help='Target a known test file during repair; omit for full acceptance.')
parser.add_argument('--cross-browser-focus', action='append', choices=sorted(path.name.removesuffix('.spec.ts') for path in (UI / 'tests/e2e').glob('*.spec.ts')), help='Closing tier: every spec on Chromium/mobile, only these specs on Firefox/WebKit.')
parser.add_argument('--repeat-each', type=int, default=1, help='Repeat targeted tests to reproduce a flaky failure during repair.')
parser.add_argument('--grep', help='Playwright title pattern for a requirement-based targeted acceptance or repair.')
parser.add_argument('--suite', choices=['smoke'], help='Run only tests tagged @smoke; omit for the selected full matrix.')
parser.add_argument('--shard', help='Playwright shard i/n (for example 1/3); each shard is its own owned run.')
parser.add_argument('--public-seo-lab', action='store_true', help='After passing browser tests, run 3 mobile + 3 desktop anonymous public Lighthouse samples on the owned production server. Requires explicit SITE_URL/SITE_INDEXING fixture settings.')
args = parser.parse_args()
if args.shard and not re.fullmatch(r'([1-9][0-9]*)/([1-9][0-9]*)', args.shard or ''):
    parser.error('--shard must look like i/n')
if args.shard and int(args.shard.split('/')[0]) > int(args.shard.split('/')[1]):
    parser.error('--shard index cannot exceed the shard count')
API = UI.parent / 'API'
LOCAL = UI / '.local'
LOCAL.mkdir(exist_ok=True)
EVIDENCE_DIR = os.environ.get('UI_EVIDENCE_DIR') or (UI / 'tools/evidence-dir.txt').read_text(encoding='utf-8').strip()
EVIDENCE = UI / EVIDENCE_DIR
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = uuid.uuid4().hex
DB = 'adhd_ui_test_' + RUN
ENV = os.environ.copy()
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
PROCESSES = []
LOGS = []
CREATED = False
STARTED_PG = False
EXTERNAL_PG = ENV.get('ADHD_UI_TEST_PG_EXTERNAL') == '1'
PGDATA = (LOCAL / 'e2e-postgres').resolve()
BIN = API / '.local/pgsql/bin'
NODE = str(UI / f'.local/node-v{(UI / ".node-version").read_text().strip()}-win-x64/node.exe') if os.name == 'nt' else shutil.which('node')
PSQL = str(BIN / 'psql.exe') if os.name == 'nt' else shutil.which('psql')
PGCTL = str(BIN / 'pg_ctl.exe') if os.name == 'nt' else shutil.which('pg_ctl')
INITDB = str(BIN / 'initdb.exe') if os.name == 'nt' else shutil.which('initdb')
SUMMARY = {'runId': RUN, 'kind': 'isolated-ui-api-postgres-e2e', 'databaseScope': 'owned-random-test-database-only', 'projects': args.project or ['chromium', 'mobile-chromium', 'firefox', 'webkit'], 'testFiles': args.test_file or 'all', 'matrix': 'targeted-repair' if args.project or args.test_file or args.repeat_each > 1 or args.suite or args.shard else 'closing-tiered' if args.cross_browser_focus else 'full-acceptance', 'repeatEach': args.repeat_each, 'crossBrowserFocus': args.cross_browser_focus or 'all', 'evidenceDir': EVIDENCE_DIR, 'suite': args.suite or 'all', 'shard': args.shard or 'none'}
SUMMARY['workers'] = 1 if ENV.get('UI_E2E_WORKERS') == '1' else 2

def run(args, label, cwd=UI, check=True):
    with (LOCAL / f'e2e-{label}.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(args, cwd=cwd, env=ENV, stdout=log, stderr=subprocess.STDOUT, creationflags=FLAGS)
    if check and result.returncode:
        raise RuntimeError(f'{label} failed; inspect the ignored .local/e2e-{label}.log')
    return result.returncode

def start(args, label, env=None, cwd=UI):
    log = (LOCAL / f'e2e-{label}.log').open('w', encoding='utf-8')
    LOGS.append(log)
    process = subprocess.Popen(args, cwd=cwd, env=env or ENV, stdout=log, stderr=subprocess.STDOUT, creationflags=FLAGS)
    PROCESSES.append(process)
    return process

def free_port(port):
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Port {port} is already in use; no existing process was stopped')

def wait_http(url, process):
    end = time.monotonic() + 60
    while time.monotonic() < end:
        if process.poll() is not None:
            raise RuntimeError('Owned test server exited before readiness; inspect .local logs')
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(.2)
    raise RuntimeError('Owned test server did not become ready within 60 seconds')

def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)

def sql(command, label):
    return run([PSQL, '--no-psqlrc', '--dbname=postgres', '--set=ON_ERROR_STOP=1', '--command', command], label)

def validate_owned_cluster():
    if not PGDATA.is_relative_to(LOCAL.resolve()) or PGDATA.name != 'e2e-postgres':
        raise RuntimeError('Refusing a PostgreSQL path outside this workspace test directory')
    marker = PGDATA / 'ui-test-owner.json'
    expected = {'workspace': str(UI.resolve()), 'purpose': 'ui-owned-test-postgres'}
    if (PGDATA / 'PG_VERSION').exists():
        if not marker.exists() or json.loads(marker.read_text(encoding='utf-8')) != expected:
            raise RuntimeError('Refusing to use a PostgreSQL directory without this task ownership marker')
    return marker, expected

lock = LOCAL / 'e2e-run.lock'
lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
exit_code = 1
try:
    os.write(lock_fd, RUN.encode())
    if not NODE or not PSQL or not re.fullmatch(r'adhd_ui_test_[a-f0-9]{32}', DB):
        raise RuntimeError('Node/psql or test database scope is invalid')
    version = subprocess.check_output([NODE, '--version'], creationflags=FLAGS).decode().strip()
    if version != 'v' + (UI / '.node-version').read_text().strip():
        raise RuntimeError('Test runtime does not match the pinned .node-version')
    for port in (3400, 3401, 5180, 5181, 5182, 5526, 5527):
        free_port(port)
    ENV.update({'PGHOST': '127.0.0.1', 'PGUSER': 'postgres', 'PGPORT': ENV.get('ADHD_UI_TEST_PG_PORT', '55433'),
                'ASPNETCORE_ENVIRONMENT': 'Testing', 'DOTNET_ENVIRONMENT': 'Testing',
                'Jwt__SigningKey': base64.b64encode(os.urandom(48)).decode(),
                'API_ORIGIN': 'http://127.0.0.1:5180', 'SITE_URL': ENV.get('SITE_URL', ''), 'SITE_INDEXING': ENV.get('SITE_INDEXING', ''), 'UI_E2E_CHECKS': 'true', 'UI_E2E_BUILD': 'true', 'UI_E2E_BASE_URL': 'http://127.0.0.1:3400', 'UI_E2E_BUILD_DIR': '.local/next-e2e', 'UI_EVIDENCE_DIR': EVIDENCE_DIR, **({'UI_E2E_CROSS': ','.join(args.cross_browser_focus)} if args.cross_browser_focus else {}), 'NEXT_TELEMETRY_DISABLED': '1',
                'Smtp__Enabled': 'false', 'PGDATABASE': DB, 'ADHD_UI_TEST_PSQL': PSQL,
                'ADHD_UI_MAILBOX_KEY': base64.b64encode(os.urandom(32)).decode(),
                'PLAYWRIGHT_BROWSERS_PATH': ENV.get('PLAYWRIGHT_BROWSERS_PATH', str(LOCAL / 'playwright'))})
    if not EXTERNAL_PG:
        free_port(int(ENV['PGPORT']))
        marker, owner = validate_owned_cluster()
        if not (PGDATA / 'PG_VERSION').exists():
            PGDATA.mkdir(exist_ok=True)
            run([INITDB, '-D', str(PGDATA), '--auth=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'], 'initdb')
            marker.write_text(json.dumps(owner), encoding='utf-8')
        run([PGCTL, '-D', str(PGDATA), '-l', str(LOCAL / 'e2e-postgres.log'), '-o', f'-h 127.0.0.1 -p {ENV["PGPORT"]}', '-w', 'start'], 'postgres-start')
        STARTED_PG = True
    sql(f'CREATE DATABASE "{DB}"', 'database-create')
    CREATED = True
    # CI PostgreSQL parolası gerekirse ortamda kalır.
    ENV['ConnectionStrings__Planner'] = f'Host=127.0.0.1;Port={ENV["PGPORT"]};Database={DB};Username=postgres;Timeout=3' + (f';Password={ENV["PGPASSWORD"]}' if ENV.get('PGPASSWORD') else '')
    run(['dotnet', 'tool', 'restore'], 'dotnet-tools', API)
    run(['dotnet', 'build', 'src/Adhd.Api', '--configuration', 'Release', '--nologo'], 'api-build', API)
    run(['dotnet', 'ef', 'database', 'update', '--project', 'src/Adhd.Infrastructure', '--startup-project', 'src/Adhd.Api', '--configuration', 'Release', '--no-build'], 'migrations', API)
    # Testing ortamında normalde işler kapalı. Ana yerel API
    # Development iş yaşamını kullanır, yardımcı sunucular Testing kalır.
    profile_env = {}
    # Provider credentials never enter the Next build/server or Playwright child environment.
    for name in tuple(ENV):
        if name.startswith('Cloudinary__'):
            ENV.pop(name)
    if ENV.get('UI_REAL_PROFILE') == '1':
        allowed = {'Cloudinary__Enabled', 'Cloudinary__CloudName', 'Cloudinary__ApiKey', 'Cloudinary__ApiSecret'}
        for line in (API / '.local/cloudinary.env').read_text(encoding='utf-8').splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            name, value = line.split('=', 1)
            if name not in allowed:
                raise RuntimeError('Unexpected Cloudinary environment field')
            profile_env[name] = value
        SUMMARY['realProfileProvider'] = 'Cloudinary; API hosts only; synthetic photo fixtures'
    api_env = {**ENV, **profile_env, 'ASPNETCORE_ENVIRONMENT': 'Development', 'DOTNET_ENVIRONMENT': 'Development', 'Jobs__Enabled': 'true'}
    api = start(['dotnet', str(API / 'src/Adhd.Api/bin/Release/net10.0/Adhd.Api.dll'), '--urls', 'http://127.0.0.1:5180'], 'api', api_env, cwd=API / 'src/Adhd.Api')
    wait_http('http://127.0.0.1:5180/health/ready', api)
    # Üçüncü gerçek sunucu yeni test kayıtlarını mevcut giriş
    # testlerinden ayırır. Yalnız bize ait bu hazırlık sunucusunda sınır yükselir;
    # ana 5180 sunucusu giriş testleri için 30/5dk değerini korur.
    setup_env = {**ENV, **profile_env, 'Jobs__Enabled': 'false', 'AuthRateLimit__PermitLimit': '100000'}
    setup_api = start(['dotnet', str(API / 'src/Adhd.Api/bin/Release/net10.0/Adhd.Api.dll'), '--urls', 'http://127.0.0.1:5182'], 'setup-api', setup_env, cwd=API / 'src/Adhd.Api')
    wait_http('http://127.0.0.1:5182/health/ready', setup_api)
    SUMMARY['fixtureRegistrationHost'] = 'owned-loopback-5182; raised auth limiter for fixtures only; main host 30/5min; same real JWT/DB'
    mailbox = start([sys.executable, str(UI / 'tools/smtp-fixture.py')], 'smtp-fixture')
    wait_http('http://127.0.0.1:5527/health', mailbox)
    smtp_env = {**ENV, 'Jobs__Enabled': 'false', 'Smtp__Enabled': 'true', 'Smtp__Host': '127.0.0.1', 'Smtp__Port': '5526',
                'Smtp__Security': 'None', 'Smtp__Username': '', 'Smtp__Password': '', 'Smtp__From': 'planner@example.test',
                'Smtp__ResetPageUrl': 'http://127.0.0.1:3400/reset-password#'}
    smtp_api = start(['dotnet', str(API / 'src/Adhd.Api/bin/Release/net10.0/Adhd.Api.dll'), '--urls', 'http://127.0.0.1:5181'], 'smtp-api', smtp_env, cwd=API / 'src/Adhd.Api')
    wait_http('http://127.0.0.1:5181/health/ready', smtp_api)
    SUMMARY['ownedLoopbackSmtpReady'] = True
    SUMMARY['realtimePublisherHost'] = 'main-api-5180-Development-with-hosted-Quartz; aux hosts Testing/jobs-disabled'
    previous_build = EVIDENCE / 'build-source-hashes.json'
    run([NODE, 'tools/source-fingerprint.mjs'], 'source-fingerprint-before-build')
    current = json.loads((EVIDENCE / 'source-hashes.json').read_text())['fingerprint']
    build_dir = UI / ENV['UI_E2E_BUILD_DIR']
    key = build_key(UI, current, ENV)
    reuse = can_reuse(build_dir, key)
    SUMMARY['buildReused'] = reuse
    shutil.copyfile(EVIDENCE / 'source-hashes.json', previous_build)
    if not reuse:
        invalidate(build_dir)
        engine = os.environ.get('UI_E2E_BUILD_ENGINE', 'turbopack')
        if engine not in ('turbopack', 'webpack'):
            raise RuntimeError('Unknown explicit E2E build engine')
        SUMMARY['buildEngine'] = engine
        # UI_E2E_PROFILE=true yalnız bileşen süre tanılaması için React profil derlemesini açar.
        run([NODE, 'node_modules/next/dist/bin/next', 'build', *(['--webpack'] if engine == 'webpack' else []), *(['--profile'] if ENV.get('UI_E2E_PROFILE') == 'true' else [])], 'ui-build')
        record_success(build_dir, key)
    web = start([NODE, 'tools/server.mjs', '--port', '3400'], 'web')
    wait_http('http://127.0.0.1:3400', web)
    disabled_env = {**ENV, 'UI_E2E_CHECKS': 'false'}
    disabled_web = start([NODE, 'tools/server.mjs', '--port', '3401'], 'disabled-checks-web', disabled_env)
    wait_http('http://127.0.0.1:3401', disabled_web)
    for check_path in ['error', 'auth', 'shell']:
        try:
            urllib.request.urlopen('http://127.0.0.1:3401/internal-checks/' + check_path, timeout=5)
            raise RuntimeError('Test-only route was available without its server flag: ' + check_path)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    stop(disabled_web)
    SUMMARY['testRouteDisabled404'] = True
    SUMMARY['migrationsApplied'] = True
    SUMMARY['grep'] = args.grep
    exit_code = run([NODE, 'node_modules/@playwright/test/cli.js', 'test', *(args.test_file or []), *[f'--project={project}' for project in (args.project or [])], *(['--grep', args.grep] if args.grep else []), *(['--grep', '@smoke'] if args.suite == 'smoke' and not args.grep else []), *([f'--shard={args.shard}'] if args.shard else []), *([f'--repeat-each={args.repeat_each}'] if args.repeat_each > 1 else [])], 'playwright', check=False)
    SUMMARY['testExitCode'] = exit_code
    audit_request = urllib.request.Request('http://127.0.0.1:5527/audit', data=b'{}', headers={
        'X-UI-Fixture-Key': ENV['ADHD_UI_MAILBOX_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(audit_request, timeout=60) as response:
        leak_audit = json.load(response)
    leak_audit['runId'] = RUN
    SUMMARY['resetCodeAudit'] = {name: leak_audit[name] for name in ('resetCodesChecked', 'artifactFilesScanned', 'auditDurationMs')} 
    (EVIDENCE / 'reset-code-artifact-scan.json').write_text(json.dumps(leak_audit, indent=2) + '\n', encoding='utf-8')
    if leak_audit['detectedAndRedactedLeaks']:
        raise RuntimeError('Reset code appeared in a test artifact; values redacted, acceptance failed')
    if exit_code == 0:
        if args.public_seo_lab:
            run([NODE, 'tools/public-lighthouse.mjs'], 'public-lighthouse')
            SUMMARY['publicSeoLab'] = json.loads((EVIDENCE / 'lighthouse-summary.json').read_text())
        run([NODE, 'tools/check-shell-imports.mjs'], 'shell-imports')
        run([NODE, 'tools/measure-bundle.mjs'], 'bundle')
        run([NODE, 'tools/source-fingerprint.mjs'], 'source-fingerprint')
        before = json.loads((EVIDENCE / 'build-source-hashes.json').read_text())
        after = json.loads((EVIDENCE / 'source-hashes.json').read_text())
        if before != after:
            raise RuntimeError('Source changed during production acceptance; rerun with frozen sources')
        SUMMARY['sourceFingerprintVerified'] = after['fingerprint']
except Exception as error:
    exit_code = 1
    SUMMARY['failure'] = str(error)
    print(str(error), flush=True)
finally:
    for process in reversed(PROCESSES):
        try:
            stop(process)
        except Exception as stop_error:
            SUMMARY.setdefault('cleanupFailures', []).append(str(stop_error))
            exit_code = 1
    try:
        if CREATED:
            if not re.fullmatch(r'adhd_ui_test_[a-f0-9]{32}', DB):
                raise RuntimeError('Refusing cleanup outside this run database')
            sql(f'DROP DATABASE "{DB}" WITH (FORCE)', 'database-drop')
            SUMMARY['ownedDatabaseDropped'] = True
    except Exception as cleanup_error:
        SUMMARY.setdefault('cleanupFailures', []).append(str(cleanup_error))
        exit_code = 1
    if STARTED_PG:
        try:
            validate_owned_cluster()
            run([PGCTL, '-D', str(PGDATA), '-m', 'fast', '-w', 'stop'], 'postgres-stop')
            SUMMARY['ownedPostgresStopped'] = True
        except Exception as cleanup_error:
            SUMMARY.setdefault('cleanupFailures', []).append(str(cleanup_error))
            exit_code = 1
    for log in LOGS:
        log.close()
    try:
        jwt_audit_code = run([NODE, 'tools/audit-realtime-secrets.mjs'], 'jwt-audit', check=False)
        SUMMARY['jwtArtifactAudit'] = json.loads((EVIDENCE / 'jwt-artifact-audit.json').read_text())
        if jwt_audit_code:
            exit_code = 1
            SUMMARY['failure'] = 'JWT found in owned test logs/artifacts; values redacted; acceptance failed'
    except Exception:
        exit_code = 1
        SUMMARY['failure'] = 'Owned test JWT artifact audit failed'
    os.close(lock_fd)
    if lock.read_text() == RUN:
        lock.unlink()
    (EVIDENCE / 'isolated-e2e-summary.json').write_text(json.dumps(SUMMARY, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(SUMMARY, ensure_ascii=False), flush=True)
raise SystemExit(exit_code)

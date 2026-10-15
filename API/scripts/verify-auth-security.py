"""JWT/SMTP sınırını bize ait yerel PostgreSQL ile kontrol eder. Kullanıcı DB'sine dokunmaz."""
from pathlib import Path
import hashlib
import json
import os
import socket
import subprocess
import xml.etree.ElementTree as ET

API = Path(__file__).resolve().parents[1]
LOCAL = API / '.local/auth-security'
LOCAL.mkdir(parents=True, exist_ok=True)
PROOF = API.parent / 'docs/verification/auth-security'
PROOF.mkdir(parents=True, exist_ok=True)
DATA = (LOCAL / 'postgres').resolve()
BIN = API / '.local/pgsql/bin'
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
ENV = {**os.environ, 'PGHOST': '127.0.0.1', 'PGPORT': '55434', 'PGUSER': 'postgres', 'PGDATABASE': 'postgres',
       'ADHD_TEST_POSTGRES': 'Host=127.0.0.1;Port=55434;Database=postgres;Username=postgres;Timeout=3'}
ENV.pop('ADHD_API_TRANSCRIPTS', None)
summary = {'kind': 'focused-jwt-smtp-real-postgres-tests', 'date': '2026-10-17', 'port': 55434,
           'databaseScope': 'owned-cluster-and-random-fixture-databases-only'}
started = False
lock = LOCAL / 'run.lock'
fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)

def binary(name):
    return str(BIN / (name + '.exe')) if os.name == 'nt' else name

def run(command, label, check=True):
    with (LOCAL / (label + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=API, env=ENV, stdout=log, stderr=subprocess.STDOUT, creationflags=FLAGS)
    if check and result.returncode:
        raise RuntimeError(label + ' failed; inspect the owned ignored log')
    return result.returncode

try:
    if not DATA.is_relative_to(LOCAL.resolve()) or DATA.name != 'postgres':
        raise RuntimeError('Invalid owned PostgreSQL scope')
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', 55434)) == 0:
            raise RuntimeError('Port is already occupied; no existing service was stopped')
    marker = DATA / 'owner.json'
    owner = {'workspace': str(API), 'purpose': 'auth-security-tests'}
    if (DATA / 'PG_VERSION').exists():
        if not marker.exists() or json.loads(marker.read_text(encoding='utf-8')) != owner:
            raise RuntimeError('PostgreSQL ownership marker mismatch')
    else:
        DATA.mkdir(exist_ok=True)
        run([binary('initdb'), '-D', str(DATA), '--auth=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'], 'initdb')
        marker.write_text(json.dumps(owner), encoding='utf-8')
    run([binary('pg_ctl'), '-D', str(DATA), '-l', str(LOCAL / 'postgres.log'), '-o', '-h 127.0.0.1 -p 55434', '-w', 'start'], 'start')
    started = True
    classes = ['AuthConfigurationTests', 'AuthTests', 'SimpleLoginTests', 'PasswordResetTests', 'TaskTests', 'RealtimeTests', 'ReverseProxyTests']
    selected = '|'.join('FullyQualifiedName~Adhd.IntegrationTests.' + name for name in classes)
    summary['testClasses'] = classes
    summary['testExitCode'] = run(['dotnet', 'test', 'tests/Adhd.IntegrationTests', '--configuration', 'Release', '--nologo',
                                  '--filter', selected, '--logger', 'trx;LogFileName=auth-security.trx', '--results-directory', str(PROOF)], 'tests', check=False)
    trx = PROOF / 'auth-security.trx'
    if trx.exists():
        root = ET.parse(trx).getroot()
        counters = root.find('.//{http://microsoft.com/schemas/VisualStudio/TeamTest/2010}Counters')
        summary['counters'] = counters.attrib if counters is not None else {}
    # Bu PostgreSQL kümesi teste ait. Her test kendi geçici veritabanını önceden silmeli.
    result = subprocess.run([binary('psql'), '--no-psqlrc', '-At', '-c', "SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')"],
                            env=ENV, capture_output=True, text=True, creationflags=FLAGS, check=True)
    summary['remainingFixtureDatabases'] = int(result.stdout.strip())
    if summary['testExitCode'] or summary['remainingFixtureDatabases']:
        raise RuntimeError('Focused security checks or fixture cleanup failed')
except Exception as error:
    summary['failure'] = str(error)
finally:
    if started:
        summary['ownedPostgresStopped'] = run([binary('pg_ctl'), '-D', str(DATA), '-m', 'fast', '-w', 'stop'], 'stop', check=False) == 0
    os.close(fd)
    lock.unlink()
    files = ['src/Adhd.Api/Auth/AuthRegistration.cs', 'src/Adhd.Api/Auth/SmtpSettingsValidator.cs', 'src/Adhd.Infrastructure/Auth/JwtTokenIssuer.cs',
             'src/Adhd.Infrastructure/Auth/SmtpResetMailSender.cs', 'tests/Adhd.IntegrationTests/AuthConfigurationTests.cs',
             'tests/Adhd.IntegrationTests/PasswordResetTests.cs', 'scripts/verify-auth-security.py', '.dockerignore']
    summary['sourceHashes'] = {name: hashlib.sha256((API / name).read_bytes()).hexdigest() for name in files}
    summary['sourceHashes']['../.gitignore'] = hashlib.sha256((API.parent / '.gitignore').read_bytes()).hexdigest()
    (PROOF / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)
if 'failure' in summary or not summary.get('ownedPostgresStopped'):
    raise SystemExit(1)

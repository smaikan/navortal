"""Eksik uç, bozuk örnek, kırık yerel bağlantı veya sır biçimli içerikte hata verir."""
import json
import hashlib
from pathlib import Path
import re
import sys
import argparse
from functools import lru_cache
from urllib.parse import unquote, urlsplit
import datetime
import uuid

# Türkçe hata iletileri, Windows dahil UTF-8 olarak okunur.
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

API = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--docs-root', type=Path, default=API.parent / 'docs')
args = parser.parse_args()
ROOT = args.docs_root.resolve()
spec = json.loads((ROOT / 'openapi-v1.json').read_text(encoding='utf-8-sig'))
catalog = json.loads((ROOT / 'endpoint-catalog.json').read_text(encoding='utf-8'))
coverage = json.loads((ROOT / 'documentation-coverage.json').read_text(encoding='utf-8'))
schemas = spec['components']['schemas']
failures = []
json_count = 0

@lru_cache(maxsize=None)
def read_text(path):
    return path.read_text(encoding='utf-8')

@lru_cache(maxsize=None)
def anchors_for(path):
    return {re.sub(r'[^\w\- ]', '', h.lower()).replace(' ', '-') for h in re.findall(r'^#{1,6} (.+)$', read_text(path), re.M)}

@lru_cache(maxsize=None)
def local_target(parent, path):
    target = (parent / unquote(path)).resolve()
    return target, target.exists()

def require(condition, message):
    if not condition:
        failures.append(message)

def schema_check(value, schema, at, depth=0):
    if depth > 40:
        return
    if '$ref' in schema:
        return schema_check(value, schemas[schema['$ref'].split('/')[-1]], at, depth + 1)
    for part in schema.get('allOf', []):
        schema_check(value, part, at, depth + 1)
    alternatives = schema.get('oneOf', schema.get('anyOf'))
    if alternatives:
        before = len(failures)
        choices = []
        for option in alternatives:
            schema_check(value, option, at, depth + 1)
            errors = failures[before:]
            del failures[before:]
            if not errors:
                return
            choices.append(errors)
        failures.extend(min(choices, key=len))
        return
    types = schema.get('type', [])
    if isinstance(types, str):
        types = [types]
    kind = 'null' if value is None else 'boolean' if isinstance(value, bool) else 'object' if isinstance(value, dict) else 'array' if isinstance(value, list) else 'string' if isinstance(value, str) else 'integer' if isinstance(value, int) else 'number'
    require(not types or kind in types or kind == 'integer' and 'number' in types, f'{at}: {kind} outside {types}')
    if value is None:
        return
    if 'enum' in schema:
        require(value in schema['enum'], f'{at}: value outside enum')
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        for name, ok in (('minimum', lambda b: value >= b), ('maximum', lambda b: value <= b),
                         ('exclusiveMinimum', lambda b: value > b), ('exclusiveMaximum', lambda b: value < b)):
            if name in schema:
                require(ok(schema[name]), f'{at}: outside {name}={schema[name]}')
    if isinstance(value, str) and not re.fullmatch(r'<[A-Z_]+>', value):
        if 'minLength' in schema:
            require(len(value) >= schema['minLength'], f'{at}: below minLength')
        if 'maxLength' in schema:
            require(len(value) <= schema['maxLength'], f'{at}: above maxLength')
        if 'pattern' in schema:
            require(re.search(schema['pattern'], value) is not None, f'{at}: pattern mismatch')
        try:
            if schema.get('format') == 'uuid':
                uuid.UUID(value)
            elif schema.get('format') == 'date':
                require(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) is not None, f'{at}: date shape')
                datetime.date.fromisoformat(value)
            elif schema.get('format') == 'date-time':
                require(datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None, f'{at}: offset absent')
        except (ValueError, TypeError):
            require(False, f'{at}: invalid {schema.get("format")}')
    if isinstance(value, dict):
        for name in schema.get('required', []):
            require(name in value, f'{at}: required property missing: {name}')
        for name, item in value.items():
            if name in schema.get('properties', {}):
                schema_check(item, schema['properties'][name], at + '.' + name, depth + 1)
    elif isinstance(value, list):
        if 'minItems' in schema:
            require(len(value) >= schema['minItems'], f'{at}: below minItems')
        if 'maxItems' in schema:
            require(len(value) <= schema['maxItems'], f'{at}: above maxItems')
        if schema.get('uniqueItems'):
            require(len({json.dumps(x, sort_keys=True) for x in value}) == len(value), f'{at}: duplicate array values')
        for i, item in enumerate(value):
            schema_check(item, schema.get('items', {}), f'{at}[{i}]', depth + 1)

actual = {(m.upper(), p) for p, path in spec['paths'].items() for m in path if m in ('get', 'post', 'put', 'delete', 'patch')}
require(actual == {(x['method'], x['path']) for x in catalog}, 'OpenAPI/catalog operation mismatch')
require(actual == {(x['method'], x['openApiPath']) for x in coverage['coverage']}, 'Documentation coverage mismatch')
require(len(coverage['coverage']) == coverage['documentedConcreteOperations'], 'Concrete operation count mismatch')
require(len(schemas) == coverage['schemas'], 'Schema count mismatch')
require(hashlib.sha256((ROOT / 'openapi-v1.json').read_bytes()).hexdigest() == coverage['openApiSha256'], 'OpenAPI fingerprint mismatch')
for row in coverage['coverage']:
    file = ROOT / row['file']
    text = read_text(file)
    header = f'## {row["method"]} {row["documentedPath"]}'
    require(text.count(header + '\n') == 1, f'Unique endpoint heading missing: {header}')
    section = text.split(header + '\n', 1)[1].split('\n## ', 1)[0]
    operation = spec['paths'][row['openApiPath']][row['method'].lower()]
    endpoint = next(x for x in catalog if x['method'] == row['method'] and x['path'] == row['openApiPath'])
    require(bool(operation.get('security')) == endpoint['authRequired'], f'Auth spec mismatch: {header}')
    require('**Yetki:**' in section and ('JWT Bearer zorunlu' if endpoint['authRequired'] else 'Anonim erişim') in section, f'Auth detail missing: {header}')
    require('**Örnek HTTP:**' in section and '**Hata yanıtları:**' in section, f'HTTP/error detail missing: {header}')
    require('**Tekrar gönderim:**' in section, f'Retry policy absent: {header}')
    for parameter in operation.get('parameters', []):
        require('`' + parameter['name'] + '`' in section, f'Parameter absent {header}: {parameter["name"]}')
    body = operation.get('requestBody', {}).get('content', {}).get('application/json', {}).get('schema')
    if body:
        block = re.search(r'\*\*Örnek request body:\*\*\s+```json\n(.*?)\n```', section, re.S)
        require(block is not None, f'Request example absent: {header}')
        if block:
            schema_check(json.loads(block[1]), body, header + ' request')
    else:
        require('**Request body:** yok.' in section, f'No-body declaration absent: {header}')
    status = str(row['successStatus'])
    require(status in operation['responses'], f'Undeclared status {header}: {status}')
    success = section.split('**Başarılı response:**', 1)[1].split('Örnek kaynağı:', 1)[0]
    response_schema = operation['responses'][status].get('content', {}).get('application/json', {}).get('schema')
    if status == '204':
        require('Response body yok' in success and '```json' not in success, f'204 body error: {header}')
    elif response_schema:
        block = re.search(r'```json\n(.*?)\n```', success, re.S)
        require(block is not None, f'Response example absent: {header}')
        if block:
            schema_check(json.loads(block[1]), response_schema, header + ' response')

for schema in schemas.values():
    for ref in re.findall(r'"\$ref":\s*"#/components/schemas/([^\"]+)"', json.dumps(schema)):
        require(ref in schemas, f'Unknown schema reference: {ref}')
dto = (ROOT / 'frontend-api/DTO-Sozlugu.md').read_text(encoding='utf-8')
require('İlgili endpoint/modül kapsamındaki değer.' not in dto, 'DTO field meanings still contain generic placeholders')
for name in schemas:
    require('\n## ' + name + '\n' in dto, f'DTO not documented: {name}')

policies = json.loads((ROOT / 'operation-policies.json').read_text(encoding='utf-8'))
require(policies['sourceSha256'] == coverage['openApiSha256'], 'Operation policy source hash mismatch')
require({(r['method'], r['path']) for r in policies['operations']} == {(r['method'], r['documentedPath']) for r in coverage['coverage']}, 'Policy concrete endpoint mismatch')
for row in policies['operations']:
    operation = spec['paths'][row['openApiPath']][row['method'].lower()]
    key = any(p.get('in') == 'header' and p['name'].lower() == 'idempotency-key' for p in operation.get('parameters', []))
    require(row['idempotencyKeyRequired'] == key, f'Wrong key policy: {row["method"]} {row["path"]}')
    require(row['authRequired'] == bool(operation.get('security')), f'Wrong policy auth: {row["path"]}')
    if key:
        require(row['maxKeyLength'] == (100 if row['path'].endswith(('/carry', '/rescue')) else 128), f'Wrong key limit: {row["path"]}')

plan_messages = (ROOT / 'frontend-api/Plan-Mesajlari.md').read_text(encoding='utf-8')
message_codes = set()
for filename in ('SchedulingEngine.cs', 'SchedulingAdvanced.cs', 'PlanUndoEngine.cs', 'MultiDaySchedulingEngine.cs'):
    content = (API / 'src/Adhd.Domain/Scheduling' / filename).read_text(encoding='utf-8-sig')
    message_codes.update(re.findall(r'"([A-Z][A-Za-z]+)"', content))
for code in message_codes | set(schemas['UnplacedReason']['enum']) - {None}:
    require(f'| {code} |' in plan_messages, f'Plan message meaning missing: {code}')

files = sorted(ROOT.rglob('*.md')) + [API.parent / 'README.md', API.parent / 'API-AGENTS.md', API.parent / 'AGENTS.md']
for file in files:
    text = read_text(file)
    for block in re.findall(r'```json\n(.*?)\n```', text, re.S):
        json.loads(block)
        json_count += 1
    require(re.search(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----', text) is None, f'Credential-shaped content: {file.name}')
    for href in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
        parsed = urlsplit(href)
        if parsed.scheme or href.startswith('#'):
            continue
        target, exists = local_target(file.parent, parsed.path)
        require(exists, f'Broken local link: {file.name} -> {href}')
        if exists and parsed.fragment and target.suffix == '.md':
            require(unquote(parsed.fragment) in anchors_for(target), f'Broken anchor: {file.name} -> {href}')

if failures:
    for problem in failures[:60]:
        print(problem)
    print(f'FAILED: {len(failures)} issues')
    sys.exit(1)
print(json.dumps({'passed': True, 'openApiOperations': len(actual), 'concreteOperations': len(coverage['coverage']), 'schemas': len(schemas), 'dtoFieldRows': sum(len(s.get('properties', {})) for s in schemas.values()), 'jsonExamples': json_count, 'markdownFiles': len(files), 'operationPolicies': len(policies['operations']), 'keyRequiredConcreteOperations': sum(r['idempotencyKeyRequired'] for r in policies['operations']), 'schedulingMessageCodes': len(message_codes)}))

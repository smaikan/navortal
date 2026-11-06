"""Yalnız plan belgelerini kontrol eder. Uygulamayı derlemez, test etmez veya kabul vermez."""
from pathlib import Path
import collections
import argparse
import hashlib
import json
import re
import urllib.parse

UI = Path(__file__).resolve().parents[1]
ROOT = UI.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--planning-only', action='store_true', help='Require every implementation gate to remain unchecked.')
args = parser.parse_args()
report_path = UI / '../UI-docs/frontend-plan-validation.json'
# Önceki başarıyı başta geçersiz yapıyoruz. Hata olursa eski yeşil rapor kalmasın.
report_path.write_text(json.dumps({'passed': False, 'kind': 'planning-artifact-validation-only',
    'reason': 'Validation started but has not completed; inspect command output if it failed.'}, indent=2), encoding='utf-8')
source = ROOT / 'docs/openapi-v1.json'
spec = json.loads(source.read_text(encoding='utf-8-sig'))
catalog = json.loads((ROOT / 'docs/endpoint-catalog.json').read_text(encoding='utf-8-sig'))
mapping = json.loads((UI / '../UI-docs/frontend-api-plan-map.json').read_text(encoding='utf-8'))
tracker = (ROOT / 'UI-Uygulama Adımları.md').read_text(encoding='utf-8')
rows = mapping['rows']
operations = {(method.upper(), path) for path, methods in spec['paths'].items() for method in methods if method in ('get','post','put','patch','delete')}
assert operations == {(r['method'],r['path']) for r in rows} == {(e['method'],e['path']) for e in catalog}
assert len(rows) == len(operations) == mapping['openApiOperations']
assert len({(r['method'],r['path']) for r in rows}) == len(rows)
assert mapping['sourceSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
assert mapping['schemaCount'] == len(spec['components']['schemas'])
assert mapping['concreteOperations'] == sum(6 if '{operation}' in r['path'] else 1 for r in rows)
assert sum(r['status']=='planned' for r in rows) == mapping['activeOperations']
assert all(r['status']=='disabled-google' for r in rows if '/api/auth/google' in r['path'])
assert sum(r['status']=='disabled-google' for r in rows) == 2
for r in rows:
    assert r['primaryMvp'] in {f'UI-{i:02}' for i in range(34)}
    e = next(e for e in catalog if e['method']==r['method'] and e['path']==r['path'])
    assert e['authRequired'] == r['authRequired']
    operation = spec['paths'][r['path']][r['method'].lower()]
    parameters = spec['paths'][r['path']].get('parameters', []) + operation.get('parameters', [])
    key = next((p for p in parameters if p.get('in') == 'header' and p.get('name', '').lower() == 'idempotency-key'), None)
    expected = 'required' if key and key.get('required') else 'optional' if key else 'not-declared'
    assert r['idempotencyKey'] == expected, (r['method'], r['path'], 'key policy mismatch')
    assert (ROOT / 'UI-docs' / r['contract']).resolve().is_file(), r['contract']
key_counts = dict(collections.Counter(r['idempotencyKey'] for r in rows))
policies = json.loads((ROOT / 'docs/operation-policies.json').read_text(encoding='utf-8'))
assert sum(key_counts.values()) == policies['openApiOperations'], key_counts
completed = []
for i in range(34):
    assert f'### UI-{i:02} — ' in tracker
    for gate in ('İ01','K01','K02','K03'):
        assert re.search(rf'^- \[[ xX]\] U{i:02}-{gate} — ', tracker, re.M)
    closes = re.findall(rf'^- \[([ xX])\] UI-{i:02} tamamlandı\.$', tracker, re.M)
    assert len(closes) == 1, f'Duplicate/missing UI-{i:02} completion gate'
    if closes[0].lower() == 'x':
        gates = re.findall(rf'^- \[([ xX])\] U{i:02}-(?:İ|K|A)\d+ — ', tracker, re.M)
        assert gates and all(g.lower() == 'x' for g in gates), f'UI-{i:02} closed with open acceptance/subdelivery'
        evidence = UI / f'../UI-docs/verification/ui-{i:02}.md'
        assert evidence.is_file() and evidence.read_text(encoding='utf-8').strip(), f'UI-{i:02} evidence missing'
        completed.append(f'UI-{i:02}')
if args.planning_only:
    assert not re.search(r'- \[[xX]\] (UI-\d{2}|U\d{2}-)', tracker), 'Planning-only mode cannot close implementation gates.'
for letter in 'ABCDEFGHIJKL':
    assert re.search(rf'^- \[[ xX]\] {letter}-UI — ', tracker, re.M)
if len(completed) == 34:
    assert all(re.search(rf'^- \[[xX]\] {letter}-UI — ', tracker, re.M) for letter in 'ABCDEFGHIJKL'), 'Product journeys still open'

files = [ROOT/'UI-AGENTS.md',ROOT/'UI-README.md',ROOT/'UI-Uygulama Adımları.md',*sorted((ROOT/'UI-docs').glob('*.md'))]
links = 0
for file in files:
    text = file.read_text(encoding='utf-8')
    assert not re.search(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----',text)
    for href in re.findall(r'\[[^\]]+\]\(([^)]+)\)',text):
        if href.startswith('<') and href.endswith('>'):
            href = href[1:-1]
        parsed = urllib.parse.urlsplit(href)
        if parsed.scheme or href.startswith('#'):
            continue
        target = file.parent / urllib.parse.unquote(parsed.path)
        assert target.exists(),f'Broken local link: {file.name} -> {href}'
        links += 1

# UI-R1 renkleri UI-docs/design altında. Varsayılan açık, koyu isteğe bağlı.
themes={'light':{'background':'#FAFAFA','surface':'#FFFFFF','raised':'#F2F2F2','text':'#171717','secondary':'#5F5F5F','primaryText':'#0062D1','onPrimary':'#FFFFFF','primary':'#0070F3','teal':'#0A7A68','amber':'#A35200','danger':'#D0021B','controlBorder':'#8A8A8A'},
        'dark':{'background':'#111214','surface':'#18191C','raised':'#222327','text':'#EDEDED','secondary':'#A1A1A1','primaryText':'#52A8FF','onPrimary':'#0A0A0A','primary':'#52A8FF','teal':'#4FD1B5','amber':'#F5B14C','danger':'#FF6166','controlBorder':'#7A7A7A'}}
def luminance(color):
    channels=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in channels]
    return sum(x*w for x,w in zip(linear,(.2126,.7152,.0722)))
def contrast(colors,a,b):
    values=sorted([luminance(colors[a]),luminance(colors[b])])
    return (values[1]+.05)/(values[0]+.05)
ratios={}
for theme,colors in themes.items():
    for foreground in ('text','secondary','primaryText','teal','amber','danger'):
        for background in ('background','surface','raised'):
            value=contrast(colors,foreground,background)
            assert value>=4.5,(theme,foreground,background,value)
            ratios[f'{theme}:{foreground}/{background}']=round(value,2)
    value=contrast(colors,'onPrimary','primary'); assert value>=4.5,(theme,'onPrimary',value); ratios[f'{theme}:onPrimary/primary']=round(value,2)
    for background in ('background','surface','raised'):
        value=contrast(colors,'controlBorder',background); assert value>=3,(theme,'controlBorder',background,value); ratios[f'{theme}:controlBorder/{background}']=round(value,2)

sources_present = (UI / 'package.json').is_file()
report={'passed':True,'kind':'planning-artifact-validation-only','frontendImplemented':False if not sources_present else 'not-assessed','frontendSourcesPresent':sources_present,'implementationMvpsComplete':len(completed),'completedMvpIds':completed,'completionEvidenceScope':'Tracker consistency and evidence file presence only; no application test executed.','plannedMvps':34,'publicApiOperations':len(rows),'concreteOperations':mapping['concreteOperations'],'activeOperations':mapping['activeOperations'],'disabledGoogle':2,'idempotencyKeyPolicies':key_counts,'schemas':mapping['schemaCount'],'checkedMarkdownFiles':len(files),'localLinks':links,'sourceSha256':mapping['sourceSha256'],'minProposedTextContrast':min(v for k,v in ratios.items() if 'controlBorder' not in k),'proposedContrastRatios':ratios,'manualRuntimeAndDeviceChecks':'Not assessed by this validator.'}
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='proposedContrastRatios'},ensure_ascii=False))

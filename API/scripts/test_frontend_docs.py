"""Exercise documentation-validator failures in isolated copies; never edit published examples."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import unquote, urlsplit

REPO = Path(__file__).resolve().parents[2]
VALIDATOR = REPO / 'API/scripts/validate-frontend-docs.py'


class FrontendDocsValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='adhd-api-doc-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docs = self.root / 'docs'
        shutil.copytree(REPO / 'docs', self.docs)
        # Belgenin işaret ettiği gerçek dosyaları al. .local, sırlar, DB ve binary dosyalar kalır.
        for file in (REPO / 'docs').rglob('*.md'):
            for href in re.findall(r'\[[^\]]+\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
                parsed = urlsplit(href)
                if parsed.scheme or not parsed.path:
                    continue
                target = (file.parent / unquote(parsed.path)).resolve()
                if target.is_file() and target.is_relative_to(REPO) and not target.is_relative_to(REPO / 'docs'):
                    destination = self.root / target.relative_to(REPO)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(target, destination)

    def run_validator(self):
        return subprocess.run([sys.executable, str(VALIDATOR), '--docs-root', str(self.docs)],
                              capture_output=True, text=True, encoding='utf-8')

    def rejected(self, fragment):
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(fragment, result.stdout + result.stderr)

    def test_complete_current_reference_passes(self):
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        expected = len(json.loads((self.docs / 'operation-policies.json').read_text())['operations'])
        self.assertEqual(json.loads(result.stdout)['operationPolicies'], expected)

    def test_missing_required_key_is_rejected(self):
        path = self.docs / 'operation-policies.json'
        data = json.loads(path.read_text())
        next(r for r in data['operations'] if r['path'] == '/api/work-sessions/start')['idempotencyKeyRequired'] = False
        path.write_text(json.dumps(data), encoding='utf-8')
        self.rejected('Wrong key policy')

    def test_wrong_carry_key_limit_is_rejected(self):
        path = self.docs / 'operation-policies.json'
        data = json.loads(path.read_text())
        next(r for r in data['operations'] if r['path'].endswith('/carry'))['maxKeyLength'] = 128
        path.write_text(json.dumps(data), encoding='utf-8')
        self.rejected('Wrong key limit')

    def test_missing_focus_variant_policy_is_rejected(self):
        path = self.docs / 'operation-policies.json'
        data = json.loads(path.read_text())
        data['operations'] = [r for r in data['operations'] if r['path'] != '/api/focus-sessions/{id}/next']
        path.write_text(json.dumps(data), encoding='utf-8')
        self.rejected('Policy concrete endpoint mismatch')

    def test_request_example_over_annotation_limit_is_rejected(self):
        path = self.docs / 'frontend-api/tasks.md'
        text = path.read_text(encoding='utf-8')
        start = text.index('## POST /api/tasks\n')
        section = text[start:]
        match = re.search(r'\*\*Örnek request body:\*\*\s+```json\n(.*?)\n```', section, re.S)
        value = json.loads(match[1]); value['title'] = 'x' * 301
        section = section[:match.start(1)] + json.dumps(value) + section[match.end(1):]
        path.write_text(text[:start] + section, encoding='utf-8')
        self.rejected('above maxLength')

    def test_unknown_field_meaning_is_rejected(self):
        path = self.docs / 'frontend-api/DTO-Sozlugu.md'
        path.write_text(path.read_text(encoding='utf-8') + '\nİlgili endpoint/modül kapsamındaki değer.\n', encoding='utf-8')
        self.rejected('DTO field meanings still contain generic placeholders')

    def test_broken_link_in_behavior_doc_is_rejected(self):
        path = self.docs / 'focus-pomodoro.md'
        path.write_text(path.read_text(encoding='utf-8') + '\n[Missing](missing-contract.md)\n', encoding='utf-8')
        self.rejected('Broken local link')


if __name__ == '__main__':
    unittest.main()

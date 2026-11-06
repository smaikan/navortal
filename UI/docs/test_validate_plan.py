"""İlerleme ve API kuralı belge kontrolü. Frontend çalışma zamanı testi değil."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class PlanValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='adhd-plan-review-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('docs', 'UI', 'UI-docs', '.agents', '.github'):
            shutil.copytree(ROOT / name, self.root / name, ignore=shutil.ignore_patterns(
                '__pycache__', 'node_modules', '.local', '.next', 'test-results', 'playwright-report',
                'package.json', 'package-lock.json'))
        for name in ('AGENTS.md', 'UI-AGENTS.md', 'UI-README.md', 'UI-Uygulama Adımları.md', 'API-AGENTS.md', 'API-README.md', 'API-Uygulama Adımları.md', 'skills-lock.json'):
            shutil.copyfile(ROOT / name, self.root / name)
        # İnceleme kaydı gerçek sözleşme kanıtına bağlanır. Backend binary veya DB kopyalamıyoruz.
        contract = Path('API/src/Adhd.Api/Controllers/TasksController.cs')
        (self.root / contract).parent.mkdir(parents=True)
        shutil.copyfile(ROOT / contract, self.root / contract)
        self.tracker = self.root / 'UI-Uygulama Adımları.md'
        # Her test yapay, bütün kutuları açık plandan başlar. Gerçek ilerleme
        # UI-00 sonrasında planlama testini yanlış başarısız yapmasın.
        self.tracker.write_text(self.tracker.read_text(encoding='utf-8')
                                .replace('- [x]', '- [ ]').replace('- [X]', '- [ ]'), encoding='utf-8')
        self.report = self.root / 'UI-docs/frontend-plan-validation.json'

    def run_validator(self, *args):
        return subprocess.run([sys.executable, str(self.root / 'UI/docs/validate-plan.py'), *args],
                              capture_output=True, text=True, encoding='utf-8')

    def close_design_package(self, evidence=True):
        text = self.tracker.read_text(encoding='utf-8')
        text = re.sub(r'^- \[ \] (U00-[^\n]+|UI-00 tamamlandı\.)', r'- [x] \1', text, flags=re.M)
        self.tracker.write_text(text, encoding='utf-8')
        if evidence:
            path = self.root / 'UI-docs/verification/ui-00.md'
            path.parent.mkdir(exist_ok=True)
            path.write_text('Synthetic design evidence in isolated test fixture only.\n', encoding='utf-8')
        else:
            (self.root / 'UI-docs/verification/ui-00.md').unlink(missing_ok=True)

    def test_current_plan_and_key_contract(self):
        result = self.run_validator('--planning-only')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(self.report.read_text())
        self.assertEqual(report['implementationMvpsComplete'], 0)
        self.assertEqual(report['idempotencyKeyPolicies'], {'not-declared': 126, 'required': 26})

    def test_partial_progress_is_allowed(self):
        text = self.tracker.read_text(encoding='utf-8').replace('- [ ] U00-İ01', '- [x] U00-İ01')
        self.tracker.write_text(text, encoding='utf-8')
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_complete_design_is_not_runtime_implementation(self):
        self.close_design_package()
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(self.report.read_text())
        self.assertEqual(report['completedMvpIds'], ['UI-00'])
        self.assertIs(report['frontendImplemented'], False)

    def test_open_acceptance_prevents_completion(self):
        text = self.tracker.read_text(encoding='utf-8').replace('- [ ] UI-00 tamamlandı.', '- [x] UI-00 tamamlandı.')
        self.tracker.write_text(text, encoding='utf-8')
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('closed with open acceptance', result.stderr)

    def test_missing_evidence_prevents_completion(self):
        self.close_design_package(evidence=False)
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('evidence missing', result.stderr)

    def test_planning_only_rejects_progress_and_invalidates_old_success(self):
        self.close_design_package()
        self.report.write_text('{"passed": true}', encoding='utf-8')
        result = self.run_validator('--planning-only')
        self.assertNotEqual(result.returncode, 0)
        self.assertIs(json.loads(self.report.read_text())['passed'], False)

    def test_fake_task_create_key_support_is_rejected(self):
        path = self.root / 'UI-docs/frontend-api-plan-map.json'
        mapping = json.loads(path.read_text(encoding='utf-8'))
        row = next(r for r in mapping['rows'] if r['path'] == '/api/tasks' and r['method'] == 'POST')
        row['idempotencyKey'] = 'required'
        path.write_text(json.dumps(mapping), encoding='utf-8')
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('key policy mismatch', result.stderr)


if __name__ == '__main__':
    unittest.main()

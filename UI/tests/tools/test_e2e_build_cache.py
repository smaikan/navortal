"""API veya DB açmadan derleme değişimi ve hata durumlarını deniyoruz."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from e2e_build_cache import RECEIPT, build_key, can_reuse, invalidate, record_success


class BuildCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ui = Path(self.temp.name)
        self.build = self.ui / 'build'
        self.build.mkdir()
        self.id = self.build / 'BUILD_ID'
        self.id.write_text('build-a')
        self.env = {'API_ORIGIN': 'http://127.0.0.1:5180', 'UI_E2E_CHECKS': 'true'}
        self.key = build_key(self.ui, 'source-a', self.env)

    def test_same_successful_build_can_be_reused(self):
        record_success(self.build, self.key)
        self.assertTrue(can_reuse(self.build, self.key))

    def test_existing_build_id_without_receipt_is_not_proof(self):
        self.assertFalse(can_reuse(self.build, self.key))

    def test_replaced_shared_build_is_not_reused_for_old_sources(self):
        record_success(self.build, self.key)
        key_b = build_key(self.ui, 'source-b', self.env)
        self.id.write_text('build-b')
        record_success(self.build, key_b)
        self.assertFalse(can_reuse(self.build, self.key))
        self.assertTrue(can_reuse(self.build, key_b))

    def test_changed_build_id_invalidates_a_leftover_receipt(self):
        record_success(self.build, self.key)
        self.id.write_text('external-build')
        self.assertFalse(can_reuse(self.build, self.key))

    def test_failed_rebuild_cannot_leave_a_reusable_receipt(self):
        record_success(self.build, self.key)
        invalidate(self.build)
        # Başarısız derleme eski BUILD_ID dosyasını diskte bırakabilir.
        self.assertTrue(self.id.exists())
        self.assertFalse(can_reuse(self.build, self.key))

    def test_environment_changes_invalidate_reuse_without_exposing_values(self):
        env = {**self.env, 'NEXT_PUBLIC_FLAG': 'fixture-value'}
        key = build_key(self.ui, 'source-a', env)
        record_success(self.build, key)
        self.assertFalse(can_reuse(self.build, self.key))
        self.assertNotIn('fixture-value', (self.build / RECEIPT).read_text())
        self.assertFalse(can_reuse(self.build, build_key(self.ui, 'source-a', {**env, 'UI_E2E_CHECKS': 'false'})))

    def test_env_file_changes_invalidate_reuse(self):
        path = self.ui / '.env.production.local'
        path.write_text('FIXTURE=first')
        key = build_key(self.ui, 'source-a', self.env)
        record_success(self.build, key)
        path.write_text('FIXTURE=second')
        self.assertFalse(can_reuse(self.build, build_key(self.ui, 'source-a', self.env)))

    def test_legal_profile_changes_invalidate_reuse_without_storing_public_identity(self):
        record_success(self.build, self.key)
        env = {**self.env, 'LEGAL_CONTROLLER_NAME': 'Synthetic Operator'}
        changed = build_key(self.ui, 'source-a', env)
        self.assertFalse(can_reuse(self.build, changed))
        record_success(self.build, changed)
        self.assertNotIn('Synthetic Operator', (self.build / RECEIPT).read_text())

    def test_domain_indexing_and_preview_changes_invalidate_reuse(self):
        record_success(self.build, self.key)
        for name, value in [('SITE_URL', 'https://planner.example.test'), ('SITE_INDEXING', 'true'), ('VERCEL_ENV', 'preview')]:
            with self.subTest(name=name):
                self.assertFalse(can_reuse(self.build, build_key(self.ui, 'source-a', {**self.env, name: value})))
                self.assertNotIn(value, (self.build / RECEIPT).read_text())

    def test_node_environment_selects_its_own_env_files(self):
        env = {**self.env, 'NODE_ENV': 'test'}
        path = self.ui / '.env.test.local'
        path.write_text('FIXTURE=first')
        key = build_key(self.ui, 'source-a', env)
        record_success(self.build, key)
        path.write_text('FIXTURE=second')
        self.assertFalse(can_reuse(self.build, build_key(self.ui, 'source-a', env)))

    def test_build_engine_comparisons_cannot_reuse_a_different_compiler(self):
        record_success(self.build, self.key)
        webpack = build_key(self.ui, 'source-a', {**self.env, 'UI_E2E_BUILD_ENGINE': 'webpack'})
        self.assertFalse(can_reuse(self.build, webpack))
        record_success(self.build, webpack)
        self.assertFalse(can_reuse(self.build, self.key))

    def test_corrupt_receipt_or_missing_build_id_is_a_cache_miss(self):
        (self.build / RECEIPT).write_text('{broken')
        self.assertFalse(can_reuse(self.build, self.key))
        record_success(self.build, self.key)
        self.id.unlink()
        self.assertFalse(can_reuse(self.build, self.key))

    def test_empty_build_id_cannot_be_certified(self):
        self.id.write_text('')
        with self.assertRaises(RuntimeError):
            record_success(self.build, self.key)
        self.assertFalse((self.build / RECEIPT).exists())


if __name__ == '__main__':
    unittest.main()

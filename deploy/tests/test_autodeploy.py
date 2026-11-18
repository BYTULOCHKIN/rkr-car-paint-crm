import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


deploy = module('autodeploy', Path(__file__).parents[1] / 'autodeploy.py')
waiter = module('wait_for_deploy', Path(__file__).parents[2] / 'scripts/wait-for-deploy.py')
SHA = 'a' * 40
OLD_SHA = 'b' * 40
DIGEST = 'c' * 64
MANIFEST = {'image': f'rkr-crm:{SHA}', 'bytes': 4, 'sha256': DIGEST}


class DeployTests(unittest.TestCase):
    def fixture(self, root):
        live, source, state = (root / name for name in ('live', 'source', 'state'))
        state.mkdir()
        for base, prefix in ((live, 'old'), (source, 'new')):
            (base / 'deploy').mkdir(parents=True)
            for name in deploy.CONFIG_FILES:
                (base / name).write_text(prefix + ':' + name)
        (live / '.env.production').write_text('CLERK_SECRET_KEY=keep-secret\n')
        (live / 'data').mkdir()
        (live / 'data/crm.sqlite').write_bytes(b'live database must stay untouched')
        (live / 'deploy-status').mkdir()
        (live / 'deploy-status/release.json').write_text(json.dumps({'commit': OLD_SHA}))
        return live, source, state

    def test_setting_image_preserves_secrets_and_removes_duplicate_values(self):
        original = 'CLERK_SECRET_KEY="secret $ with spaces"\nCRM_IMAGE=old\nexport CRM_IMAGE=other\n'
        updated = deploy.set_image(original, 'rkr-crm:new')
        self.assertEqual(updated.count('CRM_IMAGE='), 1)
        self.assertIn('CLERK_SECRET_KEY="secret $ with spaces"\n', updated)
        self.assertTrue(updated.endswith('CRM_IMAGE=rkr-crm:new\n'))

    def test_checksum_failure_never_loads_image_or_touches_live_config(self):
        with tempfile.TemporaryDirectory() as directory:
            live, source, state = self.fixture(Path(directory))
            with patch.object(deploy, 'ROOT', live), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'download_image', return_value=(4, 'wrong-digest')), \
                    patch.object(deploy, 'run') as run, patch.object(deploy, 'compose') as compose:
                status = deploy.DeploymentStatus(SHA)
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    deploy.deploy(source, SHA, MANIFEST, status)
                self.assertEqual(status.record['deployment']['steps']['verify']['status'], 'failed')
                self.assertEqual(status.record['commit'], OLD_SHA)
                run.assert_not_called()
                compose.assert_not_called()
            self.assertEqual((live / 'deploy/Caddyfile').read_text(), 'old:deploy/Caddyfile')

    def test_newer_main_leaves_production_unchanged_after_image_import(self):
        with tempfile.TemporaryDirectory() as directory:
            live, source, state = self.fixture(Path(directory))
            (source / deploy.ASSET).write_bytes(b'demo')
            with patch.object(deploy, 'ROOT', live), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'download_image', return_value=(4, DIGEST)), \
                    patch.object(deploy, 'compose'), patch.object(deploy, 'run') as run, \
                    patch.object(deploy, 'output', return_value=f'arm64 {SHA}'), \
                    patch.object(deploy, 'main_sha', return_value=OLD_SHA):
                status = deploy.DeploymentStatus(SHA)
                deploy.deploy(source, SHA, MANIFEST, status)
                self.assertEqual(status.record['deployment']['status'], 'superseded')
                self.assertEqual(status.record['commit'], OLD_SHA)
                self.assertEqual(run.call_count, 1)  # Docker load only, no backup or replacement.

    def test_health_failure_restores_previous_image_config_and_preserves_data(self):
        with tempfile.TemporaryDirectory() as directory:
            live, source, state = self.fixture(Path(directory))
            (source / deploy.ASSET).write_bytes(b'demo')
            compose = Mock()
            with patch.object(deploy, 'ROOT', live), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'download_image', return_value=(4, DIGEST)), \
                    patch.object(deploy, 'compose', compose), patch.object(deploy, 'run'), \
                    patch.object(deploy, 'main_sha', return_value=SHA), \
                    patch.object(deploy, 'output', side_effect=[f'arm64 {SHA}', 'container-id', 'old-image-id']), \
                    patch.object(deploy, 'smoke_test', side_effect=[RuntimeError('bad health'), None]):
                status = deploy.DeploymentStatus(SHA)
                with self.assertRaisesRegex(RuntimeError, 'bad health'):
                    deploy.deploy(source, SHA, MANIFEST, status)
                status.finish('failed')
            self.assertEqual((live / 'deploy/Caddyfile').read_text(), 'old:deploy/Caddyfile')
            self.assertIn('CLERK_SECRET_KEY=keep-secret', (live / '.env.production').read_text())
            self.assertIn(f'CRM_IMAGE=rkr-crm:rollback-{SHA}', (live / '.env.production').read_text())
            self.assertEqual((live / 'data/crm.sqlite').read_bytes(), b'live database must stay untouched')
            self.assertFalse((state / 'current-sha').exists())
            self.assertEqual(status.record['commit'], OLD_SHA)
            self.assertEqual(status.record['deployment']['steps']['rollback']['status'], 'success')
            with self.assertRaisesRegex(RuntimeError, 'failed at healthcheck'):
                waiter.stage_result(status.record, SHA, 'healthcheck')

    def test_success_publishes_stage_timings_without_any_server_build(self):
        with tempfile.TemporaryDirectory() as directory:
            live, source, state = self.fixture(Path(directory))
            (source / deploy.ASSET).write_bytes(b'demo')
            with patch.object(deploy, 'ROOT', live), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'download_image', return_value=(4, DIGEST)), \
                    patch.object(deploy, 'compose') as compose, patch.object(deploy, 'run'), \
                    patch.object(deploy, 'main_sha', return_value=SHA), \
                    patch.object(deploy, 'output', side_effect=[f'arm64 {SHA}', 'container-id', 'old-image-id']), \
                    patch.object(deploy, 'smoke_test'), patch.object(deploy, 'install_controller'), \
                    patch.object(deploy, 'cleanup_images'):
                status = deploy.DeploymentStatus(SHA)
                deploy.deploy(source, SHA, MANIFEST, status)
            result = json.loads((live / 'deploy-status/release.json').read_text())
            self.assertEqual(result['commit'], SHA)
            self.assertEqual((state / 'current-sha').read_text().strip(), SHA)
            for step in result['deployment']['steps'].values():
                self.assertEqual(step['status'], 'success')
                self.assertGreaterEqual(step['seconds'], 0)
            self.assertFalse(any('build' in call.args for call in compose.call_args_list))
            self.assertIsNotNone(waiter.stage_result(result, SHA, 'healthcheck'))

    def test_release_for_another_commit_is_rejected(self):
        manifest = {**MANIFEST, 'schema': 1, 'commit': OLD_SHA,
                    'architecture': 'arm64', 'asset': deploy.ASSET}
        with patch.object(deploy.urllib.request, 'urlopen',
                          return_value=io.BytesIO(json.dumps(manifest).encode())):
            with self.assertRaisesRegex(ValueError, 'Invalid ARM64'):
                deploy.published_release(SHA)

    def test_discovery_bypasses_a_cached_not_yet_published_response(self):
        manifest = {**MANIFEST, 'schema': 1, 'commit': SHA,
                    'architecture': 'arm64', 'asset': deploy.ASSET}
        missing = deploy.urllib.error.HTTPError('https://github.com/release.json', 404, 'Not Found', {}, None)
        with patch.object(deploy.time, 'time', side_effect=[1000, 1020]), \
                patch.object(deploy.urllib.request, 'urlopen', side_effect=[
                    missing, io.BytesIO(json.dumps(manifest).encode())
                ]) as request:
            self.assertIsNone(deploy.published_release(SHA))
            self.assertEqual(deploy.published_release(SHA), manifest)
            urls = [call.args[0].full_url for call in request.call_args_list]
            self.assertNotEqual(urls[0], urls[1])

    def test_wrong_image_revision_is_rejected_before_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            live, source, state = self.fixture(Path(directory))
            with patch.object(deploy, 'ROOT', live), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'download_image', return_value=(4, DIGEST)), \
                    patch.object(deploy, 'compose'), patch.object(deploy, 'run') as run, \
                    patch.object(deploy, 'output', return_value=f'amd64 {OLD_SHA}'):
                status = deploy.DeploymentStatus(SHA)
                with self.assertRaisesRegex(ValueError, 'architecture or commit'):
                    deploy.deploy(source, SHA, MANIFEST, status)
                self.assertEqual(run.call_count, 1)
                self.assertEqual(status.record['commit'], OLD_SHA)


class WaiterTests(unittest.TestCase):
    def test_old_release_does_not_satisfy_new_deployment(self):
        self.assertIsNone(waiter.stage_result(
            {'commit': OLD_SHA, 'deployment': {'commit': OLD_SHA}}, SHA, 'download'))

    def test_final_stage_waits_until_the_new_commit_is_published(self):
        data = {'commit': OLD_SHA, 'deployment': {
            'commit': SHA, 'status': 'running',
            'steps': {'healthcheck': {'status': 'success', 'seconds': 0.5}}
        }}
        self.assertIsNone(waiter.stage_result(data, SHA, 'healthcheck'))

    def test_failures_are_reported_immediately_with_the_failed_stage(self):
        data = {'commit': OLD_SHA, 'deployment': {
            'commit': SHA, 'status': 'failed', 'failed_stage': 'verify', 'steps': {}
        }}
        with self.assertRaisesRegex(RuntimeError, 'failed at verify'):
            waiter.stage_result(data, SHA, 'verify')


if __name__ == '__main__':
    unittest.main()

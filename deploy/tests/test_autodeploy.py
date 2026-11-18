import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location(
    'autodeploy', Path(__file__).parents[1] / 'autodeploy.py'
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeployTests(unittest.TestCase):
    def test_deployment_wait_job_does_not_block_successful_checks(self):
        sha = 'a' * 40
        responses = [
            {'workflow_runs': [{'head_sha': sha, 'head_branch': 'main',
                                'event': 'push', 'jobs_url': 'https://api.github.com/jobs'}]},
            {'jobs': [{'name': 'checks', 'status': 'completed', 'conclusion': 'success'},
                      {'name': 'Wait for production deployment', 'status': 'in_progress', 'conclusion': None}]}
        ]
        with patch.object(deploy.urllib.request, 'urlopen',
                          side_effect=[io.BytesIO(json.dumps(item).encode()) for item in responses]):
            self.assertTrue(deploy.ci_passed(sha))

    def test_setting_image_preserves_secrets_and_removes_duplicate_values(self):
        original = 'CLERK_SECRET_KEY="secret $ with spaces"\nCRM_IMAGE=old\nexport CRM_IMAGE=other\n'
        updated = deploy.set_image(original, 'rkr-crm:new')
        self.assertEqual(updated.count('CRM_IMAGE='), 1)
        self.assertIn('CLERK_SECRET_KEY="secret $ with spaces"\n', updated)
        self.assertTrue(updated.endswith('CRM_IMAGE=rkr-crm:new\n'))

    def test_newer_main_keeps_live_configuration_unchanged(self):
        with patch.object(deploy, 'compose') as compose, \
                patch.object(deploy, 'main_sha', return_value='b' * 40), \
                patch.object(deploy, 'run') as run:
            deploy.deploy(Path('/unused'), 'a' * 40)
        self.assertEqual(compose.call_count, 2)  # validate and build only
        run.assert_not_called()  # no backup, tag, or production mutation

    def test_failed_health_restores_previous_image_and_config_without_touching_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'live'
            source = Path(directory) / 'source'
            state = Path(directory) / 'state'
            state.mkdir()
            for base, prefix in ((root, 'old'), (source, 'new')):
                (base / 'deploy').mkdir(parents=True)
                for name in ('compose.production.yaml', 'deploy/Caddyfile',
                             'deploy/backup-to-s3.sh', 'deploy/upload-backup.py'):
                    (base / name).write_text(prefix + ':' + name)
            (root / '.env.production').write_text('CLERK_SECRET_KEY=keep-secret\n')
            (root / 'data').mkdir()
            database = root / 'data/crm.sqlite'
            database.write_bytes(b'live database must stay untouched')
            sha = 'a' * 40
            compose = Mock()
            with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'STATE', state), \
                    patch.object(deploy, 'compose', compose), \
                    patch.object(deploy, 'main_sha', return_value=sha), \
                    patch.object(deploy, 'run'), \
                    patch.object(deploy, 'output', side_effect=['container-id', 'old-image-id']), \
                    patch.object(deploy, 'smoke_test', side_effect=[RuntimeError('bad health'), None]):
                with self.assertRaisesRegex(RuntimeError, 'bad health'):
                    deploy.deploy(source, sha)
            self.assertEqual((root / 'deploy/Caddyfile').read_text(), 'old:deploy/Caddyfile')
            self.assertIn('CLERK_SECRET_KEY=keep-secret', (root / '.env.production').read_text())
            self.assertIn(f'CRM_IMAGE=rkr-crm:rollback-{sha}', (root / '.env.production').read_text())
            self.assertEqual(database.read_bytes(), b'live database must stay untouched')
            self.assertFalse((state / 'current-sha').exists())


if __name__ == '__main__':
    unittest.main()
